// ───────────── avisos (Resumen) ─────────────
// Fijos que han subido de precio: el último cargo real de cada recurrente frente al anterior (más de un 5 % y 1 €), de los últimos 45 días.
function subidasFijos() {
  const por = new Map();
  for (const m of movimientos().filter((m) => !m.auto && !m.previsto && m.recurrente && m.clase === "gasto")) { if (!por.has(m.recurrente)) por.set(m.recurrente, []); por.get(m.recurrente).push(m); }
  const out = [];
  for (const [nombre, l] of por) {
    l.sort((a, b) => a.fecha - b.fecha);
    const u = l[l.length - 1], a = l[l.length - 2];
    if (a && diasDesde(u.fecha) <= 45 && u.importe - a.importe >= 1 && u.importe > a.importe * 1.05) out.push({ nombre, antes: a.importe, ahora: u.importe });
  }
  return out;
}
// Resumen de un mes en pocas frases (para cuando se cierra)
function resumenMes(key) {
  const M = finMes(key), C = resumenCategorias(key).filter((c) => c.valor > 0.5 && c.grupo !== "fijo"), out = [];
  if (!M.real.some((m) => !m.auto)) return out;
  out.push(`Entraron ${eur(M.ingresos, 0)} y salieron ${eur(M.gastos, 0)}: ${M.ahorro >= 0 ? "ahorraste" : "gastaste de más"} ${eur(Math.abs(M.ahorro), 0)}.`);
  if (C.length) {
    const top = C.slice(0, 2).map((c) => `${c.nombre} (${eur(c.valor, 0)})`).join(" y ");
    const raro = C.map((c) => ({ c, d: difMedia(c) })).filter((x) => x.d != null).sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
    out.push(`En gasto variable pesó sobre todo ${top}.${raro ? ` ${raro.c.nombre}: ${eur(Math.abs(raro.d), 0)} ${raro.d > 0 ? "más" : "menos"} de lo habitual.` : ""}`);
  }
  const R = repartoAhorro(key);
  if (R.compras > 0) out.push(`Metiste ${eur(R.compras, 0)} en tu inversión.`);
  const sin = M.real.filter((m) => m.pendiente).length;
  if (sin) out.push(`Quedan ${sin} movimiento${sin > 1 ? "s" : ""} sin revisar que ya cuentan como «Sin clasificar».`);
  return out;
}
// Fijos de cada mes que llevan más de dos meses sin aparecer en lo importado (una suscripción que diste de baja, un recibo que
// cambió de nombre): mientras sigan activos, la app los da por pagados cada mes y cuentan en tus gastos y en la previsión.
// Solo los que alguna vez casaron con un movimiento real, y contando hasta el último día con datos (no hasta hoy).
function fijosSinCobrar() {
  const fd = fechaDatos();
  if (!fd) return [];
  const ult = new Map();
  for (const m of movimientos()) if (!m.auto && !m.previsto && m.recurrente && (!ult.has(m.recurrente) || m.fecha > ult.get(m.recurrente))) ult.set(m.recurrente, m.fecha);
  return recurrentes().filter((r) => r.clase !== "aportacion" && !r.meses && !(r.hasta && r.hasta < hoy) && ult.has(r.nombre) && fd.diff(ult.get(r.nombre), "days").days > 62)
    .map((r) => ({ id: r.p.id, nombre: r.nombre, clase: r.clase, ultima: ult.get(r.nombre) }));
}
// Qué avisos van a la vista en el Inicio y cuáles plegados («y N avisos más»). Arriba, como mucho `max` de los que piden
// actuar (warn); el resto de esos y las notas (info), plegados. Fuera: lo de «Por revisar» (ya está en el menú, con su número)
// y las notas que repiten una de las acciones que ya salen arriba (`rutasArriba`).
function repartirAvisos(lista, rutasArriba = [], max = 2) {
  const L = lista.filter((a) => a.ruta !== "#revisar" && !(a.nivel !== "warn" && rutasArriba.includes(a.ruta)));
  const warn = L.filter((a) => a.nivel === "warn");
  return { arriba: warn.slice(0, max), resto: [...warn.slice(max), ...L.filter((a) => a.nivel !== "warn")] };
}
// Cuánto hay que apartar al mes para llegar a un objetivo con fecha (0 si no tiene fecha, ya pasó o ya está conseguido).
function ritmoObjetivo(o, hoyF) {
  if (!o.limite || !(o.limite > hoyF) || !(o.meta > o.ahorrado)) return 0;
  return (o.meta - o.ahorrado) / Math.max(1, Math.ceil(o.limite.diff(hoyF, "months").months));
}
// Recordatorios que se repiten: cada cuántos meses, cómo se dice y cuál es la siguiente fecha (la primera posterior a hoy).
const MESES_REPETIR = { anual: 12, trimestral: 3, mensual: 1 };
const REPETIR = { anual: "cada año", trimestral: "cada 3 meses", mensual: "cada mes" };
function siguienteFecha(fecha, repetir, hoyF) {
  const n = MESES_REPETIR[repetir];
  if (!n || !fecha) return null;
  let f = fecha.plus({ months: n });
  for (let i = 1; f <= hoyF; i++) f = fecha.plus({ months: n * (i + 1) });  // desde la fecha original: un día 31 no se va corriendo al 28
  return f;
}
function cuantoFalta(fecha, hoyF) {
  const d = Math.round(fecha.startOf("day").diff(hoyF.startOf("day"), "days").days);
  return d === 0 ? "hoy" : d === 1 ? "mañana" : d === -1 ? "ayer" : d < 0 ? `hace ${-d} días` : `en ${d} días`;
}
// Lo que suman tus fijos en marcha, por tipo: al año (cada uno por las veces que toca) y al mes (de media, si alguno no es de todos los meses: `noMensual`).
// regs: los registros tal cual ({ clase, importe, meses, activo, hasta }).
function totalesFijos(regs, hoyISO) {
  const out = { gasto: { año: 0, n: 0 }, ingreso: { año: 0, n: 0 }, aportacion: { año: 0, n: 0 } };
  for (const r of regs) {
    if (r.activo === false || (r.hasta && String(r.hasta) < hoyISO)) continue;
    const t = out[r.clase || "gasto"]; if (!t) continue;
    const veces = Array.isArray(r.meses) && r.meses.length ? r.meses.length : 12;
    if (veces < 12) t.noMensual = true;
    t.año += Math.abs(num(r.importe)) * veces; t.n++;
  }
  for (const k of ["gasto", "ingreso", "aportacion"]) out[k].mes = out[k].año / 12;
  return out;
}
// ───────────── lo que conviene mirar en lo que acaba de llegar del banco ─────────────
// movs: como los de movimientos() ({ p, fecha, clase, categoria, importe, concepto, cuenta, recurrente, auto, previsto, pendiente }).
const esReciente = (m, hoyF, dias) => !m.auto && !m.previsto && !m.pendiente && m.clase === "gasto" && !m.recurrente && hoyF.diff(m.fecha, "days").days <= dias;
// Comisiones de los últimos `dias`. Las que son el pago de un fijo dado de alta no: esas ya las esperas.
// 90 días y no menos: el primer extracto que se importa suele traer un trimestre, y lo que haya en él tiene que verse
// (cada aviso se quita con su × y no vuelve, así que un plazo largo no los hace pesados).
const comisionesRecientes = (movs, hoyF, dias = 90) => movs.filter((m) => esReciente(m, hoyF, dias) && m.categoria === "Comisiones");
// Posibles cobros repetidos: dos gastos del mismo comercio, por el mismo importe (desde 5 €) y en la misma cuenta, con dos días
// de diferencia como mucho. Solo «posibles»: dos compras iguales también pasan. Fuera los Bizums y las partes de un dividido.
const comercioDe = (m) => norm((m.p && m.p.ext_texto) || m.concepto || "").replace(/[^a-zñ ]+/g, " ").replace(/\s+/g, " ").trim();
function cobrosRepetidos(movs, hoyF, dias = 90) {
  const g = movs.filter((m) => esReciente(m, hoyF, dias) && m.importe >= 5 && !(m.p && m.p.parte_de) && comercioDe(m) && !comercioDe(m).includes("bizum")).sort((a, b) => a.fecha - b.fecha);
  const out = [], usados = new Set();
  for (let i = 0; i < g.length; i++) {
    if (usados.has(g[i])) continue;
    for (let j = i + 1; j < g.length && g[j].fecha.diff(g[i].fecha, "days").days <= 2; j++) {
      const a = g[i], b = g[j];
      if (usados.has(b) || Math.abs(a.importe - b.importe) > 0.005 || a.cuenta !== b.cuenta || comercioDe(a) !== comercioDe(b)) continue;
      out.push({ a, b }); usados.add(b); break;
    }
  }
  return out;
}
// Las copias de seguridad están solo en la carpeta de los datos: si ese disco falla, se pierden las dos cosas.
const faltaSegundaCopia = (config, info, nMovs) => !(config || {}).copia_extra && !(info || {}).ejemplo && nMovs > 0;

function avisos() {
  // `clave`: qué aviso es y de cuándo. Con la × del Inicio se guarda en config.avisos_descartados y ese aviso no vuelve a salir;
  // como la clave lleva el mes o el dato que lo provoca, sí avisa otra vez cuando cambia (otro mes, otra subida, otro saldo).
  const out = [], quitados = new Set((DB.config || {}).avisos_descartados || []);
  const add = (nivel, texto, ruta, clave) => { if (!clave || !quitados.has("inicio:" + clave)) out.push({ nivel, texto, ruta, clave: clave ? "inicio:" + clave : "" }); };
  const nPend = (DB.pendientes || []).length;
  if (nPend) add("warn", `${nPend} movimiento${nPend > 1 ? "s" : ""} por revisar: la app no ha sabido clasificarlo${nPend > 1 ? "s" : ""} sola`, "#revisar");
  for (const x of subidasFijos()) add("warn", `${x.nombre} ha subido: de ${eur(x.antes, 2)} a ${eur(x.ahora, 2)}`, "#gestionar/recurrente", `subida:${x.nombre}:${x.ahora}`);
  for (const x of fijosSinCobrar()) add("info", `${x.nombre} no aparece en tus movimientos desde el ${x.ultima.toFormat("dd/MM")} · si ya no lo ${x.clase === "ingreso" ? "cobras" : "pagas"}, desactívalo: sigue contando cada mes`, `#editar/recurrente/${x.id}`, `sincobrar:${x.id}:${x.ultima.toISODate()}`);
  // Lo que trae el extracto y conviene mirar: una comisión (se puede reclamar o evitar) y un cobro que parece repetido.
  // Cada uno lleva el movimiento en su clave: quitado con su ×, no vuelve.
  for (const m of comisionesRecientes(movimientos(), hoy).sort((a, b) => a.fecha - b.fecha).slice(-3)) add("warn", `Te han cobrado una comisión: ${m.concepto} · ${eur(m.importe, 2)} el ${m.fecha.toFormat("dd/MM")}`, `#editar/movimiento/${m.p.id}`, `comision:${m.p.id}`);
  for (const { a, b } of cobrosRepetidos(movimientos(), hoy).slice(-3)) add("info", `Posible cobro repetido: ${b.concepto} · dos de ${eur(b.importe, 2)} (el ${a.fecha.toFormat("dd/MM")} y el ${b.fecha.toFormat("dd/MM")}) · si son dos compras de verdad, quita este aviso`, `#editar/movimiento/${b.p.id}`, `repetido:${a.p.id}:${b.p.id}`);
  if (faltaSegundaCopia(DB.config, DB.info, registros("movimiento").length)) add("info", "Tus copias de seguridad están en el mismo disco que tus datos: si ese disco falla, se pierden las dos cosas · guárdalas también en otro sitio (un USB, otro disco)", "#ajustes/datos", "copias:mismodisco");
  const nArch = ((DB.info || {}).archivos || []).length;
  if (nArch) add("warn", `${nArch} archivo${nArch > 1 ? "s" : ""} en la carpeta Importar sin procesar`, "#importar", `archivos:${nArch}:${hoy.toISODate()}`);
  const K = conciliacion();
  const desc = K ? K.filas.filter((f) => Math.abs(f.dif) > 1) : [];
  // Con las dos cifras: «+6,50 €» a secas no dice si falta un movimiento o si el saldo que anotaste es de antes
  if (desc.length) add("warn", `No cuadra entre el ${K.desde.toFormat("dd/MM")} y el ${K.hasta.toFormat("dd/MM")}: `
    + desc.map((f) => `${f.nombre} ${eurS(f.dif)} (anotaste ${eur(f.real)} y los movimientos dan ${eur(f.esperado)})`).join(", ")
    + " · falta o sobra algún movimiento, o el saldo que anotaste es de antes", "#cerrar", `cuadre:${K.hasta.toISODate()}`);
  const P = patrimonio();
  // Los cierres se piden desde que se usa la app (primer registro de patrimonio), no desde el historial importado.
  const primerMes = P.length ? keyCal(P[0].fecha) : null;
  const ant = mesAnterior(hoyCal);
  if (primerMes && ant >= primerMes && !cierres().some((c) => c.mes === ant)) add("warn", `${mesLbl(ant)} sin cerrar · anota tus saldos del último día del mes`, "#cerrar", `cierre:${ant}`);
  if (!P.length) add("warn", "Aún no hay saldos registrados · se anotan al cerrar el mes", "#cerrar", `sinsaldos:${hoyCal}`);
  else { const d = diasDesde(P[P.length - 1].fecha); if (d > 40) add("warn", `Último registro de saldos hace ${d} días`, "#cerrar", `saldosviejos:${hoyCal}`); }
  const fd = fechaDatos();
  if (cuentas().some((c) => c.extracto) && (!fd || diasDesde(fd) > 8)) add("info", fd ? `Movimientos hasta el ${fd.toFormat("dd/MM")}: importa el extracto de tu banco para ver cómo vas` : "Importa el extracto de tu banco para empezar", "#importar", `importar:${fd ? fd.toISODate() : ""}`);
  const A = activos().filter((a) => !vendidoDelTodo(a));  // de lo que ya vendiste o traspasaste entero no hay valor que actualizar
  const viejos = A.filter((a) => !a.fechaValor || diasDesde(a.fechaValor) > 35);
  if (viejos.length) add("info", `Valor de la inversión sin actualizar hace más de un mes: ${viejos.map((a) => a.nombre).join(", ")}`, "#valores", `valores:${hoyCal}`);
  const malos = saludInversion().filter((x) => x.nivel === "error");
  if (malos.length) add("warn", `Tu inversión: ${malos.length === 1 ? "hay algo que no cuadra" : `${malos.length} cosas no cuadran`} (${malos.map((x) => x.activo.nombre).join(", ")}) · revísalo`, "#inversion", `salud:${hoyCal}:${malos.length}`);
  const sinIni = A.filter((a) => a.aportadoIni == null);
  if (sinIni.length) add("info", `Falta cuánto habías aportado antes a ${sinIni.map((a) => a.nombre).join(", ")} · sin rentabilidad`, "#gestionar/activo", `sinini:${sinIni.length}`);
  const F = prevision();
  if (!hayIngresosFijos() && fechaDatos() && sum(mesesHasta(hoyKey, 3).map((k) => finMes(k).ingresos)) > 0) add("info", "Tus ingresos aún no están como fijos: la previsión de los próximos meses no los cuenta · detéctalos", "#fijos", `ingfijos:${hoyCal}`);
  else if (F.conRegistro && F.minimo && F.minimo.saldo < 0) add("warn", `Tu dinero en cuentas bajaría a ${eur(F.minimo.saldo, 0)} en ${mesLbl(F.minimo.key).toLowerCase()}`, "#inicio", `minimo:${F.minimo.key}:${hoyCal}`);
  if (F.agota) {
    const meses = Math.round(mesDT(F.agota.key).diff(mesDT(hoyKey), "months").months);
    add(meses <= 1 ? "warn" : "info", `El dinero sin invertir de ${nombresBroker()} se acaba en ${mesLbl(F.agota.key).toLowerCase()}: ese mes faltan ${eur(F.agota.apoBanco, 0)} para las aportaciones · pasa dinero desde el banco antes`, "#inicio", `agota:${F.agota.key}`);
  }
  // Ritmo del gasto variable del mes en curso (desde el día 7, mientras no se haya pasado ya: eso lo dice la barra).
  const Mh = finMes(hoyKey), vari = gastoVariable(Mh), d = diaDeMes(hoy), dm = diasMes(hoyKey);
  if (limiteVar > 0 && d >= 7 && d < dm && vari <= limiteVar) {
    const proy = (vari / d) * dm;
    if (proy > limiteVar * 1.05) add("warn", `A este ritmo acabarás ${mesLbl(hoyKey).toLowerCase()} con ${eur(proy, 0)} de gasto variable (límite ${eur(limiteVar, 0)}; llevas ${eur(vari, 0)})`, "#movimientos", `ritmo:${hoyKey}`);
  }
  // Categorías disparadas este mes: ≥ 2× su media de los meses anteriores con datos (y al menos 50 € más).
  const previos = mesesHasta(mesAnterior(hoyKey), 3).filter(conDatos);
  if (previos.length >= 2 && d >= 5) {
    const porCat = (M) => { const m = new Map(); for (const x of M.real.filter((x) => x.gasto && grupoDe(x.categoria) !== "fijo")) m.set(x.categoria, (m.get(x.categoria) || 0) + x.gasto); return m; };
    const actual = porCat(Mh), antes = previos.map((k) => porCat(finMes(k)));
    for (const [cat, v] of actual) {
      const med = media(antes.map((m) => m.get(cat) || 0));
      if ((med > 0 && v >= 2 * med && v - med >= 50) || (med === 0 && v >= 150))
        add("info", `${cat}: ${eur(v, 0)} este mes, ${med > 0 ? `${nf(v / med, 1, 1)}× tu media (${eur(med, 0)})` : "sin gasto los meses anteriores"}`, "#movimientos", `cat:${cat}:${hoyKey}`);
    }
  }
  // Presupuestos por categoría del mes en curso.
  for (const c of resumenCategorias(hoyKey).filter((c) => c.presupuesto > 0)) {
    if (c.valor > c.presupuesto) add("warn", `${c.nombre}: llevas ${eur(c.valor, 0)} de un presupuesto de ${eur(c.presupuesto, 0)}`, "#movimientos/categorias", `pres:${c.nombre}:${hoyKey}`);
    else if (c.valor >= 0.9 * c.presupuesto && d < dm - 3) add("info", `${c.nombre}: ya llevas el ${Math.round((100 * c.valor) / c.presupuesto)} % de su presupuesto`, "#movimientos/categorias", `pres90:${c.nombre}:${hoyKey}`);
  }
  // Recordatorios con fecha.
  for (const r of recordatorios().filter((r) => r.estado !== "hecho" && r.fecha.minus({ days: r.avisar }) <= finHoy)) {
    const vencido = r.fecha <= finHoy;
    add(vencido ? "warn" : "info", `${r.nombre} · ${vencido ? "desde el" : "el"} ${r.fecha.toFormat("dd/MM/yyyy")}${r.texto ? ` · ${r.texto}` : ""}`, r.p.file.path, `rec:${r.p.id}:${r.fecha.toISODate()}:${vencido ? "v" : "a"}`);
  }
  return out;
}

// ───────────── hitos del patrimonio, reparto objetivo y tamaño de las compras ─────────────
// Funciones puras (reciben los datos) para poder probarlas con números sencillos.
const HITOS = [1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
// Hitos del patrimonio: los ya cruzados (con la fecha del primer registro que los supera; si solo los cruza la estimación de
// hoy, la fecha es hoy) y los siguientes. puntos: [{ fecha, neto }] por orden de fecha · actual: patrimonio estimado hoy.
function hitosPatrimonio(puntos, actual, hoyF) {
  const techo = Math.max(actual || 0, ...puntos.map((p) => p.neto));
  const logrados = HITOS.filter((h) => h <= techo).map((h) => {
    const p = puntos.find((x) => x.neto >= h);
    return { valor: h, fecha: p ? p.fecha : hoyF, hoy: !p, inicial: !!p && p === puntos[0] };  // inicial: ya lo tenías en el primer registro
  });
  const faltan = HITOS.filter((h) => h > (actual || 0));
  return { logrados, proximos: faltan.slice(0, 2).map((h) => ({ valor: h, falta: h - (actual || 0) })), siguiente: faltan[0] || null };
}
// Reparto objetivo: de los activos con `objetivo` (% deseado), cuánto se alejan de él y a cuál llevar la próxima aportación
// (el más por debajo; solo si pasa de la banda de 5 puntos: dentro de ella no hay que hacer nada). Sin vender nada.
function repartoObjetivo(filas, banda = 5) {
  const total = sum(filas.map((f) => f.valor));
  const conObj = filas.filter((f) => f.valor > 0 && hasNum(f.p.objetivo) && num(f.p.objetivo) > 0);
  if (!(total > 0) || !conObj.length) return null;
  const lista = conObj.map((f) => ({ f, objetivo: num(f.p.objetivo), actual: (100 * f.valor) / total })).map((x) => ({ ...x, dif: x.actual - x.objetivo }));
  const debajo = lista.filter((x) => x.dif < -banda).sort((a, b) => a.dif - b.dif)[0] || null;
  return { lista, proxima: debajo, dentro: !lista.some((x) => Math.abs(x.dif) > banda) };
}
// Comprueba los % que el usuario teclea para su reparto objetivo. `valores`: cadenas o números (vacío = sin objetivo).
// Vale si no hay ninguno (quitar el objetivo) o si cada uno está entre 0 y 100 y suman 100 (con 0,05 de margen por los decimales).
function validarObjetivos(valores) {
  const lleno = valores.filter((v) => String(v ?? "").trim() !== "");
  if (!lleno.length) return { ok: true, vacio: true, suma: 0, falta: 0, mensaje: "" };
  const n = lleno.map((v) => Number(String(v).replace(",", ".")));
  if (n.some((x) => !isFinite(x) || x < 0 || x > 100)) return { ok: false, suma: NaN, falta: NaN, mensaje: "Cada porcentaje tiene que estar entre 0 y 100." };
  const suma = Math.round(n.reduce((a, b) => a + b, 0) * 100) / 100, falta = Math.round((100 - suma) * 100) / 100;
  if (Math.abs(falta) <= 0.05) return { ok: true, suma, falta: 0, mensaje: "" };
  return { ok: false, suma, falta, mensaje: falta > 0 ? `Suman ${suma.toLocaleString("es-ES")} %: faltan ${falta.toLocaleString("es-ES")} puntos para llegar a 100 %.` : `Suman ${suma.toLocaleString("es-ES")} %: sobran ${(-falta).toLocaleString("es-ES")} puntos para quedarte en 100 %.` };
}
// Reparto actual frente al objetivo y, dado un importe, cómo repartir la próxima aportación sin vender nada.
// filas: [{ valor, p: { objetivo } }] (los activos de la pantalla). Solo cuentan los que tienen objetivo; si sus % no suman 100
// se escalan para que sí (normalizado = true). La aportación va a los que están por debajo, en proporción a lo que les falta
// para llegar a su parte del total (valor actual + aportación): así nunca sobra nada y no se vende ningún activo.
// Devuelve null sin objetivos. Los importes del reparto van en céntimos exactos (la suma da justo el importe).
function repartoAportacion(filas, importe = 0, banda = 5) {
  const base = filas.filter((f) => hasNum(f.p.objetivo) && num(f.p.objetivo) > 0 && f.valor >= 0);
  if (!base.length) return null;
  const sumaObj = sum(base.map((f) => num(f.p.objetivo))), total = sum(base.map((f) => f.valor));
  const cent = Math.max(0, Math.round((importe || 0) * 100)), x = cent / 100, T = total + x;
  const lineas = base.map((f) => {
    const objetivo = (100 * num(f.p.objetivo)) / sumaObj, ideal = (objetivo / 100) * T;
    return { f, objetivo, actual: total > 0 ? (100 * f.valor) / total : 0, falta: Math.max(0, ideal - f.valor), aporta: 0 };
  });
  const S = sum(lineas.map((l) => l.falta));
  if (cent > 0 && S > 0) {
    // Reparto proporcional a lo que falta, en céntimos: parte entera y los céntimos sobrantes a los mayores restos.
    const parte = lineas.map((l) => (l.falta * cent) / S), base0 = parte.map(Math.floor);
    let resto = cent - sum(base0);
    [...parte.keys()].sort((a, b) => parte[b] - base0[b] - (parte[a] - base0[a])).slice(0, Math.max(0, resto)).forEach((i) => base0[i]++);
    lineas.forEach((l, i) => (l.aporta = base0[i] / 100));
  }
  for (const l of lineas) { l.dif = l.actual - l.objetivo; l.despues = T > 0 ? (100 * (l.f.valor + l.aporta)) / T : 0; l.difDespues = l.despues - l.objetivo; }
  return { lineas, total, importe: x, normalizado: Math.abs(sumaObj - 100) > 0.05, sumaObjetivos: sumaObj, dentro: !lineas.some((l) => Math.abs(l.dif) > banda) };
}
// Meses que tardarías en llegar a `meta` con esos supuestos (null si no llega en 50 años).
function mesesHasta50(inicial, apoMes, rentAnual, meta) {
  if (inicial >= meta) return 0;
  const rm = Math.pow(1 + rentAnual, 1 / 12) - 1;
  let v = inicial;
  for (let m = 1; m <= 600; m++) { v = v * (1 + rm) + apoMes; if (v >= meta) return m; }
  return null;
}
// Tamaño de una compra frente a las que ya has hecho en ese activo (tercios): pequeña · habitual · grande. Con menos de 6, nada.
function tamañoCompras(importes) {
  const v = importes.filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length < 6) return null;
  const p33 = v[Math.floor(v.length / 3)], p67 = v[Math.floor((2 * v.length) / 3)];
  return { p33, p67, de: (x) => (x < p33 ? "pequeña" : x > p67 ? "grande" : "habitual") };
}

// ───────────── plusvalías por FIFO («Para la renta») ─────────────
// Las ventas descuentan el coste de las compras más antiguas (primero entrado, primero salido), como pide Hacienda en fondos,
// acciones y cripto. Un traspaso entre fondos no tributa: el coste y la antigüedad pasan al fondo nuevo. Orientativo.
// ops: [{ id, fecha: DateTime, activo, importe (+compra, −venta), part (participaciones o null), traspaso, ajuste }]
// → { ventas: [{ id, fecha, activo, unidades, valor, coste, resultado, faltan }], sinDatos: [activos sin participaciones], traspasos }
function fifoVentas(ops) {
  const o = ops.filter((x) => !x.ajuste);
  const sinDatos = new Set(o.filter((x) => x.part == null || !isFinite(x.part) || Math.abs(x.part) < 1e-9).map((x) => x.activo));
  const validas = o.filter((x) => !sinDatos.has(x.activo));
  // La pareja de cada traspaso: la venta de un fondo y la compra de otro por el mismo importe en pocos días
  const comprasT = validas.filter((x) => x.traspaso && x.importe > 0), pareja = new Map(), usadas = new Set();
  for (const s of validas.filter((x) => x.traspaso && x.importe < 0)) {
    const b = comprasT.find((c) => !usadas.has(c.id) && c.activo !== s.activo && Math.abs(c.fecha.diff(s.fecha, "days").days) <= 6 && Math.abs(Math.abs(c.importe) - Math.abs(s.importe)) <= Math.max(1, 0.01 * Math.abs(s.importe)));
    if (b) { pareja.set(s.id, b.id); usadas.add(b.id); }
  }
  // Mismo día: compras normales, venta del traspaso, compra del traspaso y, al final, las ventas normales
  const rango = (x) => (x.importe > 0 ? (x.traspaso ? 2 : 0) : x.traspaso && pareja.has(x.id) ? 1 : 3);
  const orden = [...validas].sort((a, b) => a.fecha.toMillis() - b.fecha.toMillis() || rango(a) - rango(b));
  const lotes = new Map(), pasar = new Map(), ventas = [];
  const de = (n) => { if (!lotes.has(n)) lotes.set(n, []); return lotes.get(n); };
  const consumir = (activo, u) => {
    const L = de(activo); let quedan = u, coste = 0; const tomados = [];
    while (quedan > 1e-9 && L.length) {
      const l = L[0], t = Math.min(l.u, quedan), c = (l.coste * t) / l.u;
      tomados.push({ u: t, coste: c, fecha: l.fecha }); coste += c; quedan -= t; l.u -= t; l.coste -= c;
      if (l.u <= 1e-9) L.shift();
    }
    return { coste, tomados, faltan: Math.max(0, quedan) };
  };
  for (const x of orden) {
    const u = Math.abs(x.part);
    if (x.importe > 0) {
      const heredados = x.traspaso ? pasar.get(x.id) : null;
      if (heredados && heredados.length) { const tot = sum(heredados.map((l) => l.u)), k = tot > 0 ? u / tot : 1; for (const l of heredados) de(x.activo).push({ u: l.u * k, coste: l.coste, fecha: l.fecha }); }
      else de(x.activo).push({ u, coste: x.importe, fecha: x.fecha });
    } else {
      const c = consumir(x.activo, u);
      if (x.traspaso && pareja.has(x.id)) { pasar.set(pareja.get(x.id), c.tomados); continue; }  // no tributa: el coste viaja al fondo nuevo
      const vendidas = u - c.faltan, valor = -x.importe * (u > 0 ? vendidas / u : 1);
      ventas.push({ id: x.id, fecha: x.fecha, activo: x.activo, unidades: vendidas, valor, coste: c.coste, resultado: valor - c.coste, faltan: c.faltan });
    }
  }
  return { ventas, sinDatos: [...sinDatos], traspasos: pareja.size };
}
// ───────────── estimación de la renta (base del ahorro) ─────────────
// Tramos estatales + autonómicos de la base del ahorro (desde 2025): [hasta, tipo].
const TRAMOS_AHORRO = [[6000, 0.19], [50000, 0.21], [200000, 0.23], [300000, 0.27], [Infinity, 0.30]];
function cuotaAhorro(base) {
  let cuota = 0, desde = 0;
  for (const [hasta, tipo] of TRAMOS_AHORRO) { if (base <= desde) break; cuota += (Math.min(base, hasta) - desde) * tipo; desde = hasta; }
  return cuota;
}
// Año a año: el resultado de las ventas se junta con las pérdidas que arrastras (las de los 4 años anteriores, primero las más
// viejas); una pérdida puede restar además hasta el 25 % de los dividendos del año. Lo que no se compensa queda pendiente.
// años: [{ año, ventas (ganancia − pérdida), dividendos (brutos), retenido }] → Map año → { base, cuota, retenido, diferencia,
// pendAntes, usado, pendDespues }. Orientativo: no conoce tus otras rentas del ahorro ni la regla de los dos meses.
function rentaPorAño(años) {
  const out = new Map();
  let pend = [];
  for (const y of [...años].sort((a, b) => a.año - b.año)) {
    pend = pend.filter((p) => y.año - p.año <= 4);
    const pendAntes = sum(pend.map((p) => p.importe));
    let gp = y.ventas, rcm = Math.max(0, y.dividendos), tope = 0.25 * rcm, usado = 0;
    if (gp < 0) { const c = Math.min(-gp, tope); gp += c; rcm -= c; tope -= c; }
    for (const p of pend) {
      if (gp > 0) { const c = Math.min(p.importe, gp); p.importe -= c; gp -= c; usado += c; }
      if (p.importe > 0 && tope > 0) { const c = Math.min(p.importe, tope); p.importe -= c; rcm -= c; tope -= c; usado += c; }
    }
    pend = pend.filter((p) => p.importe > 0.005);
    if (gp < -0.005) pend.push({ año: y.año, importe: -gp });
    const base = Math.max(0, gp) + rcm, cuota = cuotaAhorro(base), retenido = y.retenido || 0;
    out.set(y.año, { base, cuota, retenido, diferencia: cuota - retenido, pendAntes, usado, pendDespues: sum(pend.map((p) => p.importe)) });
  }
  return out;
}
// El año de «Para la renta» en CSV (punto y coma y coma decimal: se abre tal cual en un Excel en español).
function csvRenta(año, ventas, cobrosAño) {
  const n = (x, d = 2) => (isFinite(x) ? x.toFixed(d).replace(".", ",") : "");
  const c = (v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const filas = [[`Ventas de ${año}`], ["Fecha", "Activo", "Participaciones", "Vendido por", "Coste", "Resultado"],
    ...ventas.map((v) => [v.fecha.toFormat("dd/MM/yyyy"), v.activo, n(v.unidades, 6), n(v.valor), n(v.coste), n(v.resultado)]),
    ["Total", "", "", n(sum(ventas.map((v) => v.valor))), n(sum(ventas.map((v) => v.coste))), n(sum(ventas.map((v) => v.resultado)))], [],
    [`Dividendos y comisiones de ${año}`], ["Fecha", "Activo", "Qué", "Te llegó", "Retención", "Bruto"],
    ...cobrosAño.map((x) => [x.fecha.toFormat("dd/MM/yyyy"), x.activo, x.tipo === "comision" ? "Comisión" : "Dividendo", n(x.tipo === "comision" ? -x.importe : x.importe), x.tipo === "comision" ? "" : n(x.retencion), x.tipo === "comision" ? "" : n(x.importe + x.retencion)])];
  return "\ufeff" + filas.map((f) => f.map(c).join(";")).join("\r\n") + "\r\n";
}
const opsParaRenta = () => aportacionesReales().map((x) => ({ id: x.p.id, fecha: x.fecha, activo: x.activo, importe: x.importe, part: hasNum(x.p.participaciones) ? num(x.p.participaciones) : null, traspaso: !!x.p.traspaso, ajuste: !!x.p.ajuste }));

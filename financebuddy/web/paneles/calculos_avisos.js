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
function avisos() {
  const out = [];
  const add = (nivel, texto, ruta) => out.push({ nivel, texto, ruta });
  const nPend = (DB.pendientes || []).length;
  if (nPend) add("warn", `${nPend} movimiento${nPend > 1 ? "s" : ""} por revisar: la app no ha sabido clasificarlo${nPend > 1 ? "s" : ""} sola`, "#revisar");
  for (const x of subidasFijos()) add("warn", `${x.nombre} ha subido: de ${eur(x.antes, 2)} a ${eur(x.ahora, 2)}`, "#gestionar/recurrente");
  const nArch = ((DB.info || {}).archivos || []).length;
  if (nArch) add("warn", `${nArch} archivo${nArch > 1 ? "s" : ""} en la carpeta Importar sin procesar`, "#importar");
  const K = conciliacion();
  const desc = K ? K.filas.filter((f) => Math.abs(f.dif) > 1) : [];
  if (desc.length) add("warn", `No cuadra entre el ${K.desde.toFormat("dd/MM")} y el ${K.hasta.toFormat("dd/MM")}: ${desc.map((f) => `${f.nombre} ${eurS(f.dif)}`).join(", ")} · falta o sobra algún movimiento`, "#cerrar");
  const P = patrimonio();
  // Los cierres se piden desde que se usa la app (primer registro de patrimonio), no desde el historial importado.
  const primerMes = P.length ? keyCal(P[0].fecha) : null;
  const ant = mesAnterior(hoyCal);
  if (primerMes && ant >= primerMes && !cierres().some((c) => c.mes === ant)) add("warn", `${mesLbl(ant)} sin cerrar · anota tus saldos del último día del mes`, "#cerrar");
  if (!P.length) add("warn", "Aún no hay saldos registrados · se anotan al cerrar el mes", "#cerrar");
  else { const d = diasDesde(P[P.length - 1].fecha); if (d > 40) add("warn", `Último registro de saldos hace ${d} días`, "#cerrar"); }
  const fd = fechaDatos();
  if (cuentas().some((c) => c.extracto) && (!fd || diasDesde(fd) > 8)) add("info", fd ? `Movimientos hasta el ${fd.toFormat("dd/MM")}: importa el extracto de tu banco para ver cómo vas` : "Importa el extracto de tu banco para empezar", "#importar");
  const A = activos();
  const viejos = A.filter((a) => !a.fechaValor || diasDesde(a.fechaValor) > 35);
  if (viejos.length) add("info", `Valor de la inversión sin actualizar hace más de un mes: ${viejos.map((a) => a.nombre).join(", ")}`, "#valores");
  const malos = saludInversion().filter((x) => x.nivel === "error");
  if (malos.length) add("warn", `Tu inversión: ${malos.length === 1 ? "hay algo que no cuadra" : `${malos.length} cosas no cuadran`} (${malos.map((x) => x.activo.nombre).join(", ")}) · revísalo`, "#inversion");
  const sinIni = A.filter((a) => a.aportadoIni == null);
  if (sinIni.length) add("info", `Falta cuánto habías aportado antes a ${sinIni.map((a) => a.nombre).join(", ")} · sin rentabilidad`, "#gestionar/activo");
  const F = prevision();
  if (!hayIngresosFijos() && fechaDatos() && sum(mesesHasta(hoyKey, 3).map((k) => finMes(k).ingresos)) > 0) add("info", "Tus ingresos aún no están como fijos: la previsión de los próximos meses no los cuenta · detéctalos", "#fijos");
  else if (F.conRegistro && F.minimo && F.minimo.saldo < 0) add("warn", `Tu dinero en cuentas bajaría a ${eur(F.minimo.saldo, 0)} en ${mesLbl(F.minimo.key).toLowerCase()}`, "#inicio");
  if (F.agota) {
    const meses = Math.round(mesDT(F.agota.key).diff(mesDT(hoyKey), "months").months);
    add(meses <= 1 ? "warn" : "info", `El dinero sin invertir de ${nombresBroker()} se acaba en ${mesLbl(F.agota.key).toLowerCase()}: ese mes faltan ${eur(F.agota.apoBanco, 0)} para las aportaciones · pasa dinero desde el banco antes`, "#inicio");
  }
  // Ritmo del gasto variable del mes en curso (desde el día 7, mientras no se haya pasado ya: eso lo dice la barra).
  const Mh = finMes(hoyKey), vari = gastoVariable(Mh), d = diaDeMes(hoy), dm = diasMes(hoyKey);
  if (limiteVar > 0 && d >= 7 && d < dm && vari <= limiteVar) {
    const proy = (vari / d) * dm;
    if (proy > limiteVar * 1.05) add("warn", `A este ritmo acabarás ${mesLbl(hoyKey).toLowerCase()} con ${eur(proy, 0)} de gasto variable (límite ${eur(limiteVar, 0)}; llevas ${eur(vari, 0)})`, "#movimientos");
  }
  // Categorías disparadas este mes: ≥ 2× su media de los meses anteriores con datos (y al menos 50 € más).
  const previos = mesesHasta(mesAnterior(hoyKey), 3).filter(conDatos);
  if (previos.length >= 2 && d >= 5) {
    const porCat = (M) => { const m = new Map(); for (const x of M.real.filter((x) => x.gasto && grupoDe(x.categoria) !== "fijo")) m.set(x.categoria, (m.get(x.categoria) || 0) + x.gasto); return m; };
    const actual = porCat(Mh), antes = previos.map((k) => porCat(finMes(k)));
    for (const [cat, v] of actual) {
      const med = media(antes.map((m) => m.get(cat) || 0));
      if ((med > 0 && v >= 2 * med && v - med >= 50) || (med === 0 && v >= 150))
        add("info", `${cat}: ${eur(v, 0)} este mes, ${med > 0 ? `${nf(v / med, 1, 1)}× tu media (${eur(med, 0)})` : "sin gasto los meses anteriores"}`, "#movimientos");
    }
  }
  // Presupuestos por categoría del mes en curso.
  for (const c of resumenCategorias(hoyKey).filter((c) => c.presupuesto > 0)) {
    if (c.valor > c.presupuesto) add("warn", `${c.nombre}: llevas ${eur(c.valor, 0)} de un presupuesto de ${eur(c.presupuesto, 0)}`, "#movimientos/categorias");
    else if (c.valor >= 0.9 * c.presupuesto && d < dm - 3) add("info", `${c.nombre}: ya llevas el ${Math.round((100 * c.valor) / c.presupuesto)} % de su presupuesto`, "#movimientos/categorias");
  }
  // Recordatorios con fecha.
  for (const r of recordatorios().filter((r) => r.estado !== "hecho" && r.fecha.minus({ days: r.avisar }) <= finHoy)) {
    const vencido = r.fecha <= finHoy;
    add(vencido ? "warn" : "info", `${r.nombre} · ${vencido ? "desde el" : "el"} ${r.fecha.toFormat("dd/MM/yyyy")}${r.texto ? ` · ${r.texto}` : ""}`, r.p.file.path);
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
const opsParaRenta = () => aportacionesReales().map((x) => ({ id: x.p.id, fecha: x.fecha, activo: x.activo, importe: x.importe, part: hasNum(x.p.participaciones) ? num(x.p.participaciones) : null, traspaso: !!x.p.traspaso, ajuste: !!x.p.ajuste }));

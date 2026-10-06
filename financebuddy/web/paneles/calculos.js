// ═════════════ cálculos ═════════════
// Mes: solo lo ya ocurrido (fecha ≤ hoy) cuenta como ingreso/gasto; lo posterior va a `*Prev` (pendiente).
// Se guarda en caché por render (`_finMes`, se vacía en render()): los paneles piden el mismo mes muchas veces.
let _finMes = new Map();
function finMes(key) {
  if (_finMes.has(key)) return _finMes.get(key);
  const ms = movsDelMes(key);
  const real = ms.filter((m) => !m.previsto), prev = ms.filter((m) => m.previsto);
  const ing = (arr) => sum(arr.filter((m) => m.clase === "ingreso").map((m) => m.importe));
  const gas = (arr) => sum(arr.map((m) => m.gasto)); // gastos − reembolsos
  const ingresos = ing(real), gastos = gas(real);
  const ahorro = ingresos - gastos;
  const r = {
    key, ms, real, ingresos, gastos, ahorro, tasa: ingresos > 0 ? ahorro / ingresos : NaN,
    ingresosPrev: ing(prev), gastosPrev: gas(prev),
  };
  _finMes.set(key, r);
  return r;
}
// Gasto medio de los 3 últimos meses completos con gastos (para metas en «meses de gasto»).
function gastoMedioReciente() {
  const g = mesesHasta(mesAnterior(hoyKey), 3).map((k) => finMes(k).gastos).filter((x) => x > 0);
  return g.length ? media(g) : NaN;
}
// Meses con datos propios (algún movimiento real, no solo recurrentes automáticos).
const conDatos = (key) => finMes(key).real.some((m) => !m.auto);
// Tasa de ahorro de los 12 meses que acaban en `key` (suaviza la estacionalidad).
function tasa12(key) {
  const s = mesesHasta(key, 12).map(finMes);
  const ing = sum(s.map((x) => x.ingresos)), gas = sum(s.map((x) => x.gastos));
  return { ing, gas, tasa: ing > 0 ? (ing - gas) / ing : NaN, meses: s.filter((x) => x.ingresos || x.gastos).length };
}
// ───────────── inversión ─────────────
// El `valor` de un activo es a `fecha_valor`; las aportaciones posteriores aún no están dentro → se suman.
const aportTrasValor = (a) => a.fechaValor ? sum(aportacionesReales().filter((x) => x.activo === a.nombre && x.fecha > a.fechaValor.endOf("day")).map((x) => x.importe)) : 0;
// Sin valor anotado ni precio conocido (p. ej. un activo recién creado al importar), vale lo aportado: no es una pérdida del 100 %.
const aportadoActivo = (a) => (a.aportadoIni || 0) + sum(aportacionesReales().filter((x) => x.activo === a.nombre).map((x) => x.importe));
// Sin participaciones: lo que queda es solo el redondeo del bróker (≤ 1 % de lo comprado; p. ej. 0,116 − 0,117).
const casiCero = (quedan, compradas) => Math.abs(quedan) <= Math.max(1e-6, 0.01 * compradas);
// Posición de un activo según sus operaciones. Participaciones: la suma de las de cada operación más los ajustes
// («cuadrar con el bróker»); se conocen si todas las operaciones las traen o un ajuste posterior cubre las que no.
// Precio medio: lo pagado en las compras ÷ participaciones compradas. Último precio: el de la última operación con
// participaciones (importe ÷ participaciones), para estimar lo que vale si no has anotado su valor.
let _pos = new Map();
function posicion(a) {
  if (_pos.has(a.nombre)) return _pos.get(a.nombre);
  const ops = aportacionesReales().filter((x) => x.activo === a.nombre);
  const ajustes = ops.filter((x) => x.p.ajuste), normales = ops.filter((x) => !x.p.ajuste);
  const tiene = (x) => hasNum(x.p.participaciones);
  const ultAjuste = ajustes.length ? DateTime.max(...ajustes.map((x) => x.fecha)).endOf("day") : null;
  const cubierta = (f) => !!(ultAjuste && f && f <= ultAjuste);
  const faltan = normales.filter((x) => !tiene(x) && !cubierta(x.fecha));
  const iniSinCubrir = a.aportadoIni > 0 && !(ultAjuste && (!a.fechaIni || cubierta(a.fechaIni)));
  const conPart = ops.length > 0 && !faltan.length && !iniSinCubrir;
  const compras = normales.filter((x) => x.importe > 0);
  const compradas = sum(compras.map((x) => num(x.p.participaciones))) + sum(ajustes.map((x) => num(x.p.participaciones)));
  const coste = sum(compras.map((x) => x.importe)) + (a.aportadoIni > 0 ? a.aportadoIni : 0);
  const conPrecio = normales.filter((x) => tiene(x) && Math.abs(num(x.p.participaciones)) > 1e-9 && Math.abs(x.importe) > 0.005);
  const u = conPrecio[conPrecio.length - 1];
  const r = {
    ops, conPart, part: conPart ? sum(ops.map((x) => num(x.p.participaciones))) : null, contadas: sum(ops.map((x) => num(x.p.participaciones))),
    compradas, precioMedio: conPart && compradas > 0 ? coste / compradas : null,
    ultimoPrecio: u ? { precio: Math.abs(u.importe / num(u.p.participaciones)), fecha: u.fecha } : null,
    sinPart: normales.filter((x) => !tiene(x)).length, faltan: faltan.length, ajustes: ajustes.length, supuestas: normales.filter((x) => x.p.supuesta).length,
  };
  r.vendido = conPart && ops.length > 1 && casiCero(r.part, compradas);
  _pos.set(a.nombre, r);
  return r;
}
const vendidoDelTodo = (a) => posicion(a).vendido;
// Lo que vale hoy y de dónde sale: «mercado» (participaciones × el precio de internet, si lo activaste y es más nuevo que lo
// anotado), «anotado» (Actualizar valores), «precio» (participaciones × precio de la última operación: estimado), «metido»
// (sin datos: lo aportado) o «vendido» (0).
// El precio de internet manda si se conocen las participaciones y es reciente (≤ 7 días): si configuraste una fuente, quieres que
// se actualice solo. Si el servicio lleva más tiempo sin dar precio, vale lo anotado (salvo que el precio sea más nuevo).
const usaMercado = (P, M, a) => !!(M && P.conPart && P.part > 0 && !P.vendido
  && (!a.conValor || !a.fechaValor || M.fecha > a.fechaValor || hoy.diff(M.fecha, "days").days <= 7));
function valorInfo(a) {
  const M = precioMercado(a);
  if (M) {
    const P = posicion(a);
    if (usaMercado(P, M, a)) return { valor: P.part * M.precio, fuente: "mercado", precio: M };
  }
  if (a.conValor) return { valor: a.valor + aportTrasValor(a), fuente: "anotado" };
  const P = posicion(a);
  if (P.vendido) return { valor: 0, fuente: "vendido" };
  if (P.conPart && P.part > 0 && P.ultimoPrecio) return { valor: P.part * P.ultimoPrecio.precio, fuente: "precio", precio: P.ultimoPrecio };
  return { valor: Math.max(0, aportadoActivo(a)), fuente: "metido" };  // nunca negativo (p. ej. un traspaso tomado por venta)
}
const valorHoy = (a) => valorInfo(a).valor;
const conValorReal = (a) => ["anotado", "precio", "mercado"].includes(valorInfo(a).fuente);
// TIR anualizada (XIRR). flujos: [{ fecha, importe }], negativo = dinero que pones, positivo = lo que recibes/vale.
function xirr(fl) {
  if (fl.length < 2 || !fl.some((f) => f.importe > 0) || !fl.some((f) => f.importe < 0)) return NaN;
  const t0 = DateTime.min(...fl.map((f) => f.fecha));
  const años = fl.map((f) => f.fecha.diff(t0, "days").days / 365);
  const npv = (r) => sum(fl.map((f, i) => f.importe / Math.pow(1 + r, años[i])));
  let lo = -0.99, hi = 10, flo = npv(lo), fhi = npv(hi);
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (fm * flo > 0) { lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}
// Flujos de un activo para la TIR: aportado inicial en `fecha_inicio`, aportaciones reales y el valor de hoy.
function flujosActivo(a) {
  if (!conValorReal(a) || a.aportadoIni == null || (a.aportadoIni > 0 && !a.fechaIni)) return null;
  const fl = [];
  if (a.aportadoIni > 0) fl.push({ fecha: a.fechaIni, importe: -a.aportadoIni });
  for (const x of aportacionesReales().filter((x) => x.activo === a.nombre && Math.abs(x.importe) > 0.005)) fl.push({ fecha: x.fecha, importe: -x.importe });
  for (const c of cobros().filter((c) => c.activo === a.nombre)) fl.push({ fecha: c.fecha, importe: c.tipo === "dividendo" ? c.importe : -c.importe });  // lo que te da el activo vuelve a ti
  fl.push({ fecha: hoy, importe: valorHoy(a) });
  return fl;
}
function resumenInversion(soloLargo = false) {
  const AP = aportaciones(), APr = aportacionesReales();
  const todas = activos().filter((a) => !soloLargo || a.largo).map((a) => {
    const conocido = a.aportadoIni != null;
    const mias = APr.filter((x) => x.activo === a.nombre);
    const aportado = (a.aportadoIni || 0) + sum(mias.map((x) => x.importe));
    const V = valorInfo(a), P = posicion(a);
    const valor = V.valor, real = V.fuente === "anotado" || V.fuente === "precio" || V.fuente === "mercado";
    const CB = cobros().filter((c) => c.activo === a.nombre);
    const dividendos = sum(CB.filter((c) => c.tipo === "dividendo").map((c) => c.importe)), comisionesCobro = sum(CB.filter((c) => c.tipo === "comision").map((c) => c.importe));
    const cobrado = dividendos - comisionesCobro;  // lo que el activo te ha dado (o cobrado) además de su valor
    const fl = flujosActivo(a);
    const desde = fl ? DateTime.min(...fl.map((f) => f.fecha)) : null;
    return { ...a, valor, fuente: V.fuente, precioEstimado: V.precio || null, conValorReal: real, ajuste: valor - a.valor, aportado, conocido,
      gan: real && conocido && aportado > 0 ? valor + cobrado - aportado : NaN, dividendos, comisionesCobro, cobrado, fl, tir: fl ? xirr(fl) : NaN, desde,
      participaciones: P.part, compradas: P.compradas, precioMedio: P.precioMedio, ultimoPrecio: P.ultimoPrecio, operaciones: mias.filter((x) => !x.p.ajuste).length, vendido: P.vendido };
  });
  // Vendido del todo (0 participaciones): no es cartera; su resultado es lo que sacaste − lo que metiste.
  const cerradas = todas.filter((f) => f.vendido && !f.conValor).map((f) => ({ nombre: f.nombre, resultado: -f.aportado, p: f.p }));
  const filas = todas.filter((f) => !(f.vendido && !f.conValor));
  const total = sum(filas.map((f) => f.valor));
  const con = filas.filter((f) => f.conValorReal && f.conocido && f.aportado > 0);
  const aportado = sum(con.map((f) => f.aportado)), gan = sum(con.map((f) => f.gan));
  const conTir = filas.filter((f) => f.fl);
  const tir = conTir.length ? xirr(conTir.flatMap((f) => f.fl)) : NaN;
  const desde = conTir.length ? DateTime.min(...conTir.map((f) => f.desde)) : null;
  return { filas, cerradas, total, aportado, gan, dividendos: sum(filas.map((f) => f.dividendos)), AP, sinAport: filas.filter((f) => !f.conocido).length, sinValor: filas.filter((f) => f.fuente === "metido").length,
    estimados: filas.filter((f) => f.fuente === "precio").length, mercado: filas.filter((f) => f.fuente === "mercado").length,
    fechaMercado: filas.filter((f) => f.fuente === "mercado").reduce((m, f) => (!m || f.precioEstimado.fecha < m ? f.precioEstimado.fecha : m), null),
    aportadoTodo: sum(filas.map((f) => f.aportado)), tir, tirParcial: conTir.length < filas.length, tirCorta: desde ? hoy.diff(desde, "days").days < 365 : false };
}

// Lo que conviene revisar de la cartera: lo importado puede venir mal o incompleto (un traspaso tomado por venta,
// operaciones sin participaciones, compras que no se sabe si fueron ventas, duplicados, el mismo activo dos veces…).
// Cada aviso: { clave, nivel: error|aviso|info, activo, texto, accion: { text, ruta } }. Los descartados (config) no salen.
const NIVEL_SALUD = { error: 0, aviso: 1, info: 2 };
const claveNombre = (n) => norm(n).replace(/\b(fondo|fund|index|indice|acc|eur|clase|class|etf|etc|ucits|the|de|del|lc)\b/g, "").replace(/[^a-z0-9]/g, "");
function saludInversion(soloDe) {
  const out = [], descartados = new Set((DB.config || {}).avisos_descartados || []), traspasos = new Set();
  const add = (x) => { if (!descartados.has(x.clave) && (!soloDe || x.activo.nombre === soloDe)) out.push(x); };
  const ficha = (a) => `#activo/${a.p.id}`;
  const A = activos();
  for (const a of A) {
    const P = posicion(a), V = valorInfo(a);
    const normales = P.ops.filter((x) => !x.p.ajuste);
    if (!normales.length) continue;
    if (normales.every((x) => x.importe < 0) && !normales.some((x) => hasNum(x.p.participaciones)) && !(a.aportadoIni > 0) && traspasos.add(a.nombre))
      add({ clave: `traspaso|${a.nombre}`, nivel: "error", activo: a, accion: { text: "Revisar", ruta: ficha(a) },
        texto: `«${a.nombre}» solo tiene ventas (${eur(-sum(normales.map((x) => x.importe)), 0)}) y ninguna compra. ¿Era dinero que pasaste desde tu banco?` });
    if (traspasos.has(a.nombre)) continue;  // lo demás de este activo sobra hasta aclarar eso
    else if (P.conPart && P.part < 0 && !P.vendido)
      add({ clave: `negativas|${a.nombre}|${nf(P.part, 0, 4)}`, nivel: "error", activo: a, accion: { text: "Cuadrar", ruta: ficha(a) },
        texto: `«${a.nombre}»: salen ${nf(-P.part, 0, 4)} participaciones vendidas de más. Falta alguna compra (o sobra una venta).` });
    if (P.vendido) continue;
    if (P.faltan) add({ clave: `sinpart|${a.nombre}|${P.faltan}`, nivel: P.faltan < normales.length ? "aviso" : "info", activo: a, accion: { text: "Cuadrar", ruta: ficha(a) },
      texto: P.faltan < normales.length ? `${P.faltan} de ${normales.length} operaciones de «${a.nombre}» no dicen cuántas participaciones: dile a la app cuántas tienes y verás tu precio medio.`
        : `«${a.nombre}»: ninguna operación dice cuántas participaciones compraste. Si las anotas, la app estima su valor y tu precio medio.` });
    if (P.supuestas) add({ clave: `supuestas|${a.nombre}|${P.supuestas}`, nivel: "aviso", activo: a, accion: { text: "Revisar", ruta: ficha(a) },
      texto: `${P.supuestas} ${P.supuestas === 1 ? "orden" : "órdenes"} de «${a.nombre}» no decían si eran compra o venta: se han tomado como compras.` });
    // Posibles duplicados: mismo sentido e importe (±1 %) en ≤ 6 días, y de orígenes distintos (extracto, órdenes, a mano)
    const origen = (x) => (x.p.ext_fecha ? "e" : "") + (x.p.orden ? "o" : "") || "m";
    for (let i = 0; i < normales.length; i++) for (let j = i + 1; j < normales.length; j++) {
      const x = normales[i], y = normales[j];
      if (Math.abs(y.fecha.diff(x.fecha, "days").days) > 6 || (x.importe > 0) !== (y.importe > 0)) continue;
      if (Math.abs(Math.abs(x.importe) - Math.abs(y.importe)) > Math.max(1, 0.01 * Math.abs(x.importe))) continue;
      if (origen(x) === origen(y) && origen(x) !== "m") continue;
      add({ clave: `dup|${x.p.id}|${y.p.id}`, nivel: "aviso", activo: a, accion: { text: "Revisar", ruta: ficha(a) }, ids: [x.p.id, y.p.id],
        texto: `«${a.nombre}»: dos ${x.importe > 0 ? "compras" : "ventas"} casi iguales (${eur(Math.abs(x.importe))} el ${x.fecha.toFormat("dd/MM/yy")} y ${eur(Math.abs(y.importe))} el ${y.fecha.toFormat("dd/MM/yy")}). ¿Es la misma contada dos veces?` });
    }
    if (/^Fondo [A-Z]{2}[A-Z0-9]{9}\d$/.test(a.nombre)) add({ clave: `nombre|${a.nombre}`, nivel: "info", activo: a, accion: { text: "Ponle nombre", ruta: `#editar/activo/${a.p.id}` },
      texto: `«${a.nombre}» solo se conoce por su ISIN: ponle el nombre del fondo.` });
    if (V.fuente === "metido") add({ clave: `valor|${a.nombre}`, nivel: "info", activo: a, accion: { text: "Anotar", ruta: "#valores" },
      texto: `«${a.nombre}» no tiene valor ni precio: cuenta por lo que has metido (sin ganancia ni pérdida).` });
    else if (V.fuente === "anotado" && a.fechaValor && diasDesde(a.fechaValor) > 60) add({ clave: `viejo|${a.nombre}|${a.p.fecha_valor}`, nivel: "info", activo: a, accion: { text: "Actualizar", ruta: "#valores" },
      texto: `El valor de «${a.nombre}» es del ${a.fechaValor.toFormat("dd/MM/yy")}.` });
  }
  // El mismo activo dos veces (nombres que se contienen, o el mismo ISIN): hay que unirlos
  const vivos = A.filter((a) => posicion(a).ops.length && !posicion(a).vendido);
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
    const a = A[i], b = A[j], ka = claveNombre(a.nombre), kb = claveNombre(b.nombre);
    const mismoIsin = a.p.isin && a.p.isin === b.p.isin;
    const corta = ka.length <= kb.length ? ka : kb, larga = ka.length <= kb.length ? kb : ka;
    if (!mismoIsin && !(corta.length >= 4 && larga.includes(corta))) continue;
    if ((!vivos.includes(a) && !vivos.includes(b)) || traspasos.has(a.nombre) || traspasos.has(b.nombre)) continue;
    const [x, y] = posicion(a).ops.length <= posicion(b).ops.length ? [a, b] : [b, a];
    add({ clave: `repe|${a.nombre}|${b.nombre}`, nivel: "aviso", activo: x, accion: { text: "Unir", ruta: `${ficha(x)}/unir/${y.p.id}` },
      texto: `¿«${x.nombre}» y «${y.nombre}» son el mismo? Únelos para que sus cuentas salgan bien.` });
  }
  return out.sort((a, b) => NIVEL_SALUD[a.nivel] - NIVEL_SALUD[b.nivel]);
}

// Evolución mes a mes: lo aportado acumulado (al final de cada mes) y lo que valía (registros de saldos + hoy).
function evolucionInversion(soloLargo = false) {
  const A = activos().filter((a) => (a.conValor || !vendidoDelTodo(a)) && (!soloLargo || a.largo));
  if (!A.length) return null;
  const nombres = new Set(A.map((a) => a.nombre));
  const APr = aportacionesReales().filter((x) => nombres.has(x.activo));
  const inicios = [...APr.map((x) => x.fecha), ...A.filter((a) => a.aportadoIni > 0 && a.fechaIni).map((a) => a.fechaIni)];
  if (!inicios.length) return null;
  const n = Math.max(2, Math.min(36, Math.round(hoy.diff(DateTime.min(...inicios).startOf("month"), "months").months) + 1));
  const keys = mesesHasta(hoyCal, n);
  const P = patrimonio();
  const aportado = keys.map((k) => {
    const fin = mesDT(k).endOf("month");
    return sum(A.filter((a) => a.aportadoIni > 0 && a.fechaIni && a.fechaIni <= fin).map((a) => a.aportadoIni)) + sum(APr.filter((x) => x.fecha <= fin).map((x) => x.importe));
  });
  // Cada mes: el valor anotado de cada activo y, si no lo hay, participaciones de ese mes × precio de fin de mes (precios por internet).
  const valorMercado = (a, k) => {
    const m = precioMercado(a), po = posicion(a);
    const precio = m && m.mensual[k];
    if (!precio || !po.conPart) return null;
    const fin = mesDT(k).endOf("month");
    const part = sum(po.ops.filter((x) => x.fecha <= fin).map((x) => num(x.p.participaciones)));
    return part > 1e-9 ? part * precio : null;
  };
  const valor = keys.map((k) => {
    if (k === hoyCal) return sum(A.map(valorHoy));
    const r = [...P].reverse().find((x) => keyCal(x.fecha) === k && Object.keys(x.valores || {}).some((v) => nombres.has(v)));
    const porActivo = A.map((a) => (r && r.valores && hasNum(r.valores[a.nombre]) ? num(r.valores[a.nombre]) : valorMercado(a, k)));
    return porActivo.every((v) => v != null) ? sum(porActivo) : (r ? sum(Object.entries(r.valores).filter(([v]) => nombres.has(v)).map(([, v]) => num(v))) : null);
  });
  const i0 = Math.max(0, Math.min(aportado.findIndex((v) => v > 0), keys.length - 2));  // sin meses vacíos delante
  return { keys: keys.slice(i0), aportado: aportado.slice(i0), valor: valor.slice(i0) };
}
// Ganancia y rentabilidad de la cartera en los últimos `meses` meses naturales, a partir de la evolución mensual
// ({ keys, aportado, valor } de evolucionInversion): ganancia = lo que ha cambiado el valor − lo metido en ese tiempo;
// rentabilidad = ganancia / (valor de partida + la mitad de lo metido) (Dietz simple; no cuenta dividendos).
// Sin valor de partida (ni anotado ni por precios) no se puede calcular: devuelve el motivo.
function rentabilidadPeriodo(ev, meses) {
  if (!ev || ev.keys.length < 2) return { ok: false, motivo: "aún no hay historial de tu inversión" };
  const n = ev.keys.length - 1, i = n - meses;
  if (i < 0) return { ok: false, motivo: "tu inversión aún no lleva tanto tiempo" };
  const v0 = ev.valor[i], v1 = ev.valor[n];
  if (v0 == null || v1 == null) return { ok: false, motivo: `falta el valor de ${mesLbl(ev.keys[i]).toLowerCase()}: anota los valores de fin de mes o activa los precios` };
  const metido = ev.aportado[n] - ev.aportado[i], gan = v1 - v0 - metido, base = v0 + metido / 2;
  return { ok: true, desde: ev.keys[i], v0, v1, metido, gan, r: base > 0 ? gan / base : NaN };
}
// Compras (y ventas) de cada mes: lo que has metido en tu inversión. Los traspasos entre fondos (vender uno para comprar
// otro) no son dinero nuevo: no cuentan.
const sinTraspasos = () => aportacionesReales().filter((x) => !x.p.traspaso);
function aportacionesMes(n = 12, soloLargo = false) {
  const keys = mesesHasta(hoyCal, n);
  const largos = soloLargo ? new Set(activos().filter((a) => a.largo).map((a) => a.nombre)) : null;
  const APr = sinTraspasos().filter((x) => !largos || largos.has(x.activo));
  return keys.map((k) => ({ key: k, compras: sum(APr.filter((x) => keyCal(x.fecha) === k && x.importe > 0).map((x) => x.importe)),
    ventas: -sum(APr.filter((x) => keyCal(x.fecha) === k && x.importe < 0).map((x) => x.importe)) }));
}
// Meses seguidos con alguna compra, contando hacia atrás desde este mes (o el anterior, si este aún no toca).
function constancia() {
  const APr = sinTraspasos().filter((x) => x.importe > 0);
  const con = new Set(APr.map((x) => keyCal(x.fecha)));
  let k = con.has(hoyCal) ? hoyCal : mesAnterior(hoyCal), n = 0;
  while (con.has(k)) { n++; k = mesAnterior(k); }
  return n;
}
// Intereses (y comisiones) de las cuentas del bróker: lo que rinde el dinero sin invertir.
function interesesBroker() {
  const ms = movimientos().filter((m) => !m.auto && !m.previsto && esDelBroker(m) && (m.clase === "ingreso" || m.clase === "gasto"));
  const año = ms.filter((m) => m.fecha.year === hoy.year);
  return { año: sum(año.filter((m) => m.clase === "ingreso").map((m) => m.importe)), comisiones: sum(año.filter((m) => m.clase === "gasto").map((m) => m.importe)),
    total: sum(ms.filter((m) => m.clase === "ingreso").map((m) => m.importe)), n: ms.length };
}


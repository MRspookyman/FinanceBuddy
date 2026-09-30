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
const valorHoy = (a) => a.valor + aportTrasValor(a);
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
  if (a.aportadoIni == null || (a.aportadoIni > 0 && !a.fechaIni)) return null;
  const fl = [];
  if (a.aportadoIni > 0) fl.push({ fecha: a.fechaIni, importe: -a.aportadoIni });
  for (const x of aportacionesReales().filter((x) => x.activo === a.nombre)) fl.push({ fecha: x.fecha, importe: -x.importe });
  fl.push({ fecha: hoy, importe: valorHoy(a) });
  return fl;
}
function resumenInversion() {
  const AP = aportaciones(), APr = aportacionesReales();
  const filas = activos().map((a) => {
    const conocido = a.aportadoIni != null;
    const aportado = (a.aportadoIni || 0) + sum(APr.filter((x) => x.activo === a.nombre).map((x) => x.importe));
    const valor = valorHoy(a);
    const fl = flujosActivo(a);
    const desde = fl ? DateTime.min(...fl.map((f) => f.fecha)) : null;
    return { ...a, valor, ajuste: valor - a.valor, aportado, conocido, gan: conocido && aportado > 0 ? valor - aportado : NaN, fl, tir: fl ? xirr(fl) : NaN, desde };
  });
  const total = sum(filas.map((f) => f.valor));
  const con = filas.filter((f) => f.conocido && f.aportado > 0);
  const aportado = sum(con.map((f) => f.aportado)), gan = sum(con.map((f) => f.gan));
  const conTir = filas.filter((f) => f.fl);
  const tir = conTir.length ? xirr(conTir.flatMap((f) => f.fl)) : NaN;
  const desde = conTir.length ? DateTime.min(...conTir.map((f) => f.desde)) : null;
  return { filas, total, aportado, gan, AP, sinAport: filas.length - con.length, tir, tirParcial: conTir.length < filas.length, tirCorta: desde ? hoy.diff(desde, "days").days < 365 : false };
}

// ───────────── saldos: proyección de un registro de patrimonio ─────────────
// Parte del saldo de cada cuenta en el registro `u` y le suma lo ocurrido hasta `hasta`:
// · ingresos y «te lo devolvieron» suman en su cuenta; gastos restan;
// · un traspaso resta en su cuenta y suma en la otra (o al revés) — la otra solo si NO importas su extracto
//   (si lo importas, el traspaso ya viene en su propio extracto);
// · las compras de activos se pagan con el efectivo del bróker; si no llega, sale de la cuenta principal (`deBanco`).
// Los activos valen su valor actual (+ aportaciones posteriores a su fecha de valor).
function proyectar(u, hasta) {
  const tras = (f) => f > u.fecha.endOf("day") && f <= hasta;
  const S = { ...u.cuentas.saldos };
  for (const c of cuentas()) if (S[c.nombre] == null) S[c.nombre] = 0;
  const mover = (c, v) => { c = c || principal(); S[c] = (S[c] || 0) + v; };
  // El bróker nunca trae sus traspasos (al importar se descartan: ya están en el banco), aunque importes su extracto.
  const conExtracto = (c) => !!(cuentaPor(c) || {}).extracto && tipoCuenta(c) !== "broker";
  const ms = movimientos().filter((m) => tras(m.fecha));
  for (const m of ms) {
    if (m.clase === "ingreso" || m.clase === "reembolso") mover(m.cuenta, m.importe);
    else if (m.clase === "gasto") mover(m.cuenta, -m.importe);
    else if (m.clase === "transferencia") {
      if (m.destino) { mover(m.cuenta, -m.importe); if (!conExtracto(m.destino) && m.destino !== m.cuenta) mover(m.destino, m.importe); }
      else if (m.origen) { mover(m.cuenta, m.importe); if (!conExtracto(m.origen) && m.origen !== m.cuenta) mover(m.origen, -m.importe); }
    }
  }
  let apo = 0, deBanco = 0;
  for (const a of aportaciones().filter((a) => tras(a.fecha))) {
    apo += a.importe;
    const cb = cuentaAportacion(a);
    if (!cb) { mover(principal(), -a.importe); deBanco += a.importe; continue; }
    const p = pagarAportacion(S[cb] || 0, a.importe);
    S[cb] = p.broker; if (p.deBanco) { mover(principal(), -p.deBanco); deBanco += p.deBanco; }
  }
  const valores = {};
  for (const a of activos()) valores[a.nombre] = valorHoy(a);
  const g = agrupar(S, activos().length ? valores : u.valores, u.otros);
  const act = sum(Object.values(g.c));
  const imp = (f) => sum(ms.filter(f).map((m) => m.importe));
  return {
    base: u, c: g.c, cuentas: g.cuentas, deudas: u.deudas, activos: act, neto: act - u.deudas,
    flujo: { apo, deBanco, tr: imp(esABroker), aAh: imp(esAAhorro), deAh: imp(esDeAhorro) },
  };
}
// Reparte una aportación entre el efectivo del bróker y el banco: primero se gasta el del bróker.
// Una venta (importe < 0) vuelve al efectivo del bróker.
function pagarAportacion(broker, apo) {
  if (apo <= 0) return { broker: broker - apo, deBroker: apo, deBanco: 0 };
  const deBroker = Math.min(Math.max(0, broker), apo);
  return { broker: broker - deBroker, deBroker, deBanco: apo - deBroker };
}
// Patrimonio estimado hoy = último registro proyectado hasta hoy.
function estimacion() {
  const P = patrimonio();
  if (!P.length) return null;
  const u = P[P.length - 1];
  return { ...proyectar(u, finHoy), dias: diasDesde(u.fecha) };
}
// Comprobación: el último registro frente al anterior proyectado hasta su fecha, cuenta a cuenta.
// Si no cuadra, falta (o sobra) algún movimiento entre los dos registros.
function conciliacion() {
  const P = patrimonio();
  if (P.length < 2) return null;
  const a = P[P.length - 2], b = P[P.length - 1];
  const pr = proyectar(a, b.fecha.endOf("day"));
  const nombres = [...new Set([...Object.keys(b.cuentas.saldos)])].filter((n) => cuentaPor(n));
  return {
    desde: a.fecha, hasta: b.fecha,
    filas: nombres.map((n) => { const real = b.cuentas.saldos[n], esperado = pr.cuentas.saldos[n] ?? 0; return { nombre: n, real, esperado, dif: real - esperado }; }),
  };
}

// ───────────── fondo de emergencia ─────────────
// Las cuentas de ahorro (si no hay, toda la liquidez). Mes actual o futuro → estimado hoy; mes pasado → registro más
// reciente de ese mes o anterior. Gasto medio: los 3 meses anteriores al mes visible (con gastos).
function fondoEmergencia() {
  const P = patrimonio();
  if (!P.length) return null;
  let liq, fuente;
  if (mes >= hoyKey) {
    const E = estimacion();
    liq = E.cuentas.ahorro ?? E.c.Liquidez;
    fuente = E.cuentas.ahorro != null ? "cuenta de ahorro" : "liquidez";
  } else {
    const r = [...P].reverse().find((x) => x.fecha <= mesDT(mes).endOf("month"));
    if (!r) return { sinRegistro: true };
    liq = r.cuentas.ahorro ?? r.c.Liquidez;
    fuente = `${r.cuentas.ahorro != null ? "cuenta de ahorro" : "liquidez"} · registro ${r.fecha.toFormat("dd/MM/yy")}`;
  }
  const previos = mesesHasta(mes, 4).slice(0, 3).map((k) => finMes(k).gastos).filter((g) => g > 0);
  const med = previos.length ? media(previos) : finMes(mes).gastos;
  return { liq, fuente, media: med, meses: med > 0 ? liq / med : NaN };
}

// ───────────── presupuesto ─────────────
const limiteVar = num(cfg.limite_variable);
const grupoDe = (nombre) => (categorias().find((c) => c.nombre === nombre) || {}).grupo || "variable";
const gastoVariable = (M) => sum(M.real.filter((m) => m.gasto && grupoDe(m.categoria) !== "fijo").map((m) => m.gasto));

// ───────────── ahorro: a dónde va ─────────────
// Reparte el ahorro del mes según la cuenta a la que va el dinero: al bróker (traspasos + intereses que se quedan allí),
// al ahorro (neto), a otras cuentas y lo que queda en la cuenta corriente.
// Las compras de inversión (`compras`) se muestran aparte: se pagan con el efectivo del bróker, no con la corriente.
function repartoAhorro(key) {
  const M = finMes(key);
  const d0 = mesDT(key), d1 = d0.plus({ months: 1 });
  const enMes = (f) => f >= d0 && f < d1 && f <= finHoy;
  const ms = M.real;
  const imp = (f) => sum(ms.filter(f).map((m) => m.importe));
  const aBroker = imp(esABroker) + imp((m) => esDelBroker(m) && m.clase === "ingreso");
  const emergencia = imp(esAAhorro) - imp(esDeAhorro) + imp((m) => tipoCuenta(m.cuenta) === "ahorro" && m.clase === "ingreso");
  const otras = imp(esAOtra) - imp(esDeOtra);
  const compras = sum(aportaciones().filter((a) => enMes(a.fecha)).map((a) => a.importe));
  return { ahorro: M.ahorro, aBroker, emergencia, otras, compras, liquido: M.ahorro - aBroker - emergencia - otras };
}

// ───────────── cuánto puedo gastar ─────────────
// Fecha del último movimiento real importado de las cuentas del día a día: los datos llegan al importar,
// así que el «disponible» y el ritmo se calculan desde esa fecha, no desde hoy.
function fechaDatos() {
  const f = movimientos().filter((m) => !m.auto && !m.previsto && !esDelBroker(m)).map((m) => m.fecha);
  return f.length ? DateTime.max(...f) : null;
}
function presupuestoSemana() {
  const fd = fechaDatos();
  const enMes = fd && keyDe(fd) === hoyKey;
  const M = finMes(hoyKey), vari = gastoVariable(M), dm = hoy.daysInMonth;
  const restantes = dm - (enMes ? fd.day : 0); // días del mes sin datos todavía
  const disponible = limiteVar - vari;
  const ref = enMes ? fd : hoy;
  const lunes = ref.startOf("week"), domingo = lunes.plus({ days: 6 }).endOf("day");
  const semana = sum(movimientos().filter((m) => !m.previsto && m.gasto && grupoDe(m.categoria) !== "fijo" && m.fecha >= lunes && m.fecha <= domingo).map((m) => m.gasto));
  return {
    fechaDatos: fd, diasSinDatos: fd ? diasDesde(fd) : null, vari, disponible, restantes, dm,
    porSemana: restantes > 0 ? (disponible * 7) / restantes : disponible, porDia: restantes > 0 ? disponible / restantes : disponible,
    semana, metaSemana: (limiteVar * 7) / dm, lunes, domingo,
  };
}

// ───────────── por categoría ─────────────
// Gasto neto (gastos − lo que te devolvieron) de cada categoría en un mes, solo lo ya ocurrido.
function gastoPorCategoria(key) {
  const out = new Map();
  for (const m of finMes(key).real) if (m.gasto) out.set(m.categoria || "Otros", (out.get(m.categoria || "Otros") || 0) + m.gasto);
  return out;
}
// Meses de referencia para comparar un mes: los 3 anteriores con movimientos propios.
const mesesReferencia = (key) => mesesHasta(mesAnterior(key), 6).filter(conDatos).slice(-3);
// Categorías del mes con su media de los meses de referencia y su presupuesto: [{ nombre, grupo, valor, media, presupuesto }].
function resumenCategorias(key) {
  const act = gastoPorCategoria(key), ref = mesesReferencia(key).map(gastoPorCategoria);
  const nombres = new Set([...act.keys(), ...categorias().filter((c) => c.presupuesto > 0 && c.grupo !== "ingreso").map((c) => c.nombre)]);
  return [...nombres].map((n) => ({
    nombre: n, grupo: grupoDe(n), valor: act.get(n) || 0, presupuesto: (categorias().find((c) => c.nombre === n) || {}).presupuesto || 0,
    media: ref.length ? media(ref.map((m) => m.get(n) || 0)) : NaN,
  })).filter((c) => c.valor > 0.5 || c.presupuesto > 0).sort((a, b) => b.valor - a.valor);
}
// Ritmo del gasto variable del mes en curso: acumulado día a día frente a la media de los meses de referencia.
function ritmoMes() {
  const dm = hoy.daysInMonth, fd = fechaDatos();
  const dia = fd && keyDe(fd) === hoyKey ? fd.day : hoy.day;
  const acumulado = (key, hasta) => {
    const d0 = mesDT(key), por = new Array(d0.daysInMonth).fill(0);
    for (const m of finMes(key).real) if (m.gasto && grupoDe(m.categoria) !== "fijo") por[m.fecha.day - 1] += m.gasto;
    let a = 0;
    return Array.from({ length: hasta }, (_, i) => (a += por[Math.min(i, por.length - 1)] || 0));
  };
  const actual = acumulado(hoyKey, dm).map((v, i) => (i < dia ? v : null));
  const refs = mesesReferencia(hoyKey);
  const med = refs.length ? Array.from({ length: dm }, (_, i) => media(refs.map((k) => { const a = acumulado(k, dm); return a[Math.min(i, mesDT(k).daysInMonth - 1)]; }))) : null;
  return { dm, dia, actual, media: med, nMeses: refs.length, hoyV: actual[dia - 1] || 0, mediaHoy: med ? med[dia - 1] : NaN };
}

const hayIngresosFijos = () => recurrentes().some((r) => r.clase === "ingreso");

// ───────────── qué hacer con tu dinero (plan de reparto) ─────────────
// Colchón en la cuenta corriente = un mes de gasto (fijos mensuales + límite de gasto variable, redondeado a 50 €)
// + el déficit de los meses negativos de la previsión en los próximos 6 meses. Lo que sobre, por orden:
// 1) al objetivo vinculado a una cuenta (fondo de emergencia) hasta su meta; 2) al bróker si su efectivo se acaba en ≤ 3 meses; 3) libre.
const aDiez = (x) => Math.floor(x / 10) * 10;
function planReparto() {
  const E = estimacion();
  if (!E || !cuentasTipo("corriente").length) return null;
  const mensuales = recurrentes().filter((r) => r.clase === "gasto" && !(r.meses && r.meses.length < 12));
  const base = Math.round((sum(mensuales.map((r) => r.importe)) + limiteVar) / 50) * 50;
  const F = prevision();
  // Sin ingresos fijos la previsión solo ve gastos: no se reserva colchón por un déficit que no es real.
  const deficit = !hayIngresosFijos() ? 0 : -sum(F.filas.filter((f) => f.key !== hoyKey).slice(0, 6).filter((f) => f.neto < 0).map((f) => f.neto));
  const colchon = base + Math.round(deficit / 50) * 50;
  const corriente = E.cuentas.corriente;
  let sobra = corriente - colchon;
  const acciones = [];
  if (sobra >= 50) {
    const o = objetivos().find((x) => x.vinculado && x.estado !== "conseguido" && x.cuenta !== principal());
    if (o && o.ahorrado < o.meta) {
      const x = aDiez(Math.min(sobra, o.meta - o.ahorrado));
      if (x >= 10) { acciones.push({ tipo: "fondo", importe: x, texto: `Pasa ${eur(x, 0)} a ${o.cuenta}`, sub: `${o.nombre}: quedaría en ${eur(o.ahorrado + x, 0)} de ${eur(o.meta, 0)}` }); sobra -= x; }
    }
    const mensualApo = sum(recurrentes().filter((r) => r.clase === "aportacion").map((r) => r.importe));
    const hasta = F.agota ? Math.round(mesDT(F.agota.key).diff(mesDT(hoyKey), "months").months) : 99;
    if (F.agota && hasta <= 3 && sobra >= 50) {
      const x = aDiez(Math.min(sobra, Math.max(0, 3 * mensualApo - E.c["Efectivo bróker"])));
      if (x >= 10) { acciones.push({ tipo: "broker", importe: x, texto: `Pasa ${eur(x, 0)} a ${nombresBroker()}`, sub: `su dinero sin invertir se acaba en ${mesLbl(F.agota.key).toLowerCase()}` }); sobra -= x; }
    }
    if (sobra >= 50) acciones.push({ tipo: "libre", importe: aDiez(sobra), texto: `Te sobran ${eur(aDiez(sobra), 0)}`, sub: "puedes dejarlos en la corriente, ahorrarlos o invertirlos" });
  }
  // Próxima acción prevista (cuando no toca mover nada ahora): avisar con tiempo del traspaso al bróker.
  const futuro = F.agota ? { mes: F.agota.key, importe: Math.ceil(F.agota.apoBanco / 10) * 10 } : null;
  return { corriente, colchon, base, deficit, sobra: corriente - colchon, acciones, futuro };
}

// ───────────── previsión de caja ─────────────
// Parte de la liquidez estimada hoy y suma, mes a mes, lo pendiente: recurrentes (ingresos, gastos, aportaciones),
// movimientos con fecha futura y el gasto variable previsto: el límite mensual (el plan del usuario);
// si no hay límite, la media real de los 3 últimos meses cerrados. La media real se devuelve siempre para comparar.
// Las aportaciones se pagan primero con el efectivo del bróker; cuando se acaba, salen del banco (`agota`: primer mes así).
function prevision(n = 12) {
  const E = estimacion();
  const inicio = E ? E.c.Liquidez : 0;
  const brokerIni = E ? E.c["Efectivo bróker"] : 0;
  let broker = brokerIni;
  // Solo meses con gasto variable apuntado (un mes con solo recurrentes fijos daría una media de 0 €).
  const cerrados = mesesHasta(mesAnterior(hoyKey), 3).map(finMes).map(gastoVariable).filter((v) => v > 0);
  const varReal = cerrados.length ? media(cerrados) : NaN;
  const varEst = limiteVar > 0 ? limiteVar : isFinite(varReal) ? varReal : 0;
  const fuenteVar = limiteVar > 0 ? "tu límite mensual" : isFinite(varReal) ? `media de ${cerrados.length} mes${cerrados.length > 1 ? "es" : ""}` : "sin datos";
  const varMes = gastoVariable(finMes(hoyKey));
  let saldo = inicio;
  const filas = mesesDesde(hoyKey, n).map((key) => {
    const pend = movimientos().filter((m) => m.previsto && keyDe(m.fecha) === key && !esDelBroker(m));
    const ing = sum(pend.filter((m) => m.clase === "ingreso").map((m) => m.importe));
    const fijos = sum(pend.map((m) => m.gasto));
    const apo = sum(aportaciones().filter((a) => a.previsto && keyDe(a.fecha) === key).map((a) => a.importe));
    // Mes en curso: lo que falta hasta la estimación, sin pasar de la parte proporcional a los días que quedan.
    const variable = key === hoyKey ? Math.min(Math.max(0, varEst - varMes), varEst * (hoy.daysInMonth - hoy.day) / hoy.daysInMonth) : varEst;
    const tr = sum(pend.filter(esABroker).map((m) => m.importe)) + sum(pend.filter(esAOtra).map((m) => m.importe)) - sum(pend.filter(esDeOtra).map((m) => m.importe));
    const pago = pagarAportacion(broker + sum(pend.filter(esABroker).map((m) => m.importe)), apo);
    broker = pago.broker;
    const neto = ing - fijos - variable - tr - pago.deBanco;
    saldo += neto;
    return { key, ing, fijos, variable, apo, apoBanco: pago.deBanco, tr, broker, salidas: fijos + variable + tr + pago.deBanco, neto, saldo };
  });
  // Mínimo de los meses futuros (el mes en curso casi siempre es el de hoy y no aporta nada).
  const futuros = filas.filter((f) => f.key !== hoyKey);
  const minimo = (futuros.length ? futuros : filas).reduce((a, b) => (b.saldo < a.saldo ? b : a));
  const agota = brokerIni > 0 ? filas.find((f) => f.apoBanco > 0) : null;
  return { inicio, brokerIni, conRegistro: !!E, filas, varEst, varReal, nMesesReal: cerrados.length, fuenteVar, minimo, agota };
}

// ───────────── avisos (Resumen) ─────────────
function avisos() {
  const out = [];
  const add = (nivel, texto, ruta) => out.push({ nivel, texto, ruta });
  const nPend = (DB.pendientes || []).length;
  if (nPend) add("warn", `${nPend} movimiento${nPend > 1 ? "s" : ""} por revisar: la app no ha sabido clasificarlo${nPend > 1 ? "s" : ""} sola`, "#revisar");
  const nArch = ((DB.info || {}).archivos || []).length;
  if (nArch) add("warn", `${nArch} archivo${nArch > 1 ? "s" : ""} en la carpeta Importar sin procesar`, "#importar");
  const K = conciliacion();
  const desc = K ? K.filas.filter((f) => Math.abs(f.dif) > 1) : [];
  if (desc.length) add("warn", `No cuadra entre el ${K.desde.toFormat("dd/MM")} y el ${K.hasta.toFormat("dd/MM")}: ${desc.map((f) => `${f.nombre} ${eurS(f.dif)}`).join(", ")} · falta o sobra algún movimiento`, "#cerrar");
  const P = patrimonio();
  // Los cierres se piden desde que se usa la app (primer registro de patrimonio), no desde el historial importado.
  const primerMes = P.length ? keyDe(P[0].fecha) : null;
  const ant = mesAnterior(hoyKey);
  if (primerMes && ant >= primerMes && !cierres().some((c) => c.mes === ant)) add("warn", `${mesLbl(ant)} sin cerrar · anota tus saldos del último día del mes`, "#cerrar");
  if (!P.length) add("warn", "Aún no hay saldos registrados · se anotan al cerrar el mes", "#cerrar");
  else { const d = diasDesde(P[P.length - 1].fecha); if (d > 40) add("warn", `Último registro de saldos hace ${d} días`, "#cerrar"); }
  const fd = fechaDatos();
  if (cuentas().some((c) => c.extracto) && (!fd || diasDesde(fd) > 8)) add("info", fd ? `Movimientos hasta el ${fd.toFormat("dd/MM")}: importa el extracto de tu banco para ver cómo vas` : "Importa el extracto de tu banco para empezar", "#importar");
  const A = activos();
  const viejos = A.filter((a) => !a.fechaValor || diasDesde(a.fechaValor) > 35);
  if (viejos.length) add("info", `Valor de la inversión sin actualizar hace más de un mes: ${viejos.map((a) => a.nombre).join(", ")}`, "#valores");
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
  const Mh = finMes(hoyKey), vari = gastoVariable(Mh), d = hoy.day, dm = hoy.daysInMonth;
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

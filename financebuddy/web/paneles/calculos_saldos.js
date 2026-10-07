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
  for (const c of cobros().filter((c) => tras(c.fecha))) mover(cuentaAportacion({ activo: c.activo, cuenta: c.cuenta }) || principal(), c.tipo === "dividendo" ? c.importe : -c.importe);  // entra o sale del efectivo del bróker
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
    const r = [...P].reverse().find((x) => x.fecha <= finDeMes(mes));
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
  const d0 = iniMes(key), d1 = iniMes(mesSiguiente(key));
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
  const M = finMes(hoyKey), vari = gastoVariable(M), dm = diasMes(hoyKey);
  const restantes = dm - (enMes ? diaDeMes(fd) : 0); // días del mes sin datos todavía
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
function ritmoMes(key = hoyKey) {
  const dm = diasMes(key), fd = fechaDatos();
  const dia = key !== hoyKey ? dm : fd && keyDe(fd) === hoyKey ? diaDeMes(fd) : diaDeMes(hoy);
  const acumulado = (key, hasta) => {
    const por = new Array(diasMes(key)).fill(0);
    for (const m of finMes(key).real) if (m.gasto && grupoDe(m.categoria) !== "fijo") por[diaDeMes(m.fecha) - 1] += m.gasto;
    let a = 0;
    return Array.from({ length: hasta }, (_, i) => (a += por[Math.min(i, por.length - 1)] || 0));
  };
  const actual = acumulado(key, dm).map((v, i) => (i < dia ? v : null));
  const refs = mesesReferencia(key);
  const med = refs.length ? Array.from({ length: dm }, (_, i) => media(refs.map((k) => { const a = acumulado(k, dm); return a[Math.min(i, diasMes(k) - 1)]; }))) : null;
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
  // El colchón se puede fijar a mano (Ajustes → config.colchon); si no, se calcula.
  const colchonAuto = base + Math.round(deficit / 50) * 50, manual = num(cfg.colchon) > 0;
  const colchon = manual ? num(cfg.colchon) : colchonAuto;
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
  return { corriente, colchon, colchonAuto, manual, base, deficit, sobra: corriente - colchon, acciones, futuro };
}

// ───────────── previsión de caja ─────────────
// Parte de la liquidez estimada hoy y suma, mes a mes, lo pendiente: recurrentes (ingresos, gastos, aportaciones),
// movimientos con fecha futura y el gasto variable previsto: lo que gastas de verdad (la media de los 3 últimos meses
// cerrados), no el límite que te propones, porque lo normal es pasarse; el límite solo se usa si aún no hay meses con datos.
// Las aportaciones se pagan primero con el efectivo del bróker; cuando se acaba, salen del banco (`agota`: primer mes así).
function prevision(n = 12) {
  const E = estimacion();
  const inicio = E ? E.c.Liquidez : 0;
  const brokerIni = E ? E.c["Efectivo bróker"] : 0;
  let broker = brokerIni;
  // Solo meses con gasto variable apuntado (un mes con solo recurrentes fijos daría una media de 0 €).
  const cerrados = mesesHasta(mesAnterior(hoyKey), 3).map(finMes).map(gastoVariable).filter((v) => v > 0);
  const varReal = cerrados.length ? media(cerrados) : NaN;
  const varEst = isFinite(varReal) ? varReal : limiteVar > 0 ? limiteVar : 0;
  const fuenteVar = isFinite(varReal) ? (cerrados.length > 1 ? `tu media de los últimos ${cerrados.length} meses` : "lo que gastaste el mes pasado") : limiteVar > 0 ? "tu límite mensual: aún no hay meses completos" : "sin datos";
  const varMes = gastoVariable(finMes(hoyKey));
  let saldo = inicio;
  const filas = mesesDesde(hoyKey, n).map((key) => {
    const pend = movimientos().filter((m) => m.previsto && keyDe(m.fecha) === key && !esDelBroker(m));
    const ing = sum(pend.filter((m) => m.clase === "ingreso").map((m) => m.importe));
    const fijos = sum(pend.map((m) => m.gasto));
    const apo = sum(aportaciones().filter((a) => a.previsto && keyDe(a.fecha) === key).map((a) => a.importe));
    // Mes en curso: lo que falta hasta la estimación, sin pasar de la parte proporcional a los días que quedan.
    const variable = key === hoyKey ? Math.min(Math.max(0, varEst - varMes), varEst * (diasMes(hoyKey) - diaDeMes(hoy)) / diasMes(hoyKey)) : varEst;
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


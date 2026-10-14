// ───────────── saldos: proyección de un registro de patrimonio ─────────────
// Parte del saldo de cada cuenta en el registro `u` y le suma lo ocurrido hasta `hasta`:
// · ingresos y «te lo devolvieron» suman en su cuenta; gastos restan;
// · un traspaso resta en su cuenta y suma en la otra (o al revés) — la otra solo si NO importas su extracto
//   (si lo importas, el traspaso ya viene en su propio extracto); uno «por revisar» solo mueve su cuenta (`traspasosPorRevisar`);
// · las compras de activos se pagan con el efectivo del bróker; si no llega, sale de la cuenta principal (`deBanco`).
// Los activos valen su valor actual (+ aportaciones posteriores a su fecha de valor).
// Cada movimiento cuenta desde el día en que el banco lo apuntó (`ext_fecha`), no desde su fecha valor, que puede ser anterior:
// el saldo que anotaste solo lleva lo que el banco ya había apuntado ese día. Si le has puesto a mano una fecha posterior a la del
// banco, manda la tuya: con fecha futura es un previsto, y `prevision()` ya lo cuenta en su mes.
// `exacto` (lo usa el cuadre de saldos): solo lo que ha pasado de verdad, sin los fijos ni las aportaciones que la app da por
// hechos y que el banco o el bróker aún no han traído.
function proyectar(u, hasta, exacto = false) {
  const tras = (f) => f > u.fecha.endOf("day") && f <= hasta;
  const S = { ...u.cuentas.saldos };
  for (const c of cuentas()) if (S[c.nombre] == null) S[c.nombre] = 0;
  const mover = (c, v) => { c = c || principal(); S[c] = (S[c] || 0) + v; };
  // El bróker nunca trae sus traspasos (al importar se descartan: ya están en el banco), aunque importes su extracto.
  const conExtracto = (c) => !!(cuentaPor(c) || {}).extracto && tipoCuenta(c) !== "broker";
  const ms = movimientos().filter((m) => !(exacto && m.auto) && tras(diaBanco(m)));
  for (const m of ms) {
    if (m.clase === "ingreso" || m.clase === "reembolso") mover(m.cuenta, m.importe);
    else if (m.clase === "gasto") mover(m.cuenta, -m.importe);
    else if (m.clase === "transferencia") {
      if (m.destino) { mover(m.cuenta, -m.importe); if (!conExtracto(m.destino) && m.destino !== m.cuenta) mover(m.destino, m.importe); }
      else if (m.origen) { mover(m.cuenta, m.importe); if (!conExtracto(m.origen) && m.origen !== m.cuenta) mover(m.origen, -m.importe); }
    }
  }
  for (const t of traspasosPorRevisar().filter((t) => tras(t.fecha))) mover(t.cuenta, t.importe);  // por revisar: solo su cuenta
  let apo = 0, deBanco = 0;
  for (const a of aportaciones().filter((a) => !(exacto && a.auto) && tras(a.fecha))) {
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
  const pr = proyectar(a, b.fecha.endOf("day"), true);
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
// Gasto variable: lo que no es de una categoría fija ni el pago de un fijo dado de alta (aunque su categoría sea variable: la
// previsión, la meta y el colchón ya suman ese fijo aparte, y contarlo aquí también sería contarlo dos veces).
const nombresFijosDeGasto = () => new Set(recurrentes().filter((r) => r.clase === "gasto").map((r) => r.nombre));
const esGastoVariable = (m, fijos = nombresFijosDeGasto()) => !!m.gasto && grupoDe(m.categoria) !== "fijo" && !(m.recurrente && fijos.has(m.recurrente));
const gastoVariable = (M) => { const f = nombresFijosDeGasto(); return sum(M.real.filter((m) => esGastoVariable(m, f)).map((m) => m.gasto)); };
// Gastos de una categoría fija que no son el pago de ningún fijo dado de alta (un seguro, un recibo que no llega cada mes):
// no son gasto variable ni los trae ningún fijo, así que la previsión y el colchón tienen que contarlos aparte.
// Para no contar un fijo dos veces (como fijo y como suelto), lo que no está enlazado se atribuye primero a los fijos de su
// categoría que ese mes tocaban y no tienen su pago enlazado (lo diste de alta después, o el pago no casó), hasta su importe.
function gastoFijoSuelto(M) {
  const porCat = new Map();
  for (const m of M.real) if (m.gasto && !m.recurrente && grupoDe(m.categoria) === "fijo") porCat.set(m.categoria, (porCat.get(m.categoria) || 0) + m.gasto);
  const pagados = new Set(M.real.filter((m) => m.recurrente && !m.auto).map((m) => m.recurrente)), nMes = mesDT(M.key).month;
  for (const r of recurrentes()) {
    if (r.clase !== "gasto" || pagados.has(r.nombre) || (r.meses && !r.meses.includes(nMes)) || !(porCat.get(r.categoria) > 0)) continue;
    porCat.set(r.categoria, Math.max(0, porCat.get(r.categoria) - r.importe));
  }
  return sum([...porCat.values()]);
}

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
// Días de tu mes en curso que ya cubren los movimientos importados: hasta `fechaDatos()`, no hasta hoy (lo gastado desde
// entonces aún no está). Con los últimos datos de un mes anterior, ninguno; sin movimientos, hasta hoy.
function diasConDatos() {
  const fd = fechaDatos();
  return fd && keyDe(fd) === hoyKey ? diaDeMes(fd) : fd && fd < iniMes(hoyKey) ? 0 : diaDeMes(hoy);
}
function presupuestoSemana() {
  const fd = fechaDatos();
  const enMes = fd && keyDe(fd) === hoyKey;
  const M = finMes(hoyKey), vari = gastoVariable(M), dm = diasMes(hoyKey);
  const restantes = dm - (enMes ? diaDeMes(fd) : 0); // días del mes sin datos todavía
  const disponible = limiteVar - vari;
  const ref = enMes ? fd : hoy;
  const lunes = ref.startOf("week"), domingo = lunes.plus({ days: 6 }).endOf("day");
  const fijosG = nombresFijosDeGasto();
  const semana = sum(movimientos().filter((m) => !m.previsto && esGastoVariable(m, fijosG) && m.fecha >= lunes && m.fecha <= domingo).map((m) => m.gasto));
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
  const dm = diasMes(key), fd = fechaDatos(), fijosG = nombresFijosDeGasto();
  const dia = key !== hoyKey ? dm : fd && keyDe(fd) === hoyKey ? diaDeMes(fd) : diaDeMes(hoy);
  const acumulado = (key, hasta) => {
    const por = new Array(diasMes(key)).fill(0);
    for (const m of finMes(key).real) if (esGastoVariable(m, fijosG)) por[diaDeMes(m.fecha) - 1] += m.gasto;
    let a = 0;
    return Array.from({ length: hasta }, (_, i) => (a += por[Math.min(i, por.length - 1)] || 0));
  };
  const actual = acumulado(key, dm).map((v, i) => (i < dia ? v : null));
  const refs = mesesReferencia(key);
  const med = refs.length ? Array.from({ length: dm }, (_, i) => media(refs.map((k) => { const a = acumulado(k, dm); return a[Math.min(i, diasMes(k) - 1)]; }))) : null;
  return { dm, dia, actual, media: med, nMeses: refs.length, hoyV: actual[dia - 1] || 0, mediaHoy: med ? med[dia - 1] : NaN };
}

// Presupuestos que se proponen a partir de lo que gastas: la media de los meses de referencia de cada categoría de gasto variable
// (las ocultas, fuera), redondeada a 10 €. Solo se propone; se guarda lo que el usuario marque.
// cats: [{ nombre, grupo, presupuesto, oculta }] · meses: [Map categoría → gasto] (uno por mes de referencia)
// → [{ nombre, media, propuesta, actual }] de mayor a menor, sin las que darían menos de 10 €.
function presupuestosSugeridos(cats, meses) {
  if (!meses.length) return [];
  return cats.filter((c) => (c.grupo || "variable") === "variable" && !c.oculta)
    .map((c) => { const m = media(meses.map((x) => Math.max(0, x.get(c.nombre) || 0))); return { nombre: c.nombre, media: m, propuesta: Math.round(m / 10) * 10, actual: c.presupuesto || 0 }; })
    .filter((x) => x.propuesta >= 10).sort((a, b) => b.media - a.media);
}

// Hucha de pagos anuales: lo que hay que ir apartando al mes para los gastos fijos que no son mensuales (los que tienen `meses`).
// Al mes = importe × veces al año ÷ 12. Próximo pago: la primera fecha desde `hoy` en uno de sus meses, dentro de su vigencia.
// rs: recurrentes() · hoy: DateTime → { filas: [{ nombre, importe, veces, alMes, proximo, enMeses }] por fecha de pago, total }
function huchaAnual(rs, hoy) {
  const h0 = hoy.startOf("day"), filas = [];
  for (const r of rs) {
    if (r.clase !== "gasto" || !r.meses || r.meses.length >= 12 || !(r.importe > 0)) continue;
    let proximo = null;
    for (let i = 0; i <= 12 && !proximo; i++) {
      const d = h0.startOf("month").plus({ months: i });
      if (!r.meses.includes(d.month)) continue;
      const f = d.set({ day: Math.min(r.dia, d.daysInMonth) });
      if (f >= h0 && (!r.desde || f >= r.desde.startOf("day")) && (!r.hasta || f <= r.hasta)) proximo = f;
    }
    if (!proximo) continue;
    filas.push({ nombre: r.nombre, importe: r.importe, veces: r.meses.length, alMes: r.importe * r.meses.length / 12, proximo,
      enMeses: (proximo.year - h0.year) * 12 + proximo.month - h0.month });
  }
  filas.sort((a, b) => a.proximo - b.proximo);
  return { filas, total: filas.reduce((s, f) => s + f.alMes, 0) };
}

// ───────────── dónde más gastas: por comercio ─────────────
// Gasto variable de un periodo por comercio. El comercio sale del concepto (el nombre limpio, normalizado con `comercioDe`):
// el texto del extracto lleva la ciudad y la tarjeta y partiría un mismo comercio en varios. Lo que te devolvieron de un gasto
// (un Bizum enlazado) resta en su comercio, y las partes de un movimiento dividido son una sola compra. Fuera los fijos (su
// grupo), lo automático, lo previsto y lo que está por revisar.
// ms: como movimientos() · dentro(m): si entra en el periodo · fijo(categoría): si es de grupo fijo · pequeña: tope de «compra pequeña».
// → { lista: [{ clave, nombre, total, n, medio }] de mayor a menor, pequeñas: { n, total } }
function porComercio(ms, dentro, fijo = () => false, pequeña = 10) {
  const grupos = new Map(), deGasto = new Map(), compras = new Map();
  for (const m of ms) {
    if (m.clase !== "gasto" || m.auto || m.previsto || m.pendiente || !dentro(m) || fijo(m.categoria)) continue;
    const clave = comercioDe({ concepto: m.concepto });
    if (!clave) continue;
    if (!grupos.has(clave)) grupos.set(clave, { clave, total: 0, compras: new Set(), nombres: new Map() });
    const g = grupos.get(clave), id = m.p && m.p.id, compra = (m.p && m.p.parte_de) || id || m;
    g.total += m.importe; g.compras.add(compra); g.nombres.set(m.concepto, (g.nombres.get(m.concepto) || 0) + 1);
    if (id != null) deGasto.set(id, g);
    compras.set(compra, (compras.get(compra) || 0) + m.importe);
  }
  for (const m of ms) if (m.clase === "reembolso" && !m.previsto && m.p && deGasto.has(m.p.reembolsa)) deGasto.get(m.p.reembolsa).total -= m.importe;
  const lista = [...grupos.values()].filter((g) => g.total >= 0.5).map((g) => ({
    clave: g.clave, nombre: [...g.nombres].sort((a, b) => b[1] - a[1])[0][0], total: g.total, n: g.compras.size, medio: g.total / g.compras.size,
  })).sort((a, b) => b.total - a.total);
  const peq = [...compras.values()].filter((v) => v < pequeña);
  return { lista, pequeñas: { n: peq.length, total: sum(peq) } };
}

// ───────────── meta de ahorro → límite de gasto variable ─────────────
// «Quiero ahorrar X al mes» (config.meta_ahorro): el límite de gasto variable que lo permite es lo que entra al mes menos lo que
// sale sin que lo decidas (fijos, gastos fijos sin dar de alta y aportaciones a tu inversión) menos la meta. Redondeado a 10 €
// hacia abajo para no quedarte corto. d: { ingresos, fijos, suelto, aportaciones } al mes → { limite, sobra, llega }.
function limitePorMeta(meta, d) {
  const sobra = d.ingresos - d.fijos - d.suelto - d.aportaciones - meta;
  return { ...d, meta, sobra, limite: sobra > 0 ? Math.floor(sobra / 10) * 10 : 0, llega: sobra >= 10 };
}
const metaAhorro = () => Math.max(0, num(cfg.meta_ahorro));
// Lo que entra y sale al mes, de media: los fijos que tienes en marcha (los de una vez al año, repartidos en 12) y los gastos fijos
// sin dar de alta (prevision().sueltoEst). Sin ingresos fijos, lo que te entró de media en los últimos 3 meses cerrados con datos.
function datosMeta() {
  const T = totalesFijos(DB.registros.recurrente || [], hoy.toISODate());
  const K = mesesHasta(mesAnterior(hoyKey), 3).filter(conDatos);
  const ingresos = T.ingreso.n ? T.ingreso.mes : K.length ? media(K.map((k) => finMes(k).ingresos)) : 0;
  return { ingresos, deFijos: !!T.ingreso.n, nMeses: K.length, fijos: T.gasto.mes, suelto: prevision().sueltoEst, aportaciones: T.aportacion.mes };
}

const hayIngresosFijos = () => recurrentes().some((r) => r.clase === "ingreso");

// ───────────── qué hacer con tu dinero (plan de reparto) ─────────────
// Colchón en la cuenta corriente = un mes de gasto (fijos mensuales + los gastos fijos que no están dados de alta + límite de
// gasto variable, o lo que gastas de verdad si no hay límite; redondeado a 50 €) + el déficit de los meses negativos de la previsión en los próximos 6 meses. Lo que sobre, por orden:
// 1) al objetivo vinculado a una cuenta (fondo de emergencia) hasta su meta; 2) al bróker si su efectivo se acaba en ≤ 3 meses; 3) libre.
const aDiez = (x) => Math.floor(x / 10) * 10;
// Sin límite puesto, el gasto variable del colchón es lo que gastas de verdad (`prevision().varEst`), no 0.
function planReparto(limite = limiteVar) {
  const E = estimacion();
  if (!E || !cuentasTipo("corriente").length) return null;
  const mensuales = recurrentes().filter((r) => r.clase === "gasto" && !(r.meses && r.meses.length < 12));
  const F = prevision();
  const base = Math.round((sum(mensuales.map((r) => r.importe)) + F.sueltoEst + (limite > 0 ? limite : F.varEst)) / 50) * 50;
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
// Y los gastos fijos que no están dados de alta (`suelto`): su media de hasta 12 meses cerrados con gastos, porque suelen ser
// recibos de una vez al año o al trimestre (con 3 meses, un seguro anual saldría multiplicado por cuatro, o no saldría).
// Las aportaciones se pagan primero con el efectivo del bróker; cuando se acaba, salen del banco (`agota`: primer mes así).
// sup: { gasto, ingresos } multiplican lo estimado (gasto variable y gastos fijos sin dar de alta) y los ingresos previstos;
// sin él (1 y 1) es la previsión normal. Los fijos dados de alta y las aportaciones no cambian: son importes que ya conoces.
function prevision(n = 12, sup = {}) {
  const fG = sup.gasto ?? 1, fI = sup.ingresos ?? 1;
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
  // Solo meses con algún gasto real: uno en el que solo hay intereses del bróker (su extracto llega más atrás que el del banco) no tiene datos de gasto.
  const mesesSuelto = mesesHasta(mesAnterior(hoyKey), 12).map(finMes).filter((M) => M.real.some((m) => !m.auto && m.clase === "gasto"));
  const sueltoEst = mesesSuelto.length ? Math.max(0, media(mesesSuelto.map(gastoFijoSuelto))) : 0;
  const sueltoMes = gastoFijoSuelto(finMes(hoyKey));
  // Mes en curso: lo que falta hasta la estimación, sin pasar de la parte proporcional a los días que aún no traen tus datos.
  const dc = diasConDatos();
  const queda = (est, llevas) => Math.min(Math.max(0, est - llevas), est * (diasMes(hoyKey) - dc) / diasMes(hoyKey));
  let saldo = inicio;
  const filas = mesesDesde(hoyKey, n).map((key) => {
    const pend = movimientos().filter((m) => m.previsto && keyDe(m.fecha) === key && !esDelBroker(m));
    const ing = sum(pend.filter((m) => m.clase === "ingreso").map((m) => m.importe)) * fI;
    const fijos = sum(pend.map((m) => m.gasto));
    const apo = sum(aportaciones().filter((a) => a.previsto && keyDe(a.fecha) === key).map((a) => a.importe));
    const variable = key === hoyKey ? queda(varEst * fG, varMes) : varEst * fG;
    const suelto = key === hoyKey ? queda(sueltoEst * fG, sueltoMes) : sueltoEst * fG;
    const tr =sum(pend.filter(esABroker).map((m) => m.importe)) + sum(pend.filter(esAOtra).map((m) => m.importe)) - sum(pend.filter(esDeOtra).map((m) => m.importe));
    const pago = pagarAportacion(broker + sum(pend.filter(esABroker).map((m) => m.importe)), apo);
    broker = pago.broker;
    const neto = ing - fijos - suelto - variable - tr - pago.deBanco;
    saldo += neto;
    return { key, ing, fijos, suelto, variable, apo, apoBanco: pago.deBanco, tr, broker, salidas: fijos + suelto + variable + tr + pago.deBanco, neto, saldo };
  });
  // Mínimo de los meses futuros (el mes en curso casi siempre es el de hoy y no aporta nada).
  const futuros = filas.filter((f) => f.key !== hoyKey);
  const minimo = (futuros.length ? futuros : filas).reduce((a, b) => (b.saldo < a.saldo ? b : a));
  const agota = brokerIni > 0 ? filas.find((f) => f.apoBanco > 0) : null;
  return { inicio, brokerIni, conRegistro: !!E, filas, varEst, varReal, nMesesReal: cerrados.length, fuenteVar, sueltoEst, nMesesSuelto: mesesSuelto.length, minimo, agota };
}

// ───────────── escenarios de la previsión ─────────────
// Tres versiones de prevision() para no fiarse de una sola cifra. Prudente: gastas un 15 % más de lo estimado y te entra un 10 %
// menos; optimista: gastas un 10 % menos y te entra lo previsto (no se cuenta con ingresos extra). Los porcentajes se pueden
// cambiar en pantalla (solo mientras miras: no se guardan). aj: { prudente: { gasto, ingresos }, optimista: {…} } en % (+15 = un 15 % más).
const ESCENARIOS = { prudente: { gasto: 15, ingresos: -10 }, optimista: { gasto: -10, ingresos: 0 } };
function escenariosPrevision(aj = {}, n = 12) {
  const sup = (id) => ({ ...ESCENARIOS[id], ...(aj[id] || {}) });
  const uno = (id, nombre, p) => {
    const F = p ? prevision(n, { gasto: 1 + p.gasto / 100, ingresos: 1 + p.ingresos / 100 }) : prevision(n);
    return { id, nombre, gasto: p ? p.gasto : 0, ingresos: p ? p.ingresos : 0, F, final: F.filas[F.filas.length - 1], minimo: F.minimo };
  };
  return [uno("prudente", "Prudente", sup("prudente")), uno("normal", "Normal", null), uno("optimista", "Optimista", sup("optimista"))];
}


// ───────────── ¿me puedo permitir un gasto? ─────────────
// Un importe como lo escribe un español: «300», «300,50», «1.200», «1.200,50 €». Con coma, los puntos son de millares; sin ella,
// un punto seguido de tres cifras también («1.200» son mil doscientos) y cualquier otro es el decimal («300.50»). Si no es un importe, NaN.
function leerImporte(t) {
  const s = String(t ?? "").replace(/[\s€]/g, "");
  const m = /^(\d+|\d{1,3}(?:\.\d{3})+)(?:,(\d*))?$/.exec(s);
  if (m) return Number(m[1].replace(/\./g, "") + "." + (m[2] || "0"));
  return /^\d+\.\d+$/.test(s) ? Number(s) : NaN;
}
// Qué pasaría con un gasto de `importe` que no tenías previsto: se lo resta a cifras que ya existen, no calcula otra previsión.
// d: { limite (0 = sin límite), disponible (lo que queda del límite este mes), finMes (lo que tendrás al acabar este mes) | null,
//      minimo: { key, saldo } | null (el mes más bajo de prevision()), colchon: { sobra } | null (corriente − colchón, de planReparto()) }
// → { importe, limite, finMes, minimo: { key, saldo }, bajoColchon (cuánto faltaría), nivel: "bien" | "ojo" | "mal" | "falta", texto };
//   lo que no se puede saber va a null. «mal» = tus cuentas bajarían de cero; «ojo» = te pasas del límite o tocas el colchón.
function puedoPermitirme(importe, d) {
  const limite = d.limite > 0 ? d.disponible - importe : null;
  const finMes = d.finMes == null ? null : d.finMes - importe;
  const minimo = d.minimo ? { key: d.minimo.key, saldo: d.minimo.saldo - importe } : null;
  const bajoColchon = d.colchon && d.colchon.sobra - importe <= -0.5 ? importe - d.colchon.sobra : null;
  const out = { importe, limite, finMes, minimo, bajoColchon };
  if (limite == null && finMes == null) return { ...out, nivel: "falta", texto: "Para contestarte hace falta tu límite de gasto o tus saldos." };
  // El peor momento: este mes o el más bajo de los que vienen.
  const peor = minimo && (finMes == null || minimo.saldo < finMes) ? { ...minimo, antes: d.minimo.saldo } : finMes != null ? { key: hoyKey, saldo: finMes, antes: d.finMes } : null;
  if (peor && peor.saldo <= -0.5) {
    const cuando = peor.key === hoyKey ? "al acabar este mes" : `en ${mesLbl(peor.key).toLowerCase()}`;
    return { ...out, nivel: "mal", texto: peor.antes <= -0.5 ? `Ni sin este gasto: tus cuentas ya bajarían de cero ${cuando}; con él se quedarían en ${eur(peor.saldo, 0)}.`
      : `No te llega: tus cuentas se quedarían en ${eur(peor.saldo, 0)} ${cuando}.` };
  }
  const pasado = limite != null && limite <= -0.5;
  const tPasa = `te pasarías ${eur(-limite, 0)} del límite de este mes`, yaBajo = d.colchon && d.colchon.sobra <= -0.5;
  const tColchon = yaBajo ? `tu cuenta del día a día ya está ${eur(-d.colchon.sobra, 0)} por debajo de tu colchón` : `dejaría tu cuenta del día a día ${eur(bajoColchon, 0)} por debajo de tu colchón`;
  const frase = (s) => s[0].toUpperCase() + s.slice(1) + ".";
  if (pasado && bajoColchon) return { ...out, nivel: "ojo", texto: frase(`${tPasa} y ${tColchon}`) };
  if (pasado) return { ...out, nivel: "ojo", texto: finMes == null ? frase(tPasa) : `Tus cuentas lo aguantan, pero ${tPasa}.` };
  if (bajoColchon) return { ...out, nivel: "ojo", texto: limite == null ? frase(tColchon) : `Te cabe en tu límite, pero ${tColchon}.` };
  if (limite == null) return { ...out, nivel: "bien", texto: `Tus cuentas lo aguantan: acabarías el mes con ${eur(finMes, 0)}.` };
  return { ...out, nivel: "bien", texto: finMes == null ? `Te cabe en tu límite de este mes: te quedarían ${eur(limite, 0)}.` : `Sí, te cabe: te quedarían ${eur(limite, 0)} de tu límite este mes.` };
}
// Las cifras de hoy para puedoPermitirme(). Sin saldos anotados no hay previsión; sin ingresos fijos, la previsión solo ve lo que
// sale y su mes más bajo no dice nada (`sinIngresos`).
function datosPermitir() {
  const F = estimacion() ? prevision() : null, R = planReparto(), conIng = hayIngresosFijos();
  return { limite: limiteVar, disponible: presupuestoSemana().disponible, finMes: F ? F.filas[0].saldo : null,
    minimo: F && conIng ? { key: F.minimo.key, saldo: F.minimo.saldo } : null, colchon: R ? { sobra: R.sobra, importe: R.colchon } : null, sinIngresos: !!F && !conIng };
}

// ───────────── «Más filtros» de Movimientos ─────────────
// f: { cuenta: "" (todas) | nombre, desde, hasta: texto como lo escribe un español ("" = sin tope), sinRevisar: bool }. El importe es el absoluto
// (movimiento.importe va siempre en positivo: da igual si es gasto o ingreso). Un tope que no es un importe válido no filtra.
function filtrosMasLimpios(f) {
  const g = f || {}, n = (t) => { const v = leerImporte(t); return isFinite(v) ? v : null; };
  return { cuenta: String(g.cuenta || ""), desde: n(g.desde), hasta: n(g.hasta), sinRevisar: !!g.sinRevisar };
}
// Cuántos de los filtros de «Más filtros» están puestos (0 = ninguno).
function filtrosMasActivos(f) {
  const g = filtrosMasLimpios(f);
  return (g.cuenta ? 1 : 0) + (g.desde != null || g.hasta != null ? 1 : 0) + (g.sinRevisar ? 1 : 0);
}
function filtrarMas(ms, f) {
  const g = filtrosMasLimpios(f);
  return ms.filter((m) => (!g.cuenta || m.cuenta === g.cuenta) && (g.desde == null || m.importe >= g.desde - 0.005)
    && (g.hasta == null || m.importe <= g.hasta + 0.005) && (!g.sinRevisar || !!m.pendiente));
}

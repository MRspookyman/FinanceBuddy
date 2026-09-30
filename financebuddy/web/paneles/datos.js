// ═════════════ datos: utilidades, mes seleccionado y lectura de los registros ═════════════
// Los módulos (datos → calculos → componentes → graficos → bloques → vistas → formularios → pantallas) se concatenan
// y comparten ámbito. Reciben `FB` (datos, API y navegación: ver nucleo.js), `luxon` e `input` ({ vista, params }).
const { DateTime } = luxon;
const vista = (input && input.vista) || "resumen";
const params = (input && input.params) || [];
const DB = FB.DB;

// ───────────── utilidades ─────────────
const num = (x) => {
  if (x == null || x === "") return 0;
  if (typeof x === "number") return x;
  let s = String(x).trim().replace(/[\s€]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? n : 0;
};
const hasNum = (x) => x != null && x !== "";
const txt = (v) => (v == null ? "" : String(v).trim());
const toDate = (v) => {
  if (!v) return null;
  if (typeof v.toFormat === "function") return v;
  const d = DateTime.fromISO(String(v));
  return d.isValid ? d : null;
};
const sum = (a) => a.reduce((s, x) => s + x, 0);
const media = (a) => (a.length ? sum(a) / a.length : NaN);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const nf = (n, min, max) => n.toLocaleString("es-ES", { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: "always" });
const eur = (n, dec = 2) => (n == null || !isFinite(n)) ? "—" : (n < 0 ? "−" : "") + nf(Math.abs(n), dec, dec) + " €";
const eurS = (n, dec = 2) => (n > 0 ? "+" : "") + eur(n, dec);
const pct = (n, signo = false) => (n == null || !isFinite(n)) ? "—" : (signo && n > 0 ? "+" : "") + (n < 0 ? "−" : "") + nf(Math.abs(n * 100), 1, 1) + " %";
const compact = (n) => {
  const a = Math.abs(n);
  const s = a >= 10000 ? nf(a / 1000, 0, 0) + "k" : a >= 1000 ? nf(a / 1000, 0, 1) + "k" : nf(a, 0, 0);
  return (n > 0 ? "+" : n < 0 ? "−" : "") + s;
};
const ejeFmt = (v) => {
  const a = Math.abs(v);
  const s = a >= 10000 ? nf(a / 1000, 0, 1) + "k" : nf(a, 0, a < 10 && a % 1 ? 1 : 0);
  return (v < 0 ? "−" : "") + s;
};
const tone = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
const mesDT = (key) => DateTime.fromFormat(key, "yyyy-MM");
const mesLbl = (key) => cap(mesDT(key).setLocale("es").toFormat("LLLL yyyy"));
const mesCorto = (key) => cap(mesDT(key).setLocale("es").toFormat("LLL").replace(".", ""));
const mesesHasta = (key, n) => Array.from({ length: n }, (_, i) => mesDT(key).minus({ months: n - 1 - i }).toFormat("yyyy-MM"));
const mesesDesde = (key, n) => Array.from({ length: n }, (_, i) => mesDT(key).plus({ months: i }).toFormat("yyyy-MM"));
const keyDe = (d) => d.toFormat("yyyy-MM");
// «Hoy» se puede fijar al arrancar (--hoy) para las pruebas.
const hoy = (DB.info && DB.info.hoy ? DateTime.fromISO(DB.info.hoy) : DateTime.now()).startOf("day");
const finHoy = hoy.endOf("day");
const hoyKey = hoy.toFormat("yyyy-MM");
const mesAnterior = (key) => mesDT(key).minus({ months: 1 }).toFormat("yyyy-MM");
const diasDesde = (d) => Math.floor(hoy.diff(d.startOf("day"), "days").days);
const fechaCorta = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");

// ───────────── estado local (mes y filtro compartidos entre pantallas) ─────────────
// Se guarda en localStorage y caduca a las 6 h, para que al volver otro día se abra el mes actual.
const ESTADO = "fin-estado", CADUCA = 6 * 3600 * 1000;
const leerEstado = () => {
  try {
    const e = JSON.parse(localStorage.getItem(ESTADO) || "{}") || {};
    return e.t && Date.now() - e.t < CADUCA ? e : {};
  } catch (_) { return {}; }
};
const guardarEstado = (cambios) => {
  try { localStorage.setItem(ESTADO, JSON.stringify({ ...leerEstado(), ...cambios, t: Date.now() })); } catch (_) {}
};
const abrir = (ruta) => FB.ir(ruta);

// ───────────── mes seleccionado ─────────────
const estado0 = leerEstado();
let mes = estado0.mes || "";
if (!mesDT(mes).isValid) mes = hoyKey;
const cambiarMes = (key) => { mes = key; guardarEstado({ mes }); render(); };
// Filtro de categoría en Gastos (se puede fijar desde el Resumen antes de abrir Gastos; se consume una vez).
let filtroCat = (vista === "gastos" || vista === "movimientos") && estado0.filtroCat ? estado0.filtroCat : null;
if (filtroCat) guardarEstado({ filtroCat: null });
let busqueda = "";

// ───────────── registros ─────────────
const cfg = DB.config || {};
// Cada registro lleva `file` (nombre y enlace para editarlo), como las notas de la versión anterior.
const registros = (tipo) => (DB.registros[tipo] || []).map((r) => ({ ...r, file: { name: r.nombre || r.concepto || r.patron || r.mes || r.fecha || tipo, path: `#editar/${tipo}/${r.id}` } }));

let _movs, _cats, _pat, _objs, _recs, _activos, _aports, _cuentas;
// Cuentas del usuario. tipo: corriente · ahorro · broker · otro. La «principal» es la primera corriente.
const cuentas = () => (_cuentas ??= registros("cuenta").map((p) => ({ p, nombre: p.nombre, tipo: txt(p.tipo) || "corriente", extracto: !!p.extracto })));
const cuentaPor = (n) => cuentas().find((c) => c.nombre === n);
const tipoCuenta = (n) => (cuentaPor(n) || {}).tipo || "";
const principal = () => (cuentas().find((c) => c.tipo === "corriente") || cuentas()[0] || {}).nombre || "";
const cuentasTipo = (t) => cuentas().filter((c) => c.tipo === t).map((c) => c.nombre);
const nombresBroker = () => cuentasTipo("broker").join(", ") || "tu bróker";

const listaMeses = (v) => {
  if (v == null || v === "") return null;
  const arr = Array.isArray(v) ? v : String(v).split(/[,\s]+/);
  const out = arr.map(Number).filter((n) => n >= 1 && n <= 12);
  return out.length ? out : null;
};
const recurrentes = () => (_recs ??= registros("recurrente").filter((p) => p.activo !== false).map((p) => ({
  p, nombre: p.nombre, importe: Math.abs(num(p.importe)), clase: txt(p.clase).toLowerCase() || "gasto",
  categoria: txt(p.categoria) || "Otros", dia: Math.max(1, num(p.dia) || 1), desde: toDate(p.desde), hasta: toDate(p.hasta),
  meses: listaMeses(p.meses), activoInv: txt(p.activo_inversion), cuenta: txt(p.cuenta),
})));
// Horizonte de los recurrentes: 12 meses por delante del mes visible o de hoy (lo necesita la previsión de caja).
const horizonte = () => DateTime.max(hoy, mesDT(mes)).startOf("month").plus({ months: 12 });
// Fechas en que toca un recurrente (desde `desde` hasta el horizonte; `meses` limita a esos meses del año).
function ocurrencias(r) {
  const out = [];
  if (!r.desde) return out;
  const fin = horizonte();
  for (let d = r.desde.startOf("month"); d <= fin; d = d.plus({ months: 1 })) {
    const fecha = d.set({ day: Math.min(r.dia, d.daysInMonth) });
    if (fecha < r.desde.startOf("day") || (r.hasta && fecha > r.hasta)) continue;
    if (r.meses && !r.meses.includes(d.month)) continue;
    out.push(fecha);
  }
  return out;
}
// Los recurrentes generan un movimiento automático cada mes salvo que exista uno real con `recurrente: <nombre>` ese mes.
// `previsto`: fecha posterior a hoy → no cuenta como cobrado/pagado, solo como pendiente.
// `gasto`: lo que suma al gasto de su categoría. `reembolso` (p. ej. un Bizum de un amigo por su parte de una cena) resta.
const movimientos = () => {
  if (_movs) return _movs;
  const reales = registros("movimiento").map((p) => ({
    p, fecha: toDate(p.fecha), importe: Math.abs(num(p.importe)),
    clase: txt(p.clase).toLowerCase() || "gasto", categoria: txt(p.categoria) || (p.clase === "transferencia" ? "" : "Otros"),
    concepto: txt(p.concepto) || "Movimiento", recurrente: txt(p.recurrente), destino: txt(p.destino), origen: txt(p.origen),
    cuenta: txt(p.cuenta) || principal(), auto: false,
  })).filter((m) => m.fecha);
  const virtuales = [];
  const vinculados = new Set(reales.filter((m) => m.recurrente).map((m) => `${m.recurrente}|${keyDe(m.fecha)}`));
  for (const r of recurrentes().filter((r) => r.clase !== "aportacion")) {
    for (const fecha of ocurrencias(r)) {
      if (vinculados.has(`${r.nombre}|${keyDe(fecha)}`)) continue;
      virtuales.push({ p: r.p, fecha, importe: r.importe, clase: r.clase, categoria: r.categoria, concepto: r.nombre, recurrente: r.nombre, cuenta: r.cuenta || principal(), auto: true });
    }
  }
  return (_movs = [...reales, ...virtuales].map((m) => ({
    ...m, previsto: m.fecha > finHoy, gasto: m.clase === "gasto" ? m.importe : m.clase === "reembolso" ? -m.importe : 0,
  })));
};
// Movimientos agrupados por mes (AAAA-MM), calculado una vez por render: los paneles piden muchos meses.
let _movsMes;
const movsDelMes = (key) => {
  if (!_movsMes) {
    const todos = movimientos(), mapa = new Map();
    for (const m of todos) { const k = keyDe(m.fecha); if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(m); }
    _movsMes = mapa;
  }
  return _movsMes.get(key) || [];
};
const categorias = () => (_cats ??= registros("categoria").map((p) => ({
  p, nombre: p.nombre, grupo: txt(p.grupo).toLowerCase() || "variable", presupuesto: num(p.presupuesto),
})));
const activoDe = (p) => ({
  p, nombre: p.nombre, clase: txt(p.clase) || "otro", cuenta: txt(p.cuenta), valor: num(p.valor), conValor: hasNum(p.valor), ter: hasNum(p.ter) ? num(p.ter) : null, fechaValor: toDate(p.fecha_valor),
  aportadoIni: hasNum(p.aportado_inicial) ? num(p.aportado_inicial) : null, fechaIni: toDate(p.fecha_inicio),
});
const activos = () => (_activos ??= registros("activo").filter((p) => txt(p.estado).toLowerCase() !== "vendido").map(activoDe));
const esCripto = (a) => /cripto/i.test(a.clase);
const claseActivo = (nombre) => ((registros("activo").find((a) => a.nombre === nombre) || {}).clase || "otro");
// Registro de patrimonio: saldo de cada cuenta y valor de cada activo en una fecha. Se agrupa por tipo de cuenta:
// Liquidez = corriente + ahorro · «Efectivo bróker» = cuentas del bróker (dinero sin invertir) · Otros = cuentas «otro» + otros.
function agrupar(saldos, valores, otros) {
  const porTipo = (t) => sum(Object.entries(saldos).filter(([c]) => (tipoCuenta(c) || "corriente") === t).map(([, v]) => num(v)));
  const corriente = porTipo("corriente"), ahorro = porTipo("ahorro");
  const inv = Object.entries(valores || {});
  return {
    c: { Liquidez: corriente + ahorro, "Efectivo bróker": porTipo("broker"),
      "Inversión": sum(inv.filter(([a]) => !/cripto/i.test(claseActivo(a))).map(([, v]) => num(v))),
      Cripto: sum(inv.filter(([a]) => /cripto/i.test(claseActivo(a))).map(([, v]) => num(v))), Otros: porTipo("otro") + num(otros) },
    cuentas: { tiene: true, corriente, ahorro: cuentasTipo("ahorro").length ? ahorro : null, saldos: { ...saldos } },
  };
}
const patrimonio = () => (_pat ??= registros("patrimonio").map((p) => {
  const saldos = {};
  for (const [k, v] of Object.entries(p.saldos || {})) saldos[k] = num(v);
  const { c, cuentas: cs } = agrupar(saldos, p.valores || {}, p.otros);
  const deudas = Math.abs(num(p.deudas));
  const act = sum(Object.values(c));
  return { p, fecha: toDate(p.fecha), c, cuentas: cs, valores: p.valores || {}, otros: num(p.otros), deudas, activos: act, neto: act - deudas };
}).filter((x) => x.fecha).sort((a, b) => a.fecha.toMillis() - b.fecha.toMillis()));
// `cuenta: X` en un objetivo → lo ahorrado es el saldo (estimado hoy) de esa cuenta; si no, el campo `ahorrado`.
// `meta_meses: N` → la meta es N meses de gasto medio reciente (redondeada a 50 €); si no, el campo `meta`.
const objetivos = () => (_objs ??= registros("objetivo").map((p) => {
  const cuenta = txt(p.cuenta);
  const E = cuenta ? estimacion() : null;
  const vinculado = !!(E && E.cuentas.saldos[cuenta] != null);
  const metaMeses = num(p.meta_meses), gm = metaMeses > 0 ? gastoMedioReciente() : NaN;
  const meta = metaMeses > 0 && gm > 0 ? Math.round((metaMeses * gm) / 50) * 50 : num(p.meta);
  return {
    p, nombre: p.nombre, cuenta, meta, metaMeses: metaMeses > 0 && gm > 0 ? metaMeses : null, ahorrado: vinculado ? E.cuentas.saldos[cuenta] : num(p.ahorrado), vinculado,
    limite: toDate(p.fecha_limite), prioridad: txt(p.prioridad).toLowerCase() || "media", estado: txt(p.estado).toLowerCase() || "activo",
  };
}));
// Recordatorios con fecha (seguro del coche, renta…): aparecen en Pendientes `avisar_dias` antes (14 por defecto).
const recordatorios = () => registros("recordatorio").map((p) => ({
  p, nombre: p.nombre, fecha: toDate(p.fecha), avisar: hasNum(p.avisar_dias) ? num(p.avisar_dias) : 14,
  estado: txt(p.estado).toLowerCase() || "pendiente", texto: txt(p.texto),
})).filter((r) => r.fecha);
const cierres = () => registros("cierre");
// Transferencias según el tipo de la otra cuenta.
const esABroker = (m) => m.clase === "transferencia" && tipoCuenta(m.destino) === "broker";
const esAAhorro = (m) => m.clase === "transferencia" && tipoCuenta(m.destino) === "ahorro";
const esDeAhorro = (m) => m.clase === "transferencia" && tipoCuenta(m.origen) === "ahorro";
const esAOtra = (m) => m.clase === "transferencia" && tipoCuenta(m.destino) === "otro";
const esDeOtra = (m) => m.clase === "transferencia" && tipoCuenta(m.origen) === "otro";
const esDelBroker = (m) => tipoCuenta(m.cuenta) === "broker"; // p. ej. intereses de la cuenta de efectivo del bróker
// Recurrentes con `clase: aportacion` y `activo_inversion` generan aportaciones automáticas (salvo que exista la real con `recurrente`).
const aportaciones = () => {
  if (_aports) return _aports;
  const reales = registros("aportacion").map((p) => ({
    p, fecha: toDate(p.fecha), activo: txt(p.activo), importe: num(p.importe), recurrente: txt(p.recurrente), cuenta: txt(p.cuenta), auto: false,
  })).filter((a) => a.fecha);
  const virtuales = [];
  const vinculadas = new Set(reales.filter((a) => a.recurrente).map((a) => `${a.recurrente}|${keyDe(a.fecha)}`));
  for (const r of recurrentes().filter((r) => r.clase === "aportacion" && r.activoInv)) {
    for (const fecha of ocurrencias(r)) {
      if (vinculadas.has(`${r.nombre}|${keyDe(fecha)}`)) continue;
      virtuales.push({ p: r.p, fecha, activo: r.activoInv, importe: r.importe, recurrente: r.nombre, cuenta: r.cuenta, auto: true });
    }
  }
  return (_aports = [...reales, ...virtuales].map((a) => ({ ...a, previsto: a.fecha > finHoy })).sort((a, b) => a.fecha.toMillis() - b.fecha.toMillis()));
};
const aportacionesReales = () => aportaciones().filter((a) => !a.previsto);
// Cuenta del bróker de la que se paga una aportación: la del activo, la de la aportación o la primera del bróker.
const cuentaAportacion = (a) => {
  const act = registros("activo").find((x) => x.nombre === a.activo);
  return (act && act.cuenta) || a.cuenta || cuentasTipo("broker")[0] || "";
};

// ═════════════ vistas ═════════════
let irAMovs = !!filtroCat;
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const pendiente = (v) => (v ? `${eur(v, 0)} pendiente` : "");

function heroPatrimonio(P, E) {
  const u = P[P.length - 1], a = P[P.length - 2];
  if (E && E.dias > 0) {
    hero(root, {
      l: "Patrimonio neto estimado · hoy", v: eur(E.neto, 0),
      d: { v: E.neto - u.neto, txt: `${eurS(E.neto - u.neto, 0)} desde el registro del ${u.fecha.toFormat("dd/MM")}`, bueno: 1 },
      s: `Último registro: ${eur(u.neto, 0)} · ${u.fecha.toFormat("dd/MM/yyyy")}`, sparkVals: P.length >= 2 ? [...P.map((x) => x.neto), E.neto] : null,
    });
    return;
  }
  hero(root, {
    l: `Patrimonio neto · ${u.fecha.toFormat("dd/MM/yyyy")}`, v: eur(u.neto, 0),
    d: a ? { v: u.neto - a.neto, txt: `${eurS(u.neto - a.neto, 0)} (${pct((u.neto - a.neto) / Math.abs(a.neto || 1), true)}) vs. ${a.fecha.toFormat("dd/MM")}`, bueno: 1 } : null,
    s: a ? "" : "Primer registro · la tendencia aparece con el segundo", sparkVals: P.length >= 3 ? P.map((x) => x.neto) : null,
  });
}

// Resumen: lo esencial a primera vista (qué hay pendiente, cómo va el mes, cuánto tienes); el resto, plegado.
function vistaResumen() {
  cabecera("Resumen", true);
  const AV = avisos();
  if (AV.length) bloqueAvisos(panel(root, "Pendientes"), AV);

  const M = finMes(mes), Mp = finMes(mesAnterior(mes)), T12 = tasa12(mes);
  const irCategoria = (n) => { guardarEstado({ filtroCat: n, mes }); abrir("#gastos"); };
  // Lo que se mira cada semana (solo tiene sentido en el mes en curso)
  const actual = mes === hoyKey;
  if (actual) {
    const g0 = rejilla();
    bloqueSemana(panel(g0, "Cuánto puedes gastar"));
    bloquePlan(panel(g0, "Qué hacer con tu dinero"));
  }
  const g = rejilla();
  const pM = panel(g, mesLbl(mes), { text: "Ver gastos →", ruta: "#gastos" });
  cifra(pM, "Ahorro del mes", eurS(M.ahorro, 0),
    [isFinite(M.tasa) ? `${pct(M.tasa)} de lo ingresado` : "", T12.meses > 1 ? `media ${pct(T12.tasa)}` : ""].filter(Boolean).join(" · "),
    "Lo que has ingresado menos lo que has gastado este mes. El porcentaje es qué parte de lo que ingresas consigues guardar.");
  filasDato(pM, [
    { l: "Ingresos", s: M.ingresosPrev ? `+${eur(M.ingresosPrev, 0)} pendiente` : "", v: eur(M.ingresos, 0) },
    { l: "Gastos", s: M.gastosPrev ? `+${eur(M.gastosPrev, 0)} pendiente` : Mp.gastos ? `${eurS(M.gastos - Mp.gastos, 0)} vs. ${mesCorto(Mp.key).toLowerCase()}` : "", v: eur(M.gastos, 0),
      h: "Lo que has gastado de verdad: si un amigo te devuelve su parte de una cena por Bizum, se descuenta." },
  ]);
  if (!actual) bloqueLimite(pM, M); // en el mes en curso ya lo dice «Cuánto puedes gastar»
  bloquePresupuesto(pM, M, { limite: 3, onCat: irCategoria });
  bloqueDinero(panel(g, "Tu dinero", { text: "Ver patrimonio →", ruta: "#patrimonio" }));

  plegable(root, "Destino del ahorro", (c) => bloqueAhorro(c, mes), { extra: "a dónde ha ido lo ahorrado este mes" });
  plegable(root, "Previsión de caja", (c) => { bloquePrevisionMini(c); enlace(c.createDiv({ cls: "fin-note" }), "Ver la previsión completa →", "#prevision"); }, { extra: "próximos 12 meses" });
  plegable(root, "¿Qué significa cada cosa?", (c) => filasDato(c, GLOSARIO.map(([l, s]) => ({ l, s, v: "" }))), { extra: "glosario" });
}
const GLOSARIO = [
  ["Gasto variable", "Todo lo que no se repite igual cada mes: comer fuera, compras, ocio… Es lo que controla tu límite mensual."],
  ["Gastos fijos", "Los que se repiten cada mes: alquiler, recibos, suscripciones (las categorías del grupo «fijo»)."],
  ["Ahorro del mes", "Ingresos menos gastos del mes."],
  ["Tasa de ahorro", "Qué parte de lo que ingresas consigues guardar (por ejemplo, 50 % = la mitad)."],
  ["Te lo devolvieron", "Lo que te pagan otros por su parte de algo que pagaste tú; se resta de ese gasto."],
  ["Entre tus cuentas", "Dinero que mueves de una cuenta tuya a otra (al ahorro, al bróker…): no es gasto."],
  ["Colchón", "Lo que conviene dejar en la cuenta corriente: un mes de gasto. Lo que sobre se puede mover."],
  ["Fondo de emergencia", "Dinero apartado para imprevistos. Lo habitual es tener de 3 a 6 meses de gasto."],
  ["Sin invertir", "Dinero en el bróker que aún no se ha usado para comprar: de ahí salen las compras."],
  ["Aportación", "Cada compra (o venta) de un fondo, acción o cripto."],
  ["Rentabilidad anual (TIR)", "Cuánto rinde al año tu inversión, teniendo en cuenta cuándo metiste cada euro."],
  ["Patrimonio neto", "Todo lo que tienes menos lo que debes."],
  ["Previsión", "Cómo evolucionará tu dinero los próximos meses con lo que se repite (nómina, alquiler…) y tu límite de gasto."],
];

// Gastos: total del mes, categorías (con el límite) y movimientos a la vista; el análisis, plegado.
function vistaGastos() {
  cabecera("Gastos", true);
  const serie = mesesHasta(mes, 12).map(finMes);
  const M = serie[11], Mp = serie[10], T12 = tasa12(mes);
  const vari = gastoVariable(M);
  hero(root, {
    l: `Gastado en ${mesLbl(mes).toLowerCase()}`, v: eur(M.gastos, 0),
    d: Mp.gastos > 0 ? { v: M.gastos - Mp.gastos, txt: `${eurS(M.gastos - Mp.gastos, 0)} vs. ${mesCorto(Mp.key).toLowerCase()}`, bueno: -1 } : null,
    s: [limiteVar > 0 ? `variable ${eur(vari, 0)} de ${eur(limiteVar, 0)} · fijos ${eur(M.gastos - vari, 0)}` : "", M.gastosPrev ? `${eur(M.gastosPrev, 0)} pendientes de pago` : ""].filter(Boolean).join(" · "),
  });

  const verCat = (n) => { filtroCat = filtroCat === n ? null : n; busqueda = ""; irAMovs = !!filtroCat; render(); };
  const g = rejilla();
  const pP = panel(g, "Por categoría", { text: "pulsa una para filtrar" });
  bloqueLimite(pP, M);
  bloquePresupuesto(pP, M, { onCat: verCat });

  // Movimientos: filtro por categoría (del mes) y buscador (en todos los meses).
  const pM = panel(g, "");
  pM.addClass ? pM.addClass("fin-movs") : (pM.className += " fin-movs");
  const h = pM.createEl("h3");
  const titulo = h.createSpan();
  enlace(h.createSpan({ cls: "x" }), "+ Apuntar", "#apuntar");
  const barra = pM.createDiv({ cls: "fin-filtros" });
  const inp = barra.createEl("input", { cls: "fin-search", attr: { type: "search", placeholder: "Buscar en todos los meses…" } });
  inp.value = busqueda;
  if (filtroCat) {
    const chip = barra.createSpan({ cls: "fin-chip", text: filtroCat });
    const x = chip.createEl("button", { text: "✕" });
    x.title = "Quitar filtro";
    x.onclick = () => { filtroCat = null; render(); };
  }
  const cont = pM.createDiv();
  const pintar = () => {
    cont.innerHTML = "";
    const q = norm(busqueda.trim());
    const todos = q ? movimientos().filter((m) => m.fecha <= mesDT(hoyKey).endOf("month")) : M.ms;
    const filas = todos
      .filter((m) => !filtroCat || m.categoria === filtroCat)
      .filter((m) => !q || norm(`${m.concepto} ${m.categoria} ${nf(m.importe, 2, 2)} ${m.importe}`).includes(q))
      .sort((a, b) => b.fecha.toMillis() - a.fecha.toMillis());
    titulo.setText(q ? `Resultados · ${filas.length}` : `Movimientos · ${filas.length}`);
    if (!filas.length) { vacio(cont, q ? "Nada coincide con la búsqueda" : filtroCat ? `Sin gastos de ${filtroCat} este mes` : "Sin movimientos este mes"); return; }
    const gastoF = sum(filas.filter((m) => !m.previsto).map((m) => m.gasto));
    if (q || filtroCat) cont.createDiv({ cls: "fin-note", text: `Gastado en lo filtrado: ${eur(gastoF)}` });
    const MAX = 20, visibles = verTodos || filas.length <= MAX + 5 ? filas : filas.slice(0, MAX);
    tabla(cont, [{ t: "Fecha" }, { t: "Concepto" }, { t: "Importe", num: true }], visibles.map((m) => conFila([
      m.fecha.toFormat(q ? "dd/MM/yy" : "dd/MM"),
      { text: m.concepto, ruta: m.p.file.path, badge: m.previsto ? "previsto" : m.clase === "reembolso" ? "te lo devolvieron" : m.clase === "transferencia" ? "entre tus cuentas" : null },
      { text: m.clase === "gasto" ? eur(-m.importe) : m.clase === "transferencia" ? eur(m.importe) : eurS(m.importe), cls: m.clase === "ingreso" && !m.previsto ? "pos" : "" },
    ], m.previsto ? "prev" : "")));
    if (visibles.length < filas.length) {
      const b = cont.createEl("button", { cls: "fin-vermas", text: `Ver los ${filas.length} movimientos` });
      b.onclick = () => { verTodos = true; pintar(); };
    }
  };
  let verTodos = false;
  inp.oninput = () => { busqueda = inp.value; verTodos = false; pintar(); };
  pintar();
  if (irAMovs) { irAMovs = false; setTimeout(() => pM.scrollIntoView && pM.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }

  // ── análisis (plegado) ──
  plegable(root, "Evolución", (c) => {
    kv(c, [
      { l: "Ingresos", v: eur(M.ingresos, 0) }, { l: "Ahorro", v: eurS(M.ahorro, 0), t: tone(M.ahorro) },
      { l: "Tasa de ahorro", v: pct(M.tasa) }, T12.meses > 1 ? { l: `Media (${T12.meses} meses)`, v: pct(T12.tasa) } : null,
    ]);
    columnas(c, {
      etiquetas: serie.map((x) => mesCorto(x.key)), titulos: serie.map((x) => mesLbl(x.key)),
      series: [{ nombre: "Ingresos", color: "var(--fin-s1)", valores: serie.map((x) => x.ingresos) }, { nombre: "Gastos", color: "var(--fin-s2)", valores: serie.map((x) => x.gastos) }],
    });
    leyenda(c, [["Ingresos", "var(--fin-s1)"], ["Gastos", "var(--fin-s2)"]]);
  }, { extra: "ingresos y gastos de los últimos 12 meses" });
  plegable(root, "Categorías mes a mes", (c) => {
    const cats = new Map();
    serie.forEach((S, i) => {
      for (const m of S.real.filter((m) => m.gasto)) {
        if (!cats.has(m.categoria)) cats.set(m.categoria, Array(12).fill(0));
        cats.get(m.categoria)[i] += m.gasto;
      }
    });
    const filasCalor = [...cats.entries()].map(([nombre, valores]) => ({ nombre, valores })).filter((f) => f.valores.some((v) => Math.abs(v) >= 0.5)).sort((a, b) => sum(b.valores) - sum(a.valores));
    if (!filasCalor.length) { vacio(c, "Sin gastos en los últimos 12 meses"); return; }
    mapaCalor(c, {
      filas: filasCalor, meses: serie.map((x) => x.key), act: mes,
      onclick: (f, i) => { mes = serie[i].key; filtroCat = f.nombre; busqueda = ""; irAMovs = true; guardarEstado({ mes }); render(); },
    });
    c.createDiv({ cls: "fin-note", text: "Pulsa una celda para ver esos movimientos." });
  }, { extra: "dónde sube o baja el gasto" });
  plegable(root, `Año ${mesDT(mes).year}`, (c) => bloqueAnual(c, mes), { extra: "totales por categoría" });
}

// Resumen del año del mes visible (enero → ese mes) comparado con el mismo periodo del año anterior.
function bloqueAnual(padre, key) {
  const d = mesDT(key), anio = d.year, n = d.month;
  const meses = (a) => Array.from({ length: n }, (_, i) => `${a}-${String(i + 1).padStart(2, "0")}`);
  const act = meses(anio).map(finMes), ant = meses(anio - 1).map(finMes);
  const tot = (arr, k) => sum(arr.map((x) => x[k]));
  const I = tot(act, "ingresos"), G = tot(act, "gastos"), Ia = tot(ant, "ingresos"), Ga = tot(ant, "gastos");
  const conGasto = act.filter((x) => x.gastos > 0).length;
  // Solo se compara si el año anterior tiene datos en al menos tantos meses como este (si no, los % no significan nada).
  const hayAnt = (Ia > 0 || Ga > 0) && ant.filter((x) => x.gastos > 0).length >= conGasto;
  const rango = n === 12 ? "año completo" : n === 1 ? "enero" : `enero – ${mesDT(key).setLocale("es").toFormat("LLLL")}`;
  if (!I && !G) { vacio(padre, `Sin movimientos en ${anio}`); return; }
  const dif = (a, b) => (hayAnt && b ? ` (${pct((a - b) / b, true)})` : "");
  kv(padre, [
    { l: `Ingresos · ${rango}`, v: eur(I, 0) }, { l: "Gastos", v: eur(G, 0) },
    { l: "Ahorro", v: eurS(I - G, 0), t: tone(I - G) }, { l: "Tasa de ahorro", v: pct(I > 0 ? (I - G) / I : NaN) },
    { l: "Gasto medio", v: conGasto ? `${eur(G / conGasto, 0)}/mes` : "—" },
  ]);
  if (hayAnt) padre.createDiv({ cls: "fin-note", text: `Vs. mismo periodo de ${anio - 1}: ingresos ${eurS(I - Ia, 0)}${dif(I, Ia)} · gastos ${eurS(G - Ga, 0)}${dif(G, Ga)}` });
  const porCat = (arr) => {
    const m = new Map();
    for (const S of arr) for (const x of S.real.filter((x) => x.gasto)) m.set(x.categoria, (m.get(x.categoria) || 0) + x.gasto);
    return m;
  };
  const cA = porCat(act), cP = porCat(ant);
  const nombres = [...new Set([...cA.keys(), ...cP.keys()])].sort((a, b) => (cA.get(b) || 0) - (cA.get(a) || 0));
  if (!nombres.length) return;
  const cols = [{ t: "Categoría" }, { t: String(anio), num: true }, { t: "% del gasto", num: true, opt: true }];
  if (hayAnt) cols.push({ t: String(anio - 1), num: true, opt: true }, { t: "Variación", num: true });
  tabla(padre, cols, nombres.map((c) => {
    const a = cA.get(c) || 0, p = cP.get(c) || 0;
    const fila = [c, eur(a, 0), G ? pct(a / G) : "—"];
    if (hayAnt) fila.push(p ? eur(p, 0) : "—", p ? { text: eurS(a - p, 0), cls: a - p > 0 ? "neg" : a - p < 0 ? "pos" : "" } : "nueva");
    return fila;
  }));
}

// Previsión: liquidez hoy y dentro de 12 meses, la curva y el aviso del bróker; el detalle, plegado.
function vistaPrevision() {
  cabecera("Previsión de caja", false, "Próximos 12 meses");
  const F = prevision();
  if (!F.conRegistro) { vacio(root, "Faltan los saldos de tus cuentas", "La previsión parte de tu dinero actual: anótalo en «Cerrar el mes»."); return; }
  const ult = F.filas[F.filas.length - 1];
  hero(root, {
    l: "Dinero en cuentas hoy · corriente + ahorro", v: eur(F.inicio, 0),
    d: { v: ult.saldo - F.inicio, txt: `${eurS(ult.saldo - F.inicio, 0)} hasta ${mesLbl(ult.key).toLowerCase()}`, bueno: 1 },
    s: `Saldo previsto entonces: ${eur(ult.saldo, 0)}`,
  });
  tiles(root, [
    { l: "Saldo mínimo previsto", v: eur(F.minimo.saldo, 0), t: F.minimo.saldo < 0 ? "neg" : "", s: `a fin de ${mesLbl(F.minimo.key).toLowerCase()}` },
    { l: "Gasto variable previsto", v: `${eur(F.varEst, 0)}/mes`, s: F.fuenteVar + (isFinite(F.varReal) && limiteVar > 0 ? ` · media real ${eur(F.varReal, 0)}` : "") },
    F.brokerIni > 0 ? { l: `${nombresBroker()} sin invertir`, v: eur(F.brokerIni, 0), s: F.agota ? `llega hasta ${mesLbl(mesAnterior(F.agota.key)).toLowerCase()}` : "cubre las aportaciones del año" } : null,
  ]);
  if (F.agota) {
    const av = root.createDiv({ cls: "fin-panel" }).createDiv({ cls: "fin-avisos" }).createDiv({ cls: "warn" });
    ico(av, "warn");
    av.appendText(`En ${mesLbl(F.agota.key).toLowerCase()} el efectivo de ${nombresBroker()} ya no llega: faltan ${eur(F.agota.apoBanco, 0)} para las aportaciones y, desde entonces, ${eur(ult.apoBanco, 0)}/mes. Traspasa desde el banco antes del día de la aportación.`);
  }
  linea(panel(root, "Dinero en cuentas a fin de cada mes"), { puntos: [{ x: "Hoy", y: F.inicio }, ...F.filas.map((f) => ({ x: mesDT(f.key).setLocale("es").toFormat("LLL yy").replace(".", ""), y: f.saldo }))] });

  plegable(root, "Entradas y salidas", (c) => {
    columnas(c, {
      etiquetas: F.filas.map((f) => mesCorto(f.key)), titulos: F.filas.map((f) => `${mesLbl(f.key)} · neto ${eurS(f.neto, 0)}`),
      series: [{ nombre: "Entradas", color: "var(--fin-s1)", valores: F.filas.map((f) => f.ing) }, { nombre: "Salidas", color: "var(--fin-s2)", valores: F.filas.map((f) => f.salidas) }],
    });
    leyenda(c, [["Entradas", "var(--fin-s1)"], ["Salidas (gastos + aportaciones que paga el banco)", "var(--fin-s2)"]]);
    const neg = F.filas.filter((f) => f.neto < 0);
    if (neg.length) c.createDiv({ cls: "fin-note", text: `Meses con más salidas que entradas: ${neg.map((f) => mesCorto(f.key).toLowerCase()).join(", ")} (${eur(sum(neg.map((f) => f.neto)), 0)}).` });
  }, { extra: "por mes" });
  plegable(root, "Detalle mensual", (c) => {
    tabla(c, [{ t: "Mes" }, { t: "Entradas", num: true }, { t: "Fijos", num: true, opt: true }, { t: "Variable", num: true, opt: true }, { t: "Aportaciones", num: true, opt: true }, { t: "Neto", num: true }, { t: "Saldo", num: true }],
      F.filas.map((f) => [mesLbl(f.key) + (f.key === hoyKey ? " (resto)" : ""), eur(f.ing, 0), eur(f.fijos, 0), eur(f.variable, 0),
        f.apoBanco ? `${eur(f.apo, 0)} (${eur(f.apoBanco, 0)} del banco)` : eur(f.apo, 0), { text: eurS(f.neto, 0), cls: tone(f.neto) }, { text: eur(f.saldo, 0), cls: f.saldo < 0 ? "neg" : "" }]));
    c.createDiv({ cls: "fin-note", text: `Parte del dinero estimado hoy (último registro de saldos + lo ocurrido después). Las aportaciones se pagan primero con el efectivo de ${nombresBroker()}. Para cambiar la previsión, ajusta los recurrentes o el límite de gasto variable.` });
  }, { extra: "tabla" });
}

// Inversión: valor, ganancia y TIR, y la tabla por activo; las aportaciones, plegadas.
function vistaInversion() {
  const I = resumenInversion();
  cabecera("Inversión", false, cuentasTipo("broker").length ? `${nombresBroker()} · largo plazo` : "largo plazo");
  if (!I.filas.length) { vacio(root, "Aún no hay activos", "Añade tus fondos, acciones o cripto (con lo que llevas aportado y lo que valen hoy)."); enlace(root.createDiv({ cls: "fin-note" }), "Añadir un activo →", "#editar/activo/nuevo"); return; }
  const fechas = I.filas.map((f) => f.fechaValor).filter(Boolean);
  hero(root, {
    l: "Valor de la cartera", v: eur(I.total, 0),
    d: I.aportado ? { v: I.gan, txt: `${eurS(I.gan, 0)} (${pct(I.gan / I.aportado, true)}) sobre lo aportado`, bueno: 1 } : null,
    s: fechas.length ? `valores a ${DateTime.min(...fechas).toFormat("dd/MM/yyyy")}` : "",
  });
  tiles(root, [
    { l: "Aportado", v: I.aportado ? eur(I.aportado, 0) : "—" },
    { l: "Ganancia", v: I.aportado ? eurS(I.gan, 0) : "—", t: I.aportado ? tone(I.gan) : "" },
    { l: "Rentabilidad anual (TIR)", v: pct(I.tir, true), t: tone(I.tir), s: I.tirCorta ? "menos de 1 año: poco representativa" : "según cuándo aportaste cada euro" },
  ]);
  const filas = [...I.filas].sort((a, b) => b.valor - a.valor);
  const pR = panel(root, "Por activo", { text: "Actualizar valores →", ruta: "#valores" });
  stack(pR, filas.map((f) => ({ nombre: f.nombre, valor: f.valor, color: colorActivo(f.nombre) })));
  tabla(pR, [{ t: "Activo" }, { t: "Valor", num: true }, { t: "Peso", num: true, opt: true }, { t: "Aportado", num: true, opt: true }, { t: "Ganancia", num: true }, { t: "Al año", num: true, opt: true }],
    filas.map((f) => [
      { text: f.nombre, ruta: f.p.file.path, dot: colorActivo(f.nombre) },
      eur(f.valor, 0), pct(I.total ? f.valor / I.total : 0), f.conocido ? eur(f.aportado, 0) : "—",
      isFinite(f.gan) ? { text: `${eurS(f.gan, 0)} (${pct(f.gan / f.aportado, true)})`, cls: tone(f.gan) } : "—",
      isFinite(f.tir) ? { text: pct(f.tir, true), cls: tone(f.tir) } : "—",
    ]));
  const APr = aportacionesReales();
  if (APr.length) plegable(root, "Aportaciones", (c) => {
    const meses = mesesHasta(hoyKey, 12);
    columnas(c, {
      etiquetas: meses.map(mesCorto), titulos: meses.map(mesLbl),
      series: [{ nombre: "Aportado", color: (v) => (v >= 0 ? "var(--fin-s1)" : BAD), valores: meses.map((k) => sum(APr.filter((a) => keyDe(a.fecha) === k).map((a) => a.importe))) }],
    });
    tabla(c, [{ t: "Fecha" }, { t: "Activo" }, { t: "Importe", num: true }],
      [...APr].reverse().slice(0, 12).map((a) => [{ text: a.fecha.toFormat("dd/MM/yyyy"), ruta: a.p.file.path }, { text: a.activo, dot: colorActivo(a.activo) }, { text: eurS(a.importe), cls: a.importe < 0 ? "neg" : "" }]));
    enlace(c.createDiv({ cls: "fin-note" }), "Todas las aportaciones →", "#gestionar/aportacion");
  }, { extra: "últimos 12 meses" });
}

// Patrimonio: neto y cómo se reparte; objetivos a la vista; evolución, cuadre con el banco e histórico, plegados
// (el cuadre se abre solo si algo no cuadra).
function vistaPatrimonio() {
  cabecera("Patrimonio", false);
  const P = patrimonio();
  if (!P.length) { vacio(root, "Aún no hay saldos registrados", "Anota los saldos de tus cuentas en «Cerrar el mes»."); return; }
  const E = estimacion(), est = E && E.dias > 0;
  const u = P[P.length - 1];
  const actual = est ? { neto: E.neto, activos: E.activos, deudas: E.deudas, c: E.c } : u;
  heroPatrimonio(P, E);
  const g = rejilla();
  const pC = panel(g, "Dónde está");
  const partes = Object.entries(actual.c).filter(([, v]) => v >= 1).sort((x, y) => y[1] - x[1]).map(([k, v]) => ({ nombre: k, valor: v, color: COMP[k] }));
  stack(pC, partes);
  const NOMBRE = { Liquidez: "Cuentas (corriente + ahorro)", "Efectivo bróker": "Bróker sin invertir", "Inversión": "Inversión", Cripto: "Cripto", Otros: "Otros" };
  filasDato(pC, partes.map((p) => ({ l: NOMBRE[p.nombre] || p.nombre, dot: p.color, v: eur(p.valor, 0), s: pct(p.valor / actual.activos) })));
  const pO = panel(g, "Objetivos", { text: "+ Nuevo", ruta: "#editar/objetivo/nuevo" });
  bloqueObjetivos(pO);
  const FE = fondoEmergencia();
  if (FE && isFinite(FE.meses)) pO.createDiv({ cls: "fin-note", text: `El fondo de emergencia cubre ${nf(FE.meses, 1, 1)} meses de gasto (${eur(FE.media, 0)}/mes de media). Lo recomendable son 3-6 meses.` });

  const K = conciliacion();
  if (K) {
    const desc = K.filas.filter((f) => Math.abs(f.dif) > 1);
    plegable(root, "¿Cuadra con el banco?", (c) => {
      tabla(c, [{ t: "Cuenta" }, { t: "Saldo anotado", num: true }, { t: "Según los movimientos", num: true }, { t: "Diferencia", num: true }],
        K.filas.map((f) => [f.nombre, eur(f.real), eur(f.esperado),
          Math.abs(f.dif) <= 1 ? { text: "✓ cuadra", cls: "pos" } : { text: eurS(f.dif), cls: "neg" }]));
      c.createDiv({ cls: "fin-note", text: "Si una cuenta no cuadra, falta o sobra algún movimiento entre los dos registros de saldos (o un traspaso sin la otra cuenta)." });
    }, { abierto: desc.length > 0, extra: `${K.desde.toFormat("dd/MM")} → ${K.hasta.toFormat("dd/MM")} · ${desc.length ? "✕ no cuadra" : "✓ cuadra"}` });
  }
  plegable(root, "Evolución", (c) => {
    const puntos = P.map((x) => ({ x: x.fecha.setLocale("es").toFormat("d LLL yy"), y: x.neto }));
    if (est) puntos.push({ x: "Hoy (est.)", y: E.neto });
    if (puntos.length >= 2) linea(c, { puntos }); else vacio(c, "La línea aparece con el segundo registro de saldos", "Se hace uno al cerrar cada mes.");
  }, { extra: "patrimonio neto en el tiempo" });
  plegable(root, "Registros de saldos", (c) => {
    tabla(c, [{ t: "Fecha" }, { t: "Cuentas", num: true, opt: true }, { t: "Inversión", num: true, opt: true }, { t: "Otros", num: true, opt: true }, { t: "Neto", num: true }, { t: "Variación", num: true }],
      [...P].reverse().map((x, i, arr) => {
        const prev = arr[i + 1];
        return [{ text: x.fecha.toFormat("dd/MM/yyyy"), ruta: x.p.file.path }, eur(x.c.Liquidez, 0), eur(x.c["Efectivo bróker"] + x.c["Inversión"] + x.c.Cripto, 0),
          eur(x.c.Otros, 0), eur(x.neto, 0), prev ? { text: eurS(x.neto - prev.neto, 0), cls: tone(x.neto - prev.neto) } : ""];
      }));
    c.createDiv({ cls: "fin-note", text: "Pulsa una fecha para corregir ese registro." });
  }, { extra: `${P.length} registro${P.length > 1 ? "s" : ""}` });
}

function vistaObjetivos() {
  cabecera("Objetivos", false);
  const obs = objetivos();
  const act = obs.filter((o) => o.estado !== "conseguido");
  const meta = sum(act.map((o) => o.meta)), ahorrado = sum(act.map((o) => o.ahorrado));
  if (!act.length) { vacio(root, "Sin objetivos activos", "Añade uno: qué quieres conseguir, cuánto cuesta y para cuándo."); }
  else {
    const mensual = sum(act.map((o) => metaObjetivo(o).mensual || 0));
    hero(root, { l: "Progreso global", v: pct(meta ? ahorrado / meta : NaN), s: `${eur(ahorrado, 0)} de ${eur(meta, 0)}${mensual ? ` · necesitas ${eur(mensual, 0)}/mes para llegar a tiempo` : ""}` });
    const orden = { alta: 0, media: 1, baja: 2 };
    const g = rejilla();
    for (const o of act.sort((a, b) => (orden[a.prioridad] ?? 1) - (orden[b.prioridad] ?? 1))) {
      const m = metaObjetivo(o);
      const p = panel(g, "");
      const h = p.createEl("h3");
      enlace(h.createSpan(), o.nombre, o.p.file.path);
      h.createSpan({ cls: "fin-badge", text: `prioridad ${o.prioridad}` });
      meter(p, { nombre: pct(m.ratio), valor: o.ahorrado, total: o.meta, lg: true, color: m.ratio >= 1 ? GOOD : "var(--fin-s1)", fuerte: eur(o.ahorrado, 0), resto: `/ ${eur(o.meta, 0)}`, ico: m.ratio >= 1 ? "ok" : null, sub: m.ratio >= 1 ? "¡Conseguido! Márcalo como conseguido." : "" });
      kv(p, [
        { l: "Falta", v: eur(m.falta, 0) },
        { l: "Fecha límite", v: o.limite ? o.limite.setLocale("es").toFormat("d LLL yyyy") : "—" },
        { l: "Necesario", v: m.mensual != null ? `${eur(m.mensual, 0)}/mes` : "—" },
      ]);
    }
  }
  const hechos = obs.filter((o) => o.estado === "conseguido");
  if (hechos.length) {
    const p = panel(root, `Conseguidos · ${hechos.length}`);
    tabla(p, [{ t: "Objetivo" }, { t: "Importe", num: true }], hechos.map((o) => [{ text: o.nombre, ruta: o.p.file.path, dot: GOOD }, eur(o.meta, 0)]));
  }
}

// ───────────── render ─────────────
// render() y la tabla completa de pantallas están al final de pantallas.js (el último módulo).
const VISTAS = { resumen: vistaResumen, gastos: vistaGastos, prevision: vistaPrevision, inversion: vistaInversion, patrimonio: vistaPatrimonio, objetivos: vistaObjetivos };

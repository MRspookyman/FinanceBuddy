// ═════════════ pantallas principales: Inicio y Movimientos ═════════════
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const ICONO_CUENTA = { corriente: "💳", ahorro: "🐷", broker: "📈", otro: "🗝️" };
const DIAS = ["L", "M", "X", "J", "V", "S", "D"];

function saludo() {
  const h = DateTime.now().hour;
  return h < 6 ? "Buenas noches" : h < 14 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
}

// ───────────── inicio ─────────────
function vistaInicio() {
  const S = presupuestoSemana(), M = finMes(hoyKey);
  const cab = root.createDiv({ cls: "fb-saludo" });
  const iz = cab.createDiv();
  iz.createEl("h2", { text: saludo() });
  const sub = iz.createDiv({ cls: "sub" });
  const fd = S.fechaDatos;
  sub.appendText(fd ? `Así va ${mesLbl(hoyKey).toLowerCase()} · movimientos hasta el ${fd.setLocale("es").toFormat("d 'de' LLLL")}` : "Aún no hay movimientos");
  if (!fd || S.diasSinDatos > 6) enlace(sub, "⬆ Importar el extracto", "#importar").className += " fb-chip aviso";
  const nPend = (DB.pendientes || []).length;
  if (nPend) enlace(sub, `${nPend} por revisar`, "#revisar").className += " fb-chip brand";

  alertas(root);
  heroGasto(root, S);
  statsMes(root, M);

  const g1 = root.createDiv({ cls: "fin-grid dos" });
  tarjetaSemana(panel(g1, "Esta semana", { text: `${S.lunes.toFormat("d/M")} – ${S.domingo.toFormat("d/M")}` }), S);
  tarjetaCategorias(panel(g1, "A dónde va tu dinero", { text: mesLbl(hoyKey), ruta: "#movimientos" }), M);

  const g2 = root.createDiv({ cls: "fin-grid dos" });
  tarjetaPlan(panel(g2, "Qué hacer con tu dinero", null, "Cuánto conviene dejar en la cuenta del día a día (un mes de gasto) y a dónde mover lo que sobra."));
  tarjetaDinero(panel(g2, "Tu dinero", { text: "Actualizar saldos", ruta: "#cerrar" }));

  const g3 = root.createDiv({ cls: "fin-grid dos" });
  tarjetaProximos(panel(g3, "Próximos fijos", { text: "Gestionar", ruta: "#gestionar/recurrente" }));
  tarjetaMeses(panel(g3, "Tus últimos meses"));
}

// Solo lo que pide actuar (los avisos de nivel «warn»), como máximo 3.
function alertas(padre) {
  const A = avisos().filter((a) => a.nivel === "warn" && a.ruta !== "#revisar").slice(0, 3);
  if (!A.length) return;
  const box = padre.createDiv({ cls: "fb-alertas" });
  for (const a of A) {
    const el = box.createEl("a", { cls: "fb-alerta internal-link", href: a.ruta && a.ruta.startsWith("#") ? a.ruta : "#inicio" });
    el.createSpan({ cls: "i", text: "!" });
    el.createSpan({ text: a.texto });
    el.createSpan({ cls: "fl", text: "›" });
  }
}

function heroGasto(padre, S) {
  const h = padre.createDiv({ cls: "fb-hero" });
  const iz = h.createDiv();
  const dm = S.dm, dia = S.fechaDatos && keyDe(S.fechaDatos) === hoyKey ? S.fechaDatos.day : hoy.day;
  if (!(limiteVar > 0)) {
    iz.createDiv({ cls: "l", text: "Llevas gastado este mes" });
    iz.createDiv({ cls: "v", text: eur(S.vari, 0) });
    iz.createDiv({ cls: "s", text: "en gasto variable (comer fuera, compras, ocio…)" });
    const p = iz.createDiv({ cls: "pills" });
    enlace(p, "Ponte un límite al mes para saber cuánto te queda →", "#ajustes").className += " pill";
    anillo(h, { frac: dia / dm, c1: `${dia}/${dm}`, c2: "días del mes" });
    return;
  }
  const pasado = S.disponible < 0;
  iz.createDiv({ cls: "l", text: pasado ? "Te has pasado este mes" : "Puedes gastar este mes" });
  iz.createDiv({ cls: "v", text: eur(Math.abs(S.disponible), 0) });
  iz.createDiv({ cls: "s", text: pasado ? `por encima de tu límite de ${eur(limiteVar, 0)} · frena el gasto variable hasta fin de mes` : `de tu límite de ${eur(limiteVar, 0)} en gasto variable` });
  const p = iz.createDiv({ cls: "pills" });
  if (!pasado && S.restantes > 0) {
    p.createSpan({ cls: "pill", text: `≈ ${eur(S.porSemana, 0)} por semana` });
    p.createSpan({ cls: "pill", text: `${eur(S.porDia, 0)} al día` });
  }
  p.createSpan({ cls: "pill", text: `${S.restantes} día${S.restantes === 1 ? "" : "s"} por delante` });
  const usado = S.vari / limiteVar;
  anillo(h, { frac: usado, marca: dia / dm, c1: `${Math.round(usado * 100)} %`, c2: "del límite usado" });
}

function statsMes(padre, M) {
  const g = padre.createDiv({ cls: "fb-stats" });
  const st = (cls, ic, l, v, t) => { const c = g.createDiv({ cls: "fb-stat " + cls }); c.createDiv({ cls: "ic", text: ic }); const d = c.createDiv(); d.createDiv({ cls: "l", text: l }); d.createDiv({ cls: "v " + (t || ""), text: v }); };
  st("entra", "↘", "Ha entrado", eur(M.ingresos, 0));
  st("sale", "↗", "Ha salido", eur(M.gastos, 0));
  st("ahorro", "🐷", "Te queda del mes", eurS(M.ahorro, 0), tone(M.ahorro));
}

function tarjetaSemana(p, S) {
  if (!S.fechaDatos) { vacio(p, "Sin movimientos todavía", " Importa el extracto de tu banco."); return; }
  const variable = movimientos().filter((m) => !m.previsto && m.gasto && grupoDe(m.categoria) !== "fijo");
  const dias = DIAS.map((l, i) => {
    const d = S.lunes.plus({ days: i });
    const valor = sum(variable.filter((m) => m.fecha.hasSame(d, "day")).map((m) => m.gasto));
    return { etiqueta: l, titulo: d.setLocale("es").toFormat("cccc d"), valor: Math.max(0, valor), futuro: d > S.fechaDatos.endOf("day"), hoy: d.hasSame(S.fechaDatos, "day") };
  });
  const meta = limiteVar > 0 ? limiteVar / S.dm : 0;
  const t = p.createDiv({ cls: "fb-total" });
  t.createDiv({ cls: "v", text: eur(S.semana, 0) });
  t.createDiv({ cls: "s", text: meta ? `de ${eur(S.metaSemana, 0)} a la semana` : "en gasto variable" });
  barrasSemana(p, dias, meta);
}

function tarjetaCategorias(p, M) {
  const porCat = new Map();
  for (const m of M.real.filter((m) => m.gasto)) porCat.set(m.categoria || "Otros", (porCat.get(m.categoria || "Otros") || 0) + m.gasto);
  const filas = [...porCat].filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]);
  if (!filas.length) { vacio(p, "Sin gastos este mes", ""); return; }
  const top = filas.slice(0, 5), resto = sum(filas.slice(5).map(([, v]) => v));
  const partes = top.map(([n, v]) => ({ nombre: n, valor: v, color: catColor(n) }));
  if (resto > 0) partes.push({ nombre: "Resto", valor: resto, color: "var(--ink-3)" });
  const w = p.createDiv({ cls: "fb-dona" });
  dona(w, partes, { c1: eur(M.gastos, 0), c2: "gastado" });
  const l = w.createDiv({ cls: "fb-lista" });
  for (const [n, v] of top) {
    const fijo = grupoDe(n) === "fijo";
    item(l, { av: { cat: n, sm: true }, t: n, s: fijo ? "gasto fijo" : `${pct(v / M.gastos)} del gasto`, v: eur(v, 0),
      onclick: () => { guardarEstado({ filtroCat: n }); FB.ir("#movimientos"); } });
  }
  if (resto > 0) item(l, { av: { icono: "⋯", sm: true }, t: `${filas.length - 5} categorías más`, v: eur(resto, 0), ruta: "#movimientos" });
}

function tarjetaPlan(p) {
  const R = planReparto();
  if (!R) { vacio(p, "Faltan los saldos de tus cuentas", " Anótalos en «Actualizar saldos» y aquí verás qué hacer con lo que sobra."); return; }
  const box = p.createDiv({ cls: "fb-plan" });
  const accion = (ic, t, s, destacada) => { const a = box.createDiv({ cls: "fb-accion" + (destacada ? " destacada" : "") }); a.createDiv({ cls: "ic", text: ic }); const d = a.createDiv(); d.createDiv({ cls: "t", text: t }); if (s) d.createDiv({ cls: "s", text: s }); };
  if (!R.acciones.length) accion("✋", "Este mes, no muevas nada", `Tienes ${eur(R.corriente, 0)} en la corriente y tu colchón es de ${eur(R.colchon, 0)} (un mes de gasto).`, true);
  else for (const a of R.acciones) accion({ fondo: "🛟", broker: "📈", libre: "✨" }[a.tipo] || "➡️", a.texto, a.sub, a.tipo !== "libre");
  if (R.futuro) accion("🗓️", `En ${mesLbl(R.futuro.mes).toLowerCase()}, pasa unos ${eur(R.futuro.importe, 0)} a ${nombresBroker()}`, "para entonces se habrá acabado su dinero sin invertir");
}

function tarjetaDinero(p) {
  const E = estimacion();
  if (!E) { vacio(p, "Aún no hay saldos", " Anota cuánto tienes en cada cuenta."); enlace(p.createDiv({ cls: "fin-note" }), "Anotar saldos →", "#cerrar"); return; }
  const I = resumenInversion();
  const t = p.createDiv({ cls: "fb-total" });
  t.createDiv({ cls: "v", text: eur(E.neto, 0) });
  t.createDiv({ cls: "s", text: E.dias > 0 ? "en total · estimado hoy" : "en total" });
  const l = p.createDiv({ cls: "fb-lista" });
  for (const c of cuentas()) {
    const v = c.tipo === "broker" ? E.c["Efectivo bróker"] : E.cuentas.saldos[c.nombre] || 0;
    if (c.tipo === "broker" && Math.abs(v) < 1 && I.filas.length) continue;
    item(l, { av: { icono: ICONO_CUENTA[c.tipo] || "🏦" }, t: c.nombre, s: { corriente: "día a día", ahorro: "ahorro", broker: "sin invertir", otro: "" }[c.tipo] || "", v: eur(v, 0), ruta: `#editar/cuenta/${c.p.id}` });
  }
  if (I.filas.length) item(l, { av: { icono: "🌱" }, t: "Inversión", s: I.aportado ? `${eurS(I.gan, 0)} (${pct(I.gan / I.aportado, true)}) sobre lo que has metido` : "valor de tus activos",
    v: eur(I.total, 0), pos: I.gan > 0, ruta: "#valores" });
  if (E.deudas) item(l, { av: { icono: "📉" }, t: "Deudas", v: eur(-E.deudas, 0) });
  const o = objetivos().find((x) => x.vinculado && x.estado !== "conseguido");
  if (o && o.meta > 0) {
    const f = Math.min(1, o.ahorrado / o.meta);
    const m = p.createDiv({ cls: "fin-note" });
    m.setText(`${o.nombre}: ${eur(o.ahorrado, 0)} de ${eur(o.meta, 0)}${o.ahorrado >= o.meta ? " ✓" : ""}`);
    const b = p.createDiv({ cls: "fb-barra" }); b.createDiv().style.width = `${(f * 100).toFixed(1)}%`;
  }
}

function tarjetaProximos(p) {
  const hasta = hoy.plus({ days: 35 }).endOf("day");
  const P = movimientos().filter((m) => m.previsto && m.recurrente && m.fecha <= hasta && (m.clase === "gasto" || m.clase === "ingreso"))
    .sort((a, b) => a.fecha - b.fecha).slice(0, 6);
  if (!P.length) {
    vacio(p, "Sin fijos por llegar", " Nómina, alquiler, recibos… la app puede detectarlos en tus movimientos.");
    enlace(p.createDiv({ cls: "fin-note" }), "Detectar mis fijos →", "#fijos");
    return;
  }
  const l = p.createDiv({ cls: "fb-lista" });
  for (const m of P) item(l, { fecha: m.fecha, t: m.concepto, s: m.categoria, v: (m.clase === "ingreso" ? "+" : "−") + eur(m.importe, 0), pos: m.clase === "ingreso", ruta: m.p && m.p.id ? `#editar/recurrente/${m.p.id}` : null });
}

function tarjetaMeses(p) {
  const K = mesesHasta(hoyKey, 6).filter((k) => finMes(k).real.some((m) => !m.auto));
  if (K.length < 2) { vacio(p, "Aún hay pocos meses", " Con dos o más meses importados verás aquí cómo evolucionas."); return; }
  columnas(p, {
    alto: 190, etiquetas: K.map(mesCorto), titulos: K.map(mesLbl),
    series: [{ nombre: "Entró", color: "var(--mint)", valores: K.map((k) => finMes(k).ingresos) }, { nombre: "Salió", color: "var(--coral)", valores: K.map((k) => finMes(k).gastos) }],
  });
  leyenda(p, [["Entró", "var(--mint)"], ["Salió", "var(--coral)"]]);
}

// ───────────── movimientos ─────────────
function vistaMovimientos() {
  cabecera("Movimientos", true, "Todo lo que ha entrado y salido. Pulsa uno para cambiarlo.");
  const M = finMes(mes);
  const g = root.createDiv({ cls: "fb-stats" });
  const st = (cls, ic, l, v, t) => { const c = g.createDiv({ cls: "fb-stat " + cls }); c.createDiv({ cls: "ic", text: ic }); const d = c.createDiv(); d.createDiv({ cls: "l", text: l }); d.createDiv({ cls: "v " + (t || ""), text: v }); };
  st("entra", "↘", "Entró", eur(M.ingresos, 0));
  st("sale", "↗", "Salió", eur(M.gastos, 0));
  st("ahorro", "🐷", "Diferencia", eurS(M.ahorro, 0), tone(M.ahorro));

  const todos = [...M.ms].sort((a, b) => b.fecha - a.fecha || (b.p.id || 0) - (a.p.id || 0));
  const cats = [...new Set(todos.map((m) => (m.clase === "transferencia" ? "Entre tus cuentas" : m.categoria)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const filtros = root.createDiv({ cls: "fb-filtros" });
  const inp = filtros.createEl("input", { cls: "fin-search", attr: { type: "search", placeholder: "Buscar un concepto, comercio o importe…" } });
  inp.value = busqueda;
  const chips = root.createDiv({ cls: "fb-chips" });
  const lista = root.createDiv({ cls: "fin-panel" });
  const pintarChips = () => {
    chips.innerHTML = "";
    for (const c of [null, ...cats]) {
      const b = chips.createEl("button", { text: c ? `${c === "Entre tus cuentas" ? "🔁" : catIcono(c)} ${c}` : "Todo" });
      if ((filtroCat || null) === c) b.className = "act";
      b.onclick = () => { filtroCat = c; pintarChips(); pintar(); };
    }
  };
  const pintar = () => {
    lista.innerHTML = "";
    const q = norm(inp.value.trim());
    const f = todos.filter((m) => (!filtroCat || (m.clase === "transferencia" ? "Entre tus cuentas" : m.categoria) === filtroCat)
      && (!q || norm(`${m.concepto} ${m.categoria} ${m.cuenta} ${m.p.ext_texto || ""} ${nf(m.importe, 2, 2)}`).includes(q)));
    if (!f.length) { vacio(lista, todos.length ? "Nada coincide" : "Sin movimientos este mes", todos.length ? "" : " Importa el extracto de tu banco o apunta uno a mano."); return; }
    let dia = null, cont = null;
    for (const m of f) {
      const k = m.fecha.toISODate();
      if (k !== dia) {
        dia = k;
        const d = lista.createDiv({ cls: "fb-dia" });
        const cab = d.createDiv({ cls: "cab" });
        cab.createSpan({ text: m.fecha.setLocale("es").toFormat("cccc d 'de' LLLL") });
        const neto = sum(f.filter((x) => x.fecha.toISODate() === k).map((x) => (x.clase === "ingreso" || x.clase === "reembolso" ? x.importe : x.clase === "gasto" ? -x.importe : 0)));
        cab.createSpan({ text: eurS(neto, 0) });
        cont = d.createDiv({ cls: "fb-lista" });
      }
      const entra = m.clase === "ingreso" || m.clase === "reembolso";
      const signo = m.clase === "transferencia" ? (m.origen ? "+" : "−") : entra ? "+" : "−";
      const sub = m.clase === "transferencia" ? `Entre tus cuentas ${m.destino ? "→ " + m.destino : m.origen ? "← " + m.origen : ""}` : `${m.categoria}${m.clase === "reembolso" ? " · te lo devolvieron" : ""}`;
      item(cont, {
        av: { cat: m.clase === "transferencia" ? null : m.categoria, clase: m.clase }, t: m.concepto,
        s: `${sub}${cuentas().length > 1 ? " · " + m.cuenta : ""}${m.auto ? " · previsto" : ""}`,
        v: signo + eur(m.importe), pos: entra, prev: m.auto || m.previsto,
        ruta: m.auto ? (m.p.id ? `#editar/recurrente/${m.p.id}` : null) : `#editar/movimiento/${m.p.id}`,
      });
    }
  };
  inp.oninput = () => { busqueda = inp.value; pintar(); };
  pintarChips(); pintar();
}

// Pantallas antiguas → las nuevas (enlaces guardados y avisos).
const VISTAS = { inicio: vistaInicio, resumen: vistaInicio, movimientos: vistaMovimientos, gastos: vistaMovimientos,
  prevision: vistaInicio, patrimonio: vistaInicio, inversion: vistaInicio };

// ═════════════ pantallas principales: Inicio y Movimientos ═════════════
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const ICONO_CUENTA = { corriente: "💳", ahorro: "🐷", broker: "📈", otro: "🗝️" };
const DIAS = ["L", "M", "X", "J", "V", "S", "D"];

function saludo() {
  const h = DateTime.now().hour;
  return h < 6 ? "Buenas noches" : h < 14 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
}

// ───────────── inicio ─────────────
// Minimalista: arriba lo que se decide (cuánto puedes gastar), luego el ritmo, a dónde va el dinero, tu patrimonio y
// los próximos cargos. Se puede ver cualquier mes pasado (selector de mes, compartido con Movimientos).
// Paneles: el usuario elige cuáles ve y en qué orden (Ajustes → Tu inicio; config.inicio / config.inicio_ocultos).
// ancho: ocupa toda la fila · defecto:false → oculto salvo que el usuario lo active.
const PANELES_INICIO = [
  { id: "gasto", t: "Cuánto puedes gastar (y lo que entró y salió)", ancho: true },
  { id: "ritmo", t: "Ritmo de gasto del mes" },
  { id: "categorias", t: "A dónde va tu dinero" },
  { id: "patrimonio", t: "Tu patrimonio (cuentas e inversión)" },
  { id: "proximos", t: "Próximos cargos (mes en curso)" },
  { id: "semana", t: "Esta semana", defecto: false },
  { id: "meses", t: "Tus últimos meses", defecto: false },
];
// config.inicio: los visibles, en orden · config.inicio_ocultos: los ocultos. Uno que no está en ninguna: según `defecto`.
function panelesInicio() {
  const existe = (id) => PANELES_INICIO.find((p) => p.id === id);
  const porDefecto = (p) => p.defecto !== false;
  if (!Array.isArray(cfg.inicio)) return [...PANELES_INICIO.filter(porDefecto), ...PANELES_INICIO.filter((p) => !porDefecto(p))].map((p) => ({ ...p, visible: porDefecto(p) }));
  const ocultos = new Set(cfg.inicio_ocultos || []);
  const visibles = cfg.inicio.map(existe).filter(Boolean);
  const nuevos = PANELES_INICIO.filter((p) => !cfg.inicio.includes(p.id) && !ocultos.has(p.id) && porDefecto(p));
  const resto = PANELES_INICIO.filter((p) => !visibles.includes(p) && !nuevos.includes(p));
  return [...[...visibles, ...nuevos].map((p) => ({ ...p, visible: true })), ...resto.map((p) => ({ ...p, visible: false }))];
}
function vistaInicio() {
  if (mes > hoyKey) mes = hoyKey;  // el Inicio no mira al futuro
  const actual = mes === hoyKey;
  const S = presupuestoSemana(), M = finMes(mes);
  const cab = root.createDiv({ cls: "fb-saludo" });
  const iz = cab.createDiv();
  iz.createEl("h2", { text: actual ? saludo() : mesLbl(mes) });
  const sub = iz.createDiv({ cls: "sub" });
  const fd = S.fechaDatos;
  if (actual) sub.appendText(fd ? `Así va ${mesLbl(hoyKey).toLowerCase().split(" ")[0]} · movimientos hasta el ${fd.setLocale("es").toFormat("d 'de' LLLL")}` : "Aún no hay movimientos");
  else sub.appendText(M.real.some((m) => !m.auto) ? "Cómo fue el mes" : "Sin movimientos importados de este mes");
  if (actual && (!fd || S.diasSinDatos > 6)) enlace(sub, "Importar el extracto", "#importar").className += " fb-chip aviso";
  const nPend = (DB.pendientes || []).length;
  if (nPend) enlace(sub, `${nPend} por revisar`, "#revisar").className += " fb-chip brand";
  const der = cab.createDiv({ cls: "fb-cab-der" });
  const box = der.createDiv({ cls: "fin-mes" });
  const btn = (t, key, title, off) => { const b = box.createEl("button", { text: t }); b.title = title; if (off) b.disabled = true; else b.onclick = () => cambiarMes(key); };
  btn("‹", mesAnterior(mes), "Mes anterior");
  box.createSpan({ cls: "lbl", text: mesLbl(mes) });
  btn("›", mesDT(mes).plus({ months: 1 }).toFormat("yyyy-MM"), "Mes siguiente", actual);
  if (!actual) btn("Hoy", hoyKey, "Volver al mes actual");
  const per = enlace(der, "Personalizar", "#ajustes/inicio");
  per.className += " fb-personalizar";
  per.title = "Elige qué ves en el inicio y en qué orden";

  if (actual) { accionesRapidas(root); alertas(root); }
  const DIBUJAR = {
    gasto: (padre) => heroGasto(padre, S, M),
    ritmo: (padre) => tarjetaRitmo(panel(padre, "Ritmo del mes", null, "Tu gasto variable acumulado día a día, comparado con lo que sueles llevar a estas alturas del mes."), mes),
    categorias: (padre) => tarjetaCategorias(panel(padre, "A dónde va tu dinero", { text: "Ver todo", ruta: "#movimientos/categorias" }), mes),
    patrimonio: (padre) => tarjetaPatrimonio(panel(padre, "Tu patrimonio", { text: "Actualizar saldos", ruta: "#cerrar" })),
    proximos: (padre) => { if (actual) tarjetaProximos(panel(padre, "Próximos cargos", { text: "Fijos", ruta: "#gestionar/recurrente" })); },
    semana: (padre) => { if (actual) tarjetaSemana(panel(padre, "Esta semana", { text: `${S.lunes.toFormat("d/M")} – ${S.domingo.toFormat("d/M")}` }), S); },
    meses: (padre) => tarjetaMeses(panel(padre, "Tus últimos meses")),
  };
  let fila = null;
  for (const p of panelesInicio().filter((p) => p.visible)) {
    if (p.ancho) { fila = null; DIBUJAR[p.id](root); continue; }
    if (!fila || fila.children.length >= 2) fila = root.createDiv({ cls: "fin-grid dos" });
    DIBUJAR[p.id](fila);
    if (!fila.children.length) fila.remove(), (fila = null);
  }
}

// Solo lo que pide actuar (los avisos de nivel «warn»), como máximo 2.
function alertas(padre) {
  const A = avisos().filter((a) => a.nivel === "warn" && a.ruta !== "#revisar").slice(0, 2);
  if (!A.length) return;
  const box = padre.createDiv({ cls: "fb-alertas" });
  for (const a of A) {
    const el = box.createEl("a", { cls: "fb-alerta internal-link", href: a.ruta && a.ruta.startsWith("#") ? a.ruta : "#inicio" });
    el.createSpan({ cls: "i", text: "!" });
    el.createSpan({ text: a.texto });
    el.createSpan({ cls: "fl", text: "›" });
  }
}

// La portada: una cifra grande que ayuda a decidir, una barra, una frase de estado y, en pequeño, entró · salió · te queda.
// Mes en curso: «Puedes gastar». Mes pasado: cuánto gastaste frente a tu límite.
function heroGasto(padre, S, M) {
  const actual = M.key === hoyKey;
  const h = padre.createDiv({ cls: "fb-hero" });
  const dm = mesDT(M.key).daysInMonth;
  const dia = actual ? (S.fechaDatos && keyDe(S.fechaDatos) === hoyKey ? S.fechaDatos.day : hoy.day) : dm;
  const barra = (frac, etiqueta) => {
    const b = h.createDiv({ cls: "fb-progreso" });
    b.createDiv({ cls: "rel" }).style.width = `${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)}%`;
    if (actual) { const m = b.createDiv({ cls: "dia" }); m.style.left = `${((100 * dia) / dm).toFixed(1)}%`; m.title = `Hoy: día ${dia} de ${dm}`; }
    h.createDiv({ cls: "pie", text: etiqueta });
  };
  const vari = gastoVariable(M);
  const R = ritmoMes(M.key);
  const estado = () => {
    if (!isFinite(R.mediaHoy) || !R.hoyV) return "";
    const dif = R.hoyV - R.mediaHoy;
    if (Math.abs(dif) < 15) return actual ? "Vas como sueles ir" : "Como sueles gastar";
    return `${actual ? "Vas" : "Gastaste"} ${eur(Math.abs(dif), 0)} ${dif < 0 ? "por debajo" : "por encima"} de lo normal${actual ? " a estas alturas" : ""}`;
  };
  if (!(limiteVar > 0)) {
    h.classList.add("neutro"); // sin límite, la cifra es lo gastado: no va en verde
    h.createDiv({ cls: "l", text: actual ? "Llevas gastado este mes" : "Gastaste" });
    h.createDiv({ cls: "v", text: eur(vari, 0) });
    if (actual) barra(dia / dm, `día ${dia} de ${dm}`);
    h.createDiv({ cls: "s", text: estado() || "en gasto variable: comer fuera, compras, ocio…" });
    if (actual) enlace(h.createDiv({ cls: "pills" }), "Ponte un límite al mes para saber cuánto te queda →", "#ajustes").className += " pill fb-hero-link";
  } else if (actual) {
    const pasado = S.disponible < 0, usado = S.vari / limiteVar;
    if (pasado) h.classList.add("pasado");
    else if (usado >= 0.85) h.classList.add("alto"); // queda poco: ámbar, antes de pasarse
    h.createDiv({ cls: "l", text: pasado ? "Te has pasado este mes" : "Puedes gastar este mes" });
    h.createDiv({ cls: "v", text: eur(Math.abs(S.disponible), 0) });
    barra(usado, `${Math.round(usado * 100)} % de tu límite de ${eur(limiteVar, 0)}`);
    const frase = pasado ? "Frena el gasto variable hasta fin de mes"
      : S.disponible < 5 ? "Has llegado a tu límite"
      : S.restantes > 1 ? `≈ ${eur(S.porDia, 0)} al día durante ${S.restantes} días` : "Último día del mes";
    h.createDiv({ cls: "s", text: [frase, estado()].filter(Boolean).join(" · ") });
  } else {
    const pasado = vari > limiteVar;
    if (pasado) h.classList.add("pasado");
    h.createDiv({ cls: "l", text: pasado ? "Te pasaste del límite" : "Te sobró de tu límite" });
    h.createDiv({ cls: "v", text: eur(Math.abs(limiteVar - vari), 0) });
    barra(vari / limiteVar, `gastaste ${eur(vari, 0)} de ${eur(limiteVar, 0)}`);
    const e = estado(); if (e) h.createDiv({ cls: "s", text: e });
  }
  const r = h.createDiv({ cls: "fb-resumen" });
  const dato = (l, v, cls) => { const d = r.createDiv({ cls: "d " + (cls || "") }); d.createDiv({ cls: "k", text: l }); d.createDiv({ cls: "n", text: v }); };
  dato(actual ? "Ha entrado" : "Entró", eur(M.ingresos, 0), "entra");
  dato(actual ? "Ha salido" : "Salió", eur(M.gastos, 0), "sale");
  dato(actual ? "Te queda" : "Ahorraste", eurS(M.ahorro, 0), M.ahorro < 0 ? "neg" : "");
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

// Diferencia con tu media, en euros y solo si es notable (≥ 20 € y ≥ 15 %): un % sobre una media pequeña engaña.
function difMedia(c) {
  if (!isFinite(c.media) || c.media < 1) return null;
  const dif = c.valor - c.media;
  return Math.abs(dif) >= 20 && Math.abs(dif) / c.media >= 0.15 ? dif : null;
}
const textoDif = (dif) => `${dif > 0 ? "+" : "−"}${eur(Math.abs(dif), 0)} vs tu media`;

// Gasto del mes por categoría: las 5 mayores en barras en píldora de su color (el contorno discontinuo es su presupuesto).
function tarjetaCategorias(p, key) {
  const C = resumenCategorias(key).filter((c) => c.valor > 0.5);
  const total = sum(C.map((c) => c.valor));
  if (!C.length) { vacio(p, "Sin gastos este mes", ""); return; }
  const t = p.createDiv({ cls: "fb-total" });
  t.createDiv({ cls: "v", text: eur(total, 0) });
  t.createDiv({ cls: "s", text: `gastado en ${mesLbl(key).toLowerCase()}` });
  const VISIBLES = 5, top = C.slice(0, VISIBLES), resto = C.slice(VISIBLES);
  const max = Math.max(...top.map((c) => Math.max(c.valor, c.presupuesto || 0)));
  const box = p.createDiv({ cls: "fb-pildoras" });
  for (const c of top) {
    const r = box.createEl("a", { cls: "fb-pildora", href: "#movimientos" });
    r.onclick = (e) => { e.preventDefault(); guardarEstado({ filtroCat: c.nombre }); FB.ir("#movimientos/lista"); };
    const n = r.createDiv({ cls: "n" });
    n.createSpan({ cls: "ic", text: catIcono(c.nombre) });
    n.createSpan({ text: c.nombre });
    const pista = r.createDiv({ cls: "pista" });
    if (c.presupuesto > 0) { const pr = pista.createDiv({ cls: "tope" }); pr.style.width = `${((100 * c.presupuesto) / max).toFixed(1)}%`; pr.title = `Presupuesto: ${eur(c.presupuesto, 0)}`; }
    const b = pista.createDiv({ cls: "barra" + (c.presupuesto > 0 && c.valor > c.presupuesto ? " pasado" : "") });
    b.style.width = `${Math.max((100 * c.valor) / max, 3).toFixed(1)}%`;
    setVar(b, "--cc", catColor(c.nombre));
    const v = r.createDiv({ cls: "val" });
    v.createDiv({ text: eur(c.valor, 0) });
    const dif = difMedia(c);
    if (dif != null) v.createDiv({ cls: "dif " + (dif > 0 ? "sube" : "baja"), text: textoDif(dif) });
    r.title = `${c.nombre}: ${eur(c.valor, 0)} · ${pct(c.valor / total)} del gasto${isFinite(c.media) ? ` · tu media ${eur(c.media, 0)}` : ""}${c.presupuesto > 0 ? ` · presupuesto ${eur(c.presupuesto, 0)}` : ""}`;
  }
  if (resto.length) enlace(p.createDiv({ cls: "fin-note" }), `y ${resto.length} categoría${resto.length > 1 ? "s" : ""} más (${eur(sum(resto.map((c) => c.valor)), 0)}) →`, "#movimientos/categorias");
}
// Una categoría (vista «Por categoría»): nombre, % del total y diferencia con la media; barra si tiene presupuesto.
function filaCategoria(padre, c, total, onclick) {
  const el = item(padre, { av: { cat: c.nombre, sm: true }, t: c.nombre, v: eur(c.valor, 0), onclick });
  const s = el.querySelector(".n").createDiv({ cls: "s" });
  const dif = difMedia(c);
  if (dif != null) s.createSpan({ cls: "fb-var " + (dif > 0 ? "sube" : "baja"), text: textoDif(dif) });
  s.appendText([c.grupo === "fijo" ? "fijo" : total > 0 ? pct(c.valor / total) : "", isFinite(c.media) && c.media >= 1 ? `media ${eur(c.media, 0)}` : ""].filter(Boolean).join(" · "));
  if (c.presupuesto > 0) {
    const f = c.valor / c.presupuesto;
    const b = el.querySelector(".n").createDiv({ cls: "fb-barra fina " + (f > 1 ? "pasado" : f >= 0.9 ? "alto" : "") });
    b.createDiv().style.width = `${Math.min(100, f * 100).toFixed(1)}%`;
    b.title = `${eur(c.valor, 0)} de ${eur(c.presupuesto, 0)} de presupuesto`;
  }
  return el;
}
// Curva de gasto acumulado del mes frente a tu media y tu límite: ¿voy mejor o peor que otros meses?
function tarjetaRitmo(p, key = hoyKey) {
  const R = ritmoMes(key);
  if (!fechaDatos()) { vacio(p, "Sin movimientos todavía", " Importa el extracto de tu banco."); return; }
  const actual = key === hoyKey;
  const t = p.createDiv({ cls: "fb-total" });
  t.createDiv({ cls: "v", text: eur(R.hoyV, 0) });
  const cuando = actual ? `a día ${R.dia}` : "en todo el mes";
  if (isFinite(R.mediaHoy)) {
    const dif = R.hoyV - R.mediaHoy;
    t.createDiv({ cls: "s", text: Math.abs(dif) < 15 ? `${cuando}, como sueles` : `${cuando} · ${eur(Math.abs(dif), 0)} ${dif < 0 ? "menos" : "más"} que tu media` });
  } else t.createDiv({ cls: "s", text: `${cuando} · con más meses importados verás tu media` });
  const series = [];
  // El gasto, en coral (como «Salió» en toda la app); las dos referencias, en tinta neutra y con trazos distintos.
  if (R.media) series.push({ nombre: "Tu media", color: "var(--ink-3)", valores: R.media, discontinua: true });
  if (limiteVar > 0) series.push({ nombre: "Límite", color: "var(--ink)", valores: Array.from({ length: R.dm }, (_, i) => (limiteVar * (i + 1)) / R.dm), discontinua: "1.5 4" });
  series.push({ nombre: actual ? "Este mes" : mesLbl(key), color: "var(--coral)", valores: R.actual, area: true });
  const marcas = [0, 6, 13, 20, 27].filter((i) => i < R.dm);
  lineas(p, { etiquetas: Array.from({ length: R.dm }, (_, i) => mesDT(key).set({ day: i + 1 }).setLocale("es").toFormat("cccc d")), series, marcas, alto: 170 });
  leyenda(p, series.map((s) => [s.nombre, s.color, s.discontinua ? "rayas" : "continua"]).reverse());
}

// Las cuatro cosas que se hacen cada semana o cada mes, a un clic y a la vista (lo que toca ahora, resaltado).
function accionesRapidas(padre) {
  const P = patrimonio(), u = P[P.length - 1], fd = fechaDatos();
  const diasSaldos = u ? diasDesde(u.fecha) : null, diasMov = fd ? diasDesde(fd) : null;
  const A = [
    { ic: "📥", t: "Importar movimientos", s: fd ? `último movimiento: ${fd.toFormat("dd/MM")}` : "sube el extracto de tu banco", ruta: "#importar", toca: !fd || diasMov > 6 },
    { ic: "🧾", t: "Actualizar saldos", s: u ? `anotados el ${u.fecha.toFormat("dd/MM")}` : "lo que tienes en cada cuenta", ruta: "#cerrar", toca: !u || diasSaldos > 35 || (keyDe(u.fecha) < hoyKey && (hoy.day <= 5 || hoy.day >= 25)) },
    { ic: "📈", t: "Actualizar inversión", s: preciosActivos() ? `precios de ${(cfg.precios.ultima || "nunca").slice(0, 10).split("-").reverse().join("/")}` : "lo que vale cada activo", ruta: preciosActivos() ? "#inversion/actualizar" : "#valores" },
    { ic: "✏️", t: "Apuntar un gasto", s: "uno a mano, al momento", ruta: "#apuntar" },
  ];
  const box = padre.createDiv({ cls: "fb-accesos fb-acciones" });
  for (const x of A) {
    const a = box.createEl("a", { cls: "fb-acceso internal-link" + (x.toca ? " toca" : ""), href: x.ruta });
    setVar(a.createDiv({ cls: "fb-av", text: x.ic }), "--cc", "var(--brand)");
    const d = a.createDiv(); d.createDiv({ cls: "t", text: x.t }); d.createDiv({ cls: "s", text: x.s });
    if (x.toca) a.createSpan({ cls: "fb-toca", text: "toca" });
  }
}

// Tu patrimonio: un total (cuentas + inversión − deudas), su evolución y una línea por grupo. El detalle, en su pantalla.
function tarjetaPatrimonio(p) {
  const E = estimacion();
  if (!E) { vacio(p, "Aún no hay saldos", " Anota cuánto tienes en cada cuenta."); enlace(p.createDiv({ cls: "fin-note" }), "Anotar saldos →", "#cerrar"); return; }
  const I = resumenInversion();
  const t = p.createDiv({ cls: "fb-total" });
  t.createDiv({ cls: "v", text: eur(E.neto, 0) });
  const P = patrimonio();
  const ant = [...P].reverse().find((x) => x.fecha < hoy.startOf("month").minus({ months: 2 })) || P[0];
  const dif = ant ? E.neto - ant.neto : NaN;
  t.createDiv({ cls: "s", text: isFinite(dif) && ant.fecha < hoy.startOf("month") ? `${eurS(dif, 0)} desde ${ant.fecha.setLocale("es").toFormat("LLLL")}` : "en total, estimado hoy" });
  const serie = [...P.map((x) => x.neto), E.neto];
  if (serie.length >= 3) miniArea(p.createDiv({ cls: "fb-spark" }), serie.slice(-12));
  const filas = [
    { l: "En tus cuentas", v: eur(E.c.Liquidez, 0), s: cuentasTipo("ahorro").length ? `día a día ${eur(E.cuentas.corriente, 0)} · ahorro ${eur(E.cuentas.ahorro || 0, 0)}` : "", ruta: "#gestionar/cuenta" },
    I.filas.length ? { l: "Invertido", v: eur(I.total, 0), s: isFinite(I.gan) && I.aportado > 0 ? `${eurS(I.gan, 0)} (${pct(I.gan / I.aportado, true)}) desde que empezaste` : "", ruta: "#inversion", t: I.gan > 0 ? "pos" : "" } : null,
    E.c["Efectivo bróker"] ? { l: "Sin invertir en el bróker", v: eur(E.c["Efectivo bróker"], 0) } : null,
    E.c.Otros ? { l: "Otros", v: eur(E.c.Otros, 0) } : null,
    E.deudas ? { l: "Deudas", v: eur(-E.deudas, 0) } : null,
  ];
  filasDato(p, filas);
  const ult = P[P.length - 1], dAn = E.neto - ult.neto;
  if (Math.abs(dAn) >= 1) {  // por qué no coincide con lo que anotaste
    const n = p.createDiv({ cls: "fin-note" });
    n.appendText(`Anotaste ${eur(ult.neto, 0)} el ${ult.fecha.toFormat("dd/MM")}; desde entonces ${eurS(dAn, 0)} por los movimientos y el cambio de valor de tu inversión. `);
    enlace(n, "Anotar saldos de hoy →", "#cerrar");
  }
  enlace(p.createDiv({ cls: "fin-note" }), "Hitos, proyección y mes a mes →", "#progreso");
  const o = objetivos().find((x) => x.vinculado && x.estado !== "conseguido");
  if (o && o.meta > 0) {
    const m = p.createDiv({ cls: "fin-note" });
    m.setText(`${o.nombre}: ${eur(o.ahorrado, 0)} de ${eur(o.meta, 0)}${o.ahorrado >= o.meta ? " ✓" : ""}`);
    const b = p.createDiv({ cls: "fb-barra fina" }); b.createDiv().style.width = `${(Math.min(1, o.ahorrado / o.meta) * 100).toFixed(1)}%`;
  }
}

// Evolución en pequeño: área suave a todo lo ancho (sin ejes), con el último punto marcado.
function miniArea(padre, vals) {
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1, n = vals.length - 1;
  const X = (i) => (i * 100) / n, Y = (v) => 36 - ((v - min) * 30) / span;
  const d = vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(2)},${Y(v).toFixed(2)}`).join("");
  padre.innerHTML = `<svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="${d}L100,40L0,40Z" style="fill:var(--brand);opacity:.1"/>`
    + `<path d="${d}" style="fill:none;stroke:var(--brand);stroke-width:2;vector-effect:non-scaling-stroke;stroke-linejoin:round"/></svg>`;
}

// Los cargos y cobros fijos de los próximos 14 días.
function tarjetaProximos(p) {
  const hasta = hoy.plus({ days: 14 }).endOf("day");
  const P = movimientos().filter((m) => m.previsto && m.recurrente && m.fecha <= hasta && (m.clase === "gasto" || m.clase === "ingreso"))
    .sort((a, b) => a.fecha - b.fecha).slice(0, 5);
  if (!P.length) {
    const hay = recurrentes().some((r) => r.clase !== "aportacion");
    vacio(p, hay ? "Nada en los próximos 14 días" : "Sin fijos todavía", hay ? "" : " Nómina, alquiler, recibos… la app puede detectarlos en tus movimientos.");
    if (!hay) enlace(p.createDiv({ cls: "fin-note" }), "Detectar mis fijos →", "#fijos");
    return;
  }
  const l = p.createDiv({ cls: "fb-lista" });
  for (const m of P) item(l, { fecha: m.fecha, t: m.concepto, s: m.categoria, v: (m.clase === "ingreso" ? "+" : "−") + eur(m.importe, 0), pos: m.clase === "ingreso", ruta: m.p && m.p.id ? `#editar/recurrente/${m.p.id}` : null });
  const tot = sum(P.map((m) => (m.clase === "ingreso" ? m.importe : -m.importe)));
  p.createDiv({ cls: "fin-note", text: `En total ${eurS(tot, 0)} en los próximos 14 días` });
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
  const st = (cls, ic, l, v) => { const c = g.createDiv({ cls: "fb-stat " + cls }); c.createDiv({ cls: "ic", text: ic }); c.createDiv({ cls: "l", text: l }); c.createDiv({ cls: "v", text: v }); };
  st("entra", "↑", "Entró", eur(M.ingresos, 0));
  st("sale", "↓", "Salió", eur(M.gastos, 0));
  st("ahorro", "⚖️", "Diferencia", eurS(M.ahorro, 0));
  const modo = params[0] === "lista" || filtroCat ? "lista" : "categorias";  // de primeras, por categoría; con una categoría elegida, su lista
  const seg = root.createDiv({ cls: "fb-seg" });
  for (const [k, t, r] of [["categorias", "Por categoría", "#movimientos"], ["lista", "Lista", "#movimientos/lista"]]) { const l = enlace(seg, t, r); l.className += k === modo ? " act" : ""; if (k === "categorias") l.addEventListener("click", () => { filtroCat = null; guardarEstado({ filtroCat: null }); }); }
  const nJev = ((((DB.config || {}).jev || {}).revision || {}).hallazgos || []).length;  // lo que el asistente Jev ve en otra categoría
  if (nJev) enlace(root.createDiv({ cls: "fin-note fb-pista" }), `✨ El asistente Jev cree que ${nJev === 1 ? "un comercio está" : `${nJev} comercios están`} en otra categoría · revísalo →`, "#revision");
  if (modo === "categorias") { vistaPorCategoria(M); return; }

  const todos = [...M.ms].sort((a, b) => b.fecha - a.fecha || (b.p.id || 0) - (a.p.id || 0));
  const cats = [...new Set(todos.map((m) => (m.clase === "transferencia" ? "Entre tus cuentas" : m.categoria)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const filtros = root.createDiv({ cls: "fb-filtros" });
  const inp = filtros.createEl("input", { cls: "fin-search", attr: { type: "search", placeholder: "Buscar un concepto, comercio o importe…" } });
  inp.value = busqueda;
  const chips = root.createDiv({ cls: "fb-chips" });
  const lista = root.createDiv({ cls: "fin-panel" });
  const pie = root.createDiv({ cls: "fb-pagina" });
  const POR_PAGINA = 40;
  const pintarChips = () => {
    chips.innerHTML = "";
    for (const c of [null, ...cats]) {
      const b = chips.createEl("button", { text: c ? `${c === "Entre tus cuentas" ? "🔁" : catIcono(c)} ${c}` : "Todo" });
      if ((filtroCat || null) === c) b.className = "act";
      b.onclick = () => { filtroCat = c; FB.estado.pagMov = 0; pintarChips(); pintar(); };
    }
  };
  const devuelto = new Map();  // gasto → lo que te han devuelto de él (Bizums enlazados)
  for (const r of registros("movimiento")) if (r.reembolsa) devuelto.set(r.reembolsa, (devuelto.get(r.reembolsa) || 0) + num(r.importe));
  const pintar = () => {
    lista.innerHTML = ""; pie.innerHTML = "";
    const q = norm(inp.value.trim());
    const f = todos.filter((m) => (!filtroCat || (m.clase === "transferencia" ? "Entre tus cuentas" : m.categoria) === filtroCat)
      && (!q || norm(`${m.concepto} ${m.categoria} ${m.cuenta} ${m.p.ext_texto || ""} ${nf(m.importe, 2, 2)}`).includes(q)));
    if (!f.length) { vacio(lista, todos.length ? "Nada coincide" : "Sin movimientos este mes", todos.length ? "" : " Importa el extracto de tu banco o apunta uno a mano."); return; }
    let dia = null, cont = null;
    const paginas = Math.ceil(f.length / POR_PAGINA), pag = Math.min(FB.estado.pagMov || 0, paginas - 1);
    for (const m of f.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA)) {
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
      const sub = m.clase === "transferencia" ? `Entre tus cuentas ${m.destino ? "→ " + m.destino : m.origen ? "← " + m.origen : ""}` : `${m.categoria}${m.clase === "reembolso" ? " · te lo devolvieron" : ""}${devuelto.has(m.p.id) ? ` · te devolvieron ${eur(devuelto.get(m.p.id))}` : ""}`;
      item(cont, {
        av: { cat: m.clase === "transferencia" ? null : m.categoria, clase: m.clase }, t: m.concepto,
        s: `${sub}${cuentas().length > 1 ? " · " + m.cuenta : ""}${m.auto ? " · previsto" : ""}`,
        v: signo + eur(m.importe), pos: entra, prev: m.auto || m.previsto,
        ruta: m.auto ? (m.p.id ? `#editar/recurrente/${m.p.id}` : null) : `#editar/movimiento/${m.p.id}`,
      });
    }
    if (paginas > 1) {  // paginación: la lista larga se corta en páginas de 40
      const ir = (n) => { FB.estado.pagMov = n; pintar(); window.scrollTo(0, 0); };
      const a = pie.createEl("button", { cls: "fb-btn sec", text: "← Anterior" }); a.disabled = pag === 0; a.onclick = () => ir(pag - 1);
      pie.createSpan({ cls: "fin-note", text: `${pag * POR_PAGINA + 1}–${Math.min(f.length, (pag + 1) * POR_PAGINA)} de ${f.length} · página ${pag + 1} de ${paginas}` });
      const s = pie.createEl("button", { cls: "fb-btn sec", text: "Siguiente →" }); s.disabled = pag >= paginas - 1; s.onclick = () => ir(pag + 1);
    }
  };
  inp.oninput = () => { busqueda = inp.value; FB.estado.pagMov = 0; pintar(); };
  pintarChips(); pintar();
}

// Gasto del mes por categoría (variable y fijo) frente a tu media y tu presupuesto; ingresos por categoría.
function vistaPorCategoria(M) {
  const C = resumenCategorias(mes);
  const total = sum(C.map((c) => c.valor));
  const abrirCat = (n) => () => { filtroCat = n; guardarEstado({ filtroCat: n }); FB.ir("#movimientos/lista"); };
  if (!C.length) { vacio(root, "Sin gastos este mes", " Importa el extracto de tu banco o cambia de mes."); return; }
  const refs = mesesReferencia(mes);
  const g = root.createDiv({ cls: "fin-grid dos" });
  for (const [grupo, tit] of [["variable", "Gasto variable"], ["fijo", "Gastos fijos"]]) {
    const cs = C.filter((c) => (c.grupo === "fijo") === (grupo === "fijo"));
    if (!cs.length) continue;
    const p = panel(g, tit, { text: eur(sum(cs.map((c) => c.valor)), 0) });
    const l = p.createDiv({ cls: "fb-lista" });
    for (const c of cs) filaCategoria(l, c, total, abrirCat(c.nombre));
  }
  const ing = new Map();
  for (const m of M.real.filter((m) => m.clase === "ingreso")) ing.set(m.categoria, (ing.get(m.categoria) || 0) + m.importe);
  if (ing.size) {
    const p = panel(g, "Ingresos", { text: eur(M.ingresos, 0) });
    const l = p.createDiv({ cls: "fb-lista" });
    for (const [n, v] of [...ing].sort((a, b) => b[1] - a[1])) item(l, { av: { cat: n, sm: true }, t: n, s: pct(v / M.ingresos), v: eur(v, 0), pos: true, onclick: abrirCat(n) });
  }
  // «Salió» es el gasto menos lo que te devolvieron; una devolución de un gasto de otro mes deja su categoría en negativo y no sale en las listas
  const dev = [...gastoPorCategoria(mes)].filter(([, v]) => v < -0.005);
  if (dev.length) {
    const totalDev = -sum(dev.map(([, v]) => v));
    root.createDiv({ cls: "fin-note", text: `Salió ${eur(M.gastos, 0)} = ${eur(M.gastos + totalDev, 0)} de gasto − ${eur(totalDev, 0)} que te han devuelto de gastos de otros meses (${dev.map(([n, v]) => `${n} ${eur(-v, 0)}`).join(", ")}).` });
  }
  const nota = root.createDiv({ cls: "fin-note" });
  nota.appendText(refs.length ? `▲▼ comparado con la media de ${refs.map(mesCorto).join(", ").toLowerCase()}. ` : "");
  nota.appendText("¿Quieres un tope para una categoría? ");
  enlace(nota, "Ponle un presupuesto →", "#gestionar/categoria");
}

// Pantallas antiguas → las nuevas (enlaces guardados y avisos).
const VISTAS = { inicio: vistaInicio, resumen: vistaInicio, movimientos: vistaMovimientos, gastos: vistaMovimientos,
  prevision: vistaInicio, patrimonio: vistaInicio, inversion: vistaInversion };

// ═════════════ componentes de interfaz ═════════════
// Colores: paleta validada para daltonismo (claro/oscuro), definida en view.css.
const SERIES = ["var(--fin-s1)", "var(--fin-s2)", "var(--fin-s3)", "var(--fin-s4)", "var(--fin-s5)", "var(--fin-s6)", "var(--fin-s7)"];
const COMP = { Liquidez: SERIES[0], "Efectivo bróker": SERIES[6], "Inversión": SERIES[1], Cripto: SERIES[2], Otros: SERIES[5] };
const colorActivo = (nombre) => {
  const orden = activos().map((a) => a.nombre).sort((a, b) => a.localeCompare(b, "es"));
  const i = orden.indexOf(nombre);
  return i < 0 ? "var(--text-faint)" : SERIES[i % SERIES.length]; // activos vendidos: gris
};
const GOOD = "var(--fin-good)", BAD = "var(--fin-bad)", WARN = "var(--fin-warn)";
const polar = (v) => (v >= 0 ? GOOD : BAD);

const root = FB.container.createDiv({ cls: "fin" });
const setVar = (el, k, v) => (el.style.setProperty ? el.style.setProperty(k, v) : (el.style[k] = v));
// Enlace a otra pantalla de la app: «#movimientos», «#editar/movimiento/12»…
const enlace = (padre, texto, ruta) => padre.createEl("a", { cls: "internal-link", text: texto, href: ruta || "#" });
const accion = (padre, texto, fn, title) => {
  const a = padre.createEl("a", { cls: "fin-link", text: texto, href: "#" });
  if (title) a.title = title;
  a.onclick = (e) => { if (e && e.preventDefault) e.preventDefault(); fn(); };
  return a;
};

// Icono y color de cada categoría (las que cree el usuario reciben uno genérico y un color estable).
const CAT_ICONO = { Vivienda: "🏠", Suministros: "💡", Seguros: "🛡️", Suscripciones: "📺", Supermercado: "🛒", "Comer fuera": "🍽️", Ocio: "🎉",
  Transporte: "🚌", Coche: "🚗", Salud: "💊", Compras: "🛍️", Hogar: "🛋️", Viajes: "✈️", "Formación": "📚", Regalos: "🎁", "Cuidado personal": "💇",
  Mascotas: "🐾", Efectivo: "💶", Comisiones: "🏦", Otros: "📦", "Nómina": "💼", "Otros ingresos": "💰", Apuestas: "🎲", Videojuegos: "🎮", Deporte: "🏀" };
// Pastel (salvia, arena, terracota, lavanda, cielo, rosa, oliva, agua, melocotón, piedra): legibles en claro y oscuro.
const PALETA = ["#8FB095", "#DDBB84", "#D98C6E", "#B3A0D6", "#8DB2C8", "#DDA0A0", "#B0B27A", "#83B7AA", "#E8A978", "#A89D92"];
const hashTxt = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
// El icono y el color se pueden elegir en cada categoría (Ajustes → Categorías); si no, los de serie.
const catReg = (n) => categorias().find((c) => c.nombre === n);
// Colores de serie de las categorías de la plantilla (como en el diseño); las nuevas, uno estable de la paleta.
const CAT_COLOR = { Vivienda: "#8FB095", Supermercado: "#DDBB84", "Comer fuera": "#D98C6E", Coche: "#B3A0D6", Suministros: "#8DB2C8",
  Suscripciones: "#DDA0A0", Seguros: "#A7B8C9", Ocio: "#E8A978", Transporte: "#83B7AA", Salud: "#E3A6B4", Compras: "#B0B27A", Hogar: "#C9B08E",
  Viajes: "#7FB0D0", "Formación": "#A9A2D8", Regalos: "#E39AA7", "Cuidado personal": "#D5A5C9", Mascotas: "#C2A07E", Efectivo: "#9DBB8C",
  Comisiones: "#B5A99B", Apuestas: "#CF8F8F", Otros: "#B8ADA0", "Nómina": "#7FAE8A", Intereses: "#9CC0A0", "Otros ingresos": "#A8C49A" };
const catColor = (n) => ((catReg(n) || {}).p || {}).color || CAT_COLOR[n] || PALETA[hashTxt(n) % (PALETA.length - 1)];
const catIcono = (n) => ((catReg(n) || {}).p || {}).icono || CAT_ICONO[n] || "🏷️";
const ICONO_CLASE = { transferencia: "🔁", ingreso: "💰", reembolso: "↩️" };
function avatar(padre, { cat, clase, icono, sm } = {}) {
  const a = padre.createDiv({ cls: "fb-av" + (sm ? " sm" : "") });
  a.textContent = icono || (clase === "transferencia" ? ICONO_CLASE.transferencia : cat ? catIcono(cat) : ICONO_CLASE[clase] || "🏷️");
  setVar(a, "--cc", cat ? catColor(cat) : "var(--brand)");
  return a;
}
// Fila de lista con avatar: { av: {cat|clase|icono}, t, s, v, vs, pos, ruta, onclick, prev }
function item(padre, it) {
  const el = it.ruta ? padre.createEl("a", { cls: "fb-item internal-link", href: it.ruta }) : padre.createDiv({ cls: "fb-item" + (it.onclick ? " click" : "") });
  if (it.onclick) el.onclick = it.onclick;
  if (it.prev) el.classList.add("prev");
  if (it.fecha) { const f = el.createDiv({ cls: "fb-fecha" }); f.createEl("b", { text: it.fecha.toFormat("d") }); f.createSpan({ text: it.fecha.setLocale("es").toFormat("LLL").replace(".", "") }); }
  else if (it.av) avatar(el, it.av);
  const n = el.createDiv({ cls: "n" });
  n.createDiv({ cls: "t", text: it.t });
  if (it.s) n.createDiv({ cls: "s", text: it.s });
  if (it.v != null) { const v = el.createDiv({ cls: "v" + (it.pos ? " pos" : "") }); v.appendText(it.v); if (it.vs) v.createEl("small", { text: it.vs }); }
  return el;
}
function cabecera(titulo, conMes, subt) {
  const h = root.createDiv({ cls: "fin-head" });
  const izq = h.createDiv();
  izq.createEl("h2", { text: titulo });
  if (subt) izq.createDiv({ cls: "sub", text: subt });
  if (conMes) {
    const box = h.createDiv({ cls: "fin-mes" });
    const btn = (t, key, title) => { const b = box.createEl("button", { text: t }); b.title = title; b.onclick = () => cambiarMes(key); };
    btn("‹", mesAnterior(mes), "Mes anterior");
    box.createSpan({ cls: "lbl", text: mesLbl(mes) });
    btn("›", mesDT(mes).plus({ months: 1 }).toFormat("yyyy-MM"), "Mes siguiente");
    if (mes !== hoyKey) btn("Hoy", hoyKey, "Volver al mes actual");
  }
}
const panel = (padre, titulo, extra, h_ayuda) => {
  const p = padre.createDiv({ cls: "fin-panel" });
  if (titulo) {
    const h = p.createEl("h3");
    const t = h.createSpan({ text: titulo });
    if (h_ayuda) ayuda(t, h_ayuda);
    if (extra) {
      const x = h.createSpan({ cls: "x" });
      if (extra.ruta) enlace(x, extra.text, extra.ruta); else x.setText(extra.text);
    }
  }
  return p;
};
const rejilla = (padre = root) => padre.createDiv({ cls: "fin-grid" });
function vacio(padre, titulo, pista) {
  const e = padre.createDiv({ cls: "fin-empty" });
  e.createEl("b", { text: titulo });
  if (pista) e.appendText(pista);
}
function delta(padre, { v, txt: t, bueno }) {
  const g = !v || !bueno ? "" : (v > 0) === (bueno > 0) ? "good" : "bad";
  padre.createSpan({ cls: "fin-delta " + g, text: `${v > 0 ? "▲" : v < 0 ? "▼" : "●"} ${t}` });
}
function spark(vals, { w = 96, h = 28, color = "var(--fin-s1)" } = {}) {
  if (!vals || vals.length < 2) return "";
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const X = (i) => 3 + i * (w - 6) / (vals.length - 1), Y = (v) => 4 + (max - v) * (h - 8) / span;
  const d = vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const n = vals.length - 1;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" style="fill:none;stroke:var(--text-faint);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round"/><circle cx="${X(n).toFixed(1)}" cy="${Y(vals[n]).toFixed(1)}" r="3.5" style="fill:${color};stroke:var(--background-secondary);stroke-width:2"/></svg>`;
}
function hero(padre, { l, v, d, s, sparkVals }) {
  const h = padre.createDiv({ cls: "fin-hero" });
  const a = h.createDiv();
  a.createDiv({ cls: "l", text: l });
  a.createDiv({ cls: "v", text: v });
  const row = a.createDiv({ cls: "row" });
  if (d) delta(row, d);
  if (s) row.createSpan({ cls: "s", text: s });
  const sp = spark(sparkVals, { w: 200, h: 56 });
  if (sp) h.createDiv({ cls: "hs" }).innerHTML = sp;
}
function tiles(padre, items) {
  const g = padre.createDiv({ cls: "fin-tiles" });
  for (const it of items.filter(Boolean)) {
    const c = g.createDiv({ cls: "fin-tile" });
    c.createDiv({ cls: "l", text: it.l });
    c.createDiv({ cls: "v " + (it.t || ""), text: it.v });
    if (it.d) delta(c, it.d);
    if (it.s) c.createDiv({ cls: "s", text: it.s });
    const sp = spark(it.spark);
    if (sp) c.createDiv({ cls: "sp" }).innerHTML = sp;
  }
}
function kv(padre, items) {
  const k = padre.createDiv({ cls: "fin-kv" });
  for (const it of items.filter(Boolean)) { const d = k.createDiv(); d.createDiv({ cls: "l", text: it.l }); d.createDiv({ cls: "v " + (it.t || ""), text: it.v }); }
}
const ICO = { ok: ["✓", GOOD], warn: ["!", WARN], over: ["✕", BAD], info: ["i", "var(--text-faint)"] };
function ico(padre, tipo) { const [c, col] = ICO[tipo]; setVar(padre.createSpan({ cls: "fin-ico", text: c }), "--ic", col); }
function meter(padre, { nombre, ruta, onclick, title, dot, valor, total, color, fuerte, resto, sub, ico: icono, marca, lg, act }) {
  const m = padre.createDiv({ cls: "fin-meter" + (lg ? " lg" : "") + (act ? " act" : "") });
  setVar(m, "--mc", color);
  const top = m.createDiv({ cls: "top" });
  const n = top.createDiv({ cls: "n" });
  if (dot) setVar(n.createSpan({ cls: "fin-dot" }), "--dc", dot);
  if (onclick) accion(n, nombre, onclick, title); else if (ruta) enlace(n, nombre, ruta); else n.appendText(nombre);
  const val = top.createDiv({ cls: "val" });
  val.createEl("b", { text: fuerte });
  if (resto) val.appendText(" " + resto);
  const tr = m.createDiv({ cls: "track" });
  tr.createDiv({ cls: "fill" }).style.width = (Math.max(0, Math.min(1, total > 0 ? valor / total : 0)) * 100).toFixed(1) + "%";
  if (marca != null) tr.createDiv({ cls: "mark" }).style.left = `calc(${(Math.min(1, marca) * 100).toFixed(1)}% - 1px)`;
  if (sub || icono) {
    const s = m.createDiv({ cls: "sub" });
    if (icono) ico(s, icono);
    if (sub) s.appendText(sub);
  }
}
function stack(padre, partes) {
  const st = padre.createDiv({ cls: "fin-stack" });
  const total = sum(partes.map((p) => Math.max(0, p.valor)));
  for (const p of partes.filter((p) => p.valor > 0)) {
    const seg = st.createDiv();
    seg.style.flex = `${p.valor} 1 0`;
    seg.style.background = p.color;
    seg.title = `${p.nombre}: ${eur(p.valor, 0)} · ${pct(p.valor / total)}`;
  }
  return st;
}
// items: [nombre, color, linea?]; con `linea` la muestra es un trazo (discontinuo si la serie lo es), no un cuadrado.
function leyenda(padre, items) {
  const l = padre.createDiv({ cls: "fin-legend" });
  for (const [nombre, color, linea] of items) {
    const s = l.createSpan(), i = s.createEl("i");
    setVar(i, "--dc", color);
    if (linea) i.className = linea === "continua" ? "linea" : "linea rayas";
    s.appendText(nombre);
  }
  return l;
}
// filas: arrays de celdas; si el array tiene `.cls`, se aplica a la fila (p. ej. "prev" para lo previsto).
function tabla(padre, cols, filas) {
  const t = padre.createDiv({ cls: "fin-tablewrap" }).createEl("table", { cls: "fin-table" });
  const hr = t.createEl("thead").createEl("tr");
  const clase = (c) => [c.num ? "num" : "", c.opt ? "opt" : ""].join(" ").trim();
  cols.forEach((c) => hr.createEl("th", { text: c.t, cls: clase(c) }));
  const tb = t.createEl("tbody");
  for (const f of filas) {
    const tr = tb.createEl("tr", { cls: f.cls || "" });
    f.forEach((c, i) => {
      const td = tr.createEl("td", { cls: [clase(cols[i]), c && c.cls ? c.cls : ""].join(" ").trim() });
      if (c == null) return;
      if (typeof c !== "object") { td.setText(String(c)); return; }
      if (c.dot) setVar(td.createSpan({ cls: "fin-dot" }), "--dc", c.dot);
      if (c.onclick) accion(td, c.text, c.onclick, c.title); else if (c.ruta) enlace(td, c.text, c.ruta); else td.appendText(c.text ?? "");
      if (c.badge) td.createSpan({ cls: "fin-badge " + (c.badgeCls || ""), text: c.badge });
    });
  }
  return t;
}
const conFila = (arr, cls) => { arr.cls = cls; return arr; };

// Sección plegable (cerrada por defecto). El contenido se dibuja la primera vez que se abre: así la página
// carga ligera y los gráficos se pintan ya con su ancho real.
function plegable(padre, titulo, pintar, { abierto = false, extra } = {}) {
  const d = padre.createEl("details", { cls: "fin-more" });
  const s = d.createEl("summary");
  s.createSpan({ cls: "t", text: titulo });
  if (extra) s.createSpan({ cls: "x", text: extra });
  const cuerpo = d.createDiv({ cls: "fin-more-body" });
  let hecho = false;
  const llenar = () => { if (!hecho) { hecho = true; pintar(cuerpo); } };
  if (d.addEventListener) d.addEventListener("toggle", () => { if (d.open) llenar(); });
  if (abierto) { d.open = true; llenar(); }
  return d;
}
// Lista de filas «etiqueta … valor» (con subtítulo opcional). items: { l, v, s?, t?, ruta?, dot? }
function filasDato(padre, items) {
  const box = padre.createDiv({ cls: "fin-rows" });
  for (const it of items.filter(Boolean)) {
    const r = box.createDiv({ cls: "r" });
    const l = r.createDiv({ cls: "l" });
    const n = l.createDiv({ cls: "n" });
    if (it.dot) setVar(n.createSpan({ cls: "fin-dot" }), "--dc", it.dot);
    if (it.ruta) enlace(n, it.l, it.ruta); else n.appendText(it.l);
    if (it.h) ayuda(n, it.h);
    if (it.s) l.createDiv({ cls: "s", text: it.s });
    r.createDiv({ cls: "v " + (it.t || ""), text: it.v });
  }
  return box;
}
// «ⓘ» con una explicación en lenguaje sencillo (al pasar el ratón o al pulsar/enfocar).
// Nombre accesible de cada campo de un formulario: su etiqueta es el .et de al lado (un lector de pantalla leía solo «campo de edición»).
function etiquetar(cont) {
  for (const et of cont.querySelectorAll(".fb-form > .et")) {
    const c = et.nextElementSibling;
    const ctl = c && (c.matches("input, select, textarea") ? c : c.querySelector("input, select, textarea"));
    const t = ((et.firstChild && et.firstChild.nodeType === 3 ? et.firstChild.textContent : et.textContent) || "").replace(/\s*\*\s*$/, "").trim();
    if (ctl && t && !ctl.getAttribute("aria-label")) ctl.setAttribute("aria-label", t);
  }
}
function ayuda(padre, texto) {
  const s = padre.createSpan({ cls: "fin-ayuda", text: "ⓘ", attr: { tabindex: "0", "aria-label": texto } });
  s.createSpan({ cls: "fin-ayuda-t", text: texto });
  return s;
}
// Cifra grande con etiqueta (para la cabecera de un panel). `h`: explicación opcional (ⓘ).
function cifra(padre, l, v, s, h) {
  const b = padre.createDiv({ cls: "fin-big" });
  const et = b.createDiv({ cls: "l", text: l });
  if (h) ayuda(et, h);
  b.createDiv({ cls: "v", text: v });
  if (s) b.createDiv({ cls: "s", text: s });
  return b;
}

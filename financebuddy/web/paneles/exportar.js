// ═════════════ exportar: un resumen en HTML y la plantilla de Excel ═════════════
// El resumen es UN archivo .html (sin enlaces ni scripts: se abre sin conexión y se puede mandar a quien quieras). Hay dos modos:
//  · con importes: las cifras tal cual;
//  · sin importes: ninguna cantidad en euros llega al archivo. Lo que se calcula ANTES de escribirlo son porcentajes y un índice
//    (100 = el primer registro): se ve cómo evoluciona todo, pero no cuánto dinero es. Taparlo con CSS no valdría: el valor
//    seguiría dentro del archivo, a un «ver código fuente» de distancia.
const MES_CORTO = (k) => mesCorto(k);
function descargarArchivo(nombre, datos, tipo) {
  const blob = datos instanceof Blob ? datos : new Blob([datos], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function descargarPlantilla() {
  const r = await FB.api("/api/plantilla", {});
  if (!r.ok) { FB.aviso(r.mensaje || "No se ha podido crear la plantilla", true); return; }
  const bin = atob(r.contenido), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  descargarArchivo(r.nombre, new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  FB.aviso("Plantilla descargada ✓");
}

// Todos tus datos en un Excel (una hoja por cosa): para guardarlos, llevarlos a otro sitio o hacer tus propias cuentas.
async function descargarDatos(btn) {
  btn.disabled = true;
  const r = await FB.api("/api/exportar_datos", {});
  btn.disabled = false;
  if (!r.ok) { FB.aviso(r.mensaje || "No se han podido exportar los datos", true); return; }
  const bin = atob(r.contenido), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  descargarArchivo(r.nombre, new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  FB.aviso("Datos exportados ✓");
}

// ───────────── gráficos del resumen: SVG simple y autónomo ─────────────
const COLORES_RESUMEN = ["#5E8266", "#C9603F", "#44688A", "#B8892F", "#6A5AA8", "#B84A6E", "#3E7558", "#7A6F63"];
function svgLinea(etiquetas, series, { fmt, alto = 170 } = {}) {
  const W = 640, H = alto, L = 46, R = 22, T = 10, B = 22;
  const todos = series.flatMap((s) => s.valores.filter((v) => v != null));
  if (todos.length < 2 || etiquetas.length < 2) return "";
  let lo = Math.min(...todos), hi = Math.max(...todos);
  if (hi === lo) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const n = etiquetas.length, X = (i) => L + (i * (W - L - R)) / (n - 1), Y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const s = [`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de líneas">`];
  for (let i = 0; i <= 3; i++) {
    const v = lo + ((hi - lo) * i) / 3, y = Y(v).toFixed(1);
    s.push(`<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="g"/><text x="${L - 6}" y="${(+y + 4).toFixed(1)}" text-anchor="end">${esc(fmt(v))}</text>`);
  }
  for (const se of series) {
    const pts = se.valores.map((v, i) => (v == null ? null : `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).filter(Boolean);
    if (pts.length < 2) continue;
    s.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${se.color}" stroke-width="${se.rayas ? 1.6 : 2.6}" stroke-linejoin="round" stroke-linecap="round"${se.rayas ? ' stroke-dasharray="5 5"' : ""}/>`);
  }
  const paso = Math.max(1, Math.ceil(n / 6));
  etiquetas.forEach((e, i) => { if (i % paso === (n - 1) % paso) s.push(`<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(e)}</text>`); });
  etiquetas.forEach((e, i) => s.push(`<circle cx="${X(i).toFixed(1)}" cy="${Y(series[0].valores[i] ?? lo).toFixed(1)}" r="7" fill="transparent"><title>${esc(e)}: ${esc(series.map((se) => (se.valores[i] == null ? "" : `${se.nombre} ${fmt(se.valores[i])}`)).filter(Boolean).join(" · "))}</title></circle>`));
  return s.join("") + "</svg>";
}
function svgBarras(etiquetas, valores, { fmt, alto = 150 } = {}) {
  const W = 640, H = alto, L = 46, R = 22, T = 10, B = 22, n = valores.length;
  if (!n) return "";
  const max = Math.max(0.0001, ...valores.map((v) => (isFinite(v) ? Math.abs(v) : 0))), mn = Math.min(0, ...valores.filter(isFinite));
  const Y = (v) => T + ((max - v) * (H - T - B)) / (max - mn);
  const w = ((W - L - R) / n) * 0.6;
  const s = [`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de columnas">`, `<line x1="${L}" x2="${W - R}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="g"/>`,
    `<text x="${L - 6}" y="${(T + 4).toFixed(1)}" text-anchor="end">${esc(fmt(max))}</text>`, `<text x="${L - 6}" y="${(Y(0) + 4).toFixed(1)}" text-anchor="end">${esc(fmt(0))}</text>`];
  valores.forEach((v, i) => {
    const x = L + ((W - L - R) / n) * (i + 0.5) - w / 2, y0 = Y(0), y1 = Y(isFinite(v) ? v : 0);
    s.push(`<rect x="${x.toFixed(1)}" y="${Math.min(y0, y1).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, Math.abs(y0 - y1)).toFixed(1)}" rx="3" fill="${v >= 0 ? "#5E8266" : "#C9603F"}"><title>${esc(etiquetas[i])}: ${esc(isFinite(v) ? fmt(v) : "—")}</title></rect>`);
    s.push(`<text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(etiquetas[i])}</text>`);
  });
  return s.join("") + "</svg>";
}
const barraReparto = (partes) => `<div class="rep">${partes.map((p, i) => `<i style="width:${Math.max(0.5, p.frac * 100).toFixed(1)}%;background:${COLORES_RESUMEN[i % COLORES_RESUMEN.length]}" title="${esc(p.nombre)} ${esc(pct(p.frac))}"></i>`).join("")}</div>`
  + `<ul class="ley">${partes.map((p, i) => `<li><i style="background:${COLORES_RESUMEN[i % COLORES_RESUMEN.length]}"></i>${esc(p.nombre)} <b>${esc(pct(p.frac))}</b>${p.extra ? ` <span>${esc(p.extra)}</span>` : ""}</li>`).join("")}</ul>`;
const tarjetaHtml = (t, cuerpo, nota) => `<section><h2>${esc(t)}</h2>${cuerpo}${nota ? `<p class="n">${esc(nota)}</p>` : ""}</section>`;
const tilesHtml = (l) => `<div class="tiles">${l.filter(Boolean).map((t) => `<div class="t"><div class="l">${esc(t.l)}</div><div class="v ${t.t || ""}">${esc(t.v)}</div>${t.s ? `<div class="s">${esc(t.s)}</div>` : ""}</div>`).join("")}</div>`;
const indice = (v, base) => (base > 0 && v != null ? (100 * v) / base : null);
const fmtIndice = (v) => nf(v, 0, 0);
const fmtPct = (v) => nf(v, 0, 0) + " %";

// ───────────── el resumen ─────────────
// ocultar: sin importes en euros (ver arriba). Devuelve el documento HTML completo.
function generarResumen(ocultar) {
  const E = estimacion(), P = patrimonio(), I = resumenInversion();
  const sec = [];
  const eurO = (v, d = 0) => (ocultar ? null : eur(v, d));  // con ocultar, nada en euros: ni se calcula el texto
  if (!E) sec.push(tarjetaHtml("Patrimonio", "<p>Aún no hay saldos anotados.</p>"));
  else {
    // Patrimonio: lo que tienes hoy (estimado) y cómo ha evolucionado
    const total = Object.values(E.c).reduce((a, b) => a + Math.max(0, b), 0);
    const partes = Object.entries(E.c).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]).map(([nombre, v]) => ({ nombre, frac: total > 0 ? v / total : 0, extra: eurO(v) }));
    const base = P.length ? P[0].neto : null;
    const ev = P.map((x) => x.fecha);
    const evValores = P.map((x) => (ocultar ? indice(x.neto, base) : x.neto));
    if (E && P.length) { ev.push(hoy); evValores.push(ocultar ? indice(E.neto, base) : E.neto); }
    const crec = base > 0 ? E.neto / base - 1 : NaN;
    sec.push(tarjetaHtml("Patrimonio",
      tilesHtml([ocultar ? { l: "Desde el primer registro", v: isFinite(crec) ? pct(crec, true) : "—", t: tone(crec), s: `${P.length} registros de saldos` } : { l: "Patrimonio hoy", v: eur(E.neto, 0), s: "estimado hoy" },
        !ocultar && isFinite(crec) ? { l: "Desde el primer registro", v: pct(crec, true), t: tone(crec) } : null, E.deudas > 0 ? { l: ocultar ? "Deudas / activos" : "Deudas", v: ocultar ? pct(E.activos > 0 ? E.deudas / E.activos : NaN) : eur(E.deudas, 0) } : null])
      + barraReparto(partes)
      + svgLinea(ev.map((d) => d.toFormat("MM/yy")), [{ nombre: ocultar ? "Índice" : "Patrimonio", color: COLORES_RESUMEN[0], valores: evValores }], { fmt: ocultar ? fmtIndice : (v) => compact(v).replace("+", "") }),
      ocultar ? "Índice: 100 es lo que había en el primer registro. No se muestran cantidades." : ""));
  }
  // Ahorro: tasa de ahorro mes a mes (un porcentaje: vale igual en los dos modos)
  const meses = mesesHasta(hoyKey, 12).map((k) => ({ k, f: finMes(k) })).filter((m) => m.f.ingresos > 0);
  if (meses.length >= 2) {
    const t = tasa12(hoyKey);
    sec.push(tarjetaHtml("Ahorro",
      tilesHtml([{ l: "Tasa de ahorro (12 meses)", v: isFinite(t.tasa) ? pct(t.tasa) : "—", s: "lo que sobra de lo que entra" }, ocultar ? null : { l: "Ingresos / gastos (12 meses)", v: `${eur(t.ing, 0)} / ${eur(t.gas, 0)}` }])
      + svgBarras(meses.map((m) => MES_CORTO(m.k)), meses.map((m) => (isFinite(m.f.tasa) ? m.f.tasa * 100 : 0)), { fmt: fmtPct }),
      "Porcentaje de los ingresos de cada mes que no se gasta."));
  }
  // En qué se va el dinero: el último mes con gastos, como porcentaje del gasto total
  const kGasto = mesesHasta(hoyKey, 3).reverse().find((k) => finMes(k).gastos > 0);
  if (kGasto) {
    const cats = resumenCategorias(kGasto).filter((c) => c.valor > 0.5), tot = sum(cats.map((c) => c.valor));
    if (tot > 0) sec.push(tarjetaHtml(`En qué se va el dinero · ${mesLbl(kGasto)}`, barraReparto(cats.slice(0, 8).map((c) => ({ nombre: c.nombre, frac: c.valor / tot, extra: eurO(c.valor) }))
      .concat(cats.length > 8 ? [{ nombre: "Otras", frac: sum(cats.slice(8).map((c) => c.valor)) / tot }] : [])), ocultar ? "Como porcentaje del gasto del mes." : ""));
  }
  // Inversión
  if (I.filas.length) {
    const pct0 = I.aportado > 0 ? I.gan / I.aportado : NaN, ev = evolucionInversion(false);
    const tabla = I.filas.filter((f) => f.valor > 0.5).sort((a, b) => b.valor - a.valor).map((f) => ({ nombre: f.nombre, frac: I.total > 0 ? f.valor / I.total : 0, extra: ocultar ? (isFinite(f.gan) && f.aportado > 0 ? pct(f.gan / f.aportado, true) : "") : eur(f.valor, 0) }));
    const idx0 = ev ? (ev.aportado.find((v) => v > 0) || 0) : 0;
    const graf = ev && ev.keys.length >= 2 ? svgLinea(ev.keys.map(MES_CORTO), [
      { nombre: ocultar ? "Valor (índice)" : "Valor", color: COLORES_RESUMEN[0], valores: ev.valor.map((v) => (ocultar ? indice(v, idx0) : v)) },
      { nombre: ocultar ? "Metido (índice)" : "Metido", color: "#7A6F63", rayas: true, valores: ev.aportado.map((v) => (ocultar ? indice(v, idx0) : v)) }], { fmt: ocultar ? fmtIndice : (v) => compact(v).replace("+", "") }) : "";
    sec.push(tarjetaHtml("Inversión", tilesHtml([ocultar ? null : { l: "Vale hoy", v: eur(I.total, 0) }, ocultar ? null : { l: "Has metido", v: eur(I.aportadoTodo, 0) },
      isFinite(pct0) ? { l: "Ganancia sobre lo metido", v: pct(pct0, true), t: tone(pct0), s: ocultar ? "" : eurS(I.gan, 0) } : null,
      isFinite(I.tir) ? { l: "Rentabilidad anual", v: pct(I.tir, true), t: tone(I.tir), s: I.tirCorta ? "menos de un año: orientativa" : "" } : null])
      + barraReparto(tabla) + graf,
      ocultar ? "Índice: 100 es lo metido al empezar. Entre paréntesis, lo que ha ganado o perdido cada activo sobre lo que metiste en él." : ""));
  }
  const nombre = "FinanceBuddy";
  const css = `:root{--bg:#f3eee6;--c:#fbf8f2;--t:#2b2620;--t2:#6f655a;--l:#e6dfd2;--b:#5e8266;--m:#3e7558;--r:#c9603f}
@media(prefers-color-scheme:dark){:root{--bg:#1c1a17;--c:#26231f;--t:#efe9df;--t2:#aaa092;--l:#39342d;--b:#8db596;--m:#7fc29b;--r:#e08a6c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}h1{font:700 1.7em Georgia,serif;margin:0 0 2px}.sub{color:var(--t2);margin:0 0 18px}
section{background:var(--c);border:1px solid var(--l);border-radius:18px;padding:18px 20px;margin:0 0 16px}h2{font:650 1.15em Georgia,serif;margin:0 0 12px}
.tiles{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 12px}.t{flex:1 1 150px;border:1px solid var(--l);border-radius:14px;padding:10px 14px}.l{font-size:.78em;color:var(--t2);font-weight:600}
.v{font:650 1.35em Georgia,serif}.v.pos{color:var(--m)}.v.neg{color:var(--r)}.s{font-size:.78em;color:var(--t2)}.n{font-size:.82em;color:var(--t2);margin:10px 0 0}
.rep{display:flex;height:12px;border-radius:99px;overflow:hidden;margin:6px 0 8px}.rep i{display:block}.ley{list-style:none;margin:0 0 12px;padding:0;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:.88em}
.ley i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}.ley span{color:var(--t2)}
svg{width:100%;height:auto;display:block}svg text{font-size:10px;fill:var(--t2)}svg .g{stroke:var(--l);stroke-width:1}footer{color:var(--t2);font-size:.8em;margin-top:20px}`;
  const cuando = hoy.setLocale("es").toFormat("d 'de' LLLL 'de' yyyy");
  return `<!doctype html>\n<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">`
    + `<title>${nombre} · Resumen del ${esc(hoy.toFormat("dd-MM-yyyy"))}</title><style>${css}</style></head><body><main>`
    + `<h1>${nombre}</h1><p class="sub">Resumen a ${esc(cuando)} · ${ocultar ? "sin importes (solo porcentajes e índices)" : "con importes"}</p>`
    + (sec.join("\n") || "<section><p>Aún no hay datos que resumir.</p></section>")
    + `<footer>${ocultar ? "Los importes se han dejado fuera antes de crear este archivo: no están en él, ni siquiera ocultos. " : ""}Generado por FinanceBuddy ${esc(String((DB.info || {}).version || ""))} en el ordenador de su dueño. Es una foto de ese día; no se actualiza sola.</footer>`
    + `</main></body></html>`;
}
function descargarResumen(ocultar) {
  const html = generarResumen(ocultar);
  descargarArchivo(`FinanceBuddy-resumen-${hoy.toFormat("yyyy-MM-dd")}${ocultar ? "-sin-importes" : ""}.html`, html, "text/html;charset=utf-8");
  FB.aviso("Resumen descargado ✓");
}

// ───────────── Ajustes ─────────────
function panelCompartir(padre) {
  const p = panel(padre, "Compartir y exportar", null, "Archivos tuyos, hechos en tu ordenador y sin conectarse a nada.");
  p.createDiv({ cls: "fin-note", text: "Resumen en HTML: tu patrimonio, cómo ahorras, en qué gastas y cómo va tu inversión, en un solo archivo que se abre en cualquier navegador y puedes mandar a tu pareja, a un asesor o guardar. Es una foto de hoy." });
  const f = p.createDiv({ cls: "fb-fila" });
  const b1 = f.createEl("button", { cls: "fb-btn", text: "Descargar con importes" }); b1.onclick = () => descargarResumen(false);
  const b2 = f.createEl("button", { cls: "fb-btn sec", text: "Descargar sin importes" }); b2.onclick = () => descargarResumen(true);
  p.createDiv({ cls: "fin-note", text: "«Sin importes» no tapa las cifras: no las incluye. Verás porcentajes (reparto, ahorro, rentabilidad) y la evolución como índice (100 = el primer registro), pero ni el archivo ni su código fuente dicen cuánto dinero es. Los nombres de tus activos sí salen." });
  const gd = p.createDiv({ cls: "fb-fila" });
  const bD = gd.createEl("button", { cls: "fb-btn sec", text: "Todos mis datos en Excel" }); bD.onclick = () => descargarDatos(bD);
  p.createDiv({ cls: "fin-note", text: "Un archivo con una hoja por cosa: movimientos, cuentas, saldos, fijos, categorías, reglas, inversión, aportaciones, dividendos, objetivos y recordatorios. Es para consultar o hacer tus propias cuentas; para guardar algo que se pueda restaurar usa las copias de seguridad. Contiene tus datos reales: guárdalo en un sitio de confianza." });
  const g = p.createDiv({ cls: "fb-fila" });
  const b3 = g.createEl("button", { cls: "fb-btn sec", text: "Plantilla de Excel para apuntar movimientos" }); b3.onclick = descargarPlantilla;
  p.createDiv({ cls: "fin-note", text: "Una hoja con fecha, concepto, importe y un desplegable con tus categorías. Rellénala (o pega ahí movimientos de otro sitio) y súbela en Importar: la categoría que elijas es la que se usa." });
}

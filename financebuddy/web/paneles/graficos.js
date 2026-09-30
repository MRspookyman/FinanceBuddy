// ═════════════ gráficos SVG y mapa de calor ═════════════
// Se redibujan al ancho real del contenedor; tooltip al pasar/tocar.
function niceTicks(min, max, count = 4) {
  // Valores casi iguales (diferencias de redondeo) → se tratan como iguales; si no, el paso sería ~0 y el bucle, infinito.
  if (Math.abs(max - min) < 1e-6 * Math.max(1, Math.abs(max))) max = min;
  if (min === max) { if (min === 0) max = 1; else { const p = Math.abs(min) * 0.1; min -= p; max += p; } }
  const step0 = (max - min) / count, mag = Math.pow(10, Math.floor(Math.log10(step0))), nrm = step0 / mag;
  const step = (nrm < 1.5 ? 1 : nrm < 3 ? 2 : nrm < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { lo, hi, ticks };
}
function barPath(x, y0, y1, w, r = 4) {
  const h = Math.abs(y1 - y0);
  r = Math.min(r, w / 2, h);
  const up = y1 < y0, s = up ? 1 : -1;
  return `M${x.toFixed(1)},${y0.toFixed(1)}V${(y1 + s * r).toFixed(1)}Q${x.toFixed(1)},${y1.toFixed(1)} ${(x + r).toFixed(1)},${y1.toFixed(1)}H${(x + w - r).toFixed(1)}Q${(x + w).toFixed(1)},${y1.toFixed(1)} ${(x + w).toFixed(1)},${(y1 + s * r).toFixed(1)}V${y0.toFixed(1)}Z`;
}
function chart(padre, render) {
  const wrap = padre.createDiv({ cls: "fin-chart" });
  let ancho = 0;
  const paint = () => {
    ancho = Math.max(260, Math.floor(wrap.clientWidth || 640));
    wrap.innerHTML = render(ancho);
    wrap.createDiv({ cls: "fin-tip" });
  };
  paint();
  if (wrap.addEventListener) {
    const mover = (e) => {
      const tip = wrap.querySelector(".fin-tip");
      const g = e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
      if (!tip) return;
      if (!g) { tip.classList.remove("on"); return; }
      tip.textContent = g.getAttribute("data-tip");
      tip.classList.add("on");
      const r = wrap.getBoundingClientRect();
      let x = e.clientX - r.left + 14;
      if (x + tip.offsetWidth > r.width) x = e.clientX - r.left - tip.offsetWidth - 14;
      tip.style.left = Math.max(0, x) + "px";
      tip.style.top = Math.max(0, e.clientY - r.top - tip.offsetHeight - 8) + "px";
    };
    wrap.addEventListener("pointermove", mover);
    wrap.addEventListener("pointerdown", mover);
    wrap.addEventListener("pointerleave", () => { const t = wrap.querySelector(".fin-tip"); if (t) t.classList.remove("on"); });
  }
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => { const w = Math.floor(wrap.clientWidth); if (w && Math.abs(w - ancho) > 8) paint(); }).observe(wrap);
  }
}
function ejeY(s, ticks, Y, L, W, R) {
  for (const v of ticks) {
    const y = Y(v).toFixed(1);
    s.push(`<line class="${v === 0 ? "base" : "grid"}" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/>`);
    s.push(`<text x="${L - 8}" y="${(+y + 4).toFixed(1)}" text-anchor="end">${esc(ejeFmt(v))}</text>`);
  }
}
function columnas(padre, { etiquetas, series, titulos, alto = 210 }) {
  chart(padre, (W) => {
    const H = alto, L = 46, R = 6, T = 10, B = 24;
    const todos = series.flatMap((s) => s.valores);
    const { lo, hi, ticks } = niceTicks(Math.min(0, ...todos), Math.max(0, ...todos));
    const Y = (v) => T + (hi - v) * (H - T - B) / (hi - lo);
    const n = etiquetas.length, gw = (W - L - R) / n, k = series.length;
    const bw = Math.max(3, Math.min(24, (gw * 0.72 - (k - 1) * 2) / k)), grupo = bw * k + (k - 1) * 2;
    const s = [`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">`];
    ejeY(s, ticks.filter((v) => v !== 0), Y, L, W, R);
    const cabe = Math.max(1, Math.floor((W - L - R) / 38)), paso = Math.ceil(n / cabe);
    etiquetas.forEach((et, i) => {
      const x0 = L + i * gw;
      const tip = (titulos ? titulos[i] : et) + "\n" + series.map((se) => `${k > 1 ? se.nombre + ": " : ""}${eur(se.valores[i])}`).join("\n");
      s.push(`<g class="col" data-tip="${esc(tip)}"><rect class="band" x="${x0.toFixed(1)}" y="${T}" width="${gw.toFixed(1)}" height="${H - T - B}" rx="4"/>`);
      series.forEach((se, j) => {
        const v = se.valores[i];
        if (!v) return;
        const x = x0 + (gw - grupo) / 2 + j * (bw + 2);
        s.push(`<path d="${barPath(x, Y(0), Y(v), bw)}" style="fill:${typeof se.color === "function" ? se.color(v) : se.color}"/>`);
      });
      s.push(`</g>`);
      if (i % paso === 0 || (i === n - 1 && n <= cabe)) s.push(`<text x="${(x0 + gw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(et)}</text>`);
    });
    const y0 = Y(0).toFixed(1);
    s.push(`<line class="base" x1="${L}" x2="${W - R}" y1="${y0}" y2="${y0}"/><text x="${L - 8}" y="${(+y0 + 4).toFixed(1)}" text-anchor="end">0</text>`);
    return s.join("") + "</svg>";
  });
}

// Anillo de progreso (sobre fondo de color): fracción usada, marca opcional (p. ej. el día del mes) y dos líneas en el centro.
function anillo(padre, { frac, marca, c1, c2, tam = 150 }) {
  const r = 58, C = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac || 0));
  const ang = (x) => (x * 360 - 90) * Math.PI / 180;
  const mk = marca != null ? `<line class="marca" x1="${75 + 49 * Math.cos(ang(marca))}" y1="${75 + 49 * Math.sin(ang(marca))}" x2="${75 + 67 * Math.cos(ang(marca))}" y2="${75 + 67 * Math.sin(ang(marca))}" stroke-width="3" stroke-linecap="round"/>` : "";
  const d = padre.createDiv({ cls: "anillo" });
  d.innerHTML = `<svg width="${tam}" height="${tam}" viewBox="0 0 150 150" role="img"><circle class="fondo" cx="75" cy="75" r="${r}" fill="none" stroke-width="13"/>`
    + `<circle class="arco" cx="75" cy="75" r="${r}" fill="none" stroke-width="13" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - f)).toFixed(1)}" transform="rotate(-90 75 75)"/>`
    + `${mk}<text class="c1" x="75" y="78" text-anchor="middle">${esc(c1)}</text><text class="c2" x="75" y="97" text-anchor="middle">${esc(c2 || "")}</text></svg>`;
  return d;
}
// Líneas sobre los días de un mes (gasto acumulado). series: [{ nombre, color, valores (null = sin dato), discontinua, area }].
// etiquetas: texto de cada punto para el tooltip; marcas: índices con etiqueta en el eje X.
function lineas(padre, { etiquetas, series, marcas, etiquetasX, alto = 200 }) {
  chart(padre, (W) => {
    const H = alto, L = 46, R = 10, T = 12, B = 24;
    const todos = series.flatMap((s) => s.valores.filter((v) => v != null));
    const { lo, hi, ticks } = niceTicks(0, Math.max(1, ...todos));
    const n = etiquetas.length;
    const X = (i) => L + (n > 1 ? i * (W - L - R) / (n - 1) : 0), Y = (v) => T + (hi - v) * (H - T - B) / (hi - lo);
    const s = [`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">`];
    ejeY(s, ticks.filter((v) => v !== 0), Y, L, W, R);
    s.push(`<line class="base" x1="${L}" x2="${W - R}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>`);
    for (const se of series) {
      const pts = se.valores.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean);
      if (pts.length < 2) continue;
      const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
      if (se.area) s.push(`<path d="${d}L${pts[pts.length - 1][0].toFixed(1)},${Y(0).toFixed(1)}L${pts[0][0].toFixed(1)},${Y(0).toFixed(1)}Z" style="fill:${se.color};opacity:.1"/>`);
      s.push(`<path d="${d}" style="fill:none;stroke:${se.color};stroke-width:${se.discontinua ? 1.6 : 2.6};stroke-linejoin:round;stroke-linecap:round${se.discontinua ? ";stroke-dasharray:5 5" : ""}"/>`);
      if (!se.discontinua) { const [x, y] = pts[pts.length - 1]; s.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" style="fill:${se.color};stroke:var(--surface);stroke-width:2.5"/>`); }
    }
    const gw = (W - L - R) / Math.max(1, n - 1);
    etiquetas.forEach((et, i) => {
      const tip = et + "\n" + series.filter((se) => se.valores[i] != null).map((se) => `${se.nombre}: ${eur(se.valores[i], 0)}`).join("\n");
      s.push(`<g class="col" data-tip="${esc(tip)}"><rect class="band" x="${(X(i) - gw / 2).toFixed(1)}" y="${T}" width="${gw.toFixed(1)}" height="${H - T - B}"/>`
        + `<line class="xh" x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${T}" y2="${H - B}"/></g>`);
    });
    for (const i of marcas || []) s.push(`<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(etiquetasX ? etiquetasX[i] : String(i + 1))}</text>`);
    return s.join("") + "</svg>";
  });
}
// Barras de los 7 días de una semana. dias: [{ etiqueta, valor, futuro, hoy }], meta: gasto por día de referencia.
function barrasSemana(padre, dias, meta) {
  const max = Math.max(meta || 0, ...dias.map((d) => d.valor), 1) * 1.1;
  const g = padre.createDiv({ cls: "fb-semana" });
  const alto = 150 - 40; // espacio para el importe y la letra del día
  for (const d of dias) {
    const c = g.createDiv({ cls: "d" + (d.futuro ? " fut" : "") + (d.hoy ? " hoy" : "") + (meta && d.valor > meta ? " alto" : "") });
    c.createDiv({ cls: "dv", text: d.valor > 0 ? eur(d.valor, 0) : "" });
    const b = c.createDiv({ cls: "b" }); b.style.height = `${Math.max(4, (d.valor / max) * alto)}px`;
    b.title = `${d.titulo || d.etiqueta}: ${eur(d.valor)}`;
    c.createDiv({ cls: "dl", text: d.etiqueta });
  }
  if (meta > 0) { const m = g.createDiv({ cls: "meta" }); m.style.bottom = `${22 + (meta / max) * alto}px`; m.createSpan({ text: `${eur(meta, 0)}/día` }); }
  return g;
}

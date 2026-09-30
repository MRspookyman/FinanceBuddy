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
function linea(padre, { puntos, color = "var(--fin-s1)", alto = 220 }) {
  chart(padre, (W) => {
    const H = alto, L = 50, T = 12, B = 24, n = puntos.length;
    const ultimo = ejeFmt(puntos[n - 1].y);
    const R = Math.max(14, ultimo.length * 7 + 14);
    const ys = puntos.map((p) => p.y);
    const { lo, hi, ticks } = niceTicks(Math.min(...ys), Math.max(...ys));
    const Y = (v) => T + (hi - v) * (H - T - B) / (hi - lo);
    const X = (i) => L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1));
    const s = [`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">`];
    ejeY(s, ticks, Y, L, W, R);
    const d = puntos.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join("");
    s.push(`<path d="${d}L${X(n - 1).toFixed(1)},${Y(lo).toFixed(1)}L${X(0).toFixed(1)},${Y(lo).toFixed(1)}Z" style="fill:${color};opacity:.1"/>`);
    s.push(`<path d="${d}" style="fill:none;stroke:${color};stroke-width:2;stroke-linejoin:round;stroke-linecap:round"/>`);
    puntos.forEach((p, i) => {
      const a = i === 0 ? L : (X(i - 1) + X(i)) / 2, b = i === n - 1 ? W - R : (X(i) + X(i + 1)) / 2;
      s.push(`<g class="col" data-tip="${esc(p.x + "\n" + eur(p.y))}"><rect class="band" x="${a.toFixed(1)}" y="${T}" width="${Math.max(1, b - a).toFixed(1)}" height="${H - T - B}"/>`
        + `<line class="xh" x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${T}" y2="${H - B}"/>`
        + `<circle class="hd" cx="${X(i).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="4.5" style="fill:${color}"/></g>`);
    });
    s.push(`<circle cx="${X(n - 1).toFixed(1)}" cy="${Y(puntos[n - 1].y).toFixed(1)}" r="4.5" style="fill:${color};stroke:var(--background-primary);stroke-width:2;pointer-events:none"/>`);
    s.push(`<text class="lab" x="${(X(n - 1) + 9).toFixed(1)}" y="${(Y(puntos[n - 1].y) + 4).toFixed(1)}">${esc(ultimo)}</text>`);
    const cabe = Math.max(2, Math.floor((W - L - R) / 78));
    const idx = n <= cabe ? puntos.map((_, i) => i) : [...new Set(Array.from({ length: cabe }, (_, j) => Math.round(j * (n - 1) / (cabe - 1))))];
    let previo = null;
    idx.forEach((i) => {
      if (puntos[i].x === previo) return;
      previo = puntos[i].x;
      s.push(`<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="${n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle"}">${esc(puntos[i].x)}</text>`);
    });
    return s.join("") + "</svg>";
  });
}

// Mapa de calor fila × mes. Intensidad relativa al máximo de cada fila (se ve la tendencia de cada categoría).
// filas: [{ nombre, valores[], onclick?(i) }]; meses: claves AAAA-MM; act: clave resaltada.
function mapaCalor(padre, { filas, meses, act, onclick }) {
  const wrap = padre.createDiv({ cls: "fin-tablewrap" });
  const g = wrap.createDiv({ cls: "fin-heat" });
  g.style.gridTemplateColumns = `minmax(110px,1.6fr) repeat(${meses.length}, minmax(44px,1fr)) minmax(62px,1.1fr)`;
  g.createDiv({ cls: "h" });
  meses.forEach((k) => g.createDiv({ cls: "h" + (k === act ? " act" : ""), text: mesCorto(k) }));
  g.createDiv({ cls: "h num", text: "Total" });
  for (const f of filas) {
    const max = Math.max(0, ...f.valores);
    g.createDiv({ cls: "c nom", text: f.nombre });
    f.valores.forEach((v, i) => {
      v = Math.round(v * 100) / 100; // un mes con reembolsos puede quedar en ±0,00 o negativo
      const c = g.createDiv({ cls: "c" + (meses[i] === act ? " act" : "") + (v ? " has" : "") + (onclick && v ? " click" : ""), text: v ? compact(v).replace("+", "") : "·" });
      if (v) {
        c.style.background = `color-mix(in srgb, var(--fin-s1) ${Math.round(10 + 55 * Math.max(0, v) / (max || 1))}%, var(--background-secondary))`;
        c.title = `${f.nombre} · ${mesLbl(meses[i]).toLowerCase()}: ${eur(v)}`;
        if (onclick) c.onclick = () => onclick(f, i);
      }
    });
    g.createDiv({ cls: "c num", text: eur(sum(f.valores), 0) });
  }
}

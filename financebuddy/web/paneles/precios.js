// ═════════════ precios por internet (opcional) ═════════════
// Apagado de serie. Si lo activas, la app consulta a Yahoo Finance, Morningstar o CoinGecko lo que vale cada activo que tenga
// fuente (solo sale el ISIN, el ticker o el nombre de la cripto: nunca importes ni cuentas). Aquí viven el panel de Ajustes, el
// buscador del formulario de un activo, la nota bajo la tabla de Inversión y el comparador «¿y si lo hubieras metido en un
// indexado?» de «Tu progreso». El cálculo está en precios.py; el valor de mercado entra en valorInfo() (calculos.js).
const FUENTES_PRECIO = { yahoo: "Yahoo Finance", morningstar: "Morningstar", coingecko: "CoinGecko" };
const MONEDAS_PRECIO = [["EUR", "Euro (EUR)"], ["USD", "Dólar (USD)"], ["GBP", "Libra (GBP)"], ["GBp", "Peniques (GBp: lo que dan las bolsas de Londres)"], ["CHF", "Franco suizo (CHF)"],
  ["JPY", "Yen (JPY)"], ["CAD", "Dólar canadiense (CAD)"], ["SEK", "Corona sueca (SEK)"], ["NOK", "Corona noruega (NOK)"], ["DKK", "Corona danesa (DKK)"]];
const fechaHora = (iso) => (iso ? DateTime.fromISO(iso).toFormat("dd/MM/yyyy HH:mm") : "");

// ───────────── el estado y el aviso único ─────────────
// Todo lo que ha pasado en una actualización, en UNA frase; los detalles de lo que falló, plegados.
function resultadoPrecios(padre) {
  const r = (cfg.precios || {}).resultado;
  if (!r) return;
  const n = (r.fallos || []).length, ok = r.actualizados || 0;
  const txtOk = `${ok} precio${ok === 1 ? "" : "s"} al día`;
  padre.createDiv({ cls: "fin-note", text: `Última actualización ${fechaHora(r.hora)}: ${txtOk}${n ? ` · ${n} no se ${n === 1 ? "ha" : "han"} podido actualizar` : ""}.` });
  if (!n) return;
  plegable(padre, `Ver qué ha fallado (${n})`, (c) => {
    for (const f of r.fallos) c.createDiv({ cls: "fin-note", text: `${f.que}: ${f.motivo}` });
    c.createDiv({ cls: "fin-note", text: "Mientras no se pueda, la app sigue con el último precio que tenía guardado. Pasa a veces con los servicios gratuitos: vuelve a probar más tarde o revisa el código del precio en el activo." });
  });
}
// Nota bajo la tabla de «Tus activos»: de cuándo son los precios y un botón para ponerlos al día.
function notaPrecios(padre) {
  const n = padre.createDiv({ cls: "fin-note" });
  n.appendText(`Precio de mercado de internet (${[...new Set(Object.values(cfg.precios.activos || {}).map((x) => FUENTES_PRECIO[x.fuente]).filter(Boolean))].join(", ")}), actualizado ${fechaHora(cfg.precios.ultima) || "nunca"}. `);
  const b = n.createEl("button", { cls: "fin-link", text: "Actualizar ahora" });
  b.onclick = () => FB.actualizarPrecios({ boton: b });
  const r = (cfg.precios || {}).resultado;
  if (r && (r.fallos || []).length) n.appendText(` · ${r.fallos.length} sin actualizar (Ajustes → Precios por internet).`);
}

// ───────────── Ajustes ─────────────
function panelPrecios(padre) {
  const C = cfg.precios || {};
  const p = panel(padre, "Precios por internet (opcional)", { text: C.activo ? "activado" : "apagado" },
    "En vez de anotar a mano lo que vale cada fondo, ETF o cripto, la app lo consulta. Apagado de serie: sin esto, FinanceBuddy no sale a internet.");
  p.id = "precios";
  p.createDiv({ cls: "fin-note", text: "Qué sale de tu ordenador: solo el identificador del producto (su ISIN, su ticker —p. ej. IWDA.AS— o el nombre de la cripto —bitcoin—). Nunca importes, cuentas, movimientos, participaciones ni tu nombre. Las consultas van directas a Yahoo Finance, Morningstar y CoinGecko, sin pasar por nadie más." });
  p.createDiv({ cls: "fin-note", text: "Son servicios gratuitos que no tienen un acuerdo con esta app: pueden fallar o cambiar sin aviso. Si falla, se sigue con el último precio guardado y lo anotado a mano. Los precios se guardan en tu carpeta de datos." });
  const o = p.createDiv({ cls: "fb-fila fb-opciones" });
  const l = o.createEl("label"); const c = l.createEl("input", { attr: { type: "checkbox" } }); c.checked = !!C.activo; l.appendText(" Activar los precios por internet");
  c.onchange = async () => {
    const r = await FB.api("/api/precios/config", { activo: c.checked });
    if (!r.ok) { FB.aviso(r.mensaje || "Error", true); return; }
    FB.aviso(c.checked ? "Activado: elige de dónde sale el precio de cada activo" : "Apagado: la app no vuelve a conectarse"); await FB.refrescar();
  };
  if (!C.activo) return;
  const A = registros("activo").filter((a) => a.estado !== "vendido");
  const con = A.filter((a) => a.fuente_precio), sin = A.filter((a) => !a.fuente_precio);
  const f = p.createDiv({ cls: "fb-fila" });
  const bAct = f.createEl("button", { cls: "fb-btn", text: C.en_marcha ? "Actualizando…" : "Actualizar ahora" });
  bAct.disabled = !con.length || !!C.en_marcha;
  bAct.onclick = () => FB.actualizarPrecios({ boton: bAct });
  const sinIsin = sin.filter((a) => /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(String(a.isin || "").toUpperCase()));
  if (sinIsin.length) {
    const bAuto = f.createEl("button", { cls: "fb-btn sec", text: `Buscar el precio de ${sinIsin.length} con ISIN` });
    bAuto.onclick = async () => {
      bAuto.disabled = true; bAuto.textContent = "Buscando…";
      const r = await FB.api("/api/precios/autoconfigurar", {});
      if (!r.ok) { FB.aviso(r.mensaje || "No se ha podido", true); bAuto.disabled = false; return; }
      const falta = (r.sin_resultado || []).length;
      FB.aviso(`${r.configurados.length} configurado${r.configurados.length === 1 ? "" : "s"}${falta ? ` · ${falta} sin resultado (búscalo a mano en el activo)` : ""}`, !!falta && !r.configurados.length);
      await FB.refrescar();
      if (r.configurados.length) FB.actualizarPrecios({ boton: null });
    };
  }
  p.createDiv({ cls: "fin-note", text: `${con.length} de ${A.length} activos con precio${C.viejo ? " · hace más de 6 horas de la última actualización" : ""}.` });
  resultadoPrecios(p);
  if (sin.length) plegable(p, `Activos sin precio por internet (${sin.length})`, (cc) => {
    cc.createDiv({ cls: "fin-note", text: "Abre cada uno y usa «Buscar precio» (por ISIN, ticker o nombre). Los que no tienen fuente se siguen anotando a mano en Inversión → Actualizar valores." });
    for (const a of sin) enlace(cc.createDiv({ cls: "fin-note" }), a.nombre, `#editar/activo/${a.id}`);
  });
}

// ───────────── buscador, dentro del formulario de un activo ─────────────
function buscadorPrecio(form, d, dibujar) {
  const caja = form.createDiv({ cls: "fb-buscador" });
  caja.createDiv({ cls: "et", text: "Buscar el precio por internet" });
  const fila = caja.createDiv({ cls: "fb-fila" });
  const i = fila.createEl("input", { attr: { type: "text", placeholder: "ISIN, ticker o nombre (p. ej. IE00B4L5Y983, IWDA.AS, bitcoin)", "aria-label": "Buscar el precio" } });
  i.value = (FB.estado.busquedaPrecio || {}).texto ?? (d.isin || "");
  const b = fila.createEl("button", { cls: "fb-btn sec", text: "Buscar", attr: { type: "button" } });
  const sal = caja.createDiv();
  const pintar = (cands, texto) => {
    sal.empty();
    if (!cands.length) { sal.createDiv({ cls: "fin-note", text: `Nada con precio para «${texto}». Prueba con el ISIN, el ticker de Yahoo (IWDA.AS, AAPL, GC=F) o el nombre de la cripto en inglés.` }); return; }
    sal.createDiv({ cls: "fin-note", text: "Los primeros son los más probables. Cada uno tiene su precio comprobado ahora mismo." });
    for (const c of cands) {
      const t = sal.createDiv({ cls: "fb-candidato" });
      const cab = t.createDiv({ cls: "c" });
      cab.createEl("b", { text: c.nombre || c.codigo });
      cab.createSpan({ cls: "s", text: ` ${c.codigo} · ${FUENTES_PRECIO[c.fuente] || c.fuente}${c.mercado && c.fuente === "yahoo" ? " · " + c.mercado : ""}` });
      const f = c.ficha || {}, datos = [`${nf(c.precio, 2, 4)} ${c.moneda} el ${fechaCorta(c.fecha)}`, f.ter != null ? `TER ${nf(f.ter, 2, 2)} %` : "", f.riesgo ? `riesgo ${f.riesgo}/7` : "", f.categoria || "", f.gestora || ""].filter(Boolean);
      t.createDiv({ cls: "s", text: datos.join(" · ") });
      const u = t.createEl("button", { cls: "fb-btn sec", text: d.codigo_precio === c.codigo && d.fuente_precio === c.fuente ? "En uso ✓" : "Usar este", attr: { type: "button" } });
      u.onclick = () => {
        d.fuente_precio = c.fuente; d.codigo_precio = c.codigo; d.moneda = c.moneda || "EUR";
        if (!d.isin && /^[A-Za-z]{2}[A-Za-z0-9]{9}\d$/.test(texto)) d.isin = texto.toUpperCase();
        if (!hasNum(d.ter) && f.ter != null) d.ter = f.ter;
        if (!d.id && (d.clase || "fondo") === "fondo" && c.tipo && ["etf", "accion", "cripto", "materia"].includes(c.tipo)) d.clase = c.tipo;
        FB.estado.busquedaPrecio = { texto, cands };
        dibujar();
      };
    }
  };
  const buscar = async () => {
    const texto = i.value.trim();
    if (texto.length < 2) return;
    b.disabled = true; sal.empty(); sal.createDiv({ cls: "fin-note", text: "Buscando…" });
    const r = await FB.api("/api/precios/buscar", { texto });
    b.disabled = false;
    if (!r.ok) { sal.empty(); mensaje(sal, r.mensaje || "No se ha podido buscar", "err"); return; }
    FB.estado.busquedaPrecio = { texto, cands: r.candidatos };
    pintar(r.candidatos, texto);
  };
  b.onclick = buscar;
  i.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } };
  const previa = FB.estado.busquedaPrecio;
  if (previa && previa.cands) pintar(previa.cands, previa.texto);
}

// ───────────── comparador: ¿y si lo hubieras metido en un indexado? ─────────────
const CARTERAS_REF = [["mundo", "MSCI World"], ["sp500", "S&P 500"], ["6040", "Cartera 60/40"], ["sinriesgo", "Sin riesgo"]];
function panelComparador(p, I) {
  if (!preciosActivos()) {
    p.createDiv({ cls: "fin-note", text: "Compara tus compras y ventas, en sus mismas fechas, con haberlo metido todo en un ETF del MSCI World, del S&P 500, en una cartera 60/40 o en dinero sin riesgo. Necesita los precios de esos ETF: se consultan por internet solo si lo activas (apagado de serie)." });
    enlace(p.createDiv({ cls: "fin-note" }), "Activar los precios por internet →", "#ajustes/precios");
    return;
  }
  const S = (FB.estado.cmp = FB.estado.cmp || { ref: "mundo", res: {} });
  const seg = p.createDiv({ cls: "fb-chips" });
  const cuerpo = p.createDiv();
  const botones = {};
  const mostrar = async (ref) => {
    S.ref = ref;
    for (const [k, b] of Object.entries(botones)) b.className = k === ref ? "act" : "";
    cuerpo.empty();
    if (!S.res[ref]) {
      cuerpo.createDiv({ cls: "fin-note", text: "Calculando con los precios de internet…" });
      S.res[ref] = await FB.api("/api/precios/comparar", { ref });
      if (S.ref !== ref) return;
      cuerpo.empty();
    }
    pintarComparacion(cuerpo, S.res[ref], I);
  };
  for (const [k, t] of CARTERAS_REF) { botones[k] = seg.createEl("button", { text: t }); botones[k].onclick = () => mostrar(k); }
  mostrar(S.ref);
}
function pintarComparacion(c, R, I) {
  if (!R.ok) { mensaje(c, R.mensaje || "No se ha podido comparar", "err"); return; }
  const EV = evolucionInversion(false);
  const mio = EV ? EV.valor[EV.valor.length - 1] : I.total;
  const dif = mio - R.hoy;
  tiles(c, [
    { l: "Tu inversión hoy", v: eur(mio, 0), s: `${eur(R.puesto, 0)} metidos` },
    { l: `En ${R.nombre} valdría`, v: eur(R.hoy, 0), s: `con tus mismas compras y fechas` },
    { l: dif >= 0 ? "Vas por delante" : "Vas por detrás", v: eurS(dif, 0), t: tone(dif), s: R.hoy > 0 ? `${pct(Math.abs(dif) / R.hoy)} sobre ${R.nombre}` : "" },
    isFinite(I.tir) ? { l: "Tu rentabilidad anual", v: pct(I.tir, true), t: tone(I.tir), s: R.tir != null ? `${R.nombre}: ${pct(R.tir, true)} (TIR)` : "TIR" } : null,
  ]);
  const n = Math.min(R.meses.length, 36), desde = R.meses.length - n;
  const keys = R.meses.slice(desde);
  const idx = EV ? new Map(EV.keys.map((k, i) => [k, EV.valor[i]])) : new Map();
  const series = [
    { nombre: "Tu inversión", color: "var(--brand)", valores: keys.map((k, i) => (i === keys.length - 1 ? mio : idx.get(k) ?? null)), area: true },
    { nombre: R.nombre, color: "var(--fin-s3)", valores: R.valor.slice(desde) },
    { nombre: "Lo metido", color: "var(--ink-3)", valores: R.aportado.slice(desde), discontinua: true },
  ];
  const paso = Math.max(1, Math.ceil(keys.length / 6));
  lineas(c, { etiquetas: keys.map(mesLbl), etiquetasX: keys.map(mesCorto), series, marcas: keys.map((_, i) => i).filter((i) => i % paso === (keys.length - 1) % paso), alto: 200 });
  leyenda(c, series.map((s) => [s.nombre, s.color, s.discontinua ? "rayas" : "continua"]));
  c.createDiv({ cls: "fin-note", text: R.detalle + ` Precios hasta el ${fechaCorta(R.fecha)}. Tu línea solo tiene los meses en que anotaste los valores, más hoy.` });
  c.createDiv({ cls: "fin-note", text: "Sin impuestos, comisiones del bróker ni diferencias de divisa entre ETF; un ETF de acumulación reinvierte los dividendos. Orientativo: lo que habría pasado no dice lo que pasará." });
  for (const a of R.avisos || []) c.createDiv({ cls: "fin-note", text: "⚠ " + a });
}

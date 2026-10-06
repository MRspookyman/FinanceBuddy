// ───────────── fijos detectados y de dónde viene el dinero ─────────────
const GRUPO_TXT = { ingreso: "ingreso", fijo: "gasto fijo", variable: "gasto variable" };
function vistaFijos() {
  titulo("Tus fijos y de dónde viene tu dinero", "Lo que la app deduce de tus movimientos importados");
  const cont = root.createDiv();
  cont.createDiv({ cls: "fin-note", text: "Analizando tus movimientos…" });
  FB.api("/api/detectar", {}).then((r) => pintarFijos(cont, r));
}
function pintarFijos(cont, r) {
  cont.innerHTML = "";
  if (!r.ok) { mensaje(cont, r.mensaje || "Error", "err"); return; }
  const p1 = panel(cont, "Ingresos y gastos que se repiten cada mes", null, "Mismo pagador o comercio, al menos dos meses seguidos, una vez al mes y con importe y día parecidos.");
  if (!r.fijos.length) {
    vacio(p1, "No hay nada nuevo que se repita cada mes", " Hacen falta al menos dos meses de movimientos importados. Lo que ya tienes como fijo no se vuelve a proponer.");
  } else {
    p1.createDiv({ cls: "fin-note", text: "Revisa el nombre, la categoría y el importe, desmarca lo que no sea fijo y pulsa «Crear». Se usarán para la previsión y los próximos se reconocerán solos al importar." });
    // En una categoría de gasto variable, Jev (si está activado) dice si parece una cuota fija o algo que coincide
    const pareceFijo = (f) => f.jev_fijo != null && num(f.jev_fijo) >= 0.75;
    const sel = r.fijos.map((f) => ({ ...f, marcado: f.grupo !== "variable" || pareceFijo(f) }));
    for (const f of sel) {
      const card = p1.createDiv({ cls: "fb-card" });
      const top = card.createDiv({ cls: "top" });
      const jv = f.jev_fijo == null ? "" : pareceFijo(f) ? ` · ✨ Jev: parece una cuota (${Math.round(100 * f.jev_fijo)} %)` : num(f.jev_fijo) < 0.35 ? " · ✨ Jev: parece que solo coincide" : "";
      top.createSpan({ text: (f.clase === "ingreso" ? "Ingreso que se repite" : f.grupo === "variable" ? "Se repite, pero es gasto variable (¿fijo?)" : "Gasto fijo") + jv });
      top.createSpan({ cls: "imp " + (f.clase === "ingreso" ? "pos" : "neg"), text: eurS(f.clase === "ingreso" ? f.importe : -f.importe) });
      card.createDiv({ cls: "txt", text: `«${f.ejemplo}» · ${f.meses} meses: ${f.importes.map((x) => eur(x)).join(" · ")}` });
      const fila = card.createDiv({ cls: "fb-fila" });
      const l = fila.createEl("label"); const c = l.createEl("input", { attr: { type: "checkbox" } }); c.checked = f.marcado; l.appendText("Es fijo");
      const iN = fila.createEl("input", { attr: { type: "text", placeholder: "Nombre" } }); iN.value = f.nombre; iN.oninput = () => (f.nombre = iN.value);
      const sC = fila.createEl("select"); for (const [v, t] of catSegunClase(f)) { const o = sC.createEl("option", { text: t }); o.value = v; }
      sC.value = f.categoria; sC.onchange = () => (f.categoria = sC.value);
      const iI = fila.createEl("input", { cls: "corto", attr: { type: "number", step: "0.01" } }); iI.value = f.importe; iI.oninput = () => (f.importe = iI.value);
      fila.appendText("día");
      const iD = fila.createEl("input", { cls: "mini", attr: { type: "number", min: "1", max: "31" } }); iD.value = f.dia; iD.oninput = () => (f.dia = iD.value);
      c.onchange = () => { f.marcado = c.checked; card.style.opacity = c.checked ? "" : ".55"; };
      c.onchange();
    }
    const res = p1.createDiv();
    const b = p1.createEl("button", { cls: "fb-btn", text: "Crear los marcados" });
    b.onclick = async () => {
      const lista = sel.filter((f) => f.marcado);
      if (!lista.length) return;
      b.disabled = true;
      const x = await FB.api("/api/fijos", { fijos: lista });
      b.disabled = false;
      if (!x.ok) { res.innerHTML = ""; mensaje(res, x.mensaje || "Error", "err"); return; }
      FB.aviso(x.mensaje);
      await FB.refrescar();
    };
  }
  enlace(p1.createDiv({ cls: "fin-note" }), "Ver todos tus recurrentes →", "#gestionar/recurrente");

  const p2 = panel(cont, "De dónde viene tu dinero", null, "Tus ingresos, lo que te devuelven y lo que entra desde tus otras cuentas, agrupado por quién lo paga. «Al mes» es la media de los meses con movimientos.");
  if (!r.origenes.length) { vacio(p2, "Aún no hay ingresos importados"); return; }
  const porTipo = {};
  for (const o of r.origenes) porTipo[o.tipo] = (porTipo[o.tipo] || 0) + o.media_mes;
  filasDato(p2, Object.entries(porTipo).sort((a, b) => b[1] - a[1]).map(([t, v]) => ({ l: t, v: `${eur(v, 0)} al mes` })));
  const cols = [{ t: "Origen" }, { t: "Qué es" }, { t: "Veces", num: true, opt: true }, { t: "Al mes", num: true }, { t: "Total", num: true, opt: true }];
  const fila = (o) => [{ text: o.origen, badge: o.fijo ? "fijo" : "" }, o.categoria ? `${o.tipo} · ${o.categoria}` : o.tipo, String(o.veces), eur(o.media_mes, 0), eur(o.total, 0)];
  const VISIBLES = 8;
  tabla(p2, cols, r.origenes.slice(0, VISIBLES).map(fila));
  if (r.origenes.length > VISIBLES) plegable(p2, "Ver el resto", (c) => tabla(c, cols, r.origenes.slice(VISIBLES).map(fila)), { extra: `${r.origenes.length - VISIBLES}` });
}

// ───────────── revisar tus categorías con Jev ─────────────
// Jev repasa lo ya clasificado (un comercio cada vez) y propone otra categoría si está en «Otros» o si está muy seguro
// de que es otra. Nada cambia hasta que lo aceptas; lo que aceptas se aplica a todo ese comercio y queda como regla.
function vistaRevision() {
  titulo("Revisar tus categorías", "El asistente Jev repasa lo que ya tienes clasificado y te avisa de lo que parece estar en otra categoría");
  const J = (DB.config || {}).jev || {}, R = J.revision || {};
  if (!J.activo) {
    const v = vacio(root, "El asistente Jev no está activado", " Sin él, la app no puede repasar tus categorías.");
    enlace(v || root, "Activar el asistente Jev →", "#ajustes/jev");
    return;
  }
  const p = panel(root, "Repasar", R.fecha ? { text: `último: ${DateTime.fromISO(R.fecha).toFormat("dd/MM")}` } : null,
    "Un comercio cada vez, empezando por los que más se repiten. Lo ya repasado no se vuelve a preguntar (salvo que le cambies la categoría).");
  const f = p.createDiv({ cls: "fb-fila" });
  const b = f.createEl("button", { cls: "fb-btn" + (R.fecha ? " sec" : ""), text: R.fecha ? "✨ Repasar lo nuevo" : "✨ Repasar mis categorías" });
  f.createSpan({ cls: "fin-note", text: R.preguntados ? `${R.preguntados} comercios repasados hasta ahora · hasta 150 cada vez` : "Hasta 150 comercios cada vez: tarda unos segundos" });
  b.onclick = async () => {
    b.disabled = true; b.textContent = "Jev está repasando…";
    const r = await FB.api("/api/jev/auditar", {});
    FB.aviso(r.mensaje || (r.ok ? "Hecho" : "Error"), !r.ok);
    await FB.refrescar();
  };
  const H = R.hallazgos || [];
  const pH = panel(root, "Para revisar", H.length ? { text: String(H.length) } : null);
  if (!H.length) { vacio(pH, R.fecha ? "Todo en orden" : "Aún no se ha repasado nada", R.fecha ? " Jev no ve nada en otra categoría." : ""); return; }
  pH.createDiv({ cls: "fin-note", text: "«Cambiar» pone la categoría que propone Jev a todos los movimientos de ese comercio y la recuerda para los próximos. «Está bien» lo deja como está." });
  const resolver = async (h, accion) => {
    const r = await FB.api("/api/jev/hallazgo", { clave: h.clave, accion });
    if (!r.ok) { FB.aviso(r.mensaje || "Error", true); return false; }
    return r.mensaje;
  };
  const seguros = H.filter((h) => num(h.confianza) >= JEV_SEGURA);
  if (seguros.length > 1) {
    const bT = pH.createDiv({ cls: "fb-fila" }).createEl("button", { cls: "fb-btn sec", text: `Cambiar los ${seguros.length} en los que Jev está seguro (≥ ${Math.round(100 * JEV_SEGURA)} %)` });
    bT.onclick = async () => {
      if (!confirm(`¿Cambiar la categoría de ${seguros.length} comercios (${sum(seguros.map((h) => h.n))} movimientos)?`)) return;
      bT.disabled = true;
      let n = 0;
      for (const h of seguros) if (await resolver(h, "aplicar")) n++;
      FB.aviso(`${n} comercios cambiados ✓`);
      await FB.refrescar();
    };
  }
  const cont = pH.createDiv({ cls: "fb-grupos" });
  for (const h of H) {
    const card = cont.createDiv({ cls: "fb-grupo" });
    const cab = card.createDiv({ cls: "cab" });
    avatar(cab, { cat: h.actual });
    const t = cab.createDiv({ cls: "n" });
    t.createDiv({ cls: "t", text: h.nombre });
    t.createDiv({ cls: "s", text: `${h.n} movimiento${h.n > 1 ? "s" : ""} · ahora en ${h.actual} · Jev: ${h.propuesta} (${Math.round(100 * h.confianza)} %)` });
    cab.createDiv({ cls: "v" + (h.ingreso ? " pos" : ""), text: eur(h.total) });
    if (norm(h.ejemplo).trim() !== norm(h.nombre).trim()) { const ext = card.createDiv({ cls: "ext", text: h.ejemplo }); ext.title = h.ejemplo; }
    const chips = card.createDiv({ cls: "fb-cats" });
    const bA = chips.createEl("button", { cls: "sug", text: `✨ Cambiar a ${catIcono(h.propuesta)} ${h.propuesta}` });
    const bD = chips.createEl("button", { text: `Está bien en ${h.actual}` });
    const hacer = async (accion, btn) => {
      bA.disabled = bD.disabled = true; btn.textContent = "…";
      const m = await resolver(h, accion);
      if (m) { FB.aviso(m); await FB.refrescar(); } else bA.disabled = bD.disabled = false;
    };
    bA.onclick = () => hacer("aplicar", bA);
    bD.onclick = () => hacer("descartar", bD);
    enlace(chips, "Otra categoría…", `#editar/movimiento/${h.id}`);
  }
}


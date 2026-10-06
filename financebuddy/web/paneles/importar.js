// ───────────── importar ─────────────
// Resultados de la última importación: se guardan en FB.estado para que sigan ahí al refrescar la pantalla.
let resultadosImport = FB.estado.imp || [];
const guardarImport = (lista) => { resultadosImport = FB.estado.imp = lista; };
function vistaImportar() {
  titulo("Importar", "Los movimientos de tu banco y de tu bróker");
  const g = rejilla();
  const pS = panel(g, "Sube un archivo");
  const tipoSel = pS.createDiv({ cls: "fb-fila" });
  let tipo = "";
  const radios = [["", "Detectar solo"], ["banco", "Extracto del banco"], ["inversion", "Movimientos del bróker"]].map(([v, t]) => {
    const l = tipoSel.createEl("label"); const r = l.createEl("input", { attr: { type: "radio", name: "tipoimp" } }); r.checked = v === tipo; r.onchange = () => (tipo = v); l.appendText(t); return r;
  });
  const fp = pS.createDiv({ cls: "fb-fila" });
  const lp = fp.createEl("label"); const cp = lp.createEl("input", { attr: { type: "checkbox" } }); cp.checked = quierePrevia(); cp.onchange = () => guardarPrevia(cp.checked);
  lp.appendText("Ver antes de importar (no se guarda nada hasta que lo confirmes)");
  const zona = pS.createDiv({ cls: "fb-zona", text: "Arrastra aquí el Excel o CSV, o pulsa para elegirlo" });
  const inp = pS.createEl("input", { attr: { type: "file", accept: ".xlsx,.xls,.csv,.txt", multiple: "" } }); inp.style.display = "none";
  zona.onclick = () => inp.click();
  const subir = async (files) => {
    for (const f of files) {
      zona.textContent = `Importando ${f.name}…`;
      const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.readAsDataURL(f); });
      const r = await FB.api("/api/importar/subir", { nombre: f.name, tipo: tipo || null, contenido: b64, previa: quierePrevia() });
      guardarImport([r, ...resultadosImport]);
    }
    await FB.refrescar();
  };
  inp.onchange = () => subir([...inp.files]);
  if (FB.soltados) { const f = FB.soltados; FB.soltados = null; subir(f); }  // archivo soltado en otra pantalla
  zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("sobre"); });
  zona.addEventListener("dragleave", () => zona.classList.remove("sobre"));
  zona.addEventListener("drop", (e) => { e.preventDefault(); zona.classList.remove("sobre"); subir([...e.dataTransfer.files]); });

  const pC = panel(g, "O déjalo en la carpeta Importar");
  pC.createDiv({ cls: "fin-note", text: "Guarda los extractos en «Importar\\Banco» o «Importar\\Inversión» (dentro de tu carpeta de datos) y pulsa el botón. Los archivos importados pasan a «Procesados»." });
  const arch = (DB.info || {}).archivos || [];
  if (arch.length) filasDato(pC, arch.map((a) => ({ l: a.nombre, s: a.tipo === "banco" ? "banco" : a.tipo === "inversion" ? "bróker" : "se detectará el tipo", v: "" })));
  const fb = pC.createDiv({ cls: "fb-fila" });
  const bI = fb.createEl("button", { cls: "fb-btn", text: arch.length ? `Importar ${arch.length} archivo${arch.length > 1 ? "s" : ""}` : "Importar la carpeta" });
  bI.onclick = async () => { bI.disabled = true; bI.textContent = "Importando…"; const r = await FB.api("/api/importar/carpeta", { previa: quierePrevia() }); guardarImport([...(r.resultados || [r]), ...resultadosImport]); await FB.refrescar(); };
  const bA = fb.createEl("button", { cls: "fb-btn sec", text: "Abrir la carpeta" });
  bA.onclick = () => FB.api("/api/abrir_carpeta", {});

  const pP = panel(g, "¿Sin extracto? Usa la plantilla");
  pP.createDiv({ cls: "fin-note", text: "Una hoja de Excel con fecha, concepto, importe y un desplegable con tus categorías: para pasar movimientos de otro sitio o de una cuenta sin extracto. La categoría que elijas es la que se usa." });
  const bP = pP.createEl("button", { cls: "fb-btn sec", text: "Descargar la plantilla de Excel" }); bP.onclick = descargarPlantilla;
  if (resultadosImport.length) {
    const pR = panel(root, "Resultado");
    for (const r of resultadosImport) resultadoImport(pR, r);
  }
  plegable(root, "¿Cómo descargo el extracto?", (c) => {
    filasDato(c, [
      { l: "Banco", s: "En la web o la app de tu banco: Cuentas → Movimientos → elige las fechas → Descargar / Exportar en Excel (o CSV). Mejor si incluye la columna de saldo: así la app comprueba que no falta nada.", v: "" },
      { l: "Bróker", s: "Busca los movimientos de la cuenta de efectivo (compras, ventas, intereses) y expórtalos en Excel o CSV.", v: "" },
      { l: "Órdenes de fondos", s: "En MyInvestor, Fondos → Órdenes → descargar (CSV). Añade las participaciones de cada compra y los traspasos entre fondos, que no salen en la cuenta de efectivo. Lo que ya estaba no se duplica.", v: "" },
      { l: "Operaciones con títulos", s: "Un Excel con Fecha, Tipo (Compra/Venta), Activo, Estado y Títulos: pone las participaciones a las compras de ETF y cripto del extracto de la cuenta.", v: "" },
      { l: "La primera vez", s: "Si la app no conoce el formato, te pedirá qué columna es la fecha, el concepto y el importe. Solo una vez por banco.", v: "" },
      { l: "Repetir no pasa nada", s: "Si importas dos veces el mismo periodo, lo ya importado se reconoce y se omite.", v: "" },
    ]);
  }, { extra: "ayuda" });
}
// ¿Se enseña antes lo que se va a importar? (se recuerda en este navegador; sí de serie)
const quierePrevia = () => { try { return localStorage.getItem("fb-previa") !== "0"; } catch (_) { return true; } };
const guardarPrevia = (v) => { try { localStorage.setItem("fb-previa", v ? "1" : "0"); } catch (_) {} };
// Vista previa: lo que pasaría al importar (el mismo código, en una simulación que se deshace) con totales para comparar con tu banco.
function tarjetaPrevia(card, r) {
  const V = r.previa, M = V.movimientos, A = V.aportaciones;
  card.classList.add("fb-previa");
  card.createDiv({ cls: "top", text: `${r.archivo}: así quedaría (aún no se ha guardado nada)` });
  const t = [];
  if (M.n) t.push({ l: "Movimientos nuevos", v: String(M.n), s: V.desde ? `del ${fechaCorta(V.desde)} al ${fechaCorta(V.hasta)}` : "" }, { l: "Entra", v: eur(M.ingresos, 2), t: "pos" }, { l: "Sale", v: eur(M.gastos, 2), s: M.traspasos ? `+ ${M.traspasos} traspaso${M.traspasos > 1 ? "s" : ""}` : "" });
  if (A.n) t.push({ l: "Compras y ventas", v: String(A.n), s: `compras ${eur(A.compras, 0)}${A.ventas ? ` · ventas ${eur(A.ventas, 0)}` : ""}` });
  if (V.saldo_final) t.push({ l: "Saldo del extracto", v: eur(V.saldo_final.saldo, 2), s: `a ${fechaCorta(V.saldo_final.fecha)}: compáralo con tu banco` });
  if (V.sugeridos) t.push({ l: "Con categoría sugerida", v: String(V.sugeridos), s: "se guardan ya, por confirmar" });
  t.push({ l: "Ya estaban", v: String(V.existentes), s: "se omiten, no se duplican" }, { l: "Por revisar", v: String(V.dudas.n), t: V.dudas.n ? "neg" : "" });
  tiles(card, t);
  if (V.activos_nuevos.length) card.createDiv({ cls: "fin-note", text: `Se crearían los activos: ${V.activos_nuevos.join(", ")}.` });
  if (V.categorias.length) card.createDiv({ cls: "fin-note", text: "Más gasto: " + V.categorias.map((c) => `${c.categoria} ${eur(c.total, 0)}`).join(" · ") });
  if (V.muestra.length) plegable(card, `Ver los últimos ${V.muestra.length} movimientos`, (c) => tabla(c, [{ t: "Fecha" }, { t: "Concepto" }, { t: "Categoría", opt: true }, { t: "Importe", num: true }],
    V.muestra.map((m) => [fechaCorta(m.fecha), m.concepto, m.clase === "transferencia" ? "Entre tus cuentas" : { text: m.categoria, badge: m.sugerido ? "por confirmar" : "" }, { text: eurS(m.importe), cls: m.importe < 0 ? "neg" : "" }])));
  if (V.dudas.n) plegable(card, `Lo que quedaría por revisar (${V.dudas.n})`, (c) => tabla(c, [{ t: "Fecha" }, { t: "Texto del extracto" }, { t: "Importe", num: true }],
    V.dudas.muestra.map((m) => [fechaCorta(m.fecha), m.texto, eurS(m.importe)])));
  const f = card.createDiv({ cls: "fb-fila" });
  const bOk = f.createEl("button", { cls: "fb-btn", text: "Importar ahora" });
  bOk.onclick = async () => {
    bOk.disabled = true;
    const x = await FB.api("/api/importar/reintentar", { ...(r.peticion || { archivo: r.archivo, tipo: r.tipo, cuenta: r.cuenta, perfil: r.perfil }), previa: false });
    reemplazar(r, x);
  };
  const bNo = f.createEl("button", { cls: "fb-btn sec", text: r.subido ? "No importar (descartar el archivo)" : "Cerrar" });
  bNo.onclick = async () => {
    if (r.subido) { const x = await FB.api("/api/importar/descartar", { archivo: r.archivo }); FB.aviso(x.mensaje || "Hecho", !x.ok); }
    guardarImport(resultadosImport.filter((y) => y !== r)); await FB.refrescar();
  };
}
function resultadoImport(padre, r) {
  const card = padre.createDiv({ cls: "fb-card" });
  if (r.ok && r.previa) { tarjetaPrevia(card, r); return; }
  if (r.ok) {
    mensaje(card, r.mensaje || "Importado", "ok");
    cuadreExtracto(card, r);
    if (r.sugeridas) enlace(card, `Ver o confirmar las ${r.sugeridas} categoría${r.sugeridas > 1 ? "s" : ""} sugerida${r.sugeridas > 1 ? "s" : ""} →`, "#revisar");
    if (r.dudas) enlace(card, `Revisar ${r.dudas} movimiento${r.dudas > 1 ? "s" : ""} →`, "#revisar");
    if (r.tipo === "banco" && r.nuevas) enlace(card, "Detectar tus ingresos y gastos fijos →", "#fijos");
    if (r.jev_hallazgos) enlace(card, "✨ Revisar tus categorías →", "#revision");
    return;
  }
  if (r.necesita === "cuenta") {
    card.createDiv({ cls: "top", text: `${r.archivo}: ¿de qué cuenta es este extracto?` });
    card.createDiv({ cls: "txt", text: `Formato reconocido: ${r.perfil}. Elige la cuenta; se recordará para la próxima vez.` });
    const f = card.createDiv({ cls: "fb-fila" });
    const importarEn = async (cuenta, b) => { b.disabled = true; const x = await FB.api("/api/importar/reintentar", { archivo: r.archivo, tipo: r.tipo, cuenta, perfil: r.perfil, previa: quierePrevia(), subido: !!r.subido }); reemplazar(r, x); };
    if (!(r.cuentas || []).length) {
      const esBroker = r.tipo === "inversion";
      f.appendText(esBroker ? "Aún no tienes una cuenta de bróker. Créala:" : "Aún no tienes esa cuenta. Créala:");
      const iN = f.createEl("input", { attr: { type: "text", placeholder: "Nombre de la cuenta" } }); iN.value = String(r.perfil || "").split(/[ (]/)[0];
      const bC = f.createEl("button", { cls: "fb-btn", text: "Crear la cuenta e importar" });
      bC.onclick = async () => {
        if (!iN.value.trim()) return;
        const x = await FB.api("/api/guardar", { tipo: "cuenta", datos: { nombre: iN.value.trim(), tipo: esBroker ? "broker" : "corriente", extracto: true } });
        if (!x.ok) { mensaje(card, x.mensaje || "Error", "err"); return; }
        importarEn(iN.value.trim(), bC);
      };
      return;
    }
    const s = f.createEl("select");
    for (const c of r.cuentas || []) { const o = s.createEl("option", { text: c }); o.value = c; }
    const b = f.createEl("button", { cls: "fb-btn", text: "Importar" });
    b.onclick = () => importarEn(s.value, b);
    return;
  }
  if (r.necesita === "perfil") { configurarFormato(card, r); return; }
  mensaje(card, r.mensaje || "No se ha podido importar", "err");
}
// Tras importar: ¿el saldo que dice el banco coincide con el que calcula la app? (si no, autoCuadre lo iguala al del banco)
function cuadreExtracto(card, r) {
  const ext = r.tipo === "banco" ? cfg[`saldo_extracto:${r.cuenta}`] : null;
  if (!ext) return;
  const f = DateTime.fromISO(ext.fecha), P = patrimonio();
  const u = [...P].reverse().find((x) => x.fecha < f.startOf("day")) || P[0];
  const est = u ? proyectar(u, f.endOf("day")).cuentas.saldos[r.cuenta] : null;
  if (est != null && Math.abs(ext.saldo - est) < 0.01) card.createDiv({ cls: "fin-note", text: `✓ El saldo de ${r.cuenta} (${eur(ext.saldo)}) es el que dice tu banco.` });
}
// El saldo de cada cuenta con extracto es el que dice el banco: si la app calcula otro, se anota el del banco (un registro de saldos de ese día;
// el mes no se cierra ni cambia el valor de la inversión). Se intenta una vez por cada saldo distinto del extracto.
async function autoCuadre() {
  const P = patrimonio();
  if (!P.length || (DB.info || {}).ejemplo) return false;
  const ultima = P[P.length - 1].fecha;
  const hechos = [];
  for (const c of cuentas().filter((c) => c.extracto && c.tipo !== "broker")) {
    const ext = cfg[`saldo_extracto:${c.nombre}`], f = ext && DateTime.fromISO(ext.fecha);
    if (!f || !f.isValid || f > hoy.endOf("day") || ultima > f.endOf("day")) continue;  // sin extracto, futuro, o ya anotaste saldos después
    const u = [...P].reverse().find((x) => x.fecha < f.startOf("day")) || P[0];
    const est = proyectar(u, f.endOf("day")).cuentas.saldos[c.nombre];
    if (est == null || Math.abs(ext.saldo - est) < 0.01) continue;
    hechos.push({ c, ext, f, u });
  }
  if (!hechos.length) return false;
  const F = DateTime.max(...hechos.map((x) => x.f)), delDia = hechos.filter((x) => x.f.hasSame(F, "day"));
  const clave = "fb-cuadre:" + delDia.map((x) => `${x.c.nombre}:${x.ext.fecha}:${x.ext.saldo}`).join("|");
  try { if (sessionStorage.getItem(clave)) return false; sessionStorage.setItem(clave, "1"); } catch (_) {}
  const u0 = delDia[0].u, saldos = { ...proyectar(u0, F.endOf("day")).cuentas.saldos };
  for (const x of delDia) saldos[x.c.nombre] = x.ext.saldo;
  const r = await FB.api("/api/saldo_banco", { fecha: F.toISODate(), saldos });
  if (!r.ok) return false;
  FB.aviso(`Saldo igualado al del banco: ${delDia.map((x) => `${x.c.nombre} ${eur(x.ext.saldo)}`).join(", ")}`);
  await FB.refrescar();
  return true;
}
const reemplazar = async (viejo, nuevo) => { guardarImport(resultadosImport.map((x) => (x === viejo ? nuevo : x))); await FB.refrescar(); };
// Formato nuevo: el usuario dice qué columna es cada cosa (se guarda como «formato» y se reconoce solo la próxima vez).
function configurarFormato(card, r) {
  card.createDiv({ cls: "top", text: `${r.archivo}: formato nuevo` });
  card.createDiv({ cls: "txt", text: "Dime qué columna es cada cosa (solo esta vez: la próxima se reconocerá solo)." });
  if (Object.keys(r.columnas_probables || {}).length) card.createDiv({ cls: "fin-note", text: "La app ha reconocido sola las columnas por su nombre y su contenido: compruébalas y dale a guardar." });
  else if (r.propuesta && Object.keys(r.propuesta).some((k) => k !== "_tipo")) card.createDiv({ cls: "fin-note", text: "✨ El asistente Jev ha elegido las columnas: revísalas antes de guardar." });
  const cab = (r.cabecera || []).map((c, i) => [c, c || `(columna ${i + 1})`]).filter(([c]) => c);
  const tw = card.createDiv({ cls: "fin-tablewrap" });
  const t = tw.createEl("table", { cls: "fin-table fb-muestra" });
  const hr = t.createEl("thead").createEl("tr"); for (const c of r.cabecera || []) hr.createEl("th", { text: c });
  const tb = t.createEl("tbody"); for (const f of r.ejemplos || []) { const tr = tb.createEl("tr"); for (const c of f) tr.createEl("td", { text: c }); }
  let tipo = r.tipo || (r.propuesta || {})._tipo || "banco";  // _tipo: si Jev ve que es del banco o del bróker
  const form = card.createDiv({ cls: "fb-form" });
  const sel = {}, esTipo = {};
  const campos = () => tipo === "inversion"
    ? [["fecha", "Fecha", true], ["concepto", "Concepto / descripción", true], ["importe", "Importe", true]]
    : [["fecha", "Fecha (de la operación)", true], ["concepto", "Concepto / descripción", true], ["importe", "Importe (con signo)", false], ["cargo", "…o Cargo (salidas)", false], ["abono", "…y Abono (entradas)", false], ["saldo", "Saldo (recomendado)", false], ["fecha_valor", "Fecha valor (opcional)", false]];
  let iN, sC, cNeg;
  const pintar = () => {
    form.innerHTML = "";
    if (!r.tipo) {
      form.createDiv({ cls: "et", text: "Este archivo es" });
      const s = form.createEl("select"); for (const [v, l] of [["banco", "Extracto del banco"], ["inversion", "Movimientos del bróker"]]) { const o = s.createEl("option", { text: l }); o.value = v; }
      s.value = tipo; s.onchange = () => { tipo = s.value; pintar(); };
    }
    for (const [k, l, req] of campos()) {
      form.createDiv({ cls: "et", text: l + (req ? " *" : "") });
      const s = form.createEl("select"); const o0 = s.createEl("option", { text: "—" }); o0.value = "";
      for (const [v, et] of cab) { const o = s.createEl("option", { text: et }); o.value = v; }
      const adivina = cab.find(([c]) => ({ fecha: /^fecha( de)? ?(operaci|contable)?/i, concepto: /concepto|descripci|detalle|movimiento/i, importe: /importe|cantidad|monto/i, saldo: /saldo/i, fecha_valor: /valor/i, cargo: /cargo|debe/i, abono: /abono|haber/i }[k] || /^$/).test(c));
      const propuesto = (r.propuesta || {})[k];  // lo que ha reconocido la app en el archivo (y, si está activado, lo que añade Jev)
      s.value = sel[k] ?? (propuesto && cab.some(([c]) => c === propuesto) ? propuesto : adivina && !(k === "fecha" && /valor/i.test(adivina[0])) ? adivina[0] : "");
      sel[k] = s.value; s.onchange = () => (sel[k] = s.value);
    }
    form.createDiv({ cls: "et", text: "Nombre de este formato" });
    iN = form.createEl("input", { attr: { type: "text" } }); iN.value = iN.value || r.archivo.replace(/\.[^.]+$/, "").replace(/\d{4}-\d{2}-\d{2}/g, "").trim() || "Mi banco";
    form.createDiv({ cls: "et", text: "Cuenta" });
    sC = form.createEl("select");
    for (const c of cuentas().filter((c) => (tipo === "inversion") === (c.tipo === "broker") || !cuentasTipo("broker").length)) { const o = sC.createEl("option", { text: c.nombre }); o.value = c.nombre; }
    if (tipo === "inversion") {
      form.createDiv({ cls: "et", text: "Las compras aparecen en negativo" });
      const l = form.createEl("label", { cls: "fb-check" }); cNeg = l.createEl("input", { attr: { type: "checkbox" } }); cNeg.checked = true; l.appendText(" sí (lo normal: es dinero que sale)");
    }
  };
  pintar();
  const b = card.createEl("button", { cls: "fb-btn", text: "Guardar formato e importar" });
  const m = card.createDiv();
  b.onclick = async () => {
    const columnas = {}; for (const [k] of campos()) if (sel[k]) columnas[k] = sel[k];
    b.disabled = true;
    const x = await FB.api("/api/importar/reintentar", { archivo: r.archivo, tipo, columnas, perfil: iN.value, cuenta: sC.value, compras_negativas: cNeg ? cNeg.checked : true, previa: quierePrevia(), subido: !!r.subido });
    b.disabled = false;
    if (!x.ok && !x.necesita) { m.innerHTML = ""; mensaje(m, x.mensaje || "Error", "err"); return; }
    reemplazar(r, x);
  };
}


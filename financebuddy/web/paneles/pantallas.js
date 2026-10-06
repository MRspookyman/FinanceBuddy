// ═════════════ pantallas de la app: primeros pasos, importar, revisar, apuntar, cerrar el mes, ajustes ═════════════
const fmtISO = (iso) => fechaCorta(iso);
const titulo = (t, sub, conNav = true) => cabecera(t, false, sub);

// ───────────── primeros pasos ─────────────
function vistaBienvenida() {
  const intro = root.createDiv({ cls: "fb-bienvenida" });
  intro.createEl("h2", { text: "Hola, soy FinanceBuddy 👋" });
  intro.createEl("p", { text: "Importas los extractos de tu banco (Excel o CSV) y te digo cuánto puedes gastar, a dónde va tu dinero y cómo va tu inversión. Todo se queda en tu ordenador." });
  const pe = intro.createDiv();
  pe.appendText("¿Prefieres verla antes con datos inventados? ");
  accion(pe, "Probar con datos de ejemplo", async () => { const r = await FB.api("/api/ejemplo", { activar: true }); if (r.ok) { await FB.recargar(); FB.ir("#inicio"); } else FB.aviso(r.mensaje, true); });

  const arch = root.createDiv({ cls: "fin-panel fb-primero" });
  arch.createEl("h3", { text: "Empieza por tu extracto" });
  arch.createDiv({ cls: "fin-note", text: "Descarga de tu banco el Excel o CSV de movimientos y arrástralo aquí. La app reconoce la cuenta, toma el saldo del propio extracto, clasifica lo que sabe y te pregunta solo lo que no. Después te propone tus fijos y un límite de gasto." });
  const zonaB = arch.createDiv({ cls: "fb-zona", text: "Arrastra aquí el Excel o CSV, o pulsa para elegirlo" });
  zonaB.onclick = () => FB.ir("#importar");
  zonaB.addEventListener("dragover", (e) => { e.preventDefault(); zonaB.classList.add("sobre"); });
  zonaB.addEventListener("dragleave", () => zonaB.classList.remove("sobre"));
  zonaB.addEventListener("drop", (e) => { e.preventDefault(); FB.soltados = [...e.dataTransfer.files]; FB.ir("#importar"); });
  const manual = plegable(root, "Prefiero empezar a mano (cuentas, límite y fijos)", (c) => manualBienvenida(c), {});
}
// El alta a mano de siempre (sin extracto): cuentas con su saldo, límite, fijos y fondo de emergencia.
function manualBienvenida(root) {
  const cs = [{ nombre: "Cuenta corriente", tipo: "corriente", extracto: true, saldo: "" }, { nombre: "Ahorro", tipo: "ahorro", extracto: false, saldo: "" }];
  const p1 = panel(root, "1 · Tus cuentas y cuánto tienes hoy en cada una");
  p1.createDiv({ cls: "fin-note", text: "Pon el saldo actual de cada cuenta. Si tienes un bróker (MyInvestor, Trade Republic, Indexa…), añade su cuenta de efectivo como «Bróker»." });
  const lista = p1.createDiv({ cls: "fb-cuentas" });
  const pintar = () => {
    lista.innerHTML = "";
    cs.forEach((c, i) => {
      const f = lista.createDiv({ cls: "fb-fila" });
      const n = f.createEl("input", { attr: { type: "text", placeholder: "Nombre" } }); n.value = c.nombre; n.oninput = () => (c.nombre = n.value);
      const t = f.createEl("select"); for (const [v, l] of Object.entries(TIPO_CUENTA)) { const o = t.createEl("option", { text: l }); o.value = v; }
      t.value = c.tipo; t.onchange = () => { c.tipo = t.value; c.extracto = t.value === "corriente"; pintar(); };
      const s = f.createEl("input", { cls: "corto", attr: { type: "number", step: "0.01", placeholder: "Saldo hoy (€)" } }); s.value = c.saldo; s.oninput = () => (c.saldo = s.value);
      const l = f.createEl("label"); const x = l.createEl("input", { attr: { type: "checkbox" } }); x.checked = c.extracto; x.onchange = () => (c.extracto = x.checked); l.appendText("importaré su extracto");
      if (cs.length > 1) { const b = f.createEl("button", { cls: "fb-btn sec mini", text: "✕" }); b.title = "Quitar"; b.onclick = () => { cs.splice(i, 1); pintar(); }; }
    });
  };
  pintar();
  const bAdd = p1.createEl("button", { cls: "fb-btn sec", text: "+ Otra cuenta" });
  bAdd.onclick = () => { cs.push({ nombre: "", tipo: "corriente", extracto: true, saldo: "" }); pintar(); };

  const p2 = panel(root, "2 · Tu límite de gasto variable al mes (opcional)");
  p2.createDiv({ cls: "fin-note", text: "Lo que te quieres permitir en comer fuera, compras, ocio… (sin contar alquiler ni recibos). Con él verás cuánto te queda cada mes." });
  const iL = p2.createEl("input", { cls: "corto", attr: { type: "number", step: "10", placeholder: "p. ej. 500" } });

  const p3 = panel(root, "3 · Ingresos y gastos fijos (opcional)");
  p3.createDiv({ cls: "fin-note", text: "Para la previsión de los próximos meses: nóminas, pensiones, alquiler, recibos… Pon todos los que tengas. Si no los sabes, déjalo: después de importar tu extracto, la app los detecta sola (Ajustes → Detectar fijos)." });
  const fijos = [{ nombre: "Nómina", clase: "ingreso", categoria: "Nómina", importe: "", dia: 28 }, { nombre: "Alquiler o hipoteca", clase: "gasto", categoria: "Vivienda", importe: "", dia: 1 }];
  const listaFijos = p3.createDiv();
  const pintarFijos = () => {
    listaFijos.innerHTML = "";
    for (const clase of ["ingreso", "gasto"]) {
      listaFijos.createDiv({ cls: "sep", text: clase === "ingreso" ? "Ingresos fijos" : "Gastos fijos" });
      for (const r of fijos.filter((x) => x.clase === clase)) {
        const f = listaFijos.createDiv({ cls: "fb-fila" });
        const n = f.createEl("input", { attr: { type: "text", placeholder: clase === "ingreso" ? "p. ej. Nómina empresa" : "p. ej. Gimnasio" } }); n.value = r.nombre; n.oninput = () => (r.nombre = n.value);
        const s = f.createEl("select"); for (const [v, t] of catSegunClase(r)) { const o = s.createEl("option", { text: t }); o.value = v; }
        if (r.categoria) s.value = r.categoria; r.categoria = s.value; s.onchange = () => (r.categoria = s.value);
        const i = f.createEl("input", { cls: "corto", attr: { type: "number", step: "0.01", placeholder: "€ al mes" } }); i.value = r.importe; i.oninput = () => (r.importe = i.value);
        f.appendText("día");
        const dI = f.createEl("input", { cls: "mini", attr: { type: "number", min: "1", max: "31" } }); dI.value = r.dia; dI.oninput = () => (r.dia = dI.value);
        const b = f.createEl("button", { cls: "fb-btn sec mini", text: "✕" }); b.title = "Quitar"; b.onclick = () => { fijos.splice(fijos.indexOf(r), 1); pintarFijos(); };
      }
      const bMas = listaFijos.createEl("button", { cls: "fb-btn sec", text: clase === "ingreso" ? "+ Otro ingreso" : "+ Otro gasto fijo" });
      bMas.onclick = () => { fijos.push({ nombre: "", clase, categoria: clase === "ingreso" ? "Nómina" : "", importe: "", dia: clase === "ingreso" ? 28 : 1 }); pintarFijos(); };
    }
  };
  pintarFijos();
  const p4 = panel(root, "4 · Fondo de emergencia");
  const l4 = p4.createEl("label", { cls: "fb-check" }); const cF = l4.createEl("input", { attr: { type: "checkbox" } }); cF.checked = true;
  l4.appendText(" Quiero un fondo de emergencia de ");
  const iM = l4.createEl("input", { cls: "mini", attr: { type: "number", min: "1", max: "12" } }); iM.value = 3;
  l4.appendText(" meses de gasto en mi cuenta de ahorro");
  const msg = root.createDiv();
  const b = root.createEl("button", { cls: "fb-btn grande", text: "Empezar" });
  b.onclick = async () => {
    b.disabled = true;
    const r = await FB.api("/api/bienvenida", { cuentas: cs, limite: iL.value, fondo_meses: cF.checked ? iM.value : null,
      recurrentes: fijos.filter((x) => num(x.importe) > 0 && x.nombre.trim()).map((x) => ({ nombre: x.nombre.trim(), clase: x.clase, categoria: x.categoria, importe: x.importe, dia: x.dia })) });
    b.disabled = false;
    if (!r.ok) { msg.innerHTML = ""; mensaje(msg, r.mensaje || "Error", "err"); return; }
    await FB.recargar();
    FB.ir("#importar");
  };
}

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
  t.push({ l: "Ya estaban", v: String(V.existentes), s: "se omiten, no se duplican" }, { l: "Por revisar", v: String(V.dudas.n), t: V.dudas.n ? "neg" : "" });
  tiles(card, t);
  if (V.activos_nuevos.length) card.createDiv({ cls: "fin-note", text: `Se crearían los activos: ${V.activos_nuevos.join(", ")}.` });
  if (V.categorias.length) card.createDiv({ cls: "fin-note", text: "Más gasto: " + V.categorias.map((c) => `${c.categoria} ${eur(c.total, 0)}`).join(" · ") });
  if (V.muestra.length) plegable(card, `Ver los últimos ${V.muestra.length} movimientos`, (c) => tabla(c, [{ t: "Fecha" }, { t: "Concepto" }, { t: "Categoría", opt: true }, { t: "Importe", num: true }],
    V.muestra.map((m) => [fechaCorta(m.fecha), m.concepto, m.clase === "transferencia" ? "Entre tus cuentas" : m.categoria, { text: eurS(m.importe), cls: m.importe < 0 ? "neg" : "" }])));
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
  if (r.propuesta && Object.keys(r.propuesta).some((k) => k !== "_tipo")) card.createDiv({ cls: "fin-note", text: "✨ El asistente Jev ha elegido las columnas: revísalas antes de guardar." });
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
      const deJev = (r.propuesta || {})[k];
      s.value = sel[k] ?? (deJev && cab.some(([c]) => c === deJev) ? deJev : adivina && !(k === "fecha" && /valor/i.test(adivina[0])) ? adivina[0] : "");
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

// ───────────── por revisar ─────────────
// Las dudas del banco se agrupan por comercio (mismo patrón, cuenta y sentido): una decisión resuelve el grupo entero.
// Cada grupo ofrece la categoría más probable (por tu historial) y las que más usas, a un clic.
function vistaRevisar() {
  const P = DB.pendientes || [];
  titulo("Por revisar", P.length ? `${P.length} movimiento${P.length > 1 ? "s" : ""} que la app no ha sabido clasificar sola` : "");
  if (!P.length) {
    const ok = root.createDiv({ cls: "fb-hecho" });
    ok.createDiv({ cls: "i", text: "✓" });
    ok.createEl("b", { text: "Todo revisado" });
    ok.createDiv({ text: "Lo que elijas aquí se recuerda: cada vez tendrás menos que revisar." });
    enlace(ok, "Ir al inicio →", "#inicio");
    return;
  }
  const banco = P.filter((p) => p.tipo_import !== "inversion"), inv = P.filter((p) => p.tipo_import === "inversion");
  const agrupar = (lista, conClase) => {
    const m = new Map(), rep = conClase ? repartosBizum(lista) : new Map();
    for (const p of [...lista].sort((a, b) => String(a.fila.op).localeCompare(String(b.fila.op)))) {
      const k = rep.get(p.id) || [p.cuenta, p.fila.patron || sugerirPatron(p.fila.texto), p.fila.importe < 0 ? "-" : "+", conClase && p.fila.clase === "transferencia" ? "t" : ""].join("|");
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
    for (const [k, g] of m) if (k.startsWith("reparto|")) g.reparto = true;  // varios Bizums iguales el mismo día: un solo gasto repartido
    return [...m.values()].sort((a, b) => b.length - a.length || sum(b.map((p) => Math.abs(p.fila.importe))) - sum(a.map((p) => Math.abs(p.fila.importe))));
  };
  const G = agrupar(banco, true), GI = agrupar(inv, false);
  const conProp = [...G.map((g) => [g, propuestaBanco(g)]), ...GI.map((g) => [g, propuestaBroker(g)])].filter(([, pr]) => pr);
  const conSug = new Set(conProp.map(([g]) => g));
  // Filtros (como en Lunch Money o Monarch): lo del banco, lo del bróker o solo lo que ya trae sugerencia
  const F = [["todo", "Todo", G.length + GI.length], ["banco", "Banco", G.length], ["broker", "Bróker", GI.length], ["sug", "Con sugerencia", conProp.length]].filter(([k, , n]) => k === "todo" || n);
  let filtroRev = FB.estado.filtroRev || "todo";  // FB.estado: sobrevive a refrescar la pantalla, no a cambiar de pantalla
  if (!F.some(([k]) => k === filtroRev)) filtroRev = "todo";
  const fil = root.createDiv({ cls: "fb-chips fb-filtro-rev" });
  for (const [k, t, n] of F) { const b = fil.createEl("button", { text: `${t} · ${n}`, cls: k === filtroRev ? "act" : "" }); b.onclick = () => { FB.estado.filtroRev = k; FB.estado.pag_rev_banco = 0; FB.estado.pag_rev_broker = 0; render(); }; }
  if (conProp.length) panelSugerencias(root, conProp);
  botonJev(root, G, GI, conSug);
  const ver = (g, tipo) => filtroRev === "todo" || filtroRev === tipo || (filtroRev === "sug" && conSug.has(g));
  const Gv = G.filter((g) => ver(g, "banco")), GIv = GI.filter((g) => ver(g, "broker"));
  if (Gv.length) {
    root.createDiv({ cls: "fin-note fb-pista", text: "Pulsa la categoría y listo: se aplica a todo el grupo y la próxima vez se clasificará solo." });
    const cont = root.createDiv({ cls: "fb-grupos" });
    const pg = paginacion(Gv, "rev_banco", render, 25);
    for (const g of pg.parte) tarjetaGrupo(cont, g);
    pg.pie(root);
  }
  if (GIv.length) {
    if (Gv.length) root.createEl("h3", { cls: "fb-sec", text: "Tu bróker" });
    const ci = root.createDiv({ cls: "fb-grupos" });
    const pg = paginacion(GIv, "rev_broker", render, 25);
    for (const g of pg.parte) tarjetaGrupoInversion(ci, g);
    pg.pie(root);
  }
}
// Bizums recibidos iguales (≥ 2) el mismo día: son el reparto de UN gasto que pagaste tú, se resuelven juntos. Igual que bizums.repartos().
const esBizum = (t) => /bizum/i.test(t || "");
const primerNombre = (t) => C_titulo(((/bizum (?:de|recibido de)\s+(\S+)/i.exec(t || "")) || [])[1] || "Bizum");
function repartosBizum(lista) {
  const bz = lista.filter((p) => p.fila.importe > 0 && p.fila.clase !== "transferencia" && esBizum(p.fila.texto))
    .sort((a, b) => String(a.fila.op).localeCompare(String(b.fila.op)) || a.fila.importe - b.fila.importe);
  const grupos = [], out = new Map();
  for (const p of bz) {
    const g = grupos.find((g) => g[0].fila.op === p.fila.op && g[0].cuenta === p.cuenta && Math.abs(g[0].fila.importe - p.fila.importe) <= Math.max(0.06, 0.02 * p.fila.importe));
    if (g) g.push(p); else grupos.push([p]);
  }
  for (const g of grupos) if (g.length >= 2) for (const p of g) out.set(p.id, `reparto|${g[0].cuenta}|${g[0].fila.op}|${g[0].fila.importe.toFixed(2)}`);
  return out;
}
// La sugerencia de un grupo. En un reparto, la persona de cada Bizum no dice nada: solo vale lo que Jev ha mirado del conjunto.
const sugDe = (g) => (g.reparto ? g.map((p) => p.sugerencia).find((s) => s && s.fuente === "jev") || null : g[0].sugerencia);
// Asistente Jev (opcional): pedir categoría para los grupos del banco que no tienen sugerencia, y qué son los textos
// del bróker que la app no reconoce.
const JEV_SEGURA = 0.85;  // igual que jev.SEGURA: desde aquí, la sugerencia sale marcada al aceptar en bloque
function botonJev(padre, G, GI, conSug = new Set()) {
  const J = (DB.config || {}).jev || {};
  const sinB = (GI || []).filter((g) => g[0].sugerencia && g[0].sugerencia.nuevo && !g[0].sugerencia.isin && !g[0].jev);
  const sin = [...G.filter((g) => !sugDe(g) && !g[0].jev && g[0].fila.clase !== "transferencia"), ...sinB];
  if (!sin.length) return;
  const f = padre.createDiv({ cls: "fb-fila fb-bloque-sug" });
  if (!J.activo) {
    const n = f.createSpan({ cls: "fin-note" });
    const nSin = sin.filter((g) => !conSug.has(g)).length;
    if (!nSin) return;
    n.appendText(`${nSin} grupo${nSin > 1 ? "s" : ""} sin sugerencia. `);
    enlace(n, "Activa el asistente Jev para que proponga su categoría →", "#ajustes/jev");
    return;
  }
  const b = f.createEl("button", { cls: "fb-btn sec", text: `✨ Pedir a Jev ${sinB.length === sin.length ? "qué son" : "la categoría de"} ${sin.length} grupo${sin.length > 1 ? "s" : ""}` });
  f.createSpan({ cls: "fin-note", text: "Solo se envía el concepto (sin nombres de Bizum ni números de tarjeta) y el importe." });
  b.onclick = async () => {
    b.disabled = true; b.textContent = "Preguntando a Jev…";
    const r = await FB.api("/api/jev/revisar", {});
    FB.aviso(r.mensaje || (r.ok ? "Hecho" : "Error"), !r.ok);
    await FB.refrescar();
  };
}
const nombreGrupo = (g) => { const f = g[0].fila, s = g[0].sugerencia || {}; return g[0].tipo_import === "inversion" ? s.nuevo || s.activo || C_titulo(sugerirPatron(f.texto)) : f.concepto || C_titulo(sugerirPatron(f.texto)); };
// Lo que la app propone para un grupo (o null): { texto, datos, motivo, segura }. «segura»: sale marcada al aceptar en bloque.
function propuestaBanco(g) {
  const p = g[0], f = p.fila, entra = f.importe > 0;
  if (f.clase === "transferencia") {
    const otras = cuentas().filter((c) => c.nombre !== p.cuenta);
    return otras.length === 1 ? { texto: `🔁 ${entra ? "Desde" : "A"} ${otras[0].nombre}`, datos: { accion: "guardar", clase: "transferencia", cuenta_otra: otras[0].nombre }, motivo: "a tu nombre", segura: true } : null;
  }
  const s = sugDe(g);
  return s && s.categoria ? { texto: `${catIcono(s.categoria)} ${s.categoria}`, datos: { accion: "guardar", clase: s.clase, categoria: s.categoria }, motivo: s.motivo,
    segura: s.fuente === "jev" ? num(s.confianza) >= JEV_SEGURA : !/^parecido/.test(s.motivo || "") } : null;
}
function propuestaBroker(g) {
  const f = g[0].fila, entra = f.importe > 0, s = g[0].sugerencia || {};
  const jv = s.fuente === "jev", segura = !jv || num(s.confianza) >= JEV_SEGURA;
  if (s.accion === "ignorar") return { texto: entra ? "🔁 Traspaso desde mi banco" : "🔁 Traspaso a mi banco", datos: { accion: "ignorar" }, motivo: jv ? s.motivo : "dinero entre tus cuentas", segura };
  if (s.accion === "interes") return { texto: entra ? "💰 Intereses" : "🏦 Comisión", datos: { accion: "interes" }, motivo: jv ? s.motivo : "de la cuenta del bróker", segura };
  if (s.accion === "activo" && s.activo) return { texto: `📈 ${entra ? "Venta" : "Compra"} de ${s.activo}`, datos: { accion: "activo", activo: s.activo }, motivo: "lo reconoce el activo", segura: true };
  if (s.accion === "activo" && s.nuevo && !entra) return { texto: `✨ Crear «${s.nuevo}»${s.clase && s.clase !== "otro" ? ` (${TIPO_ACTIVO[s.clase] || s.clase})` : ""}`, datos: { accion: "activo", nuevo_activo: s.nuevo, clase: s.clase }, motivo: jv ? `tipo: ${s.motivo}` : "activo nuevo", segura: true };
  return null;
}
// Aceptar en bloque lo que propone la app: una lista con casillas (las dudosas, sin marcar) y un botón.
function panelSugerencias(padre, conProp) {
  const nMov = sum(conProp.map(([g]) => g.length));
  const cab = padre.createDiv({ cls: "fb-fila fb-bloque-sug" });
  const b = cab.createEl("button", { cls: "fb-btn", text: `✨ Revisar y aceptar ${conProp.length === 1 ? "la sugerencia" : `las ${conProp.length} sugerencias`} (${nMov} movimiento${nMov > 1 ? "s" : ""})` });
  cab.createSpan({ cls: "fin-note", text: "Ves lo que propone la app para cada grupo y lo aceptas de una vez." });
  const caja = padre.createDiv({ cls: "fin-panel fb-sug-lista" }); caja.style.display = "none";
  b.onclick = () => { caja.style.display = caja.style.display === "none" ? "" : "none"; };
  const marcado = new Map(conProp.map(([g, pr]) => [g, pr.segura]));
  const l = caja.createDiv({ cls: "fb-sug-l" });
  for (const [g, pr] of conProp) {
    const r = l.createEl("label", { cls: "r" });
    const c = r.createEl("input", { attr: { type: "checkbox" } }); c.checked = pr.segura; c.onchange = () => marcado.set(g, c.checked);
    const n = r.createDiv({ cls: "n" });
    n.createDiv({ cls: "t", text: nombreGrupo(g) });
    n.createDiv({ cls: "s", text: `${g.length > 1 ? `${g.length} movimientos · ` : ""}${g[0].cuenta}${pr.motivo ? " · " + pr.motivo : ""}` });
    r.createDiv({ cls: "v " + (g[0].fila.importe > 0 ? "pos" : ""), text: eurS(sum(g.map((x) => x.fila.importe))) });
    r.createDiv({ cls: "pr", text: "→ " + pr.texto });
  }
  const pie = caja.createDiv({ cls: "fb-fila" });
  const ok = pie.createEl("button", { cls: "fb-btn", text: "Aceptar las marcadas" });
  const est = pie.createSpan({ cls: "fin-note" });
  ok.onclick = async () => {
    const elegidos = conProp.filter(([g]) => marcado.get(g));
    if (!elegidos.length) { est.setText("No hay ninguna marcada."); return; }
    ok.disabled = true;
    let hechos = 0;
    for (const [g, pr] of elegidos) {
      est.setText(`Guardando ${hechos + 1} de ${elegidos.length}…`);
      const f = g[0].fila;
      const r = await FB.api("/api/resolver", { id: g[0].id, ids: g.map((x) => x.id), recordar: true, patron: f.patron || sugerirPatron(f.texto), mantener: hechos > 0, ...pr.datos });
      if (r.ok) hechos++;  // si otro grupo ya lo resolvió («recordar» con el mismo patrón), no pasa nada
    }
    FB.aviso(`Aceptadas ${hechos} sugerencia${hechos === 1 ? "" : "s"} ✓`, false, avisoDeshacer());
    await FB.refrescar();
  };
}
// Categorías que más usas (por número de movimientos), para ofrecerlas a un clic.
function catsFrecuentes(entra, n = 6, importe = 0) {
  const c = new Map();
  for (const m of movimientos()) if (!m.auto && m.categoria && m.clase !== "transferencia" && (m.clase === "ingreso") === entra) c.set(m.categoria, (c.get(m.categoria) || 0) + 1);
  const validas = new Set(catSegunClase({ clase: entra ? "ingreso" : "gasto" }).map(([v]) => v));
  return [...c].filter(([k]) => validas.has(k) && !(Math.abs(importe) < 25 && grupoDe(k) === "fijo")).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, n);
}
// Cabecera común de un grupo de «Por revisar»: avatar, nombre, fechas, total y el texto del extracto.
function cabGrupo(card, g, av, nombre) {
  const p = g[0], f = p.fila, entra = f.importe > 0;
  const cab = card.createDiv({ cls: "cab" });
  avatar(cab, av);
  const n = cab.createDiv({ cls: "n" });
  n.createDiv({ cls: "t", text: nombre });
  n.createDiv({ cls: "s", text: g.length > 1 ? `${g.length} movimientos · del ${fmtISO(g[0].fila.op)} al ${fmtISO(g[g.length - 1].fila.op)} · ${p.cuenta}` : `${fmtISO(f.op)} · ${p.cuenta}` });
  cab.createDiv({ cls: "v " + (entra ? "pos" : ""), text: eurS(sum(g.map((x) => x.fila.importe))) });
  const ext = card.createDiv({ cls: "ext", text: g.reparto ? `De: ${g.map((x) => primerNombre(x.fila.texto)).join(", ")}  (${g.map((x) => eur(x.fila.importe)).join(" · ")})` : f.texto + (g.length > 1 ? `  (${g.map((x) => eur(Math.abs(x.fila.importe))).join(" · ")})` : "") });
  ext.title = ext.textContent;
  if (p.duda) card.createDiv({ cls: "duda", text: p.duda });
}
// Resolver un grupo entero (ids) con la misma decisión; la tarjeta se desliza fuera y la pantalla se refresca.
// Botón «Deshacer» del aviso tras una decisión de «Por revisar» (el servidor guarda una foto de antes)
const avisoDeshacer = () => ({ texto: "Deshacer", fn: async () => { const r = await FB.api("/api/deshacer", {}); FB.aviso(r.mensaje || "Hecho", !r.ok); await FB.refrescar(); } });
const resolverGrupo = (card, g, extra) => async (datos, btn) => {
  btn.disabled = true;
  const r = await FB.api("/api/resolver", { id: g[0].id, ids: g.map((x) => x.id), ...extra(), ...datos });
  if (!r.ok) { btn.disabled = false; mensaje(card, r.mensaje || "Error", "err"); return; }
  card.classList.add("fuera");
  FB.aviso(r.mensaje, false, avisoDeshacer());
  setTimeout(() => FB.refrescar(), 220);
};
// Traspaso a una cuenta tuya que aún no está en la app: se crea y se resuelve el grupo.
async function nuevaCuentaYTraspaso(hecho, btn) {
  const nombre = (prompt("Nombre de la cuenta (p. ej. «Cuenta BBVA» o «Revolut»):") || "").trim();
  if (!nombre) return;
  const r = await FB.api("/api/guardar", { tipo: "cuenta", datos: { nombre, tipo: "corriente", extracto: false } });
  if (!r.ok) { FB.aviso(r.mensaje || "No se ha podido crear la cuenta", true); return; }
  hecho({ accion: "guardar", clase: "transferencia", cuenta_otra: nombre }, btn);
}
// Dudas del bróker: crear el activo (nombre y tipo sugeridos) o elegir uno, intereses, comisión o traspaso.
function tarjetaGrupoInversion(padre, g) {
  const p = g[0], f = p.fila, entra = f.importe > 0, sug = p.sugerencia || {};
  const card = padre.createDiv({ cls: "fb-grupo" });
  let nombreNuevo = sug.nuevo || C_titulo(sugerirPatron(f.texto)), recordar = true, patron = f.patron || sugerirPatron(f.texto);
  cabGrupo(card, g, { icono: entra ? "💶" : "📈" }, sug.nuevo || sug.activo || C_titulo(sugerirPatron(f.texto)));
  const hecho = resolverGrupo(card, g, () => ({ recordar, patron }));
  const chips = card.createDiv({ cls: "fb-cats" });
  const chip = (texto, datos, cls, title) => { const b = chips.createEl("button", { text: texto, cls: cls || "" }); if (title) b.title = title; b.onclick = () => hecho(datos(), b); return b; };
  const acts = opcActivos().map(([v]) => v);
  const jv = sug.fuente === "jev" ? ` · ${sug.motivo}` : "";
  const tipoNuevo = sug.clase && sug.clase !== "otro" ? ` (${TIPO_ACTIVO[sug.clase] || sug.clase})` : "";
  if (!entra && sug.accion === "activo" && sug.nuevo) chip(`✨ Crear «${nombreNuevo}»${tipoNuevo}${jv}`, () => ({ accion: "activo", nuevo_activo: nombreNuevo, clase: sug.clase }), "sug", "Crea el activo y guarda estas compras en él");
  if (sug.accion === "activo" && sug.activo) chip(`✨ ${entra ? "Venta de" : "Compra de"} ${sug.activo}`, () => ({ accion: "activo", activo: sug.activo }), "sug");
  if (sug.accion === "ignorar") chip(`✨ 🔁 Traspaso ${entra ? "desde" : "a"} mi banco${jv}`, () => ({ accion: "ignorar" }), "sug", "El dinero que pasas entre el banco y el bróker ya cuenta en el extracto del banco");
  if (sug.accion === "interes") chip(`✨ ${entra ? "💰 Intereses" : "🏦 Comisión"}${jv}`, () => ({ accion: "interes" }), "sug");
  if (sug.accion === "dividendo" && sug.activo) chip(`✨ 💵 Dividendo de ${sug.activo}`, () => ({ accion: "dividendo", activo: sug.activo }), "sug");
  for (const a of acts.filter((a) => a !== sug.activo)) chip(`📈 ${a}`, () => ({ accion: "activo", activo: a }));
  if (sug.accion !== "interes") chip(entra ? "💰 Intereses" : "🏦 Comisión", () => ({ accion: "interes" }));
  if (entra && acts.length) {  // un dividendo o cupón: de qué activo
    const sD = chips.createEl("select", { cls: "otra" });
    const d0 = sD.createEl("option", { text: sug.accion === "dividendo" && !sug.activo ? "✨ Dividendo de…" : "Dividendo de…" }); d0.value = "";
    for (const a of acts) { const o = sD.createEl("option", { text: `💵 ${a}` }); o.value = a; }
    sD.onchange = () => { if (sD.value) hecho({ accion: "dividendo", activo: sD.value }, sD); };
  }
  if (sug.accion !== "ignorar") chip(entra ? "🔁 Traspaso desde mi banco" : "🔁 Traspaso a mi banco", () => ({ accion: "ignorar" }));
  if (entra && sug.nuevo) chip(`Venta: nuevo activo «${nombreNuevo}»`, () => ({ accion: "activo", nuevo_activo: nombreNuevo, clase: sug.clase }));
  plegable(card, "Opciones", (c) => {
    const f0 = c.createDiv({ cls: "fb-fila" });
    f0.createSpan({ cls: "fb-et", text: "Nombre del activo nuevo" });
    const iN = f0.createEl("input", { attr: { type: "text" } }); iN.value = nombreNuevo; iN.oninput = () => (nombreNuevo = iN.value);
    const f1 = c.createDiv({ cls: "fb-fila" });
    const lab = f1.createEl("label"); const chk = lab.createEl("input", { attr: { type: "checkbox" } }); chk.checked = recordar; chk.onchange = () => (recordar = chk.checked);
    lab.appendText("Recordar para la próxima vez los que contengan:");
    const iPat = f1.createEl("input", { attr: { type: "text" } }); iPat.value = patron; iPat.oninput = () => (patron = iPat.value);
  });
}
// «¿De cuál de tus gastos es?»: los gastos tuyos de los días anteriores que un Bizum recibido (o un reparto) podría devolver, con
// todo lo que ayuda a elegir. Al pulsar uno, el Bizum se guarda como reembolso de ese gasto (su categoría) y queda enlazado.
function gastosCandidatos(card, g, sug, hecho) {
  const cs = g[0].candidatos || [];
  if (!cs.length) return;
  const imp = g[0].fila.importe, suma = sum(g.map((p) => p.fila.importe)), n = g.length;
  const caja = card.createDiv({ cls: "fb-cands" });
  caja.createDiv({ cls: "et", text: n > 1 ? `¿De cuál de tus gastos es este reparto? Los ${n} Bizums suman ${eur(suma)}` : "¿De cuál de tus gastos es esta parte?" });
  for (const c of cs) {
    const b = caja.createEl("button", { cls: "fb-cand" + (sug && sug.gasto_id === c.id ? " jev" : "") });
    b.title = c.texto;
    const arr = b.createDiv({ cls: "t" });
    arr.createSpan({ text: `${sug && sug.gasto_id === c.id ? "✨ " : ""}${fechaCorta(c.fecha)} · ${c.concepto || C_titulo(sugerirPatron(c.texto))}` });
    arr.createSpan({ cls: "v", text: eur(c.importe) });
    const partes = [`${catIcono(c.cat)} ${c.cat}`, c.dias === 0 ? "ese mismo día" : `${c.dias} día${c.dias > 1 ? "s" : ""} antes`];
    if (c.k && c.k > 1) partes.push(`${eur(imp)} × ${c.k} = ${eur(imp * c.k)} ${Math.abs(imp * c.k - c.importe) <= Math.max(0.06 * c.k, 0.02 * c.importe) ? "✓ cuadra" : "≈"}`);
    else if (c.k === 1) partes.push("es justo el gasto entero");
    else partes.push(`${eur(suma)} = el ${Math.round((100 * suma) / c.importe)} % del gasto`);
    b.createDiv({ cls: "s", text: partes.join(" · ") });
    const resto = c.importe - c.devuelto;
    const s2 = [c.devuelto > 0 ? `ya te han devuelto ${eur(c.devuelto)} (te quedan ${eur(resto)})` : "", resto - suma >= -0.1 ? `tu parte real: ${eur(Math.max(0, resto - suma))}` : `te devuelven ${eur(suma - resto)} más de lo que costó`].filter(Boolean);
    b.createDiv({ cls: "s", text: s2.join(" · ") });
    b.createDiv({ cls: "ext", text: c.texto });
    b.onclick = () => hecho({ accion: "guardar", clase: "gasto", categoria: c.cat, reembolsa: c.id }, b);
  }
}
function tarjetaGrupo(padre, g) {
  const p = g[0], f = p.fila, entra = f.importe > 0, esTr = f.clase === "transferencia";
  const sug = sugDe(g);
  const card = padre.createDiv({ cls: "fb-grupo" });
  cabGrupo(card, g, sug ? { cat: sug.categoria } : { icono: esTr ? "🔁" : g.reparto ? "↩️" : entra ? "💰" : "❔" },
    g.reparto ? `Reparto: ${g.length} Bizums de ${eur(f.importe)}` : f.concepto || C_titulo(sugerirPatron(f.texto)));
  // Un reparto no se recuerda por persona (cada Bizum es de uno distinto): solo se aplica a estos
  let recordar = !g.reparto, patron = g.reparto ? "" : f.patron || sugerirPatron(f.texto), concepto = f.concepto || "";
  const hecho = resolverGrupo(card, g, () => ({ recordar, patron, concepto: g.length === 1 ? concepto : null }));
  if (entra && !esTr && esBizum(f.texto)) gastosCandidatos(card, g, sug, hecho);
  const chips = card.createDiv({ cls: "fb-cats" });
  const chip = (texto, datos, cls) => { const b = chips.createEl("button", { text: texto, cls: cls || "" }); b.onclick = () => hecho(datos, b); return b; };
  const claseCat = (cat) => (grupoDe(cat) === "ingreso" ? "ingreso" : "gasto");
  if (esTr) {
    for (const c of cuentas().filter((c) => c.nombre !== p.cuenta)) chip(`🔁 ${entra ? "Desde" : "A"} ${c.nombre}`, { accion: "guardar", clase: "transferencia", cuenta_otra: c.nombre }, "sug");
    const bN = chips.createEl("button", { text: "＋ Otra cuenta mía…" }); bN.title = "Una cuenta tuya que aún no está en la app"; bN.onclick = () => nuevaCuentaYTraspaso(hecho, bN);
  }
  const vistas = new Set();
  if (sug && sug.categoria) {
    const b = chip(`✨ ${catIcono(sug.categoria)} ${sug.categoria}${sug.fuente === "jev" ? ` · ${sug.motivo}` : ""}`, { accion: "guardar", clase: sug.clase, categoria: sug.categoria }, "sug");
    b.title = `Sugerida: ${sug.motivo}`;
    vistas.add(sug.categoria);
  }
  for (const c of catsFrecuentes(entra, 6, f.importe)) if (!vistas.has(c)) { vistas.add(c); chip(`${catIcono(c)} ${c}`, { accion: "guardar", clase: claseCat(c), categoria: c }); }
  // Cualquier otra categoría (o gasto/ingreso cruzado: un ingreso que en realidad te devuelve un gasto)
  const sOtra = chips.createEl("select", { cls: "otra" });
  const o0 = sOtra.createEl("option", { text: "Otra…" }); o0.value = "";
  for (const [grupo, lbl] of [["gasto", entra ? "Te devuelven un gasto de…" : "Gasto"], ["ingreso", "Ingreso"]]) {
    const og = sOtra.createEl("optgroup"); og.label = lbl;
    for (const [v] of catSegunClase({ clase: grupo })) { const o = og.createEl("option", { text: `${catIcono(v)} ${v}` }); o.value = v; }
  }
  sOtra.onchange = () => { if (sOtra.value) hecho({ accion: "guardar", clase: claseCat(sOtra.value), categoria: sOtra.value }, sOtra); };
  if (!esTr && cuentas().length > 1) {
    const sTr = chips.createEl("select", { cls: "otra" });
    const t0 = sTr.createEl("option", { text: "Entre mis cuentas…" }); t0.value = "";
    for (const c of cuentas().filter((c) => c.nombre !== p.cuenta)) { const o = sTr.createEl("option", { text: `${entra ? "← desde" : "→ a"} ${c.nombre}` }); o.value = c.nombre; }
    sTr.onchange = () => { if (sTr.value) hecho({ accion: "guardar", clase: "transferencia", cuenta_otra: sTr.value }, sTr); };
  }
  const bD = chips.createEl("button", { cls: "desc", text: g.length > 1 ? "Descartar todos" : "Descartar" });
  bD.title = "No registrar " + (g.length > 1 ? "estos movimientos" : "este movimiento");
  bD.onclick = () => hecho({ accion: "ignorar" }, bD);
  if (g.reparto) return;  // sin «Opciones»: no hay nada que recordar ni nombre que cambiar
  plegable(card, "Opciones", (c) => {
    const f1 = c.createDiv({ cls: "fb-fila" });
    const lab = f1.createEl("label"); const chk = lab.createEl("input", { attr: { type: "checkbox" } }); chk.checked = recordar; chk.onchange = () => (recordar = chk.checked);
    lab.appendText("Recordar para la próxima vez los que contengan:");
    const iPat = f1.createEl("input", { attr: { type: "text" } }); iPat.value = patron; iPat.oninput = () => (patron = iPat.value);
    if (g.length === 1) {
      const f2 = c.createDiv({ cls: "fb-fila" });
      f2.createSpan({ cls: "fb-et", text: "Nombre para mostrar" });
      const iC = f2.createEl("input", { attr: { type: "text" } }); iC.value = concepto; iC.oninput = () => (concepto = iC.value);
    }
  });
}
function cabeceraTarjeta(card, p) {
  const f = p.fila;
  const top = card.createDiv({ cls: "top" });
  top.createSpan({ text: `${fmtISO(f.op)} · ${f.concepto || f.texto.slice(0, 40)}` });
  top.createSpan({ cls: "imp " + (f.importe < 0 ? "neg" : "pos"), text: eurS(f.importe) });
  card.createDiv({ cls: "txt", text: `${f.texto} · ${p.cuenta}` });
  card.createDiv({ cls: "duda", text: p.duda });
}
async function resolverPendiente(card, p, datos, boton) {
  boton.disabled = true;
  const r = await FB.api("/api/resolver", { id: p.id, ...datos });
  boton.disabled = false;
  if (!r.ok) { mensaje(card, r.mensaje || "Error", "err"); return; }
  FB.aviso(r.mensaje);
  await FB.refrescar();
}
function tarjetaInversion(padre, p) {
  const f = p.fila, card = padre.createDiv({ cls: "fb-card" });
  cabeceraTarjeta(card, p);
  const fila = card.createDiv({ cls: "fb-fila" });
  const sAcc = fila.createEl("select");
  for (const [v, t] of [["activo", f.importe < 0 ? "Compra de un activo" : "Venta de un activo"], ["interes", f.importe > 0 ? "Intereses o dividendos" : "Comisión"], ["ignorar", f.importe > 0 ? "Traspaso desde mi banco (ya está en el banco)" : "Traspaso a mi banco (ya está en el banco)"]]) { const o = sAcc.createEl("option", { text: t }); o.value = v; }
  sAcc.value = f.importe > 0 ? "ignorar" : "activo";
  const sAct = fila.createEl("select"); for (const [v] of opcActivos()) { const o = sAct.createEl("option", { text: v }); o.value = v; }
  const oN = sAct.createEl("option", { text: "Nuevo activo…" }); oN.value = "__nuevo";
  if (!opcActivos().length) sAct.value = "__nuevo";
  const iNuevo = fila.createEl("input", { attr: { type: "text", placeholder: "Nombre del activo (p. ej. Fondo MSCI World)" } });
  iNuevo.value = C_titulo(sugerirPatron(f.texto));
  const fila2 = card.createDiv({ cls: "fb-fila" });
  const lab = fila2.createEl("label"); const chk = lab.createEl("input", { attr: { type: "checkbox" } }); lab.appendText("Recordar:");
  const iPat = fila2.createEl("input", { attr: { type: "text" } }); iPat.value = f.patron || sugerirPatron(f.texto); chk.checked = true;
  const bG = fila2.createEl("button", { cls: "fb-btn", text: "Guardar" });
  const sync = () => { const a = sAcc.value === "activo"; sAct.style.display = a ? "" : "none"; iNuevo.style.display = a && sAct.value === "__nuevo" ? "" : "none"; };
  sAcc.onchange = sync; sAct.onchange = sync; sync();
  bG.onclick = () => resolverPendiente(card, p, { accion: sAcc.value, activo: sAct.value === "__nuevo" ? null : sAct.value,
    nuevo_activo: sAcc.value === "activo" && sAct.value === "__nuevo" ? iNuevo.value : null, recordar: chk.checked, patron: iPat.value }, bG);
}
const C_titulo = (s) => String(s).split(" ").map((w) => cap(w)).join(" ");
const sugerirPatron = (t) => norm(String(t).replace(/^(compra|pago|recibo|adeudo|transferencia|bizum)( en| a favor de| de)?\s+/i, "").replace(/[,].*$/, "").replace(/\s+\d{3,}.*$/, "")).split(" ").slice(0, 3).join(" ");

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

// ───────────── apuntar a mano ─────────────
function vistaApuntar() {
  titulo("Apuntar un movimiento", "Un gasto en efectivo, algo que aún no ha llegado al banco…");
  formulario(root, "movimiento", null, { volver: "#movimientos", avisoGuardado: "Apuntado ✓", textoGuardar: "Apuntar" });
  root.createDiv({ cls: "fin-note", text: "Si luego importas el extracto y el movimiento está (misma fecha e importe), no se duplica." });
}

// ───────────── cerrar el mes ─────────────
function vistaCerrar() {
  titulo("Actualizar saldos", "Anota lo que tienes en cada cuenta (mejor el último día del mes): así la app comprueba que no falta nada");
  const P = patrimonio();
  const ant = mesAnterior(hoyCal);  // los saldos se cierran por mes natural, empiece cuando empiece «tu mes»
  const primer = P.length ? keyCal(P[0].fecha) : hoyCal;
  const pendienteAnt = ant >= primer && !cierres().some((c) => c.mes === ant);
  let fecha = pendienteAnt ? mesDT(ant).endOf("month") : hoy;
  const resumen = resumenMes(ant);
  if (resumen.length) { const pr = panel(root, `Así fue ${mesLbl(ant).toLowerCase()}`); for (const t of resumen) pr.createDiv({ cls: "fin-note fb-frase", text: t }); }
  const p = panel(root, pendienteAnt ? `Cierre de ${mesLbl(ant).toLowerCase()}` : "Registro de saldos de hoy");
  if (!pendienteAnt && cierres().some((c) => c.mes === ant)) p.createDiv({ cls: "fin-note", text: `${mesLbl(ant)} ya está cerrado. Puedes anotar los saldos de hoy si quieres (por ejemplo, para comprobar que todo cuadra).` });
  const form = p.createDiv({ cls: "fb-form" });
  const campos = {}, refs = { s: {}, v: {} };
  const pintar = () => {
    form.innerHTML = "";
    refs.s = {}; refs.v = {};
    const u = [...P].reverse().find((x) => x.fecha < fecha.startOf("day")) || P[P.length - 1];
    const pr = u ? proyectar(u, fecha.endOf("day")) : null;
    form.createDiv({ cls: "et", text: "Fecha" });
    const iF = form.createEl("input", { attr: { type: "date" } }); iF.value = fecha.toISODate();
    iF.onchange = () => { const d = DateTime.fromISO(iF.value); if (d.isValid) { fecha = d; pintar(); } };
    form.createDiv({ cls: "sep", text: "Saldo de tus cuentas ese día" });
    for (const c of cuentas()) {
      const est = pr ? pr.cuentas.saldos[c.nombre] : null;
      const ext = cfg[`saldo_extracto:${c.nombre}`];
      const et = form.createDiv({ cls: "et", text: c.nombre });
      const i = form.createEl("input", { attr: { type: "number", step: "0.01" } });
      const prefill = ext && ext.fecha === fecha.toISODate() ? ext.saldo : est != null ? Math.round(est * 100) / 100 : "";
      i.value = campos["s:" + c.nombre] ?? prefill;
      i.oninput = () => (campos["s:" + c.nombre] = i.value);
      refs.s[c.nombre] = i;
      form.createDiv({ cls: "s", text: est != null ? `según los movimientos: ${eur(est)}${ext ? ` · último extracto: ${eur(ext.saldo)} el ${fmtISO(ext.fecha)}` : ""}` : "saldo de ese día" });
      if (est != null && ext && ext.fecha <= fecha.toISODate() && Math.abs(ext.saldo - est) >= 0.01) {  // el banco dice otra cosa: por qué puede ser
        const dif = ext.saldo - est;
        const n = form.createDiv({ cls: "s aviso-saldo" });
        n.appendText(`El banco dice ${eur(ext.saldo)}: ${eurS(dif, 2)} respecto a la cuenta de la app. `);
        n.appendText("Falta algún movimiento (o sobra uno apuntado a mano o previsto) entre el último registro y hoy. Si tu banco dice " + eur(ext.saldo) + ", anota ese saldo.");
      }
    }
    const A = activos().filter((a) => !vendidoDelTodo(a));
    if (A.length) {
      form.createDiv({ cls: "sep", text: "Valor de tu inversión ese día" });
      for (const a of A) {
        form.createDiv({ cls: "et", text: a.nombre });
        const i = form.createEl("input", { attr: { type: "number", step: "0.01" } });
        i.value = campos["v:" + a.nombre] ?? Math.round(valorHoy(a) * 100) / 100;
        i.oninput = () => (campos["v:" + a.nombre] = i.value);
        refs.v[a.nombre] = i;
        const sa = form.createDiv({ cls: "s" });
        const part = resumenInversion().filas.find((x) => x.nombre === a.nombre);
        if (part && part.participaciones > 0) {
          sa.appendText(`${nf(part.participaciones, 0, 4)} participaciones × precio `);
          const pr = sa.createEl("input", { cls: "fb-precio", attr: { type: "number", step: "0.0001", min: "0", placeholder: "€", "aria-label": `Precio de ${a.nombre}` } });
          pr.oninput = () => { const v = parseFloat(pr.value); if (v > 0) { i.value = (Math.round(v * part.participaciones * 100) / 100).toFixed(2); campos["v:" + a.nombre] = i.value; } };
          sa.appendText(" € · ");
        }
        sa.appendText(a.fechaValor ? `último valor anotado: ${eur(a.valor)} el ${a.fechaValor.toFormat("dd/MM")}` : "lo que vale hoy en tu bróker");
      }
    }
    form.createDiv({ cls: "sep", text: "Otros" });
    form.createDiv({ cls: "et", text: "Otros bienes (€)" });
    const iO = form.createEl("input", { attr: { type: "number", step: "0.01" } }); iO.value = campos.otros ?? (u ? u.otros || "" : ""); iO.oninput = () => (campos.otros = iO.value);
    form.createDiv({ cls: "et", text: "Deudas (€)" });
    const iD = form.createEl("input", { attr: { type: "number", step: "0.01" } }); iD.value = campos.deudas ?? (u ? u.deudas || "" : ""); iD.oninput = () => (campos.deudas = iD.value);
    form.createDiv({ cls: "et", text: "Lo destacable del mes (opcional)" });
    const iN = form.createEl("textarea", { attr: { rows: "3" } }); iN.value = campos.notas ?? ""; iN.oninput = () => (campos.notas = iN.value);
    Object.assign(refs, { otros: iO, deudas: iD, notas: iN });
  };
  pintar();
  const res = p.createDiv();
  const b = p.createEl("button", { cls: "fb-btn", text: pendienteAnt ? `Cerrar ${mesLbl(ant).toLowerCase()}` : "Guardar los saldos" });
  b.onclick = async () => {
    const saldos = {}, valores = {};
    for (const [n, i] of Object.entries(refs.s)) if (i.value !== "") saldos[n] = i.value;
    for (const [n, i] of Object.entries(refs.v)) if (i.value !== "") valores[n] = i.value;
    b.disabled = true;
    const r = await FB.api("/api/cierre", { fecha: fecha.toISODate(), mes: pendienteAnt ? ant : fecha.toFormat("yyyy-MM"), saldos, valores,
      otros: refs.otros.value, deudas: refs.deudas.value, notas: refs.notas.value });
    b.disabled = false;
    if (!r.ok) { res.innerHTML = ""; mensaje(res, r.mensaje || "Error", "err"); return; }
    FB.aviso(r.mensaje);
    await FB.recargar(); FB.ir("#inicio");
  };
  // Meses cerrados: resumen de cada uno (calculado con los movimientos) y sus notas
  const C = [...cierres()].sort((a, b) => String(b.mes).localeCompare(String(a.mes)));
  if (C.length) plegable(root, "Meses cerrados", (c) => {
    tabla(c, [{ t: "Mes" }, { t: "Ingresos", num: true }, { t: "Gastos", num: true }, { t: "Ahorro", num: true }, { t: "Tasa", num: true, opt: true }, { t: "Notas", opt: true }],
      C.filter((x) => mesDT(x.mes).isValid).map((x) => { const M = finMes(x.mes); return [{ text: mesLbl(x.mes), ruta: x.file.path }, eur(M.ingresos, 0), eur(M.gastos, 0), { text: eurS(M.ahorro, 0), cls: tone(M.ahorro) }, pct(M.tasa), x.notas || ""]; }));
  }, { extra: `${C.length}` });
}

// ───────────── ajustes ─────────────
function vistaAjustes() {
  titulo("Ajustes", "");
  if ((DB.info || {}).ejemplo) {
    const e = panel(root, "Estás viendo datos de ejemplo");
    e.createDiv({ cls: "fin-note", text: "Son inventados. Cuando quieras, vuelve a tus datos." });
    const b = e.createEl("button", { cls: "fb-btn", text: "Volver a mis datos" });
    b.onclick = async () => { await FB.api("/api/ejemplo", { activar: false }); await FB.recargar(); FB.ir("#inicio"); };
  }
  const tab = { datos: "datos", jev: "integraciones", precios: "integraciones", integraciones: "integraciones" }[params[0]] || "general";
  const seg = root.createDiv({ cls: "fb-seg" });
  for (const [k, t] of [["general", "General"], ["integraciones", "Asistente y precios"], ["datos", "Tus datos y copias"]]) { const l = enlace(seg, t, "#ajustes/" + k); l.className += k === tab ? " act" : ""; }
  const cnt = (t) => (DB.registros[t] || []).length;
  const g = tab === "general" ? rejilla() : null;
  if (tab === "general") {
  const pL = panel(g, "Tu límite de gasto variable");
  pL.createDiv({ cls: "fin-note", text: "Al mes, sin contar gastos fijos. 0 = sin límite." });
  const f = pL.createDiv({ cls: "fb-fila" });
  const iL = f.createEl("input", { cls: "corto", attr: { type: "number", step: "10" } }); iL.value = limiteVar || "";
  const bL = f.createEl("button", { cls: "fb-btn", text: "Guardar" });
  bL.onclick = async () => { await FB.api("/api/config", { limite_variable: iL.value }); FB.aviso("Guardado ✓"); await FB.refrescar(); };

  const pM = panel(g, "Tu mes y tu colchón");
  const fM = pM.createDiv({ cls: "fb-fila" });
  fM.createSpan({ cls: "fb-et", text: "Tu mes empieza el día" });
  const iM = fM.createEl("input", { cls: "mini", attr: { type: "number", min: "1", max: "28", step: "1", "aria-label": "Día en que empieza tu mes (de 1 a 28)" } }); iM.value = diaInicio;
  pM.createDiv({ cls: "fin-note", text: diaInicio === 1 ? "1 = el mes natural. Si cobras, por ejemplo, el 28, pon 28: tu «octubre» irá del 28 de septiembre al 27 de octubre."
    : `Ahora ${mesLbl(hoyKey).toLowerCase()} es ${mesRango(hoyKey)}. Los saldos y la inversión siguen por meses naturales.` });
  const fC = pM.createDiv({ cls: "fb-fila" });
  fC.createSpan({ cls: "fb-et", text: "Colchón en la cuenta corriente" });
  const iC = fC.createEl("input", { cls: "corto", attr: { type: "number", min: "0", step: "50", placeholder: "automático", "aria-label": "Colchón en la cuenta corriente, en euros" } }); iC.value = num(cfg.colchon) || "";
  const RP = planReparto();
  pM.createDiv({ cls: "fin-note", text: `Lo que quieres dejar siempre en la cuenta antes de mover lo que sobra. Vacío o 0 = lo calcula la app${RP ? ` (ahora ${eur(RP.colchonAuto, 0)}: un mes de fijos y de gasto variable, más los meses que se prevén en negativo)` : ""}.` });
  const bM = pM.createEl("button", { cls: "fb-btn", text: "Guardar" });
  bM.onclick = async () => { await FB.api("/api/config", { dia_inicio: iM.value || 1, colchon: iC.value || 0 }); FB.aviso("Guardado ✓"); await FB.refrescar(); };

  apariencia(panel(g, "Apariencia"));
  const pT = panel(g, "Tú", null, "Tu nombre tal y como sale en el banco. Con él, el dinero que mueves entre cuentas a tu nombre se reconoce como traspaso y no como gasto o ingreso.");
  pT.createDiv({ cls: "fin-note", text: "Se rellena solo con el titular del primer extracto que lo traiga. Si hay más titulares (cuenta conjunta), sepáralos con «;»." });
  const fT = pT.createDiv({ cls: "fb-fila" });
  const iT = fT.createEl("input", { attr: { type: "text", placeholder: "p. ej. GARCÍA LÓPEZ ANA" } }); iT.value = (cfg.titulares || []).join("; ");
  const bT = fT.createEl("button", { cls: "fb-btn", text: "Guardar" });
  bT.onclick = async () => { await FB.api("/api/titulares", { titulares: iT.value.split(";") }); FB.aviso("Guardado ✓"); await FB.refrescar(); };
  }
  if (tab === "integraciones") { panelJev(root); panelPrecios(root); }
  if (tab === "general") {
  const pI = panel(root, "Tu inicio", null, "Elige qué ves en la pantalla de inicio y en qué orden. Se guarda al momento.");
  pI.id = "tu-inicio";
  personalizarInicio(pI);
  if (params[0] === "inicio") setTimeout(() => { pI.scrollIntoView({ block: "start" }); pI.classList.add("resalta"); }, 30);
  if (params[0] === "precios") setTimeout(() => { const e = document.getElementById("precios"); if (e) { e.scrollIntoView({ block: "start" }); e.classList.add("resalta"); } }, 30);
  if (params[0] === "jev") setTimeout(() => { const e = document.getElementById("jev"); if (e) { e.scrollIntoView({ block: "start" }); e.classList.add("resalta"); } }, 30);
  }
  if (tab === "datos") {
  const accesos = (padre, lista) => {
    const box = padre.createDiv({ cls: "fb-accesos" });
    for (const [ic, t, s, ruta] of lista) {
      const a = box.createEl("a", { cls: "fb-acceso internal-link", href: ruta });
      const av = a.createDiv({ cls: "fb-av", text: ic }); setVar(av, "--cc", "var(--brand)");
      const d = a.createDiv(); d.createDiv({ cls: "t", text: t }); d.createDiv({ cls: "s", text: s });
    }
  };
  const pD = panel(root, "Tus datos");
  pD.createEl("h4", { cls: "fb-sec", text: "Dinero del día a día" });
  accesos(pD, [
    ["💳", "Cuentas", `${cnt("cuenta")} cuentas`, "#gestionar/cuenta"],
    ["🔁", "Fijos", `${cnt("recurrente")} ingresos y gastos que se repiten`, "#gestionar/recurrente"],
    ["🎯", "Objetivos", `${cnt("objetivo")} metas de ahorro`, "#gestionar/objetivo"],
    ["⏰", "Recordatorios", "renta, ITV, seguros anuales…", "#gestionar/recordatorio"],
  ]);
  pD.createEl("h4", { cls: "fb-sec", text: "Cómo se clasifica" });
  accesos(pD, [
    ["🏷️", "Categorías", `${cnt("categoria")} categorías · fusionar y ocultar`, "#gestionar/categoria"],
    ["🧠", "Reglas", "cómo se clasifica cada comercio · probarlas", "#gestionar/regla"],
    ["📄", "Formatos de archivo", "cómo se lee el Excel de cada banco", "#gestionar/perfil"],
  ]);
  pD.createEl("h4", { cls: "fb-sec", text: "Inversión" });
  accesos(pD, [
    ["🌱", "Activos", `${cnt("activo")} activos · editar o borrar`, "#gestionar/activo"],
    ["📥", "Compras de inversión", `${cnt("aportacion")} aportaciones`, "#gestionar/aportacion"],
    ["💵", "Dividendos y comisiones", `${cnt("cobro")} registrados · para la renta`, "#gestionar/cobro"],
  ]);

  panelCompartir(root);
  const pC = panel(root, "Carpeta de datos y copias de seguridad");
  pC.createDiv({ cls: "fin-note", text: `Tus datos están en ${DB.info.carpeta} (archivo datos.db). Cada día que abres la app se guarda una copia en la carpeta Copias (las 30 últimas).` });
  const fc = pC.createDiv({ cls: "fb-fila" });
  const bAbrir = fc.createEl("button", { cls: "fb-btn sec", text: "Abrir la carpeta" }); bAbrir.onclick = () => FB.api("/api/abrir_carpeta", { que: "datos" });
  const bCopia = fc.createEl("button", { cls: "fb-btn sec", text: "Hacer una copia ahora" }); bCopia.onclick = async () => { const r = await FB.api("/api/copia", {}); FB.aviso(r.mensaje || "Hecho"); };
  const det = pC.createEl("details"); det.createEl("summary", { text: "Restaurar una copia" });
  const fr = det.createDiv({ cls: "fb-fila" });
  const sCop = fr.createEl("select", { attr: { "aria-label": "Copia de seguridad" } });
  FB.api("/api/copias").then((r) => { for (const n of r.copias || []) { const o = sCop.createEl("option", { text: n }); o.value = n; } });
  const bRes = fr.createEl("button", { cls: "fb-btn sec", text: "Restaurar" });
  bRes.onclick = async () => { if (!sCop.value || !confirm(`¿Volver a los datos de «${sCop.value}»? Lo de ahora se guarda antes en otra copia.`)) return; const r = await FB.api("/api/restaurar", { copia: sCop.value }); FB.aviso(r.mensaje || "Hecho", !r.ok); await FB.refrescar(); };
  const det2 = pC.createEl("details"); det2.createEl("summary", { text: "Usar otra carpeta de datos" });
  const fr2 = det2.createDiv({ cls: "fb-fila" });
  const iC = fr2.createEl("input", { attr: { type: "text", placeholder: "C:\\Users\\…\\FinanceBuddy", "aria-label": "Carpeta de datos" } }); iC.value = DB.info.carpeta;
  const bC = fr2.createEl("button", { cls: "fb-btn sec", text: "Cambiar" });
  bC.onclick = async () => { const r = await FB.api("/api/carpeta", { carpeta: iC.value }); FB.aviso(r.mensaje || "Hecho", !r.ok); await FB.recargar(); FB.ir("#inicio"); };
  det2.createDiv({ cls: "fin-note", text: "Si la carpeta no tiene datos, se empieza de cero allí (tus datos actuales siguen en la carpeta de antes)." });
  const det3 = pC.createEl("details"); det3.createEl("summary", { text: "Borrar todos los datos" });
  det3.createDiv({ cls: "fin-note", text: "Se guarda una copia antes. Escribe BORRAR para confirmar." });
  const fr3 = det3.createDiv({ cls: "fb-fila" });
  const iB = fr3.createEl("input", { attr: { type: "text", placeholder: "BORRAR", "aria-label": "Escribe BORRAR para confirmar" } });
  const bB = fr3.createEl("button", { cls: "fb-btn sec peligro", text: "Borrar todo" });
  bB.onclick = async () => { const r = await FB.api("/api/vaciar", { confirmar: iB.value }); FB.aviso(r.mensaje || "Hecho", !r.ok); if (r.ok) { await FB.recargar(); FB.ir("#bienvenida"); } };

  }
  if (tab === "general") {
  const pS = panel(root, "FinanceBuddy");
  pS.createDiv({ cls: "fin-note", text: `Versión ${DB.info.version}. La app funciona en tu ordenador: cerrar la pestaña no la cierra.` });
  pS.createDiv({ cls: "fin-note", text: "Atajos de teclado: pulsa ? para verlos (D = modo discreto · I = importar · A = apuntar un movimiento · 1 a 5 = las secciones del menú)." });
  panelVersion(pS);
  const bS = pS.createDiv({ cls: "fb-fila" }).createEl("button", { cls: "fb-btn sec", text: "Cerrar FinanceBuddy" });
  bS.onclick = async () => { await FB.api("/api/salir", {}); document.body.innerHTML = "<p style='padding:40px;font-family:sans-serif'>FinanceBuddy se ha cerrado. Puedes cerrar esta pestaña.</p>"; };
  }
}

// Aviso de versión nueva (opcional, apagado de serie): una consulta pública a GitHub como mucho al día; no descarga ni instala nada.
function panelVersion(p) {
  const C = cfg.actualizaciones || {}, R = C.resultado || {};
  const o = p.createDiv({ cls: "fb-fila fb-opciones" });
  const l = o.createEl("label"); const c = l.createEl("input", { attr: { type: "checkbox" } }); c.checked = !!C.activo;
  l.appendText(" Avisarme si hay una versión nueva");
  c.onchange = async () => { await FB.api("/api/actualizaciones/config", { activo: c.checked }); FB.aviso(c.checked ? "Activado: se comprobará al abrir la app" : "Apagado"); await FB.refrescar(); };
  p.createDiv({ cls: "fin-note", text: "Consulta la página pública de versiones de FinanceBuddy en GitHub, como mucho una vez al día. No envía nada tuyo ni instala nada: solo te dice si hay algo nuevo y te lleva a su página. Apagado de serie." });
  if (!C.activo) return;
  const n = p.createDiv({ cls: "fin-note" });
  n.appendText(R.mensaje ? `${R.mensaje} ` : "Aún no se ha comprobado. ");
  if (R.nueva && R.url && /^https:\/\/github\.com\//.test(R.url)) { const a = n.createEl("a", { text: "Ver la versión nueva →", href: R.url, attr: { target: "_blank", rel: "noopener noreferrer" } }); a.className = "fin-link"; }
  const b = n.createEl("button", { cls: "fin-link", text: " Comprobar ahora" });
  b.onclick = async () => { b.disabled = true; const r = await FB.api("/api/actualizaciones/comprobar", { forzar: true }); if (!r.ok) FB.aviso(r.mensaje || "No se ha podido comprobar", true); await FB.refrescar(); };
}
// Tema (en este navegador) y color de acento (en tus datos).
const ACENTOS = [["salvia", "#1B7558"], ["violeta", "#5A44D4"], ["azul", "#1C5DCF"], ["verde", "#327D1A"], ["coral", "#CB4520"], ["rosa", "#C4307A"], ["grafito", "#2B3340"]];
// Asistente Jev (TypeSafe AI), opcional: la clave se guarda solo en tu carpeta de datos y nunca vuelve a la página.
function panelJev(padre) {
  const J = (DB.config || {}).jev || {};
  const p = panel(padre, "Asistente Jev (opcional)", { text: J.activo ? "activado" : J.hay_clave ? "desactivado" : "sin clave" },
    "Jev es un modelo de TypeSafe AI que elige entre opciones y dice con qué confianza. Solo sugiere: nunca guarda nada por su cuenta.");
  p.id = "jev";
  const usos = p.createEl("ul", { cls: "fb-lista-jev" });
  for (const t of ["Por revisar: la categoría de lo que tu historial no reconoce, y qué es cada texto raro del bróker (compra, intereses, traspaso…)",
    "Revisar tus categorías: lo que tienes en «Otros» o que parece estar en otra",
    "Apuntar: la categoría según escribes el concepto",
    "Fijos: si algo que se repite es una cuota o solo coincide",
    "Un banco nuevo: qué columna es cada cosa"]) usos.createEl("li", { text: t });
  p.createDiv({ cls: "fin-note", text: "Además del movimiento, Jev recibe contexto de tu propio historial para comparar con tu criterio: cómo has clasificado cosas parecidas, tus Bizums más habituales y qué ha pasado antes con esa persona (sin su nombre), y en un Bizum recibido, los gastos tuyos que podría devolver." });
  p.createDiv({ cls: "fin-note", text: "Se envía a TypeSafe (EE. UU.) solo el concepto del movimiento —sin nombres de los Bizum, números de tarjeta, IBAN ni correos— y el importe. Nada de saldos, cuentas ni fechas. Sin clave, la app funciona igual." });
  const f = p.createDiv({ cls: "fb-fila" });
  const i = f.createEl("input", { attr: { type: "password", autocomplete: "off", placeholder: J.hay_clave ? `Clave guardada (…${J.fin_clave})` : "Pega aquí tu clave de Jev", "aria-label": "Clave de Jev" } });
  const bG = f.createEl("button", { cls: "fb-btn", text: "Guardar" });
  const bP = f.createEl("button", { cls: "fb-btn sec", text: "Probar" });
  const msg = p.createDiv();
  // El resultado de «Probar» se guarda en FB.estado: la pantalla se redibuja al guardar y el mensaje sobrevive
  if (FB.estado.jevPrueba) mensaje(msg, FB.estado.jevPrueba.texto, FB.estado.jevPrueba.ok ? "ok" : "err");
  const enviar = async (d) => { const r = await FB.api("/api/jev/config", d); if (!r.ok) { msg.empty(); mensaje(msg, r.mensaje || "Error", "err"); } return r.ok; };
  const guardar = async (d, aviso) => { if (!(await enviar(d))) return false; FB.aviso(aviso); await FB.refrescar(); return true; };
  bG.onclick = () => { if (i.value.trim()) guardar({ clave: i.value.trim(), activo: true }, "Clave guardada ✓"); };
  bP.onclick = async () => {
    if (i.value.trim() && !(await enviar({ clave: i.value.trim(), activo: true }))) return;
    bP.disabled = true; msg.empty(); mensaje(msg, "Probando…");
    const r = await FB.api("/api/jev/probar", {});
    FB.estado.jevPrueba = { texto: r.mensaje || "Error", ok: !!r.ok };
    await FB.refrescar();
  };
  if (J.hay_clave) {
    const o = p.createDiv({ cls: "fb-fila fb-opciones" });
    const chk = (texto, k, v) => { const l = o.createEl("label"); const c = l.createEl("input", { attr: { type: "checkbox" } }); c.checked = v; c.onchange = () => guardar({ [k]: c.checked }, "Guardado ✓"); l.appendText(" " + texto); };
    chk("Activado", "activo", !!J.activo);
    chk("Pedir sugerencias al importar", "al_importar", !!J.al_importar);
    if (!J.de_entorno) { const q = o.createEl("button", { cls: "fin-link", text: "Quitar la clave" }); q.onclick = () => guardar({ clave: "", activo: false }, "Clave quitada"); }
    plegable(p, "Ver lo último que se ha enviado a Jev", (c) => {
      c.createDiv({ cls: "fin-note", text: "Exactamente lo que ha salido de tu ordenador, de lo más nuevo a lo más viejo (las últimas 30 consultas). Los nombres de personas, números de tarjeta, IBAN, direcciones y tu nombre no salen." });
      FB.api("/api/jev/enviado", {}).then((r) => {
        if (!r.ok || !(r.enviado || []).length) { vacio(c, "Aún no se ha enviado nada", " Aparecerá aquí en cuanto Jev revise algo."); return; }
        for (const e of r.enviado) {
          const x = c.createDiv({ cls: "fb-enviado" });
          x.createDiv({ cls: "c", text: e.cuando });
          x.createDiv({ cls: "e", text: e.estado });
          for (const q of e.preguntas) x.createDiv({ cls: "q", text: `Pregunta «${q.nombre}»: ${q.instrucciones} — ${q.tipo === "noul" ? "sí / no" : `${q.opciones.length} opciones: ${q.opciones.slice(0, 3).join(" | ")}${q.opciones.length > 3 ? " …" : ""}`}` });
        }
      });
    });
    const u = J.uso || {};
    const n = p.createDiv({ cls: "fin-note" });
    const coste = num(u.coste) < 0.01 ? "menos de un céntimo" : `unos ${nf(num(u.coste), 2, 2)} $`;
    n.appendText(`Este mes: ${u.consultas || 0} consulta${u.consultas === 1 ? "" : "s"} · ${coste} (TypeSafe cobra 0,042 $ por millón de palabras enviadas). `);
    if (J.activo) enlace(n, "Revisar tus categorías →", "#revision");
  }
}
function apariencia(p) {
  const f1 = p.createDiv({ cls: "fb-fila" });
  f1.createSpan({ cls: "fb-et", text: "Tema" });
  const seg = f1.createDiv({ cls: "fb-seg mini" });
  for (const [k, t] of [["claro", "Claro"], ["oscuro", "Oscuro"], ["auto", "Automático"]]) {
    const b = seg.createEl("button", { text: t, cls: FB.tema() === k ? "act" : "" });
    b.onclick = () => { FB.tema(k); render(); };
  }
  const f2 = p.createDiv({ cls: "fb-fila" });
  f2.createSpan({ cls: "fb-et", text: "Color" });
  const g = f2.createDiv({ cls: "fb-colores" });
  const actual = cfg.acento || "salvia";
  for (const [k, col] of ACENTOS) {
    const b = g.createEl("button", { cls: k === actual ? "act" : "", attr: { type: "button", title: cap(k), "aria-label": cap(k) } });
    b.style.background = col;
    b.onclick = async () => { document.body.dataset.acento = k; await FB.api("/api/config", { acento: k }); await FB.refrescar(); };
  }
  p.createDiv({ cls: "fin-note", text: "Los colores e iconos de cada categoría se cambian en Tus datos → Categorías." });
}
function personalizarInicio(p) {
  const lista = panelesInicio();
  const guardar = async () => {
    await FB.api("/api/config", { inicio: lista.filter((x) => x.visible).map((x) => x.id), inicio_ocultos: lista.filter((x) => !x.visible).map((x) => x.id) });
    await FB.recargar();
  };
  const box = p.createDiv({ cls: "fb-orden" });
  const pintar = () => {
    box.innerHTML = "";
    lista.forEach((x, i) => {
      const r = box.createDiv({ cls: "r" + (x.visible ? "" : " off") });
      const l = r.createEl("label"); const c = l.createEl("input", { attr: { type: "checkbox" } }); c.checked = x.visible;
      l.appendText(x.t);
      c.onchange = () => { x.visible = c.checked; pintar(); guardar(); };
      const mover = (d, t, title) => { const b = r.createEl("button", { text: t, attr: { type: "button", title, "aria-label": title } }); b.disabled = !lista[i + d]; b.onclick = () => { [lista[i], lista[i + d]] = [lista[i + d], lista[i]]; pintar(); guardar(); }; };
      mover(-1, "↑", "Subir"); mover(1, "↓", "Bajar");
    });
  };
  pintar();
}

// ───────────── listas y edición de registros ─────────────
function vistaGestionar() {
  const tipo = params[0];
  const F = FORMS[tipo];
  if (!F) { FB.ir("#ajustes"); return; }
  titulo(F.plural, F.ayuda || "");
  const barra = root.createDiv({ cls: "fin-filtros" });
  enlace(barra, "← Ajustes", "#ajustes").className += " fin-link";
  const inp = barra.createEl("input", { cls: "fin-search", attr: { type: "search", placeholder: "Buscar…" } });
  if (!["cierre"].includes(tipo)) enlace(barra, `+ Nuevo`, `#editar/${tipo}/nuevo`).className = "fb-btn";
  if (tipo === "recurrente") enlace(barra, "Detectar en mis movimientos", "#fijos").className = "fb-btn sec";
  if (tipo === "categoria") panelOrdenarCategorias(root);
  const cont = root.createDiv({ cls: "fin-panel" });
  let todos = [...(DB.registros[tipo] || [])];
  if (F.orden) todos.sort(F.orden);
  let deSerie = false;
  const pintar = () => {
    cont.innerHTML = "";
    const q = norm(inp.value.trim());
    let filas = todos.filter((r) => !q || norm(JSON.stringify(r)).includes(q));
    const ocultas = tipo === "regla" && !q && !deSerie ? filas.filter((r) => r.origen === "plantilla").length : 0;
    if (ocultas) {
      filas = filas.filter((r) => r.origen !== "plantilla");
      const n = cont.createDiv({ cls: "fin-note" });
      n.appendText(filas.length ? "Tus reglas: se crean solas cuando clasificas algo en «Por revisar» y marcas «Recordar». " : "Aún no tienes reglas propias: se crean solas cuando clasificas algo en «Por revisar» y marcas «Recordar». ");
      const b = n.createEl("button", { cls: "fin-link", text: `Ver también las ${ocultas} de serie` });
      b.onclick = () => { deSerie = true; pintar(); };
      if (!filas.length) return;
    }
    if (!filas.length) { vacio(cont, q ? "Nada coincide" : `Aún no hay ${F.plural.toLowerCase()}`); return; }
    const pg = paginacion(filas, "gestionar_" + tipo, pintar), vis = pg.parte;
    tabla(cont, F.cols.map((t, i) => ({ t, num: t === "Importe" || t === "Valor" || t === "Cuentas" || t === "Inversión" })), vis.map((r) => {
      const celdas = F.fila(r);
      celdas[0] = { text: typeof celdas[0] === "object" ? celdas[0].text : String(celdas[0] ?? ""), ruta: `#editar/${tipo}/${r.id}` };
      return celdas;
    }));
    pg.pie(cont);
  };
  inp.oninput = () => { FB.estado["pag_gestionar_" + tipo] = 0; pintar(); };
  pintar();
}
// Fusionar u ocultar categorías (Ajustes → Categorías). Todo con vista previa y «Deshacer» (el servidor guarda una foto antes).
function panelOrdenarCategorias(padre) {
  const cats = registros("categoria");
  const uso = {};
  for (const c of cats) uso[c.nombre] = { m: 0, f: 0, r: 0 };
  for (const [t, k] of [["movimiento", "m"], ["recurrente", "f"], ["regla", "r"]]) for (const x of registros(t)) if (uso[x.categoria]) uso[x.categoria][k]++;
  const sinUso = cats.filter((c) => !c.oculta && !uso[c.nombre].m && !uso[c.nombre].f && !uso[c.nombre].r && !(num(c.presupuesto) > 0));
  const ocultas = cats.filter((c) => c.oculta);
  const nota = (c) => `${uso[c.nombre].m} movimientos · ${uso[c.nombre].f} fijos · ${uso[c.nombre].r} reglas`;
  const hecho = async (r) => { FB.aviso(r.mensaje || "Hecho", !r.ok, r.ok ? avisoDeshacer() : undefined); await FB.refrescar(); };
  const p = plegable(padre, "Ordenar: fusionar u ocultar categorías", (b) => {
    // Fusionar
    b.createEl("h4", { text: "Fusionar dos categorías" });
    b.createDiv({ cls: "fin-note", text: "Pasa todo lo de una categoría a otra (movimientos, fijos, reglas y presupuesto) y borra la primera. Antes verás qué cambiaría." });
    const f = b.createDiv({ cls: "fb-fila" });
    const opciones = (sel, vacioTxt) => { sel.createEl("option", { text: vacioTxt }).value = ""; for (const c of cats) sel.createEl("option", { text: c.nombre + (c.oculta ? " (oculta)" : "") }).value = c.nombre; };
    const sO = f.createEl("select", { attr: { "aria-label": "Categoría que desaparece" } }); opciones(sO, "— la que desaparece —");
    f.createSpan({ cls: "fb-et", text: "pasa a" });
    const sD = f.createEl("select", { attr: { "aria-label": "Categoría que se queda" } }); opciones(sD, "— la que se queda —");
    const res = b.createDiv({ attr: { "aria-live": "polite" } });
    const ver = async () => {
      res.innerHTML = "";
      if (!sO.value || !sD.value) return;
      const r = await FB.api("/api/categoria/fusionar", { origen: sO.value, destino: sD.value, previa: true });
      res.innerHTML = "";
      if (!r.ok) { mensaje(res, r.mensaje || "No se puede fusionar", "err"); return; }
      const ul = res.createEl("ul", { cls: "fb-prueba-lista fb-resumen" });
      ul.createEl("li", { text: `${r.movimientos} movimiento${r.movimientos === 1 ? "" : "s"} pasan a «${sD.value}»` });
      if (r.fijos) ul.createEl("li", { text: `${r.fijos} fijo${r.fijos === 1 ? "" : "s"} pasan a «${sD.value}»` });
      if (r.reglas) ul.createEl("li", { text: `${r.reglas} regla${r.reglas === 1 ? "" : "s"} apuntan a «${sD.value}»` });
      if (r.presupuesto_origen) ul.createEl("li", { text: `Presupuesto: ${eur(r.presupuesto_origen, 0)} + ${eur(r.presupuesto_destino, 0)} = ${eur(r.presupuesto, 0)} al mes` });
      if (r.grupo_cambia) ul.createEl("li", { text: "Ojo: una es gasto fijo y la otra variable; lo de «" + sO.value + "» pasará a contar como la que se queda." });
      ul.createEl("li", { text: `«${sO.value}» se borra` });
      const bF = res.createEl("button", { cls: "fb-btn", text: `Fusionar «${sO.value}» en «${sD.value}»`, attr: { type: "button" } });
      bF.onclick = async () => {
        if (!confirm(`¿Fusionar «${sO.value}» en «${sD.value}»? Podrás deshacerlo justo después.`)) return;
        bF.disabled = true; await hecho(await FB.api("/api/categoria/fusionar", { origen: sO.value, destino: sD.value }));
      };
    };
    sO.onchange = ver; sD.onchange = ver;
    // Ocultar
    b.createEl("h4", { text: "Ocultar las que no usas" });
    b.createDiv({ cls: "fin-note", text: "Una categoría oculta no sale al elegir categoría, pero no se borra: puedes volver a enseñarla cuando quieras." });
    if (!sinUso.length) b.createDiv({ cls: "fin-note", text: "Todas tus categorías visibles tienen algún movimiento, fijo, regla o presupuesto." });
    else {
      b.createDiv({ cls: "fin-note", text: `Sin movimientos, fijos, reglas ni presupuesto (${sinUso.length}):` });
      const chips = b.createDiv({ cls: "fb-cats" });
      for (const c of sinUso) { const x = chips.createEl("span", { cls: "fb-chip", text: `${catIcono(c.nombre)} ${c.nombre}` }); x.title = nota(c); }
      const bO = b.createEl("button", { cls: "fb-btn sec", text: `Ocultar estas ${sinUso.length}`, attr: { type: "button" } });
      bO.onclick = async () => {
        if (!confirm(`¿Ocultar ${sinUso.length} categorías sin usar? No se borra nada y podrás deshacerlo.`)) return;
        bO.disabled = true; await hecho(await FB.api("/api/categoria/ocultar", { nombres: sinUso.map((c) => c.nombre) }));
      };
    }
    if (ocultas.length) {
      b.createDiv({ cls: "fin-note", text: `Ocultas ahora (${ocultas.length}), pulsa para volver a enseñarla:` });
      const ch = b.createDiv({ cls: "fb-cats" });
      for (const c of ocultas) { const x = ch.createEl("button", { text: `${catIcono(c.nombre)} ${c.nombre}`, attr: { type: "button", title: nota(c) } }); x.onclick = async () => hecho(await FB.api("/api/categoria/ocultar", { nombres: [c.nombre], ocultar: false })); }
    }
  }, { extra: [sinUso.length ? `${sinUso.length} sin usar` : "", ocultas.length ? `${ocultas.length} ocultas` : ""].filter(Boolean).join(" · ") });
  return p;
}
function vistaEditar() {
  const [tipo, id] = params;
  const F = FORMS[tipo];
  if (!F) { FB.ir("#ajustes"); return; }
  let reg = id === "nuevo" ? null : (DB.registros[tipo] || []).find((r) => String(r.id) === String(id));
  if (id === "nuevo" && tipo === "cobro" && params[2]) { const act = (DB.registros.activo || []).find((r) => String(r.id) === params[2]); if (act) reg = { activo: act.nombre }; }
  if (id === "nuevo" && tipo === "aportacion" && params[2]) { const act = (DB.registros.activo || []).find((r) => String(r.id) === params[2]); if (act) reg = { activo: act.nombre }; }
  titulo(reg && reg.id ? `Editar ${F.uno}` : `Nuevo: ${F.uno}`, F.ayuda || "");
  if (id !== "nuevo" && !reg) { vacio(root, "Ese registro ya no existe"); return; }
  const volver = FB.anterior && !FB.anterior.startsWith("#editar") ? FB.anterior : `#gestionar/${tipo}`;
  if (tipo === "movimiento" && reg && ["gasto", "ingreso", "reembolso"].includes(reg.clase)) cambioCategoria(root, reg, volver);
  if (tipo === "movimiento" && reg && reg.id) panelReembolsos(root, reg);
  formulario(root, tipo, reg, { volver });
  if (tipo === "aportacion" && reg && reg.id) {
    const x = [reg.supuesta ? "La orden no decía si era compra o venta: se tomó como compra. Si fue una venta, pon el importe y las participaciones en negativo." : "",
      reg.ext_texto ? `Del extracto: «${reg.ext_texto}» (${eurS(num(reg.ext_importe))}, ${fmtISO(reg.ext_fecha)}).` : "", reg.orden ? "Viene del archivo de órdenes del bróker." : "",
      reg.ajuste ? "Ajuste para cuadrar las participaciones con tu bróker (sin dinero)." : ""].filter(Boolean);
    for (const t of x) root.createDiv({ cls: "fin-note", text: t });
  }
  if (tipo === "movimiento" && reg && reg.ext_texto) root.createDiv({ cls: "fin-note", text: `Del extracto: «${reg.ext_texto}» (${eurS(num(reg.ext_importe))}, ${fmtISO(reg.ext_fecha)})` });
}

// Cambiar la categoría a un clic; si viene del extracto, también la de los parecidos (mismo comercio) y recordarlo.
// En la ficha de un gasto: lo que te han devuelto y lo que te costó de verdad. En la de un reembolso: de qué gasto es.
function panelReembolsos(padre, reg) {
  const movs = registros("movimiento");
  if (reg.clase === "gasto") {
    const rs = movs.filter((m) => m.reembolsa === reg.id).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    if (!rs.length) return;
    const dev = sum(rs.map((m) => num(m.importe)));
    const p = panel(padre, "Te lo han devuelto", { text: `${rs.length} Bizum${rs.length > 1 ? "s" : ""}` }, "Dinero que te han devuelto de este gasto (sus Bizums). Resta de su categoría.");
    filasDato(p, [...rs.map((m) => ({ l: `${fechaCorta(m.fecha)} · ${m.concepto}`, v: `+${eur(num(m.importe))}`, t: "pos", ruta: `#editar/movimiento/${m.id}` })),
      { l: "Pagaste", v: eur(num(reg.importe)) }, { l: "Te han devuelto", v: eur(dev) }, { l: "Tu parte real", v: eur(Math.max(0, num(reg.importe) - dev)), t: "b" }]);
  } else if (reg.clase === "reembolso" && reg.reembolsa) {
    const g = movs.find((m) => m.id === reg.reembolsa);
    if (!g) return;
    const otros = movs.filter((m) => m.reembolsa === g.id), dev = sum(otros.map((m) => num(m.importe)));
    const p = panel(padre, "Devuelve parte de este gasto");
    filasDato(p, [{ l: `${fechaCorta(g.fecha)} · ${g.concepto}`, s: `${g.categoria || ""}${g.ext_texto ? " · " + g.ext_texto : ""}`, v: eur(num(g.importe)), ruta: `#editar/movimiento/${g.id}` },
      { l: `Lo devuelven ${otros.length} Bizum${otros.length > 1 ? "s" : ""}`, v: eur(dev) }, { l: "Tu parte real", v: eur(Math.max(0, num(g.importe) - dev)), t: "b" }]);
  }
}
function cambioCategoria(padre, reg, volver) {
  const p = panel(padre, "Cambiar la categoría");
  const chips = p.createDiv({ cls: "fb-cats" });
  const opciones = p.createDiv({ cls: "fb-fila fb-opciones" });
  let parecidos = true, recordar = true;
  const conExtracto = !!reg.ext_texto;
  if (conExtracto) {
    const l1 = opciones.createEl("label"); const c1 = l1.createEl("input", { attr: { type: "checkbox" } }); c1.checked = true; c1.onchange = () => (parecidos = c1.checked);
    const t1 = l1.createSpan({ text: "Cambiar también los parecidos" });
    const l2 = opciones.createEl("label"); const c2 = l2.createEl("input", { attr: { type: "checkbox" } }); c2.checked = true; c2.onchange = () => (recordar = c2.checked);
    l2.appendText("y recordarlo para los próximos");
    FB.api("/api/parecidos", { id: reg.id }).then((r) => {
      if (!r.ok) return;
      if (!r.n) { l1.style.display = "none"; parecidos = false; }
      t1.textContent = `Cambiar también ${r.n === 1 ? "el otro movimiento" : `los otros ${r.n} movimientos`} de «${C_titulo(r.patron)}»`;
    });
  }
  const grupo = reg.clase === "ingreso" ? "ingreso" : "gasto";
  for (const [c] of catSegunClase({ clase: grupo })) {
    const b = chips.createEl("button", { text: `${catIcono(c)} ${c}`, cls: c === reg.categoria ? "act" : "" });
    b.onclick = async () => {
      b.disabled = true;
      const r = await FB.api("/api/recategorizar", { id: reg.id, categoria: c, parecidos: conExtracto && parecidos, recordar: conExtracto && recordar });
      if (!r.ok) { b.disabled = false; mensaje(p, r.mensaje || "Error", "err"); return; }
      FB.aviso(r.mensaje);
      await FB.recargar();
      FB.ir(volver);
    };
  }
}

// ───────────── render ─────────────
const TODAS = { ...VISTAS, bienvenida: vistaBienvenida, importar: vistaImportar, revisar: vistaRevisar, apuntar: vistaApuntar, cerrar: vistaCerrar,
  valores: vistaCerrar, ajustes: vistaAjustes, gestionar: vistaGestionar, editar: vistaEditar, fijos: vistaFijos, activo: vistaActivo, revision: vistaRevision, renta: vistaRenta, reparto: vistaReparto };
const TITULOS = { inicio: "Inicio", movimientos: "Movimientos", inversion: "Inversión",
  bienvenida: "Bienvenida", importar: "Importar", revisar: "Por revisar", apuntar: "Apuntar", cerrar: "Cerrar el mes", valores: "Valores", ajustes: "Ajustes", gestionar: "Ajustes", editar: "Editar", fijos: "Fijos", activo: "Inversión", revision: "Revisar categorías", renta: "Para la renta", reparto: "Reparto objetivo" };
function render() {
  _movs = _movsMes = _aports = _objs = _pat = _cuentas = _recs = _activos = _cats = _cobros = undefined; _finMes = new Map(); _pos = new Map();
  root.empty();
  const sinConfigurar = !cuentas().length && !["bienvenida", "ajustes", "gestionar", "editar", "importar"].includes(vista);
  (sinConfigurar ? vistaBienvenida : TODAS[vista] || vistaInicio)();
  etiquetar(root);
  document.title = "FinanceBuddy · " + (TITULOS[sinConfigurar ? "bienvenida" : vista] || "Inicio");
}
render();
if (!(input && input.exponer)) autoCuadre();
// Para las pruebas automáticas.
if (input && input.exponer) {
  window.__fin = { periodoKey, periodoInicio, rentabilidadPeriodo, planReparto, DateTime, finMes, repartoAhorro, estimacion, conciliacion, prevision, resumenInversion, fondoEmergencia, gastoVariable, tasa12, repartoObjetivo, repartoAportacion, validarObjetivos, resumenMes, subidasFijos,
    movimientos, aportaciones, objetivos, patrimonio, avisos, categorias, grupoDe, limiteVar, mesesHasta, mesAnterior, hoyKey,
    fechaDatos, presupuestoSemana, planReparto, cuentas, proyectar, resumenCategorias, ritmoMes, evolucionInversion, aportacionesMes, constancia, interesesBroker, saludInversion, posicion, valorInfo,
    hitosPatrimonio, mesesHasta50, tamañoCompras, fifoVentas, cobros, usaMercado, generarResumen };
}

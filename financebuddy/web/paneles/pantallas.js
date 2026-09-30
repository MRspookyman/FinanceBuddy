// ═════════════ pantallas de la app: primeros pasos, importar, revisar, apuntar, cerrar el mes, ajustes ═════════════
const fmtISO = (iso) => fechaCorta(iso);
const titulo = (t, sub, conNav = true) => cabecera(t, false, sub);

// ───────────── primeros pasos ─────────────
function vistaBienvenida() {
  const intro = root.createDiv({ cls: "fb-bienvenida" });
  intro.createEl("h2", { text: "Hola, soy FinanceBuddy 👋" });
  intro.createEl("p", { text: "Importas los extractos de tu banco (Excel o CSV) y te digo cuánto puedes gastar, a dónde va tu dinero y qué hacer con lo que sobra. Todo se queda en tu ordenador." });
  const pe = intro.createDiv();
  pe.appendText("¿Prefieres verla antes con datos inventados? ");
  accion(pe, "Probar con datos de ejemplo", async () => { const r = await FB.api("/api/ejemplo", { activar: true }); if (r.ok) { await FB.recargar(); FB.ir("#inicio"); } else FB.aviso(r.mensaje, true); });

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
  p2.createDiv({ cls: "fin-note", text: "Lo que te quieres permitir en comer fuera, compras, ocio… (sin contar alquiler ni recibos). Con él verás cuánto te queda cada semana." });
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
  let tipo = "banco";
  const radios = [["banco", "Extracto del banco"], ["inversion", "Movimientos del bróker"]].map(([v, t]) => {
    const l = tipoSel.createEl("label"); const r = l.createEl("input", { attr: { type: "radio", name: "tipoimp" } }); r.checked = v === tipo; r.onchange = () => (tipo = v); l.appendText(t); return r;
  });
  const zona = pS.createDiv({ cls: "fb-zona", text: "Arrastra aquí el Excel o CSV, o pulsa para elegirlo" });
  const inp = pS.createEl("input", { attr: { type: "file", accept: ".xlsx,.xls,.csv,.txt", multiple: "" } }); inp.style.display = "none";
  zona.onclick = () => inp.click();
  const subir = async (files) => {
    for (const f of files) {
      zona.textContent = `Importando ${f.name}…`;
      const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.readAsDataURL(f); });
      const r = await FB.api("/api/importar/subir", { nombre: f.name, tipo, contenido: b64 });
      guardarImport([r, ...resultadosImport]);
    }
    await FB.refrescar();
  };
  inp.onchange = () => subir([...inp.files]);
  zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("sobre"); });
  zona.addEventListener("dragleave", () => zona.classList.remove("sobre"));
  zona.addEventListener("drop", (e) => { e.preventDefault(); zona.classList.remove("sobre"); subir([...e.dataTransfer.files]); });

  const pC = panel(g, "O déjalo en la carpeta Importar");
  pC.createDiv({ cls: "fin-note", text: "Guarda los extractos en «Importar\\Banco» o «Importar\\Inversión» (dentro de tu carpeta de datos) y pulsa el botón. Los archivos importados pasan a «Procesados»." });
  const arch = (DB.info || {}).archivos || [];
  if (arch.length) filasDato(pC, arch.map((a) => ({ l: a.nombre, s: a.tipo === "banco" ? "banco" : a.tipo === "inversion" ? "bróker" : "se detectará el tipo", v: "" })));
  const fb = pC.createDiv({ cls: "fb-fila" });
  const bI = fb.createEl("button", { cls: "fb-btn", text: arch.length ? `Importar ${arch.length} archivo${arch.length > 1 ? "s" : ""}` : "Importar la carpeta" });
  bI.onclick = async () => { bI.disabled = true; bI.textContent = "Importando…"; const r = await FB.api("/api/importar/carpeta", {}); guardarImport([...(r.resultados || [r]), ...resultadosImport]); await FB.refrescar(); };
  const bA = fb.createEl("button", { cls: "fb-btn sec", text: "Abrir la carpeta" });
  bA.onclick = () => FB.api("/api/abrir_carpeta", {});

  if (resultadosImport.length) {
    const pR = panel(root, "Resultado");
    for (const r of resultadosImport) resultadoImport(pR, r);
  }
  plegable(root, "¿Cómo descargo el extracto?", (c) => {
    filasDato(c, [
      { l: "Banco", s: "En la web o la app de tu banco: Cuentas → Movimientos → elige las fechas → Descargar / Exportar en Excel (o CSV). Mejor si incluye la columna de saldo: así la app comprueba que no falta nada.", v: "" },
      { l: "Bróker", s: "Busca los movimientos de la cuenta de efectivo (compras, ventas, intereses) y expórtalos en Excel o CSV.", v: "" },
      { l: "La primera vez", s: "Si la app no conoce el formato, te pedirá qué columna es la fecha, el concepto y el importe. Solo una vez por banco.", v: "" },
      { l: "Repetir no pasa nada", s: "Si importas dos veces el mismo periodo, lo ya importado se reconoce y se omite.", v: "" },
    ]);
  }, { extra: "ayuda" });
}
function resultadoImport(padre, r) {
  const card = padre.createDiv({ cls: "fb-card" });
  if (r.ok) {
    mensaje(card, r.mensaje || "Importado", "ok");
    if (r.dudas) enlace(card, `Revisar ${r.dudas} movimiento${r.dudas > 1 ? "s" : ""} →`, "#revisar");
    if (r.tipo === "banco" && r.nuevas) enlace(card, "Detectar tus ingresos y gastos fijos →", "#fijos");
    return;
  }
  if (r.necesita === "cuenta") {
    card.createDiv({ cls: "top", text: `${r.archivo}: ¿de qué cuenta es este extracto?` });
    card.createDiv({ cls: "txt", text: `Formato reconocido: ${r.perfil}. Elige la cuenta; se recordará para la próxima vez.` });
    const f = card.createDiv({ cls: "fb-fila" });
    const importarEn = async (cuenta, b) => { b.disabled = true; const x = await FB.api("/api/importar/reintentar", { archivo: r.archivo, tipo: r.tipo, cuenta, perfil: r.perfil }); reemplazar(r, x); };
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
const reemplazar = async (viejo, nuevo) => { guardarImport(resultadosImport.map((x) => (x === viejo ? nuevo : x))); await FB.refrescar(); };
// Formato nuevo: el usuario dice qué columna es cada cosa (se guarda como «formato» y se reconoce solo la próxima vez).
function configurarFormato(card, r) {
  card.createDiv({ cls: "top", text: `${r.archivo}: formato nuevo` });
  card.createDiv({ cls: "txt", text: "Dime qué columna es cada cosa (solo esta vez: la próxima se reconocerá solo)." });
  const cab = (r.cabecera || []).map((c, i) => [c, c || `(columna ${i + 1})`]).filter(([c]) => c);
  const tw = card.createDiv({ cls: "fin-tablewrap" });
  const t = tw.createEl("table", { cls: "fin-table fb-muestra" });
  const hr = t.createEl("thead").createEl("tr"); for (const c of r.cabecera || []) hr.createEl("th", { text: c });
  const tb = t.createEl("tbody"); for (const f of r.ejemplos || []) { const tr = tb.createEl("tr"); for (const c of f) tr.createEl("td", { text: c }); }
  let tipo = r.tipo || "banco";
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
      s.value = sel[k] ?? (adivina && !(k === "fecha" && /valor/i.test(adivina[0])) ? adivina[0] : "");
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
    const x = await FB.api("/api/importar/reintentar", { archivo: r.archivo, tipo, columnas, perfil: iN.value, cuenta: sC.value, compras_negativas: cNeg ? cNeg.checked : true });
    b.disabled = false;
    if (!x.ok && !x.necesita) { m.innerHTML = ""; mensaje(m, x.mensaje || "Error", "err"); return; }
    reemplazar(r, x);
  };
}

// ───────────── por revisar ─────────────
function vistaRevisar() {
  titulo("Por revisar", "Movimientos que la app no ha sabido clasificar sola");
  const P = DB.pendientes || [];
  if (!P.length) { mensaje(root, "Todo revisado ✓ No hay movimientos pendientes.", "ok"); return; }
  root.createDiv({ cls: "fin-note", text: "Marca «recordar» y la próxima vez se clasificarán solos. Si no quieres registrar un movimiento, descártalo." });
  const cont = root.createDiv();
  for (const p of [...P].sort((a, b) => String(a.fila.op).localeCompare(String(b.fila.op)))) (p.tipo_import === "inversion" ? tarjetaInversion : tarjetaBanco)(cont, p);
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
function tarjetaBanco(padre, p) {
  const f = p.fila, card = padre.createDiv({ cls: "fb-card" });
  cabeceraTarjeta(card, p);
  const fila = card.createDiv({ cls: "fb-fila" });
  const sClase = fila.createEl("select"); for (const [k, t] of Object.entries(CLASE_MOV)) { const o = sClase.createEl("option", { text: t }); o.value = k; }
  sClase.value = f.clase in CLASE_MOV ? f.clase : f.importe < 0 ? "gasto" : "ingreso";
  const sCat = fila.createEl("select");
  const llenarCat = () => { sCat.innerHTML = ""; for (const [v, t] of catSegunClase({ clase: sClase.value })) { const o = sCat.createEl("option", { text: t }); o.value = v; } if ([...sCat.options].some((o) => o.value === f.cat)) sCat.value = f.cat; };
  const sOtra = fila.createEl("select");
  for (const c of cuentas().filter((c) => c.nombre !== p.cuenta)) { const o = sOtra.createEl("option", { text: (f.importe < 0 ? "→ a " : "← desde ") + c.nombre }); o.value = c.nombre; }
  const iCon = fila.createEl("input", { attr: { type: "text", placeholder: "Concepto" } }); iCon.value = f.concepto || "";
  const fila2 = card.createDiv({ cls: "fb-fila" });
  const lab = fila2.createEl("label"); const chk = lab.createEl("input", { attr: { type: "checkbox" } }); lab.appendText("Recordar para la próxima vez:");
  const iPat = fila2.createEl("input", { attr: { type: "text", placeholder: "texto que lo identifica" } }); iPat.value = f.patron || sugerirPatron(f.texto);
  chk.checked = true;
  const bG = fila2.createEl("button", { cls: "fb-btn", text: "Guardar" });
  const bD = fila2.createEl("button", { cls: "fb-btn sec", text: "Descartar" });
  bD.title = "No registrar este movimiento";
  const sync = () => { const t = sClase.value === "transferencia"; llenarCat(); sCat.style.display = t ? "none" : ""; sOtra.style.display = t ? "" : "none"; if (t && !sOtra.options.length) sOtra.style.display = "none"; };
  sClase.onchange = sync; sync();
  bG.onclick = () => resolverPendiente(card, p, { accion: "guardar", clase: sClase.value, categoria: sCat.value, concepto: iCon.value, cuenta_otra: sOtra.value, recordar: chk.checked, patron: iPat.value }, bG);
  bD.onclick = () => resolverPendiente(card, p, { accion: "ignorar" }, bD);
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
    const sel = r.fijos.map((f) => ({ ...f, marcado: f.grupo !== "variable" }));
    for (const f of sel) {
      const card = p1.createDiv({ cls: "fb-card" });
      const top = card.createDiv({ cls: "top" });
      top.createSpan({ text: `${f.clase === "ingreso" ? "Entra" : "Sale"} · ${GRUPO_TXT[f.grupo] || f.grupo}` });
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
  const ant = mesAnterior(hoyKey);
  const primer = P.length ? keyDe(P[0].fecha) : hoyKey;
  const pendienteAnt = ant >= primer && !cierres().some((c) => c.mes === ant);
  let fecha = pendienteAnt ? mesDT(ant).endOf("month") : hoy;
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
    }
    const A = activos();
    if (A.length) {
      form.createDiv({ cls: "sep", text: "Valor de tu inversión ese día" });
      for (const a of A) {
        form.createDiv({ cls: "et", text: a.nombre });
        const i = form.createEl("input", { attr: { type: "number", step: "0.01" } });
        i.value = campos["v:" + a.nombre] ?? Math.round(valorHoy(a) * 100) / 100;
        i.oninput = () => (campos["v:" + a.nombre] = i.value);
        refs.v[a.nombre] = i;
        form.createDiv({ cls: "s", text: a.fechaValor ? `último valor anotado: ${eur(a.valor)} el ${a.fechaValor.toFormat("dd/MM")}` : "lo que vale hoy en tu bróker" });
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

// ───────────── valores de la inversión ─────────────
function vistaValores() {
  titulo("Actualizar valores", "Lo que vale hoy cada activo (míralo en tu bróker)");
  const A = registros("activo").filter((a) => a.estado !== "vendido");
  if (!A.length) { vacio(root, "Aún no hay activos"); enlace(root.createDiv({ cls: "fin-note" }), "Añadir un activo →", "#editar/activo/nuevo"); return; }
  const p = panel(root, "");
  const form = p.createDiv({ cls: "fb-form" });
  form.createDiv({ cls: "et", text: "Fecha" });
  const iF = form.createEl("input", { attr: { type: "date" } }); iF.value = hoy.toISODate();
  const ins = {};
  for (const a of A) {
    form.createDiv({ cls: "et", text: a.nombre });
    const i = form.createEl("input", { attr: { type: "number", step: "0.01" } }); i.value = a.valor ?? ""; ins[a.nombre] = i;
    form.createDiv({ cls: "s", text: a.fecha_valor ? `anterior: ${eur(num(a.valor))} el ${fmtISO(a.fecha_valor)}` : "" });
  }
  const b = p.createEl("button", { cls: "fb-btn", text: "Guardar" });
  b.onclick = async () => {
    const valores = {}; for (const [n, i] of Object.entries(ins)) if (i.value !== "") valores[n] = i.value;
    const r = await FB.api("/api/valores", { fecha: iF.value, valores });
    if (r.ok) { FB.aviso(r.mensaje); await FB.recargar(); FB.ir("#inicio"); } else mensaje(p, r.mensaje, "err");
  };
  enlace(p.createDiv({ cls: "fin-note" }), "Editar o añadir activos →", "#gestionar/activo");
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
  const g = rejilla();
  const pL = panel(g, "Tu límite de gasto variable");
  pL.createDiv({ cls: "fin-note", text: "Al mes, sin contar gastos fijos. 0 = sin límite." });
  const f = pL.createDiv({ cls: "fb-fila" });
  const iL = f.createEl("input", { cls: "corto", attr: { type: "number", step: "10" } }); iL.value = limiteVar || "";
  const bL = f.createEl("button", { cls: "fb-btn", text: "Guardar" });
  bL.onclick = async () => { await FB.api("/api/config", { limite_variable: iL.value }); FB.aviso("Guardado ✓"); await FB.refrescar(); };

  const pG = panel(g, "Lo más usado");
  const cnt = (t) => (DB.registros[t] || []).length;
  const accesos = (padre, lista) => {
    const box = padre.createDiv({ cls: "fb-accesos" });
    for (const [ic, t, s, ruta] of lista) {
      const a = box.createEl("a", { cls: "fb-acceso internal-link", href: ruta });
      const av = a.createDiv({ cls: "fb-av", text: ic }); setVar(av, "--cc", "var(--brand)");
      const d = a.createDiv(); d.createDiv({ cls: "t", text: t }); d.createDiv({ cls: "s", text: s });
    }
  };
  accesos(pG, [
    ["🔍", "Detectar fijos", "nóminas, alquiler, recibos y de dónde viene tu dinero", "#fijos"],
    ["🧾", "Actualizar saldos", "cierra el mes: lo que tienes en cada cuenta", "#cerrar"],
  ]);
  const pD = panel(root, "Tus datos");
  accesos(pD, [
    ["🔁", "Fijos", `${cnt("recurrente")} ingresos y gastos que se repiten`, "#gestionar/recurrente"],
    ["💳", "Cuentas", `${cnt("cuenta")} cuentas`, "#gestionar/cuenta"],
    ["🏷️", "Categorías", `${cnt("categoria")} categorías`, "#gestionar/categoria"],
    ["🧠", "Reglas", "cómo se clasifica cada comercio", "#gestionar/regla"],
    ["🌱", "Inversión", `${cnt("activo")} activos · actualizar su valor`, "#valores"],
    ["🎯", "Objetivos", `${cnt("objetivo")} metas de ahorro`, "#gestionar/objetivo"],
    ["⏰", "Recordatorios", "renta, ITV, seguros anuales…", "#gestionar/recordatorio"],
    ["📄", "Formatos de archivo", "cómo se lee el Excel de cada banco", "#gestionar/perfil"],
    ["📒", "Todos los movimientos", `${cnt("movimiento")} registrados`, "#gestionar/movimiento"],
    ["📥", "Compras de inversión", `${cnt("aportacion")} aportaciones`, "#gestionar/aportacion"],
  ]);

  const pC = panel(root, "Carpeta de datos y copias de seguridad");
  pC.createDiv({ cls: "fin-note", text: `Tus datos están en ${DB.info.carpeta} (archivo datos.db). Cada día que abres la app se guarda una copia en la carpeta Copias (las 30 últimas).` });
  const fc = pC.createDiv({ cls: "fb-fila" });
  const bAbrir = fc.createEl("button", { cls: "fb-btn sec", text: "Abrir la carpeta" }); bAbrir.onclick = () => FB.api("/api/abrir_carpeta", { que: "datos" });
  const bCopia = fc.createEl("button", { cls: "fb-btn sec", text: "Hacer una copia ahora" }); bCopia.onclick = async () => { const r = await FB.api("/api/copia", {}); FB.aviso(r.mensaje || "Hecho"); };
  const det = pC.createEl("details"); det.createEl("summary", { text: "Restaurar una copia" });
  const fr = det.createDiv({ cls: "fb-fila" });
  const sCop = fr.createEl("select");
  FB.api("/api/copias").then((r) => { for (const n of r.copias || []) { const o = sCop.createEl("option", { text: n }); o.value = n; } });
  const bRes = fr.createEl("button", { cls: "fb-btn sec", text: "Restaurar" });
  bRes.onclick = async () => { if (!sCop.value || !confirm(`¿Volver a los datos de «${sCop.value}»? Lo de ahora se guarda antes en otra copia.`)) return; const r = await FB.api("/api/restaurar", { copia: sCop.value }); FB.aviso(r.mensaje || "Hecho", !r.ok); await FB.refrescar(); };
  const det2 = pC.createEl("details"); det2.createEl("summary", { text: "Usar otra carpeta de datos" });
  const fr2 = det2.createDiv({ cls: "fb-fila" });
  const iC = fr2.createEl("input", { attr: { type: "text", placeholder: "C:\\Users\\…\\FinanceBuddy" } }); iC.value = DB.info.carpeta;
  const bC = fr2.createEl("button", { cls: "fb-btn sec", text: "Cambiar" });
  bC.onclick = async () => { const r = await FB.api("/api/carpeta", { carpeta: iC.value }); FB.aviso(r.mensaje || "Hecho", !r.ok); await FB.recargar(); FB.ir("#inicio"); };
  det2.createDiv({ cls: "fin-note", text: "Si la carpeta no tiene datos, se empieza de cero allí (tus datos actuales siguen en la carpeta de antes)." });
  const det3 = pC.createEl("details"); det3.createEl("summary", { text: "Borrar todos los datos" });
  det3.createDiv({ cls: "fin-note", text: "Se guarda una copia antes. Escribe BORRAR para confirmar." });
  const fr3 = det3.createDiv({ cls: "fb-fila" });
  const iB = fr3.createEl("input", { attr: { type: "text" } });
  const bB = fr3.createEl("button", { cls: "fb-btn sec peligro", text: "Borrar todo" });
  bB.onclick = async () => { const r = await FB.api("/api/vaciar", { confirmar: iB.value }); FB.aviso(r.mensaje || "Hecho", !r.ok); if (r.ok) { await FB.recargar(); FB.ir("#bienvenida"); } };

  const pS = panel(root, "FinanceBuddy");
  pS.createDiv({ cls: "fin-note", text: `Versión ${DB.info.version}. La app funciona en tu ordenador: cerrar la pestaña no la cierra.` });
  const bS = pS.createEl("button", { cls: "fb-btn sec", text: "Cerrar FinanceBuddy" });
  bS.onclick = async () => { await FB.api("/api/salir", {}); document.body.innerHTML = "<p style='padding:40px;font-family:sans-serif'>FinanceBuddy se ha cerrado. Puedes cerrar esta pestaña.</p>"; };
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
  const cont = root.createDiv({ cls: "fin-panel" });
  let todos = [...(DB.registros[tipo] || [])];
  if (F.orden) todos.sort(F.orden);
  let verTodos = false;
  const pintar = () => {
    cont.innerHTML = "";
    const q = norm(inp.value.trim());
    const filas = todos.filter((r) => !q || norm(JSON.stringify(r)).includes(q));
    if (!filas.length) { vacio(cont, q ? "Nada coincide" : `Aún no hay ${F.plural.toLowerCase()}`); return; }
    const vis = verTodos ? filas : filas.slice(0, 200);
    tabla(cont, F.cols.map((t, i) => ({ t, num: t === "Importe" || t === "Valor" || t === "Cuentas" || t === "Inversión" })), vis.map((r) => {
      const celdas = F.fila(r);
      celdas[0] = { text: typeof celdas[0] === "object" ? celdas[0].text : String(celdas[0] ?? ""), ruta: `#editar/${tipo}/${r.id}` };
      return celdas;
    }));
    if (vis.length < filas.length) { const b = cont.createEl("button", { cls: "fin-vermas", text: `Ver los ${filas.length}` }); b.onclick = () => { verTodos = true; pintar(); }; }
  };
  inp.oninput = pintar;
  pintar();
}
function vistaEditar() {
  const [tipo, id] = params;
  const F = FORMS[tipo];
  if (!F) { FB.ir("#ajustes"); return; }
  const reg = id === "nuevo" ? null : (DB.registros[tipo] || []).find((r) => String(r.id) === String(id));
  titulo(reg ? `Editar ${F.uno}` : `Nuevo: ${F.uno}`, F.ayuda || "");
  if (id !== "nuevo" && !reg) { vacio(root, "Ese registro ya no existe"); return; }
  const volver = FB.anterior && !FB.anterior.startsWith("#editar") ? FB.anterior : `#gestionar/${tipo}`;
  formulario(root, tipo, reg, { volver });
  if (tipo === "movimiento" && reg && reg.ext_texto) root.createDiv({ cls: "fin-note", text: `Del extracto: «${reg.ext_texto}» (${eurS(num(reg.ext_importe))}, ${fmtISO(reg.ext_fecha)})` });
}

// ───────────── render ─────────────
const TODAS = { ...VISTAS, bienvenida: vistaBienvenida, importar: vistaImportar, revisar: vistaRevisar, apuntar: vistaApuntar, cerrar: vistaCerrar,
  valores: vistaValores, ajustes: vistaAjustes, gestionar: vistaGestionar, editar: vistaEditar, fijos: vistaFijos };
const TITULOS = { inicio: "Inicio", movimientos: "Movimientos",
  bienvenida: "Bienvenida", importar: "Importar", revisar: "Por revisar", apuntar: "Apuntar", cerrar: "Cerrar el mes", valores: "Valores", ajustes: "Ajustes", gestionar: "Ajustes", editar: "Editar", fijos: "Fijos" };
function render() {
  _movs = _movsMes = _aports = _objs = _pat = _cuentas = _recs = _activos = _cats = undefined; _finMes = new Map();
  root.empty();
  const sinConfigurar = !cuentas().length && !["bienvenida", "ajustes", "gestionar", "editar"].includes(vista);
  (sinConfigurar ? vistaBienvenida : TODAS[vista] || vistaInicio)();
  document.title = "FinanceBuddy · " + (TITULOS[sinConfigurar ? "bienvenida" : vista] || "Inicio");
}
render();
// Para las pruebas automáticas.
if (input && input.exponer) {
  window.__fin = { finMes, repartoAhorro, estimacion, conciliacion, prevision, resumenInversion, fondoEmergencia, gastoVariable, tasa12,
    movimientos, aportaciones, objetivos, patrimonio, avisos, categorias, grupoDe, limiteVar, mesesHasta, mesAnterior, hoyKey,
    fechaDatos, presupuestoSemana, planReparto, cuentas, proyectar };
}

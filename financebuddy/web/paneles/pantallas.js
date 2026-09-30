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
  let tipo = "";
  const radios = [["", "Detectar solo"], ["banco", "Extracto del banco"], ["inversion", "Movimientos del bróker"]].map(([v, t]) => {
    const l = tipoSel.createEl("label"); const r = l.createEl("input", { attr: { type: "radio", name: "tipoimp" } }); r.checked = v === tipo; r.onchange = () => (tipo = v); l.appendText(t); return r;
  });
  const zona = pS.createDiv({ cls: "fb-zona", text: "Arrastra aquí el Excel o CSV, o pulsa para elegirlo" });
  const inp = pS.createEl("input", { attr: { type: "file", accept: ".xlsx,.xls,.csv,.txt", multiple: "" } }); inp.style.display = "none";
  zona.onclick = () => inp.click();
  const subir = async (files) => {
    for (const f of files) {
      zona.textContent = `Importando ${f.name}…`;
      const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.readAsDataURL(f); });
      const r = await FB.api("/api/importar/subir", { nombre: f.name, tipo: tipo || null, contenido: b64 });
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
      { l: "Órdenes de fondos", s: "En MyInvestor, Fondos → Órdenes → descargar (CSV). Añade las participaciones de cada compra y los traspasos entre fondos, que no salen en la cuenta de efectivo. Lo que ya estaba no se duplica.", v: "" },
      { l: "Operaciones con títulos", s: "Un Excel con Fecha, Tipo (Compra/Venta), Activo, Estado y Títulos: pone las participaciones a las compras de ETF y cripto del extracto de la cuenta.", v: "" },
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
    const m = new Map();
    for (const p of [...lista].sort((a, b) => String(a.fila.op).localeCompare(String(b.fila.op)))) {
      const k = [p.cuenta, p.fila.patron || sugerirPatron(p.fila.texto), p.fila.importe < 0 ? "-" : "+", conClase && p.fila.clase === "transferencia" ? "t" : ""].join("|");
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
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
  for (const [k, t, n] of F) { const b = fil.createEl("button", { text: `${t} · ${n}`, cls: k === filtroRev ? "act" : "" }); b.onclick = () => { FB.estado.filtroRev = k; render(); }; }
  if (conProp.length) panelSugerencias(root, conProp);
  const ver = (g, tipo) => filtroRev === "todo" || filtroRev === tipo || (filtroRev === "sug" && conSug.has(g));
  const Gv = G.filter((g) => ver(g, "banco")), GIv = GI.filter((g) => ver(g, "broker"));
  if (Gv.length) {
    root.createDiv({ cls: "fin-note fb-pista", text: "Pulsa la categoría y listo: se aplica a todo el grupo y la próxima vez se clasificará solo." });
    const cont = root.createDiv({ cls: "fb-grupos" });
    for (const g of Gv) tarjetaGrupo(cont, g);
  }
  if (GIv.length) {
    if (Gv.length) root.createEl("h3", { cls: "fb-sec", text: "Tu bróker" });
    const ci = root.createDiv({ cls: "fb-grupos" });
    for (const g of GIv) tarjetaGrupoInversion(ci, g);
  }
}
const nombreGrupo = (g) => { const f = g[0].fila, s = g[0].sugerencia || {}; return g[0].tipo_import === "inversion" ? s.nuevo || s.activo || C_titulo(sugerirPatron(f.texto)) : f.concepto || C_titulo(sugerirPatron(f.texto)); };
// Lo que la app propone para un grupo (o null): { texto, datos, motivo, segura }. «segura»: sale marcada al aceptar en bloque.
function propuestaBanco(g) {
  const p = g[0], f = p.fila, entra = f.importe > 0;
  if (f.clase === "transferencia") {
    const otras = cuentas().filter((c) => c.nombre !== p.cuenta);
    return otras.length === 1 ? { texto: `🔁 ${entra ? "Desde" : "A"} ${otras[0].nombre}`, datos: { accion: "guardar", clase: "transferencia", cuenta_otra: otras[0].nombre }, motivo: "a tu nombre", segura: true } : null;
  }
  const s = p.sugerencia;
  return s && s.categoria ? { texto: `${catIcono(s.categoria)} ${s.categoria}`, datos: { accion: "guardar", clase: s.clase, categoria: s.categoria }, motivo: s.motivo, segura: !/^parecido/.test(s.motivo || "") } : null;
}
function propuestaBroker(g) {
  const f = g[0].fila, entra = f.importe > 0, s = g[0].sugerencia || {};
  if (s.accion === "ignorar") return { texto: entra ? "🔁 Traspaso desde mi banco" : "🔁 Traspaso a mi banco", datos: { accion: "ignorar" }, motivo: "dinero entre tus cuentas", segura: true };
  if (s.accion === "interes") return { texto: entra ? "💰 Intereses" : "🏦 Comisión", datos: { accion: "interes" }, motivo: "de la cuenta del bróker", segura: true };
  if (s.accion === "activo" && s.activo) return { texto: `📈 ${entra ? "Venta" : "Compra"} de ${s.activo}`, datos: { accion: "activo", activo: s.activo }, motivo: "lo reconoce el activo", segura: true };
  if (s.accion === "activo" && s.nuevo && !entra) return { texto: `✨ Crear «${s.nuevo}»`, datos: { accion: "activo", nuevo_activo: s.nuevo }, motivo: "activo nuevo", segura: true };
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
      const r = await FB.api("/api/resolver", { id: g[0].id, ids: g.map((x) => x.id), recordar: true, patron: f.patron || sugerirPatron(f.texto), ...pr.datos });
      if (r.ok) hechos++;  // si otro grupo ya lo resolvió («recordar» con el mismo patrón), no pasa nada
    }
    FB.aviso(`Aceptadas ${hechos} sugerencia${hechos === 1 ? "" : "s"} ✓`);
    await FB.refrescar();
  };
}
// Categorías que más usas (por número de movimientos), para ofrecerlas a un clic.
function catsFrecuentes(entra, n = 6) {
  const c = new Map();
  for (const m of movimientos()) if (!m.auto && m.categoria && m.clase !== "transferencia" && (m.clase === "ingreso") === entra) c.set(m.categoria, (c.get(m.categoria) || 0) + 1);
  const validas = new Set(catSegunClase({ clase: entra ? "ingreso" : "gasto" }).map(([v]) => v));
  return [...c].filter(([k]) => validas.has(k)).sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, n);
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
  const ext = card.createDiv({ cls: "ext", text: f.texto + (g.length > 1 ? `  (${g.map((x) => eur(Math.abs(x.fila.importe))).join(" · ")})` : "") });
  ext.title = ext.textContent;
  if (p.duda) card.createDiv({ cls: "duda", text: p.duda });
}
// Resolver un grupo entero (ids) con la misma decisión; la tarjeta se desliza fuera y la pantalla se refresca.
const resolverGrupo = (card, g, extra) => async (datos, btn) => {
  btn.disabled = true;
  const r = await FB.api("/api/resolver", { id: g[0].id, ids: g.map((x) => x.id), ...extra(), ...datos });
  if (!r.ok) { btn.disabled = false; mensaje(card, r.mensaje || "Error", "err"); return; }
  card.classList.add("fuera");
  FB.aviso(r.mensaje);
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
  if (!entra && sug.accion === "activo" && sug.nuevo) chip(`✨ Crear «${nombreNuevo}»`, () => ({ accion: "activo", nuevo_activo: nombreNuevo }), "sug", "Crea el activo y guarda estas compras en él");
  if (sug.accion === "activo" && sug.activo) chip(`✨ ${entra ? "Venta de" : "Compra de"} ${sug.activo}`, () => ({ accion: "activo", activo: sug.activo }), "sug");
  if (entra && sug.accion === "ignorar") chip("✨ 🔁 Traspaso desde mi banco", () => ({ accion: "ignorar" }), "sug", "El dinero que pasas al bróker ya cuenta en el extracto del banco");
  if (entra && sug.accion === "interes") chip("✨ 💰 Intereses", () => ({ accion: "interes" }), "sug");
  for (const a of acts.filter((a) => a !== sug.activo)) chip(`📈 ${a}`, () => ({ accion: "activo", activo: a }));
  if (entra && sug.accion !== "interes") chip("💰 Intereses o dividendos", () => ({ accion: "interes" }));
  if (!entra) chip("🏦 Comisión", () => ({ accion: "interes" }));
  if (!(entra && sug.accion === "ignorar")) chip(entra ? "🔁 Traspaso desde mi banco" : "🔁 Traspaso a mi banco", () => ({ accion: "ignorar" }));
  if (entra && sug.nuevo) chip(`Venta: nuevo activo «${nombreNuevo}»`, () => ({ accion: "activo", nuevo_activo: nombreNuevo }));
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
function tarjetaGrupo(padre, g) {
  const p = g[0], f = p.fila, entra = f.importe > 0, esTr = f.clase === "transferencia";
  const sug = p.sugerencia;
  const card = padre.createDiv({ cls: "fb-grupo" });
  cabGrupo(card, g, sug ? { cat: sug.categoria } : { icono: esTr ? "🔁" : entra ? "💰" : "❔" }, f.concepto || C_titulo(sugerirPatron(f.texto)));
  let recordar = true, patron = f.patron || sugerirPatron(f.texto), concepto = f.concepto || "";
  const hecho = resolverGrupo(card, g, () => ({ recordar, patron, concepto: g.length === 1 ? concepto : null }));
  const chips = card.createDiv({ cls: "fb-cats" });
  const chip = (texto, datos, cls) => { const b = chips.createEl("button", { text: texto, cls: cls || "" }); b.onclick = () => hecho(datos, b); return b; };
  const claseCat = (cat) => (grupoDe(cat) === "ingreso" ? "ingreso" : "gasto");
  if (esTr) {
    for (const c of cuentas().filter((c) => c.nombre !== p.cuenta)) chip(`🔁 ${entra ? "Desde" : "A"} ${c.nombre}`, { accion: "guardar", clase: "transferencia", cuenta_otra: c.nombre }, "sug");
    const bN = chips.createEl("button", { text: "＋ Otra cuenta mía…" }); bN.title = "Una cuenta tuya que aún no está en la app"; bN.onclick = () => nuevaCuentaYTraspaso(hecho, bN);
  }
  const vistas = new Set();
  if (sug && sug.categoria) {
    const b = chip(`✨ ${catIcono(sug.categoria)} ${sug.categoria}`, { accion: "guardar", clase: sug.clase, categoria: sug.categoria }, "sug");
    b.title = `Sugerida: ${sug.motivo}`;
    vistas.add(sug.categoria);
  }
  for (const c of catsFrecuentes(entra)) if (!vistas.has(c)) { vistas.add(c); chip(`${catIcono(c)} ${c}`, { accion: "guardar", clase: claseCat(c), categoria: c }); }
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
    const A = activos().filter((a) => !vendidoDelTodo(a));
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
  // Los que tienes (los vendidos del todo no). Con participaciones, basta el precio que ves en el bróker.
  const A = resumenInversion().filas.filter((f) => f.estado !== "vendido");
  if (!A.length) { vacio(root, "Aún no hay activos"); enlace(root.createDiv({ cls: "fin-note" }), "Añadir un activo →", "#editar/activo/nuevo"); return; }
  const p = panel(root, "");
  const form = p.createDiv({ cls: "fb-form" });
  form.createDiv({ cls: "et", text: "Fecha" });
  const iF = form.createEl("input", { attr: { type: "date" } }); iF.value = hoy.toISODate();
  const ins = {};
  for (const a of A) {
    form.createDiv({ cls: "et", text: a.nombre });
    const i = form.createEl("input", { attr: { type: "number", step: "0.01", placeholder: "Valor total (€)" } }); i.value = a.p.valor ?? ""; ins[a.nombre] = i;
    const s = form.createDiv({ cls: "s" });
    if (a.participaciones > 0) {
      s.appendText(`${nf(a.participaciones, 0, 4)} participaciones × precio `);
      const pr = s.createEl("input", { cls: "fb-precio", attr: { type: "number", step: "0.0001", min: "0", placeholder: "€", "aria-label": `Precio de ${a.nombre}` } });
      if (a.p.valor != null && a.p.fecha_valor) pr.placeholder = nf(num(a.p.valor) / a.participaciones, 2, 4);
      pr.oninput = () => { const v = parseFloat(pr.value); if (v > 0) i.value = (Math.round(v * a.participaciones * 100) / 100).toFixed(2); };
      s.appendText(" € = valor");
    }
    if (a.p.fecha_valor) s.appendText(`${a.participaciones > 0 ? " · " : ""}anterior: ${eur(num(a.p.valor))} el ${fmtISO(a.p.fecha_valor)}`);
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

  apariencia(panel(g, "Apariencia"));
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
  const pT = panel(root, "Tú", null, "Tu nombre tal y como sale en el banco. Con él, el dinero que mueves entre cuentas a tu nombre se reconoce como traspaso y no como gasto o ingreso.");
  pT.createDiv({ cls: "fin-note", text: "Se rellena solo con el titular del primer extracto que lo traiga. Si hay más titulares (cuenta conjunta), sepáralos con «;»." });
  const fT = pT.createDiv({ cls: "fb-fila" });
  const iT = fT.createEl("input", { attr: { type: "text", placeholder: "p. ej. GARCÍA LÓPEZ ANA" } }); iT.value = (cfg.titulares || []).join("; ");
  const bT = fT.createEl("button", { cls: "fb-btn", text: "Guardar" });
  bT.onclick = async () => { await FB.api("/api/titulares", { titulares: iT.value.split(";") }); FB.aviso("Guardado ✓"); await FB.refrescar(); };
  const pI = panel(root, "Tu inicio", null, "Elige qué ves en la pantalla de inicio y en qué orden. Se guarda al momento.");
  pI.id = "tu-inicio";
  personalizarInicio(pI);
  if (params[0] === "inicio") setTimeout(() => { pI.scrollIntoView({ block: "start" }); pI.classList.add("resalta"); }, 30);
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

// Tema (en este navegador) y color de acento (en tus datos).
const ACENTOS = [["salvia", "#5E8266"], ["violeta", "#6A5AA8"], ["azul", "#44688A"], ["verde", "#3E7558"], ["coral", "#C9603F"], ["rosa", "#B84A6E"], ["grafito", "#3F3A34"]];
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
  let reg = id === "nuevo" ? null : (DB.registros[tipo] || []).find((r) => String(r.id) === String(id));
  if (id === "nuevo" && tipo === "aportacion" && params[2]) { const act = (DB.registros.activo || []).find((r) => String(r.id) === params[2]); if (act) reg = { activo: act.nombre }; }
  titulo(reg && reg.id ? `Editar ${F.uno}` : `Nuevo: ${F.uno}`, F.ayuda || "");
  if (id !== "nuevo" && !reg) { vacio(root, "Ese registro ya no existe"); return; }
  const volver = FB.anterior && !FB.anterior.startsWith("#editar") ? FB.anterior : `#gestionar/${tipo}`;
  if (tipo === "movimiento" && reg && ["gasto", "ingreso", "reembolso"].includes(reg.clase)) cambioCategoria(root, reg, volver);
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
  valores: vistaValores, ajustes: vistaAjustes, gestionar: vistaGestionar, editar: vistaEditar, fijos: vistaFijos, activo: vistaActivo };
const TITULOS = { inicio: "Inicio", movimientos: "Movimientos", inversion: "Inversión",
  bienvenida: "Bienvenida", importar: "Importar", revisar: "Por revisar", apuntar: "Apuntar", cerrar: "Cerrar el mes", valores: "Valores", ajustes: "Ajustes", gestionar: "Ajustes", editar: "Editar", fijos: "Fijos", activo: "Inversión" };
function render() {
  _movs = _movsMes = _aports = _objs = _pat = _cuentas = _recs = _activos = _cats = undefined; _finMes = new Map(); _pos = new Map();
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
    fechaDatos, presupuestoSemana, planReparto, cuentas, proyectar, resumenCategorias, ritmoMes, evolucionInversion, aportacionesMes, constancia, interesesBroker, saludInversion, posicion, valorInfo };
}

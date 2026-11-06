// ───────────── importar ─────────────
// Resultados de la última importación: se guardan en FB.estado para que sigan ahí al refrescar la pantalla.
const resultadosImport = FB.estado.imp ||= [];
const guardarImport = (lista) => { resultadosImport.splice(0, resultadosImport.length, ...lista); };
const peticionImport = (r) => ({ ...(r.peticion || { archivo: r.archivo, carpeta: r.carpeta, tipo: r.tipo, cuenta: r.cuenta, perfil: r.perfil }), subido: !!r.subido });
const claveArchivoImport = (r) => `${r.carpeta || ""}|${r.archivo}`;
const empezarImport = () => { FB.estado.impLote = []; };
const añadirImport = (r) => {
  guardarImport([r, ...resultadosImport.filter((x) => claveArchivoImport(x) !== claveArchivoImport(r))]);
  FB.estado.impLote = [...(FB.estado.impLote || []).filter((x) => claveArchivoImport(x) !== claveArchivoImport(r)), r];
};
async function ejecutarImportacion(accion) {
  if (FB.estado.impEnCurso) { FB.aviso("Ya hay una importación en curso. Espera a que termine."); return; }
  FB.estado.impEnCurso = true;
  try { await accion(); }
  catch (error) {
    console.error(error);
    FB.aviso("No se ha podido terminar la importación. Vuelve a Importar para revisar los resultados y reintentar los archivos pendientes.", true);
  } finally {
    FB.estado.impEnCurso = false;
    await FB.refrescar();
  }
}
function vistaImportar() {
  titulo("Importar", "Los movimientos de tu banco y de tu bróker");
  // El camino principal (soltar un archivo) va solo y arriba; la carpeta y la plantilla, debajo y en dos columnas: antes
  // las tres tarjetas pesaban igual y el único botón relleno de la pantalla era el del camino secundario.
  const pS = panel(root, "Sube el extracto");
  const tipoSel = pS.createDiv({ cls: "fb-fila", attr: { role: "radiogroup", "aria-label": "Qué archivo subes" } });
  let tipo = "";
  tipoSel.createSpan({ cls: "fb-et", text: "Qué archivo es" });
  const radios = [["", "Que lo detecte la app"], ["banco", "Banco"], ["inversion", "Inversión"]].map(([v, t]) => {
    const l = tipoSel.createEl("label"); const r = l.createEl("input", { attr: { type: "radio", name: "tipoimp" } }); r.checked = v === tipo; r.onchange = () => (tipo = v); l.appendText(t); return r;
  });
  const fp = pS.createDiv({ cls: "fb-fila" });
  const lp = fp.createEl("label"); const cp = lp.createEl("input", { attr: { type: "checkbox" } }); cp.checked = quierePrevia(); cp.onchange = () => guardarPrevia(cp.checked);
  lp.appendText("Ver antes de importar (no se guarda nada hasta que lo confirmes)");
  const inp = pS.createEl("input", { attr: { type: "file", accept: ".xlsx,.xls,.csv,.txt,.n43,.ofx,.qfx,.qif", multiple: "" } }); inp.style.display = "none";
  const zona = zonaSoltar(pS, "Arrastra aquí el extracto (Excel, CSV, Norma 43, OFX o QIF), o pulsa para elegirlo", () => inp.click(), (files) => subir(files));
  const subir = (files) => ejecutarImportacion(async () => {
    empezarImport();
    const resultados = [];
    for (const f of files) {
      zona.textContent = `Importando ${f.name}…`;
      const b64 = await new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = () => mal(r.error); r.readAsDataURL(f); });
      const r = await FB.api("/api/importar/subir", { nombre: f.name, tipo: tipo || null, contenido: b64, previa: quierePrevia() });
      if (!r.archivo) r.archivo = f.name;
      r.subido = true;
      añadirImport(r);
      resultados.push(r);
    }
    await finalizarImportacion(resultados);
  });
  inp.onchange = () => subir([...inp.files]);
  if (FB.soltados) { const f = FB.soltados; FB.soltados = null; subir(f); }  // archivo soltado en otra pantalla
  if (FB.estado.impEnCurso) mensaje(pS, "Importación en curso. Puedes cambiar de pantalla; los resultados se conservarán.");
  if (resultadosImport.length) {
    const pR = panel(root, "Resultado");
    resumenImportaciones(pR);
    avisoDeshacerPendiente(pR);
    const grupos = new Set();
    for (const r of resultadosImport) {
      if (r.necesita === "cuenta") {
        const clave = claveCuentaImport(r);
        if (grupos.has(clave)) continue;
        grupos.add(clave);
      }
      resultadoImport(pR, r);
    }
  }
  const g = rejilla();
  const pC = panel(g, "O déjalo en la carpeta Importar");
  pC.createDiv({ cls: "fin-note", text: "Guarda los extractos en «Importar\\Banco» o «Importar\\Inversión» (dentro de tu carpeta de datos) y pulsa el botón. Los archivos importados pasan a «Procesados»." });
  const arch = (DB.info || {}).archivos || [];
  if (arch.length) plegable(pC, `Ver los ${arch.length} archivos pendientes`, (c) => {
    const filas = filasDato(c, arch.map((a) => ({ l: a.nombre, s: a.tipo === "banco" ? "banco" : a.tipo === "inversion" ? "inversión" : "se detectará el tipo", v: "" })));
    // Un archivo que se dejó ahí por error (o uno subido que se quedó a medias): se quita sin pasar por el Explorador
    arch.forEach((a, i) => {
      const b = filas.children[i].querySelector(".v").createEl("button", { cls: "fb-btn sec peligro", text: "Quitar", attr: { "aria-label": `Quitar ${a.nombre} de la carpeta Importar` } });
      b.disabled = !!FB.estado.impEnCurso;
      b.onclick = () => ejecutarImportacion(async () => {
        if (!(await confirmar(`Se borra «${a.nombre}» de la carpeta Importar y no se importa nada.\n\nSi es un extracto del banco, lo puedes volver a descargar cuando quieras.`,
          { titulo: "¿Quitar este archivo?", si: "Quitar el archivo", no: "Cancelar", peligro: true }))) return;
        b.disabled = true;
        const x = await FB.api("/api/importar/descartar", { archivo: a.nombre, carpeta: a.tipo || "" });
        FB.aviso(x.mensaje || "Hecho", !x.ok);
        // y su tarjeta (vista previa o a medias), si la había: sus botones ya no encontrarían el archivo
        if (x.ok) {
          const conservar = (y) => (y.ok && !y.previa) || claveArchivoImport(y) !== claveArchivoImport({ archivo: a.nombre, carpeta: a.tipo });
          guardarImport(resultadosImport.filter(conservar));
          FB.estado.impLote = (FB.estado.impLote || []).filter(conservar);
        }
        await FB.refrescar();
      });
    });
  });
  const fb = pC.createDiv({ cls: "fb-fila" });
  // Relleno solo si hay archivos esperando: entonces sí es lo que toca hacer. Vacío, es un camino más entre otros.
  const bI = fb.createEl("button", { cls: arch.length ? "fb-btn" : "fb-btn sec", text: arch.length ? `Importar ${arch.length} archivo${arch.length > 1 ? "s" : ""}` : "Importar la carpeta" });
  bI.disabled = !!FB.estado.impEnCurso;
  bI.onclick = () => ejecutarImportacion(async () => {
    bI.disabled = true; bI.textContent = "Importando…";
    empezarImport();
    const r = await FB.api("/api/importar/carpeta", { previa: quierePrevia() });
    const lista = r.resultados || [r];
    for (const x of lista) añadirImport(x);
    await finalizarImportacion(lista);
  });
  const bA = fb.createEl("button", { cls: "fb-btn sec", text: "Abrir la carpeta" });
  bA.onclick = () => FB.api("/api/abrir_carpeta", {});

  const pP = panel(g, "¿Sin extracto? Usa la plantilla");
  pP.createDiv({ cls: "fin-note", text: "Una hoja de Excel con fecha, concepto, importe y un desplegable con tus categorías: para pasar movimientos de otro sitio o de una cuenta sin extracto. La categoría que elijas es la que se usa." });
  const bP = pP.createEl("button", { cls: "fb-btn sec", text: "Descargar la plantilla de Excel" }); bP.onclick = descargarPlantilla;
  const lotes = cfg.importaciones || [];
  if (lotes.length) plegable(root, "Importaciones recientes", (c) => {
    c.createDiv({ cls: "fin-note", text: "Cada fila es un archivo que importaste. «Quitar» borra todo lo que trajo ese archivo, aunque hayas hecho otras cosas después; lo que apuntaste a mano no se toca. Si lo vuelves a importar, sus filas vuelven a entrar." });
    for (const e of lotes) {
      const f = c.createDiv({ cls: "fb-fila" });
      f.createSpan({ text: `${DateTime.fromISO(e.cuando).toFormat("dd/MM/yyyy HH:mm")} · ${e.archivo}${e.cuenta ? ` · ${e.cuenta}` : ""} · ${textoRegistrosLote(e.registros)}` });
      botonQuitarImportacion(f, e, "Quitar", `Quitar la importación de ${e.archivo} del ${DateTime.fromISO(e.cuando).toFormat("dd/MM/yyyy HH:mm")}`);
    }
  }, { extra: String(lotes.length) });
  plegable(root, "¿Cómo descargo el extracto?", (c) => {
    filasDato(c, [
      { l: "Banco", s: "En la web o la app de tu banco: Cuentas → Movimientos → elige las fechas → Descargar / Exportar en Excel (o CSV). Mejor si incluye la columna de saldo: así la app comprueba que no falta nada. También sirven Norma 43, OFX o QIF: el formato se reconoce solo.", v: "" },
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
// Filas que parecían un movimiento y no se han podido leer (una fecha o un importe que la app no entiende): se enseñan tal como
// vienen en el archivo para corregirlas ahí. No bloquea: lo demás se importa. `hecho`: ya se ha importado (no es la vista previa).
function filasSinLeer(card, lista, hecho) {
  if (!lista || !lista.length) return;
  const n = lista.length;
  const m = mensaje(card, `${n} fila${n > 1 ? "s" : ""} no se ${n > 1 ? "han" : "ha"} podido leer${hecho ? "" : ` y no se importará${n > 1 ? "n" : ""}`}:\n`
    + lista.slice(0, 8).map((f) => `· fila ${f.fila}: no entiendo ${f.que} «${f.valor}»${f.texto ? ` (${f.texto})` : ""}`).join("\n") + (n > 8 ? `\n…y ${n - 8} más` : "")
    + "\nCorrígelo en el archivo y vuelve a importarlo: lo que ya esté importado no se duplica.", "err");
  m.setAttribute("role", "alert");
}
// ¿Hay algo en la vista previa que pida mirarla entera? Filas que no se han podido leer, movimientos que quedarían por revisar o
// activos que se crearían. Si no, basta con un resumen de una línea y un botón (previaSencilla).
const previaConDudas = (V) => !!((V.ilegibles || []).length || V.dudas.n || (V.activos_nuevos || []).length);
// La vista previa sin nada raro, en una frase: cuántos movimientos, de qué fechas, lo que entra y sale y el saldo que trae el extracto.
function resumenPrevia(V) {
  const M = V.movimientos, A = V.aportaciones, partes = [];
  if (M.n) partes.push(`${M.n} movimiento${M.n === 1 ? "" : "s"} nuevo${M.n === 1 ? "" : "s"}${V.desde ? ` del ${fechaCorta(V.desde)} al ${fechaCorta(V.hasta)}` : ""}: entran ${eur(M.ingresos, 2)} y salen ${eur(M.gastos, 2)}${M.traspasos ? ` (y ${M.traspasos} traspaso${M.traspasos === 1 ? "" : "s"})` : ""}`);
  if (A.n) partes.push(`${A.n} compra${A.n === 1 ? "" : "s"} y venta${A.n === 1 ? "" : "s"} de inversión`);
  if (!M.n && !A.n) partes.push("Nada nuevo");
  if (V.existentes) partes.push(`${V.existentes} ya estaba${V.existentes === 1 ? "" : "n"} y se omite${V.existentes === 1 ? "" : "n"}`);
  if (V.automaticos) partes.push(`${V.automaticos} clasificados por reglas`);
  if (V.saldo_final) partes.push(`saldo del extracto el ${fechaCorta(V.saldo_final.fecha)}: ${eur(V.saldo_final.saldo, 2)} (compáralo con tu banco)`);
  return partes.join(" · ") + ".";
}
// Vista previa: lo que pasaría al importar (el mismo código, en una simulación que se deshace) con totales para comparar con tu banco.
// Sin nada raro, se resume en una línea y se confirma con un botón; el detalle queda plegado.
function tarjetaPrevia(card, r) {
  const V = r.previa;
  card.classList.add("fb-previa");
  const sencilla = !previaConDudas(V);
  if (sencilla) card.classList.add("corta");
  card.createDiv({ cls: "top", text: `${r.archivo}: ${sencilla ? "todo en orden, aún no se ha guardado nada" : "así quedaría (aún no se ha guardado nada)"}` });
  if (sencilla) {
    card.createDiv({ cls: "txt", text: resumenPrevia(V) });
    botonesPrevia(card, r, "Importar");
    plegable(card, "Ver el detalle", (c) => detallePrevia(c, V));
    return;
  }
  detallePrevia(card, V);
  botonesPrevia(card, r, "Importar");  // el mismo nombre con o sin dudas: es el mismo paso
}
function detallePrevia(card, V) {
  const M = V.movimientos, A = V.aportaciones;
  const t = [];
  if (M.n) t.push({ l: "Movimientos nuevos", v: String(M.n), s: V.desde ? `del ${fechaCorta(V.desde)} al ${fechaCorta(V.hasta)}` : "" }, { l: "Entra", v: eur(M.ingresos, 2), t: "pos" }, { l: "Sale", v: eur(M.gastos, 2), s: M.traspasos ? `+ ${M.traspasos} traspaso${M.traspasos > 1 ? "s" : ""}` : "" });
  if (A.n) t.push({ l: "Compras y ventas", v: String(A.n), s: `compras ${eur(A.compras, 2)}${A.ventas ? ` · ventas ${eur(A.ventas, 2)}` : ""}` });
  if (V.saldo_final) t.push({ l: "Saldo del extracto", v: eur(V.saldo_final.saldo, 2), s: `a ${fechaCorta(V.saldo_final.fecha)}: compáralo con tu banco` });
  if (V.automaticos) t.push({ l: "Por tus reglas", v: String(V.automaticos), s: "puedes corregirlos en Por revisar" });
  t.push({ l: "Ya estaban", v: String(V.existentes), s: "se omiten, no se duplican" }, { l: "Por revisar", v: String(V.dudas.n), t: V.dudas.n ? "neg" : "" });
  tiles(card, t);
  filasSinLeer(card, V.ilegibles);
  if (V.activos_nuevos.length) card.createDiv({ cls: "fin-note", text: `Se crearían los activos: ${V.activos_nuevos.join(", ")}.` });
  if (V.categorias.length) card.createDiv({ cls: "fin-note", text: "Más gasto: " + V.categorias.map((c) => `${c.categoria} ${eur(c.total, 2)}`).join(" · ") });
  if (V.muestra.length) plegable(card, `Ver los últimos ${V.muestra.length} movimientos`, (c) => tabla(c, [{ t: "Fecha" }, { t: "Concepto" }, { t: "Categoría", opt: true }, { t: "Importe", num: true }],
    V.muestra.map((m) => [fechaCorta(m.fecha), m.concepto, m.clase === "transferencia" ? "Entre tus cuentas" : { text: m.categoria, badge: m.auto ? "por regla" : "" }, { text: eurS(m.importe), cls: m.importe < 0 ? "neg" : "" }])));
  if (V.dudas.n) plegable(card, `Lo que quedaría por revisar (${V.dudas.n})`, (c) => tabla(c, [{ t: "Fecha" }, { t: "Texto del extracto" }, { t: "Importe", num: true }],
    V.dudas.muestra.map((m) => [fechaCorta(m.fecha), m.texto, eurS(m.importe)])));
}
function botonesPrevia(card, r, texto) {
  const f = card.createDiv({ cls: "fb-fila" });
  const bOk = f.createEl("button", { cls: "fb-btn", text: texto });
  bOk.disabled = !!FB.estado.impEnCurso;
  bOk.onclick = () => ejecutarImportacion(async () => {
    bOk.disabled = true;
    const x = await FB.api("/api/importar/reintentar", { ...peticionImport(r), previa: false });
    await reemplazar(r, x);
  });
  botonNoImportar(f, r);
}
// Cerrar una tarjeta no importa nada; descartar solo borra la copia subida a Importar.
function botonNoImportar(padre, r) {
  const b = padre.createEl("button", { cls: "fb-btn sec", text: r.subido && r.archivo ? "No importar (descartar el archivo)" : "Cerrar" });
  b.disabled = !!FB.estado.impEnCurso;
  b.onclick = () => ejecutarImportacion(async () => {
    if (r.subido && r.archivo) {
      const x = await FB.api("/api/importar/descartar", { archivo: r.archivo, carpeta: r.carpeta });
      FB.aviso(x.mensaje || "Hecho", !x.ok);
      if (!x.ok) return;
    }
    guardarImport(resultadosImport.filter((y) => y !== r));
    FB.estado.impLote = (FB.estado.impLote || []).filter((y) => y !== r);
    await finalizarImportacion([]);
  });
  return b;
}
function resultadoImport(padre, r) {
  const card = padre.createDiv({ cls: "fb-card" });
  if (r.ok && r.previa && !r.ya_importado) { tarjetaPrevia(card, r); return; }
  if (r.ok) {
    card.createDiv({ cls: "top", text: r.archivo || r.cuenta || "Extracto" });
    mensaje(card, r.mensaje || "Importado", r.ya_importado ? "" : "ok");
    filasSinLeer(card, r.ilegibles, true);
    const lote = (cfg.importaciones || []).find((e) => e.id === r.lote);  // queda algo de este archivo que quitar
    if (lote) botonQuitarImportacion(card.createDiv({ cls: "fb-fila" }), lote, "Quitar esta importación", `Quitar esta importación: ${r.archivo}`);
    cuadreExtracto(card, r);
    if (r.hueco && r.hueco.mensaje) card.createDiv({ cls: "fin-note", text: r.hueco.mensaje });
    if (r.preguntar_efectivo && resultadosImport.find((x) => x.preguntar_efectivo === r.preguntar_efectivo) === r) preguntarEfectivoImport(card, r);
    // En la revisión guiada, sus pasos ya llevan a las dudas y a las sugeridas: aquí serían otro botón principal junto a «Siguiente»
    const enRepaso = vista === "repaso";
    if (r.sugeridas && !enRepaso) enlace(card, `Ver o confirmar las ${r.sugeridas} categoría${r.sugeridas > 1 ? "s" : ""} sugerida${r.sugeridas > 1 ? "s" : ""} →`, "#revisar");
    if (r.dudas && !enRepaso) enlace(card.createDiv({ cls: "fb-fila" }), r.dudas > 1 ? `Revisar las ${r.dudas} dudas →` : "Revisar la duda →", "#revisar").className += " fb-btn";  // lo que toca hacer después: grande y a la vista
    if (r.tipo === "banco" && r.nuevas) enlace(card, "Detectar tus ingresos y gastos fijos →", "#fijos");
    return;
  }
  if (r.necesita === "cuenta") { preguntaCuentaImport(card, r); return; }
  if (r.necesita === "perfil") { configurarFormato(card, r); return; }
  mensaje(card, r.mensaje || "No se ha podido importar", "err");
  botonNoImportar(card.createDiv({ cls: "fb-fila" }), r);
}
// Solo agrupamos una identidad reconocida; sin número de cuenta cada archivo necesita una decisión propia.
const claveCuentaImport = (r) => JSON.stringify([r.tipo, r.perfil, r.iban || claveArchivoImport(r)]);
function preguntaCuentaImport(card, r) {
  const grupo = resultadosImport.filter((x) => x.necesita === "cuenta" && claveCuentaImport(x) === claveCuentaImport(r));
  const esBroker = r.tipo !== "banco";
  card.createDiv({ cls: "top", text: grupo.length > 1 ? `¿De qué cuenta son estos ${grupo.length} extractos?` : `${r.archivo}: ¿de qué cuenta es este extracto?` });
  card.createDiv({ cls: "txt", text: `Formato reconocido: ${r.perfil}${r.iban ? ` · cuenta terminada en ${r.iban}` : ""}. Tu elección se aplicará ${grupo.length > 1 ? "a todos estos archivos" : "a este archivo"}.` });
  plegable(card, `Ver ${grupo.length === 1 ? "el archivo" : `los ${grupo.length} archivos`}`, (c) => {
    for (const x of grupo) {
      const fila = c.createDiv({ cls: "fb-fila" });
      fila.createSpan({ text: x.archivo });
      botonNoImportar(fila, x);
    }
  });
  const disponibles = cuentas().filter((c) => (c.tipo === "broker") === esBroker && (!r.iban || !c.p.iban || c.p.iban === r.iban));
  const f = card.createDiv({ cls: "fb-fila" });
  let selector;
  if (disponibles.length) {
    const l = f.createEl("label", { text: "Cuenta " });
    selector = l.createEl("select");
    for (const c of disponibles) { const o = selector.createEl("option", { text: c.nombre }); o.value = c.nombre; }
    selector.createEl("option", { text: "Crear otra cuenta", attr: { value: "" } });
  }
  const lNombre = f.createEl("label", { text: "Nombre de la cuenta " });
  const entrada = lNombre.createEl("input", { attr: { type: "text" } });
  const base = String(r.perfil || "").split(/[ (]/)[0];
  entrada.value = cuentas().some((c) => c.nombre === base) ? `${base} ${r.iban || ""}`.trim() : base;
  const b = f.createEl("button", { cls: "fb-btn" });
  const actualizar = () => {
    lNombre.hidden = !!selector?.value;
    b.textContent = selector?.value ? "Usar esta cuenta e importar" : "Crear la cuenta e importar";
  };
  if (selector) selector.onchange = actualizar;
  actualizar();
  b.disabled = !!FB.estado.impEnCurso;
  b.onclick = () => ejecutarImportacion(async () => {
    const nombre = selector?.value || entrada.value.trim();
    if (!nombre) return;
    b.disabled = true;
    if (!selector?.value) {
      const x = await FB.api("/api/guardar", { tipo: "cuenta", datos: { nombre, tipo: esBroker ? "broker" : "corriente", extracto: true, ...(r.iban ? { iban: r.iban } : {}) } });
      if (!x.ok) { FB.aviso(x.mensaje || "No se ha podido crear la cuenta", true); return; }
    }
    const nuevos = [];
    for (const viejo of grupo) {
      const x = await FB.api("/api/importar/reintentar", { ...peticionImport(viejo), cuenta: nombre, previa: quierePrevia() });
      sustituirImport(viejo, x); nuevos.push(x);
    }
    await finalizarImportacion(nuevos);
  });
}
// El servidor iguala el saldo al importar; la pantalla solo cuenta lo que ha hecho, nunca escribe saldos por su cuenta.
function cuadreExtracto(card, r) {
  if (r.saldo_igualado) card.createDiv({ cls: "txt", text: `${r.cuenta}: saldo igualado al del banco (${eur(r.saldo_igualado.saldo, 2)})` });
}
function preguntarEfectivoImport(card, r) {
  const cuenta = r.preguntar_efectivo;
  card.createDiv({ cls: "txt", text: `¿Cuánto tienes sin invertir hoy en ${cuenta}? (Opcional)` });
  card.createDiv({ cls: "fin-note", text: "Solo el dinero sin invertir, no el valor de tus fondos. Se guardará como saldo de hoy. Esta pregunta solo se hace una vez." });
  const f = card.createDiv({ cls: "fb-fila" });
  const l = f.createEl("label", { text: "Efectivo en euros " });
  const i = l.createEl("input", { attr: { type: "text", inputmode: "decimal", placeholder: "0,00" } });
  const b = f.createEl("button", { cls: "fb-btn", text: "Guardar efectivo" });
  const no = f.createEl("button", { cls: "fb-btn sec", text: "Ahora no" });
  const m = card.createDiv({ attr: { "aria-live": "polite" } });
  const responder = async (guardar) => {
    if (FB.estado.impEnCurso) { FB.aviso("Ya hay una importación en curso. Espera a que termine."); return; }
    const saldo = importeRepaso(i.value);
    if (guardar && !Number.isFinite(saldo)) { m.empty(); mensaje(m, "Escribe el efectivo en euros, por ejemplo 1.200,50.", "err"); i.focus(); return; }
    b.disabled = no.disabled = true;
    const x = await FB.api("/api/importar/efectivo", { cuenta, ...(guardar ? { saldo } : {}) });
    if (!x.ok) { b.disabled = no.disabled = false; m.empty(); mensaje(m, x.mensaje || "No se ha podido guardar", "err"); return; }
    // Varios archivos del mismo bróker pueden haber traído la misma pregunta en el lote.
    for (const y of resultadosImport) if (y.preguntar_efectivo === cuenta) delete y.preguntar_efectivo;
    FB.aviso(x.mensaje || (guardar ? "Efectivo guardado" : "No se volverá a preguntar"), false, x.deshacer ? avisoDeshacer() : undefined);
    await finalizarImportacion([]);
  };
  b.onclick = () => responder(true);
  no.onclick = () => responder(false);
}
// Quitar de golpe todo lo que trajo una importación (un lote). Siempre con confirmación: dice cuántos registros se van y que se
// pierde lo que hayas cambiado en ellos. El servidor lo deja deshacer con «Deshacer».
const NOMBRES_LOTE = { movimiento: ["movimiento", "movimientos"], aportacion: ["compra o venta", "compras y ventas"], cobro: ["cobro", "cobros"],
  pendiente: ["fila por revisar", "filas por revisar"], operacion: ["orden en espera", "órdenes en espera"], ignorado: ["fila descartada", "filas descartadas"] };
const textoRegistrosLote = (reg) => {
  const partes = Object.entries(reg || {}).filter(([t, n]) => n && NOMBRES_LOTE[t]).map(([t, n]) => `${n} ${NOMBRES_LOTE[t][n === 1 ? 0 : 1]}`);
  return partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : partes[0] || "nada";
};
function botonQuitarImportacion(padre, lote, texto, nombreAccesible) {
  const b = padre.createEl("button", { cls: "fb-btn sec peligro", text: texto, attr: { "aria-label": nombreAccesible || texto } });
  b.onclick = async () => {
    const total = Object.values(lote.registros || {}).reduce((s, n) => s + n, 0);
    if (!(await confirmar(`Se quitarán ${total} registro${total === 1 ? "" : "s"} de «${lote.archivo}»: ${textoRegistrosLote(lote.registros)}.\n\nLos cambios que hayas hecho sobre ellos (categorías, divisiones…) se pierden. Lo que apuntaste a mano no se toca. Podrás deshacerlo justo después.`,
      { titulo: "¿Quitar esta importación?", si: "Quitar la importación", no: "Cancelar", peligro: true }))) return;
    b.disabled = true;
    const r = await FB.api("/api/importar/deshacer", { lote: lote.id });
    FB.aviso(r.mensaje || "Hecho", !r.ok, r.ok && r.quitados ? avisoDeshacer() : undefined);
    guardarImport(resultadosImport.filter((x) => x.lote !== lote.id));
    await FB.refrescar();
  };
  return b;
}
// Un lote se mantiene unido aunque unos archivos entren y otros necesiten una respuesta.
function resumenImportaciones(padre) {
  const lista = FB.estado.impLote || [];
  if (lista.length < 2) return;
  const hechos = lista.filter((r) => r.ok && !r.previa && !r.ya_importado);
  const repetidos = lista.filter((r) => r.ya_importado).length;
  const pendientes = lista.filter((r) => !r.ok || (r.previa && !r.ya_importado) || r.preguntar_efectivo).length;
  const nuevas = hechos.reduce((n, r) => n + (r.nuevas || 0), 0);
  const dudas = hechos.reduce((n, r) => n + (r.dudas || 0), 0);
  padre.createDiv({ cls: "txt", attr: { role: "status" }, text: `${lista.length} archivos: ${hechos.length} importados · ${repetidos} ya importados · ${pendientes} por resolver. ${nuevas} registros nuevos${dudas ? ` · ${dudas} por revisar` : ""}.` });
}
async function finalizarImportacion(lista) {
  const lote = FB.estado.impLote || lista;
  const escritos = lista.filter((r) => r.ok && !r.previa && r.deshacer);
  // En una subida múltiple no pedimos un clic por cada archivo que no tiene nada que revisar.
  // Para uno solo se respeta siempre «Ver antes de importar».
  if (lote.length > 1) {
    for (const r of [...lote]) {
      if (!r.ok || !r.previa || r.ya_importado || previaConDudas(r.previa)) continue;
      const x = await FB.api("/api/importar/reintentar", { ...peticionImport(r), previa: false });
      sustituirImport(r, x);
      if (x.ok && x.deshacer) escritos.push(x);
    }
  }
  await FB.refrescar();
  const que = (FB.DB.info || {}).deshacer;
  if (escritos.length && que) FB.aviso(que, false, avisoDeshacer());
  if (location.hash.split("/")[0] !== "#importar") {
    FB.aviso("Importación terminada. Puedes revisar los resultados en Importar.", resultadosImport.some((r) => !r.ok), { texto: "Ver resultados", fn: () => FB.ir("#importar") });
    return;
  }
  // No se abandona ninguna pregunta, error o vista previa de esta pantalla.
  if (resultadosImport.some((r) => !r.ok || (r.previa && !r.ya_importado) || r.preguntar_efectivo)) return;
  const reales = (FB.estado.impLote || lista).filter((r) => r.ok && !r.previa && !r.ya_importado && (r.nuevas || r.dudas));
  if (reales.length) { FB.repasoImportado = reales; FB.ir("#repaso"); }
}
function sustituirImport(viejo, nuevo) {
  nuevo.archivo ||= viejo.archivo;
  nuevo.carpeta ??= viejo.carpeta;
  nuevo.subido = !!viejo.subido;
  guardarImport(resultadosImport.map((x) => claveArchivoImport(x) === claveArchivoImport(viejo) ? nuevo : x));
  FB.estado.impLote = (FB.estado.impLote || []).map((x) => claveArchivoImport(x) === claveArchivoImport(viejo) ? nuevo : x);
}
const reemplazar = async (viejo, nuevo) => { sustituirImport(viejo, nuevo); await finalizarImportacion([nuevo]); };
// Formato nuevo: el usuario dice qué columna es cada cosa (se guarda como «formato» y se reconoce solo la próxima vez).
function configurarFormato(card, r) {
  card.createDiv({ cls: "top", text: `${r.archivo}: formato nuevo` });
  card.createDiv({ cls: "txt", text: "Dime qué columna es cada cosa (solo esta vez: la próxima se reconocerá solo)." });
  if (Object.keys(r.columnas_probables || {}).length) card.createDiv({ cls: "fin-note", text: "La app ha reconocido sola las columnas por su nombre y su contenido: compruébalas y dale a guardar." });
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
      const s = form.createEl("select"); for (const [v, l] of [["banco", "Banco"], ["inversion", "Inversión"]]) { const o = s.createEl("option", { text: l }); o.value = v; }
      s.value = tipo; s.onchange = () => { tipo = s.value; pintar(); };
    }
    for (const [k, l, req] of campos()) {
      form.createDiv({ cls: "et", text: l + (req ? " *" : "") });
      const s = form.createEl("select"); const o0 = s.createEl("option", { text: "—" }); o0.value = "";
      for (const [v, et] of cab) { const o = s.createEl("option", { text: et }); o.value = v; }
      const adivina = cab.find(([c]) => ({ fecha: /^fecha( de)? ?(operaci|contable)?/i, concepto: /concepto|descripci|detalle|movimiento/i, importe: /importe|cantidad|monto/i, saldo: /saldo/i, fecha_valor: /valor/i, cargo: /cargo|debe/i, abono: /abono|haber/i }[k] || /^$/).test(c));
      const propuesto = (r.propuesta || {})[k];  // lo que ha reconocido la app en el archivo
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
  const fB = card.createDiv({ cls: "fb-fila" });
  const b = fB.createEl("button", { cls: "fb-btn", text: "Guardar formato e importar" });
  botonNoImportar(fB, r);
  const m = card.createDiv();
  b.disabled = !!FB.estado.impEnCurso;
  b.onclick = () => ejecutarImportacion(async () => {
    const columnas = {}; for (const [k] of campos()) if (sel[k]) columnas[k] = sel[k];
    b.disabled = true;
    const x = await FB.api("/api/importar/reintentar", { archivo: r.archivo, carpeta: r.carpeta, tipo, columnas, perfil: iN.value, cuenta: sC.value, compras_negativas: cNeg ? cNeg.checked : true, previa: quierePrevia(), subido: !!r.subido });
    b.disabled = false;
    if (!x.ok && !x.necesita) { m.innerHTML = ""; mensaje(m, x.mensaje || "Error", "err"); return; }
    await reemplazar(r, x);
  });
}


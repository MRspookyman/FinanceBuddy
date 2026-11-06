// ───────────── ajustes ─────────────
// Una sola forma de guardar: todo lo de Ajustes se guarda al cambiarlo y lo dice con el mismo aviso. Antes convivían cinco
// maneras en la misma pantalla (botón propio, botón compartido por tres campos, al marcar la casilla, al pulsar un color y
// al reordenar), y no había forma de saber si lo que acababas de escribir estaba guardado.
// La pantalla se vuelve a dibujar al guardar, así que se devuelve el foco a donde estuviera: si has pasado al campo
// siguiente con el tabulador (el evento `change` salta justo antes), te quedas en él.
async function guardarAjuste(ruta, datos) {
  const r = await FB.api(ruta, datos);
  if (!r.ok) { FB.aviso(r.mensaje || "No se ha podido guardar", true); return false; }
  FB.aviso("Guardado ✓");
  const k = (document.activeElement && document.activeElement.dataset || {}).fb || "";
  await FB.refrescar();
  if (k) { const e = document.querySelector(`#app [data-fb="${k}"]`); if (e) e.focus(); }
  return true;
}
// Campo que se guarda solo al cambiarlo (y al salir de él): `clave` es con lo que se recupera el foco tras redibujar.
const alCambiar = (el, clave, datos) => { el.dataset.fb = clave; el.onchange = () => guardarAjuste("/api/config", datos()); return el; };
// Una fila de ajuste: el nombre (un <label> de verdad), el campo con su unidad al lado y, debajo, la ayuda en una frase.
function campoAjuste(padre, { id, etiqueta, unidad, ayuda, cls = "corto", attr = {} }) {
  const f = padre.createDiv({ cls: "fb-ajuste" });
  f.createEl("label", { text: etiqueta, attr: { for: id } });
  const c = f.createDiv({ cls: "c" });
  const inp = c.createEl("input", { cls, attr: { id, ...attr } });
  if (unidad) c.createSpan({ cls: "u", text: unidad });
  if (ayuda) f.createDiv({ cls: "fin-note", text: ayuda });
  return inp;
}
// Una casilla con su texto al lado (no debajo) y, si hace falta, la ayuda debajo del texto.
function casillaAjuste(padre, texto, marcada, ayuda) {
  const l = padre.createEl("label", { cls: "fb-fila fb-casilla" });
  const c = l.createEl("input", { attr: { type: "checkbox" } }); c.checked = !!marcada;
  const t = l.createSpan({ text: texto });
  if (ayuda) t.createSpan({ cls: "fin-note", text: ayuda });
  return c;
}
// Ajustes, por tareas: lo que decides de tu dinero, cómo se clasifica lo que importas, cómo se ve y avisa la app, los
// servicios opcionales que salen a internet y las copias. Cada grupo tiene su ruta (#ajustes/clasificacion…); las de antes
// (#ajustes/datos, /precios, /inicio) llevan a su grupo.
const GRUPOS_AJUSTES = [["dinero", "Tu dinero", "💶"], ["clasificacion", "Clasificación", "🏷️"], ["aspecto", "Aspecto y avisos", "🎨"], ["servicios", "Servicios opcionales", ""], ["copias", "Copias y archivos", "🗂️"]];
// A qué grupo vuelve «← Ajustes» desde cada lista (gestionar.js)
const AJUSTES_DE_TIPO = { categoria: "clasificacion", regla: "clasificacion", perfil: "clasificacion" };
const rutaAjustesDe = (tipo) => "#ajustes/" + (AJUSTES_DE_TIPO[tipo] || "dinero");
function vistaAjustes() {
  titulo("Ajustes", "Todo se guarda solo al cambiarlo; te lo confirma abajo.");
  const ALIAS = { general: "dinero", datos: "copias", integraciones: "servicios", jev: "servicios", precios: "servicios", inicio: "aspecto" };
  const tab = GRUPOS_AJUSTES.some(([k]) => k === params[0]) ? params[0] : ALIAS[params[0]] || "dinero";
  if ((DB.info || {}).ejemplo) {  // la franja de arriba ya dice que son de ejemplo: aquí solo el botón para salir
    const e = root.createDiv({ cls: "fb-fila fb-salir-ejemplo", attr: { id: "salir-ejemplo" } });
    e.createSpan({ text: "Estás viendo datos de ejemplo." });
    const b = e.createEl("button", { cls: "fb-btn", text: "Volver a mis datos" });
    b.onclick = async () => { await FB.api("/api/ejemplo", { activar: false }); await FB.recargar(); FB.ir("#inicio"); };
  }
  const seg = root.createEl("nav", { cls: "fb-seg fb-grupos-ajustes", attr: { "aria-label": "Grupos de ajustes" } });
  for (const [k, t, ic] of GRUPOS_AJUSTES) {
    const l = enlace(seg, `${ic} ${t}`, "#ajustes/" + k);
    if (k === tab) { l.className += " act"; l.setAttribute("aria-current", "true"); }
  }
  const col = root.createDiv({ cls: "fb-ajustes" });
  const cnt = (t) => (DB.registros[t] || []).length;
  const accesos = (padre, lista) => {
    const box = padre.createDiv({ cls: "fb-accesos" });
    for (const [ic, t, s, ruta] of lista) {
      const a = box.createEl("a", { cls: "fb-acceso internal-link", href: ruta });
      const av = a.createDiv({ cls: "fb-av", text: ic, attr: { "aria-hidden": "true" } }); setVar(av, "--cc", "var(--brand)");
      const d = a.createDiv(); d.createDiv({ cls: "t", text: t }); d.createDiv({ cls: "s", text: s });
    }
  };
  if (tab === "dinero") {
    const pL = panel(col, "Tu límite de gasto variable", null, "Lo que te das al mes para comer fuera, compras, ocio… sin contar los gastos fijos. Es tu tope, no el del banco.");
    const iL = campoAjuste(pL, { id: "aj-limite", etiqueta: "Límite al mes", unidad: "€/mes", ayuda: "0 o vacío = sin límite.", attr: { type: "number", step: "10", min: "0" } }); iL.value = limiteVar || "";
    alCambiar(iL, "limite", () => ({ limite_variable: iL.value }));
    // Meta de ahorro: si la pones, la app calcula el límite que la permite (limitePorMeta); cambiarlo es cosa tuya, con el botón
    const iA = campoAjuste(pL, { id: "aj-meta", etiqueta: "Quiero ahorrar al mes", unidad: "€/mes", ayuda: "Opcional, aparte de lo que ya inviertes. Con una meta, la app te dice qué límite te la deja cumplir.", attr: { type: "number", min: "0", step: "10", placeholder: "opcional" } }); iA.value = metaAhorro() || "";
    alCambiar(iA, "meta", () => ({ meta_ahorro: iA.value || 0 }));
    const meta = metaAhorro();
    if (meta > 0) {
      const L = limitePorMeta(meta, datosMeta());
      if (!(L.ingresos > 0)) pL.createDiv({ cls: "fin-note", text: "Para calcular tu límite hace falta saber lo que te entra al mes: detecta tus ingresos fijos en Fijos o importa algún mes completo." });
      else {
        const resta = [[L.fijos, "de fijos"], [L.suelto, "de otros gastos fijos que no tienes dados de alta"], [L.aportaciones, "que inviertes"]].filter(([v]) => v >= 0.5).map(([v, t]) => ` − ${eur(v, 2)} ${t}`).join("");
        pL.createDiv({ cls: "fin-note", text: `Te entran ${eur(L.ingresos, 2)} al mes (${L.deFijos ? "tus ingresos fijos" : `tu media de ${L.nMeses === 1 ? "el último mes" : `los últimos ${L.nMeses} meses`}`})${resta} − ${eur(meta, 2)} de tu meta = ${eur(L.sobra, 2)} para gasto variable.` });
        if (!L.llega) mensaje(pL, `Con lo que te entra no llega para ahorrar ${eur(meta, 2)} al mes: te faltarían ${eur(-L.sobra, 2)} aunque no gastaras nada en gasto variable.`, "err");
        else if (Math.abs(L.limite - limiteVar) < 1) pL.createDiv({ cls: "fin-note", text: `Tu límite de ${eur(limiteVar, 2)} ya es el de tu meta.` });
        else {
          const fU = pL.createDiv({ cls: "fb-fila" });
          fU.createSpan({ text: `Con tu meta, tu límite sería ${eur(L.limite, 2)} al mes (${limiteVar > 0 ? `ahora es ${eur(limiteVar, 2)}` : "ahora no tienes"}).` });
          const bU = fU.createEl("button", { cls: "fb-btn sec", text: `Usar ${eur(L.limite, 2)}`, attr: { type: "button", "aria-label": `Usar ${eur(L.limite, 2)} al mes como límite de gasto variable` } });
          bU.onclick = () => guardarAjuste("/api/config", { limite_variable: L.limite });
        }
      }
    }
    const pM = panel(col, "Tu mes y tu colchón");
    const iM = campoAjuste(pM, { id: "aj-mes", etiqueta: "Tu mes empieza el día", cls: "mini", unidad: "de cada mes",
      ayuda: diaInicio === 1 ? "1 = el mes natural. Si cobras, por ejemplo, el 28, pon 28: tu «octubre» irá del 28 de septiembre al 27 de octubre." : `Ahora ${mesLbl(hoyKey).toLowerCase()} es ${mesRango(hoyKey)}. Los saldos y la inversión siguen por meses naturales.`,
      attr: { type: "number", min: "1", max: "28", step: "1" } }); iM.value = diaInicio;
    alCambiar(iM, "mes", () => ({ dia_inicio: iM.value || 1 }));
    const RP = planReparto();
    const iC = campoAjuste(pM, { id: "aj-colchon", etiqueta: "Colchón en la cuenta corriente", unidad: "€",
      ayuda: `Lo que quieres dejar siempre en la cuenta antes de mover lo que sobra. Vacío = lo calcula la app${RP ? ` (ahora ${eur(RP.colchonAuto, 2)})` : ""}.`,
      attr: { type: "number", min: "0", step: "50", placeholder: "automático" } }); iC.value = num(cfg.colchon) || "";
    alCambiar(iC, "colchon", () => ({ colchon: iC.value || 0 }));
    const pD = panel(col, "Tus cuentas, fijos y metas");
    accesos(pD, [
      ["💳", "Cuentas", `${cnt("cuenta")} cuenta${cnt("cuenta") === 1 ? "" : "s"} · añadir, personalizar y ver sus movimientos`, "#cuentas"],
      ["🔁", "Fijos", `${cnt("recurrente")} ingresos y gastos que se repiten · y buscar más en tus movimientos`, "#gestionar/recurrente"],
      ["🎯", "Metas de ahorro", `${cnt("objetivo")} meta${cnt("objetivo") === 1 ? "" : "s"}`, "#gestionar/objetivo"],
      ["⏰", "Recordatorios", "renta, ITV, seguros anuales…", "#gestionar/recordatorio"],
    ]);
    const pI = panel(col, "Tu inversión");
    accesos(pI, [
      ["🌱", "Activos", `${cnt("activo")} activo${cnt("activo") === 1 ? "" : "s"} · editar o borrar`, "#gestionar/activo"],
      ["📥", "Compras y ventas", `${cnt("aportacion")} operaciones`, "#gestionar/aportacion"],
      ["💵", "Dividendos y comisiones", `${cnt("cobro")} anotados · para la renta`, "#gestionar/cobro"],
    ]);
  }
  if (tab === "clasificacion") {
    const pD = panel(col, "Cómo se clasifica lo que importas");
    accesos(pD, [
      ["🏷️", "Categorías", `${cnt("categoria")} categorías · icono, color, presupuesto; juntar y ocultar`, "#gestionar/categoria"],
      ["🧠", "Reglas", "«si el texto contiene…, es esta categoría» · probarlas y corregir lo ya importado", "#gestionar/regla"],
      ["📄", "Formatos de archivo", "qué columna es cada cosa en el Excel de cada banco", "#gestionar/perfil"],
    ]);
    const pT = panel(col, "Tus nombres en el banco", null, "Con ellos, el dinero que mueves entre cuentas a tu nombre se reconoce como traspaso y no como gasto o ingreso.");
    const iT = campoAjuste(pT, { id: "aj-titulares", etiqueta: "Tu nombre tal y como sale en el banco", cls: "", ayuda: "Se rellena solo con el titular del primer extracto que lo traiga. Si hay más titulares (cuenta conjunta), sepáralos con «;».", attr: { type: "text", placeholder: "p. ej. GARCÍA LÓPEZ ANA" } });
    iT.value = (cfg.titulares || []).join("; ");
    iT.dataset.fb = "titulares";
    iT.onchange = () => guardarAjuste("/api/titulares", { titulares: iT.value.split(";") });
  }
  if (tab === "aspecto") {
    apariencia(panel(col, "Apariencia"));
    const pI = panel(col, "Tu inicio", null, "Qué ves en la pantalla de inicio y en qué orden.");
    pI.id = "tu-inicio";
    personalizarInicio(pI);
    const pP = panel(col, "Listas");
    const iP = campoAjuste(pP, { id: "aj-pagina", etiqueta: "Registros por página", cls: "mini", unidad: "filas",
      ayuda: "Cuántas filas se ven de una vez en Movimientos, en las listas de Ajustes, en Para la renta y en las operaciones de cada activo (de 10 a 200). Las tarjetas de «Por revisar» van aparte.",
      attr: { type: "number", min: "10", max: "200", step: "5" } }); iP.value = porPagina();
    alCambiar(iP, "pagina", () => ({ por_pagina: iP.value || 40 }));
    const pW = panel(col, "Avisos de Windows", null, "Con la app en marcha (su icono en la bandeja), Windows te avisa de los recordatorios (una vez al día) y de cuándo toca importar (una vez a la semana). No sale nada a internet.");
    const cW = casillaAjuste(pW, "Avisarme de los recordatorios y de cuándo toca importar", cfg.avisos_windows === true);
    cW.onchange = () => guardarAjuste("/api/config", { avisos_windows: cW.checked });
    // Para que lleguen sin tener que abrirla: que la abra Windows al iniciar sesión, en la bandeja y sin navegador (autoarranque.py)
    const AR = (DB.info || {}).arranque || {};
    const cA = casillaAjuste(pW, "Abrir FinanceBuddy al iniciar Windows (en la bandeja, sin abrir el navegador)", !!AR.activo,
      AR.disponible ? "Así los avisos llegan aunque no hayas abierto la app. Se quita aquí o en el Administrador de tareas de Windows." : AR.motivo || "");
    cA.disabled = !AR.disponible;
    cA.onchange = async () => {
      const r = await FB.api("/api/arranque", { activar: cA.checked });
      FB.aviso(r.mensaje || (r.ok ? "Guardado ✓" : "No se ha podido cambiar"), !r.ok);
      await FB.refrescar();
    };
    pW.createDiv({ cls: "fin-note", text: "Las dos cosas, apagadas de serie." });
    const pS = panel(col, "FinanceBuddy");
    pS.createDiv({ cls: "fin-note", text: `Versión ${DB.info.version}. La app funciona en tu ordenador: cerrar la pestaña no la cierra. Pulsa ? para ver los atajos de teclado.` });
    panelVersion(pS);
    const bS = pS.createDiv({ cls: "fb-fila" }).createEl("button", { cls: "fb-btn sec", text: "Cerrar FinanceBuddy" });
    bS.onclick = async () => { await FB.api("/api/salir", {}); document.body.innerHTML = "<p style='padding:40px;font-family:sans-serif'>FinanceBuddy se ha cerrado. Puedes cerrar esta pestaña.</p>"; };
    if (params[0] === "inicio") setTimeout(() => { pI.scrollIntoView({ block: "start" }); pI.classList.add("resalta"); }, 30);
  }
  if (tab === "servicios") {
    col.createDiv({ cls: "fin-note", text: "Los precios por internet son opcionales y están apagados de serie. El aviso de versión se configura en «Aspecto y avisos»; sin estas opciones, la app no sale a internet." });
    panelPrecios(col);
    const ir = params[0] === "precios" ? "precios" : null;
    if (ir) setTimeout(() => { const e = document.getElementById(ir); if (e) { e.scrollIntoView({ block: "start" }); e.classList.add("resalta"); } }, 30);
  }
  if (tab === "copias") {
    // Primero, recuperar: deshacer lo último y las copias; después, sacar tus datos; y al final, plegado, lo que cambia de sitio o borra.
    panelDeshacer(col);
    const pC = panel(col, "Copias de seguridad");
    pC.createDiv({ cls: "fin-note", text: `Cada día que abres la app se guarda una copia (las 30 últimas). Tus datos están en ${DB.info.carpeta} (archivo datos.db).` });
    const fc = pC.createDiv({ cls: "fb-fila" });
    const bCopia = fc.createEl("button", { cls: "fb-btn", text: "Hacer una copia ahora" }); bCopia.onclick = async () => { const r = await FB.api("/api/copia", {}); FB.aviso(r.mensaje || "Hecho"); };
    const bAbrir = fc.createEl("button", { cls: "fb-btn sec", text: "Abrir la carpeta" }); bAbrir.onclick = () => FB.api("/api/abrir_carpeta", { que: "datos" });
    const det = pC.createEl("details"); det.createEl("summary", { text: "Restaurar una copia" });
    const fr = det.createDiv({ cls: "fb-fila" });
    const sCop = fr.createEl("select", { attr: { "aria-label": "Copia de seguridad" } });
    FB.api("/api/copias").then((r) => { for (const n of r.copias || []) { const o = sCop.createEl("option", { text: n }); o.value = n; } });
    const bRes = fr.createEl("button", { cls: "fb-btn sec", text: "Restaurar" });
    bRes.onclick = async () => { if (!sCop.value || !(await confirmar(`Vas a volver a los datos de «${sCop.value}». Lo de ahora se guarda antes en otra copia, así que podrás recuperarlo.`, { titulo: "¿Volver a una copia?", si: "Volver a esta copia" }))) return; const r = await FB.api("/api/restaurar", { copia: sCop.value }); FB.aviso(r.mensaje || "Hecho", !r.ok); await FB.refrescar(); };
    // Segunda copia en otro sitio (un USB, otro disco, una carpeta sincronizada): si el disco falla, las copias de al lado se van con él
    const detX = pC.createEl("details"); detX.createEl("summary", { text: "Guardar también las copias en otro sitio" });
    detX.createDiv({ cls: "fin-note", text: "Si pones aquí una carpeta de un USB, de otro disco o de una carpeta sincronizada, cada copia se guarda también ahí. Si ese sitio no está disponible (el USB sin poner), la app sigue como si nada y te lo dice aquí." });
    const frX = detX.createDiv({ cls: "fb-fila" });
    const iX = frX.createEl("input", { attr: { type: "text", placeholder: "E:\\Copias de FinanceBuddy", "aria-label": "Carpeta para la segunda copia" } });
    iX.value = DB.config.copia_extra || "";
    const bX = frX.createEl("button", { cls: "fb-btn sec", text: "Guardar" });
    bX.onclick = async () => {
      const r = await FB.api("/api/copia_extra", { carpeta: iX.value });
      FB.aviso(r.mensaje || "Hecho", !r.ok);
      await FB.refrescar();
    };
    const fallo = DB.config.copia_extra_error;
    if (fallo) mensaje(detX, `La última copia en ${fallo.carpeta} no se pudo guardar (${fallo.motivo}). Las copias de la carpeta Copias sí están.`, "err");
    else if (DB.config.copia_extra) detX.createDiv({ cls: "fin-note", text: "Última copia guardada ahí sin problemas." });
    panelCompartir(col);
    const pX = panel(col, "Cambiar de carpeta o empezar de cero");
    const det2 = pX.createEl("details"); det2.createEl("summary", { text: "Usar otra carpeta de datos" });
    const fr2 = det2.createDiv({ cls: "fb-fila" });
    const iC = fr2.createEl("input", { attr: { type: "text", placeholder: "C:\\Users\\…\\FinanceBuddy", "aria-label": "Carpeta de datos" } }); iC.value = DB.info.carpeta;
    const bC = fr2.createEl("button", { cls: "fb-btn sec", text: "Cambiar" });
    bC.onclick = async () => { let r = await FB.api("/api/carpeta", { carpeta: iC.value }); if (r.necesita_confirmar) { if (!(await confirmar(r.mensaje, { titulo: "¿Empezar de cero en esa carpeta?", si: "Crear base nueva" }))) return; r = await FB.api("/api/carpeta", { carpeta: iC.value, confirmado: true }); } FB.aviso(r.mensaje || "Hecho", !r.ok); await FB.recargar(); FB.ir("#inicio"); };
    det2.createDiv({ cls: "fin-note", text: "La carpeta tiene que existir (créala antes en el Explorador si es nueva). Si no tiene datos, se empieza de cero allí (tus datos actuales siguen en la carpeta de antes)." });
    const det3 = pX.createEl("details"); det3.createEl("summary", { text: "Borrar todos los datos" });
    det3.createDiv({ cls: "fin-note", text: "Se guarda una copia antes. Escribe BORRAR para confirmar." });
    const fr3 = det3.createDiv({ cls: "fb-fila" });
    const iB = fr3.createEl("input", { attr: { type: "text", placeholder: "BORRAR", "aria-label": "Escribe BORRAR para confirmar" } });
    const bB = fr3.createEl("button", { cls: "fb-btn sec peligro", text: "Borrar todo" });
    bB.onclick = async () => { const r = await FB.api("/api/vaciar", { confirmar: iB.value }); FB.aviso(r.mensaje || "Hecho", !r.ok); if (r.ok) { await FB.recargar(); FB.ir("#bienvenida"); } };
  }
}

// «Deshacer lo último»: el aviso de abajo con «Deshacer» dura segundos; la foto de antes sigue en el servidor hasta que
// guardas otra cosa, se cambia de carpeta o se cierra la app, así que también se puede deshacer desde aquí sin prisa.
function panelDeshacer(padre) {
  const que = (DB.info || {}).deshacer;
  if (!que) return;
  const p = panel(padre, "Deshacer lo último");
  p.createDiv({ cls: "fin-note", text: `Lo último que se puede deshacer: ${que}. Vuelve a dejar tus datos como estaban justo antes. En cuanto guardes, importes o cambies otra cosa, ya no se podrá deshacer.` });
  const b = p.createDiv({ cls: "fb-fila" }).createEl("button", { cls: "fb-btn sec", text: "Deshacer" });
  b.onclick = async () => {
    b.disabled = true;
    const r = await FB.api("/api/deshacer", {});
    FB.aviso(r.mensaje || "Hecho", !r.ok);
    await FB.refrescar();
  };
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
const ACENTOS = [["violeta", "#5B3FD1"], ["salvia", "#1B7558"], ["azul", "#1C5DCF"], ["verde", "#327D1A"], ["coral", "#CB4520"], ["rosa", "#C4307A"], ["grafito", "#2B3340"]];
function apariencia(p) {
  const f1 = p.createDiv({ cls: "fb-fila" });
  f1.createSpan({ cls: "fb-et", text: "Tema" });
  const seg = f1.createDiv({ cls: "fb-seg mini" });
  for (const [k, t] of [["claro", "Claro"], ["oscuro", "Oscuro"], ["auto", "Automático"]]) {
    const b = seg.createEl("button", { text: t, cls: FB.tema() === k ? "act" : "", attr: { type: "button", "aria-pressed": String(FB.tema() === k) } });
    b.onclick = () => { FB.tema(k); render(); };  // el tema es de este navegador (no va a tus datos) y se ve al momento: sin aviso
  }
  const f2 = p.createDiv({ cls: "fb-fila" });
  f2.createSpan({ cls: "fb-et", text: "Color" });
  const g = f2.createDiv({ cls: "fb-colores" });
  const actual = cfg.acento || "violeta";
  for (const [k, col] of ACENTOS) {
    const nombre = cap(k) + (k === "violeta" ? " (de serie)" : "");
    const b = g.createEl("button", { cls: k === actual ? "act" : "", attr: { type: "button", title: nombre, "aria-label": nombre, "aria-pressed": String(k === actual) } });
    b.style.background = col;
    b.onclick = () => { document.body.dataset.acento = k; guardarAjuste("/api/config", { acento: k }); };
  }
  p.createDiv({ cls: "fin-note", text: "El icono y el color de cada categoría se cambian en Clasificación → Categorías; los de cada cuenta, en Cuentas." });
  p.createEl("h4", { text: "Tu compañero" });
  const visible = casillaAjuste(p, `Mostrar a ${nombreMascota()}`, mascotaVisible());
  alCambiar(visible, "mascota", () => ({ mascota: visible.checked ? "si" : "no" }));
  const nombre = campoAjuste(p, { id: "mascota-nombre", etiqueta: "Nombre del compañero", cls: "", ayuda: "Si lo dejas vacío, se llama Nubo. Ocultarlo no cambia tus datos ni lo que hace la app.", attr: { type: "text", maxlength: "16", placeholder: "Nubo" } });
  nombre.value = cfg.mascota_nombre || "";
  alCambiar(nombre, "mascota_nombre", () => ({ mascota_nombre: nombre.value }));
}
function personalizarInicio(p) {
  const lista = panelesInicio();
  const guardar = async () => {
    const r = await FB.api("/api/config", { inicio: lista.filter((x) => x.visible).map((x) => x.id), inicio_ocultos: lista.filter((x) => !x.visible).map((x) => x.id) });
    FB.aviso(r.ok ? "Guardado ✓" : r.mensaje || "No se ha podido guardar", !r.ok);
    await FB.recargar();
  };
  const box = p.createDiv({ cls: "fb-orden" });
  const pintar = () => {
    box.innerHTML = "";
    lista.forEach((x, i) => {
      const r = box.createDiv({ cls: "r" + (x.visible ? "" : " off") });
      // Las flechas, junto al nombre (no al otro lado de la pantalla), y cada una dice qué panel mueve.
      const mover = (d, t, title) => { const b = r.createEl("button", { text: t, attr: { type: "button", title, "aria-label": title } }); b.disabled = !lista[i + d]; b.onclick = () => { [lista[i], lista[i + d]] = [lista[i + d], lista[i]]; pintar(); guardar(); box.querySelectorAll(".r")[i + d]?.querySelector(`button[aria-label="${title}"]`)?.focus(); }; };
      mover(-1, "↑", `Subir ${x.t}`); mover(1, "↓", `Bajar ${x.t}`);
      const l = r.createEl("label"); const c = l.createEl("input", { attr: { type: "checkbox" } }); c.checked = x.visible;
      l.createSpan({ text: x.t });
      c.onchange = () => { x.visible = c.checked; pintar(); guardar(); };
    });
  };
  pintar();
}


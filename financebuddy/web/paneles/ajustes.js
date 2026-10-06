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
  const fP = pM.createDiv({ cls: "fb-fila" });
  fP.createSpan({ cls: "fb-et", text: "Registros por página" });
  const iP = fP.createEl("input", { cls: "mini", attr: { type: "number", min: "10", max: "200", step: "5", "aria-label": "Registros por página en las listas largas (de 10 a 200)" } }); iP.value = porPagina();
  pM.createDiv({ cls: "fin-note", text: "Cuántas filas se ven de una vez en Movimientos, Gestionar, Renta y las operaciones de cada activo (de 10 a 200). Las listas de «Por revisar» llevan su propio tamaño porque cada fila es una ficha." });
  const bM = pM.createEl("button", { cls: "fb-btn", text: "Guardar" });
  bM.onclick = async () => { await FB.api("/api/config", { dia_inicio: iM.value || 1, colchon: iC.value || 0, por_pagina: iP.value || 40 }); FB.aviso("Guardado ✓"); await FB.refrescar(); };

  const pS = panel(g, "Importar", null, "Cuando un movimiento no está claro pero tu historial sugiere una categoría con confianza (mismo comercio u otro muy parecido), se guarda ya con esa categoría y cuenta en tu mes; queda marcado «por confirmar» en Por revisar. Apagado, todo lo dudoso espera en Por revisar hasta que lo decidas.");
  const lS = pS.createEl("label", { cls: "fb-fila" });
  const cS = lS.createEl("input", { attr: { type: "checkbox" } }); cS.checked = cfg.guardar_sugeridos !== false;
  lS.appendText("Guardar ya lo importado con la categoría sugerida (por confirmar)");
  cS.onchange = async () => { await FB.api("/api/config", { guardar_sugeridos: cS.checked }); FB.aviso("Guardado ✓"); await FB.refrescar(); };

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


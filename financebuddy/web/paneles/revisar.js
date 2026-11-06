// ───────────── por revisar ─────────────
// Las dudas del banco se agrupan por comercio (mismo patrón, cuenta y sentido): una decisión resuelve el grupo entero.
// Cada grupo ofrece la categoría más probable (por tu historial) y las que más usas, a un clic.
function vistaRevisar() { montarRevision(root, true); }
// El mismo listado y las mismas decisiones sirven en Por revisar y en la revisión guiada.
function montarRevision(padre, opciones = false) {
  const conTitulo = opciones === true, soloIds = opciones && opciones.soloIds;
  const incluido = (p) => !soloIds || soloIds.has(p.id);
  const paginaRev = (tipo) => `${opciones && opciones.clavePagina || "rev"}_${tipo}`;
  const root = padre;
  // Lo que la app no ha sabido clasificar: lo mismo que cuentan el aviso y los primeros pasos del Inicio y la insignia del menú. Las
  // compras del bróker que ya reconoce (`compraBroker`) cuentan en tu inversión desde el principio: no son dudas y van aparte.
  const P = porRevisar().filter(incluido), compras = (DB.pendientes || []).filter((p) => incluido(p) && compraBroker(p));
  const S = soloIds ? [] : (DB.registros.movimiento || []).filter((m) => m.auto && DB.ultimo_lote != null && m.lote === DB.ultimo_lote).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.id - a.id);
  // Los grupos se cuentan antes del título: la insignia del menú y el subtítulo iban por movimientos y los chips de abajo
  // por grupos, con la misma pinta («6 movimientos» arriba y «Todo · 4» justo debajo). Ahora el título dice las dos cosas.
  const banco = P.filter((p) => p.tipo_import !== "inversion"), inv = P.filter((p) => p.tipo_import === "inversion");
  const agrupar = (lista, conClase) => {
    const m = new Map(), rep = conClase ? repartosBizum(lista) : new Map();
    for (const p of [...lista].sort((a, b) => String(a.fila.op).localeCompare(String(b.fila.op)))) {
      const k = rep.get(p.id) || [p.cuenta, p.bizum ? norm(p.bizum.persona) + "|" + norm(p.bizum.concepto) : p.fila.patron || sugerirPatron(p.fila.texto), p.fila.importe < 0 ? "-" : "+", conClase && p.fila.clase === "transferencia" ? "t" : ""].join("|");
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
    for (const [k, g] of m) if (k.startsWith("reparto|")) g.reparto = true;  // varios Bizums iguales el mismo día: un solo gasto repartido
    return [...m.values()].sort((a, b) => b.length - a.length || sum(b.map((p) => Math.abs(p.fila.importe))) - sum(a.map((p) => Math.abs(p.fila.importe))));
  };
  const G = agrupar(banco, true), GI = agrupar(inv, false), GC = agrupar(compras, false);
  const nG = G.length + GI.length;
  if (conTitulo) titulo("Por revisar", P.length ? `${nG} grupo${nG > 1 ? "s" : ""} · ${P.length} movimiento${P.length > 1 ? "s" : ""} para elegir cómo se clasifican`
    + (nG < P.length ? " (lo del mismo comercio se resuelve de una vez)" : "") : "");
  if (conTitulo && FB.estado.volverMovimientos) {
    const volver = enlace(root, "← Volver a Movimientos", FB.estado.volverMovimientos.ruta);
    volver.onclick = () => {
      const v = FB.estado.volverMovimientos;
      FB.estado.restaurarMovimientos = v;
      delete FB.estado.revisarMovimiento; delete FB.estado.volverMovimientos;
    };
  }
  avisoDeshacerPendiente(root);
  if (!P.length) {
    if (S.length) panelAutomaticos(root, S);
    seccionComprasBroker(root, GC);
    if (S.length || GC.length) return;
    const ok = root.createDiv({ cls: "fb-hecho" });
    ok.createDiv({ cls: "i", text: "✓" });
    ok.createEl("b", { text: "Todo revisado" });
    ok.createDiv({ text: "Solo tus reglas clasifican sin preguntar. Puedes cambiarlas en Ajustes." });
    enlace(ok, "Ir al inicio →", "#inicio");
    return;
  }
  const conProp = [...G.map((g) => [g, propuestaBanco(g)]), ...GI.map((g) => [g, propuestaBroker(g)])].filter(([, pr]) => pr);
  const conSug = new Set(conProp.map(([g]) => g));
  const barra = root.createDiv({ cls: "fb-revision-barra" });
  const F = [["todo", "Todo", nG], ["sug", "Con sugerencia", conProp.length]];
  const objetivo = conTitulo ? FB.estado.revisarMovimiento : null;
  if (objetivo != null) FB.estado.filtroRev = "todo";
  let filtroRev = FB.estado.filtroRev === "sug" && conProp.length ? "sug" : "todo";
  const fil = barra.createDiv({ cls: "fb-chips fb-filtro-rev", attr: { role: "group", "aria-label": "Qué dudas ver" } });
  for (const [k, t, n] of F) { const b = fil.createEl("button", { text: `${t} · ${n}`, cls: k === filtroRev ? "act" : "", attr: { "aria-pressed": String(k === filtroRev) } }); b.onclick = () => { FB.estado.filtroRev = k; FB.estado["pag_" + paginaRev("banco")] = 0; FB.estado["pag_" + paginaRev("broker")] = 0; render(); }; }
  if (conProp.length) panelSugerencias(barra, conProp);
  if (S.length) panelAutomaticos(barra, S);
  const ver = (g, tipo) => filtroRev === "todo" || filtroRev === tipo || (filtroRev === "sug" && conSug.has(g));
  const Gv = G.filter((g) => ver(g, "banco")), GIv = GI.filter((g) => ver(g, "broker"));
  if (objetivo != null) {
    for (const [lista, tipo] of [[Gv, "banco"], [GIv, "broker"]]) {
      const i = lista.findIndex((g) => g.some((p) => p.id === objetivo));
      if (i >= 0) FB.estado["pag_" + paginaRev(tipo)] = Math.floor(i / 25);
    }
  }
  const enfocar = (cont, g) => {
    const card = cont.lastElementChild;
    card.dataset.pendientes = g.map((p) => p.id).join(",");
    if (objetivo != null && g.some((p) => p.id === objetivo)) {
      card.classList.add("fb-grupo-enfocado"); card.tabIndex = -1;
      card.setAttribute("aria-label", `Movimiento seleccionado: ${nombreGrupo(g)}`);
      setTimeout(() => { if (card.isConnected) { card.focus({ preventScroll: true }); card.scrollIntoView({ block: "center" }); } }, 0);
      delete FB.estado.revisarMovimiento;
    }
  };
  if (Gv.length) {
    const cont = root.createDiv({ cls: "fb-grupos" });
    const pg = paginacion(Gv, paginaRev("banco"), render, 25);
    for (const g of pg.parte) { tarjetaGrupo(cont, g); enfocar(cont, g); }
    pg.pie(root);
  }
  if (GIv.length) {
    if (Gv.length) root.createEl("h3", { cls: "fb-sec", text: "Tu bróker" });
    const ci = root.createDiv({ cls: "fb-grupos" });
    const pg = paginacion(GIv, paginaRev("broker"), render, 25);
    for (const g of pg.parte) { tarjetaGrupoInversion(ci, g); enfocar(ci, g); }
    pg.pie(root);
  }
  if (filtroRev === "todo") seccionComprasBroker(root, GC);
}
// Compras del bróker que la app ya reconoce: cuentan en tu inversión por lo que pagaste, así que no suman al «por revisar». Aquí se
// elige de qué activo son (o se crea) para dejarlas guardadas.
function seccionComprasBroker(padre, GC) {
  if (!GC.length) return;
  padre.createEl("h3", { cls: "fb-sec", text: "Compras de tu bróker por confirmar" });
  padre.createDiv({ cls: "fin-note fb-pista", text: "Ya cuentan en tu inversión por lo que pagaste, y no suman a lo que queda por revisar. Elige el activo (o créalo) para dejarlas guardadas." });
  const ci = padre.createDiv({ cls: "fb-grupos" });
  for (const g of GC) tarjetaGrupoInversion(ci, g);
}
// Lo que las reglas clasificaron en la última importación sigue siendo corregible.
function panelAutomaticos(padre, S) {
  plegable(padre, `${S.length} se clasificaron solos · Ver y corregir`, (lista) => {
    lista.classList.add("fb-auto-lista");
    for (const m of S) {
      const fila = lista.createDiv({ cls: "fb-auto-fila" });
      const regla = registros("regla").find((r) => r.id === m.auto.regla);
      fila.createDiv({ text: `${fechaCorta(m.fecha)} · ${m.ext_texto || m.concepto} · ${eur(m.clase === "gasto" ? -num(m.importe) : num(m.importe))}` });
      fila.createDiv({ cls: "fin-note", text: m.auto.serie ? "de serie" : regla ? `por tu regla ‹${regla.patron}›` : "por tu historial anterior" });
      if (m.clase === "transferencia") {
        fila.createDiv({ text: m.origen ? `Traspaso desde ${m.origen}` : m.destino ? `Traspaso a ${m.destino}` : "Traspaso entre tus cuentas" });
      } else {
        const sel = fila.createEl("select", { attr: { "aria-label": `Categoría de ${m.concepto}` } });
        for (const [v] of catSegunClase(m)) { const o = sel.createEl("option", { text: v }); o.value = String(v); }
        sel.value = m.categoria || "";
        sel.onchange = async () => {
          const r = await FB.api("/api/recategorizar", { id: m.id, categoria: sel.value, parecidos: false, recordar: false });
          FB.aviso(r.mensaje || "Categoría cambiada", !r.ok, r.ok ? avisoDeshacer() : undefined); await FB.refrescar();
        };
      }
      const b = fila.createEl("button", { cls: "fb-btn sec", text: "Pregúntame en adelante" });
      b.onclick = async () => {
        b.disabled = true; const r = await FB.api("/api/regla/preguntar", { movimiento: m.id });
        FB.aviso(r.mensaje || "Te preguntaré la próxima vez", !r.ok, r.ok ? avisoDeshacer() : undefined); await FB.refrescar();
      };
    }
  });
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
// En un reparto, el historial de cada persona no permite deducir la categoría del conjunto.
const sugDe = (g) => g.reparto ? null : g[0].sugerencia;
const nombreGrupo = (g) => { const p = g[0], f = p.fila, s = p.sugerencia || {}; return p.tipo_import === "inversion" ? s.nuevo || s.activo || C_titulo(sugerirPatron(f.texto)) : p.bizum && !g.reparto ? `Bizum ${f.importe > 0 ? "de" : "a"} ${p.bizum.persona}${p.bizum.concepto ? ` · ${p.bizum.concepto}` : ""}` : f.concepto || C_titulo(sugerirPatron(f.texto)); };
// Lo que la app propone para un grupo (o null): { texto, datos, motivo, segura }. «segura»: sale marcada al aceptar en bloque.
function propuestaBanco(g) {
  const p = g[0], f = p.fila, entra = f.importe > 0;
  if (f.clase === "transferencia") {
    const otras = cuentas().filter((c) => c.nombre !== p.cuenta);
    return otras.length === 1 ? { texto: `🔁 ${entra ? "Desde" : "A"} ${otras[0].nombre}`, datos: { accion: "guardar", clase: "transferencia", cuenta_otra: otras[0].nombre }, motivo: "a tu nombre", segura: true } : null;
  }
  const s = sugDe(g);
  return s && s.categoria ? { texto: `${catIcono(s.categoria)} ${s.categoria}`, datos: { accion: "guardar", clase: s.clase, categoria: s.categoria }, motivo: s.motivo,
    segura: s.segura !== false && !/^parecido/.test(s.motivo || "") } : null;
}
function propuestaBroker(g) {
  const f = g[0].fila, entra = f.importe > 0, s = g[0].sugerencia || {};
  if (s.accion === "ignorar") return { texto: entra ? "🔁 Traspaso desde mi banco" : "🔁 Traspaso a mi banco", datos: { accion: "ignorar" }, motivo: "dinero entre tus cuentas", segura: true };
  if (s.accion === "interes") return { texto: entra ? "💰 Intereses" : "🏦 Comisión", datos: { accion: "interes" }, motivo: "de la cuenta del bróker", segura: true };
  if (s.accion === "activo" && s.activo) return { texto: `📈 ${entra ? "Venta" : "Compra"} de ${s.activo}`, datos: { accion: "activo", activo: s.activo }, motivo: "lo reconoce el activo", segura: true };
  if (s.accion === "activo" && s.nuevo && !entra) return { texto: `✨ Crear «${s.nuevo}»${s.clase && s.clase !== "otro" ? ` (${TIPO_ACTIVO[s.clase] || s.clase})` : ""}`, datos: { accion: "activo", nuevo_activo: s.nuevo, clase: s.clase }, motivo: "activo nuevo", segura: true };
  return null;
}
// Aceptar en bloque lo que propone la app: una lista con casillas (las dudosas, sin marcar) y un botón.
function panelSugerencias(padre, conProp) {
  const cab = padre.createDiv({ cls: "fb-bloque-sug" });
  const b = cab.createEl("button", { cls: "fb-btn", text: `Aceptar ${conProp.length} sugerencias`, attr: { "aria-expanded": "false" } });
  const caja = cab.createDiv({ cls: "fin-panel fb-sug-lista" }); caja.style.display = "none";
  b.onclick = () => { caja.style.display = caja.style.display === "none" ? "" : "none"; b.setAttribute("aria-expanded", String(caja.style.display !== "none")); };
  const marcado = new Map(conProp.map(([g, pr]) => [g, pr.segura])), siempre = new Map();
  const l = caja.createDiv({ cls: "fb-sug-l" });
  for (const [g, pr] of conProp) {
    const r = l.createDiv({ cls: "r" });
    const c = r.createEl("input", { attr: { type: "checkbox", "aria-label": `Aceptar ${nombreGrupo(g)}` } }); c.checked = pr.segura; c.onchange = () => marcado.set(g, c.checked);
    const n = r.createDiv({ cls: "n" });
    n.createDiv({ cls: "t", text: nombreGrupo(g) });
    n.createDiv({ cls: "s", text: `${g.length > 1 ? `${g.length} movimientos · ` : ""}${g[0].cuenta}${pr.motivo ? " · " + pr.motivo : ""}` });
    r.createDiv({ cls: "v " + (g[0].fila.importe > 0 ? "pos" : ""), text: eurS(sum(g.map((x) => x.fila.importe))) });
    r.createDiv({ cls: "pr", text: "→ " + pr.texto });
    if (g[0].tipo_import !== "inversion" && !g.reparto) {
      const lab = r.createEl("label", { cls: "fb-siempre-bloque" });
      const s = lab.createEl("input", { attr: { type: "checkbox" } }); s.checked = (g[0].racha || {}).n >= 3;
      siempre.set(g, s.checked); s.onchange = () => siempre.set(g, s.checked); lab.appendText("Siempre");
    }
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
      const r = await FB.api("/api/resolver", { id: g[0].id, ids: g.map((x) => x.id), ...(g[0].tipo_import === "inversion" ? { recordar: true } : {}), proxima: siempre.get(g) ? "siempre" : "preguntar", patron: f.patron || sugerirPatron(f.texto), mantener: hechos > 0, ...pr.datos });
      if (r.ok) hechos++;
      else { ok.disabled = false; est.setText(r.mensaje || "No se ha podido guardar esta sugerencia."); return; }
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
// Lo último que se puede deshacer, a la vista: el aviso de abajo se borra solo a los segundos y hasta ahora era la única
// forma de volver atrás (confirmar 200 categorías y mirar para otro lado no tenía vuelta salvo restaurando una copia).
function avisoDeshacerPendiente(padre) {
  const que = (DB.info || {}).deshacer;
  if (!que) return;
  const f = padre.createDiv({ cls: "fin-note fb-fila" });
  f.appendText(`Lo último: ${que}.`);
  accion(f, "Deshacer", async () => { const r = await FB.api("/api/deshacer", {}); FB.aviso(r.mensaje || "Hecho", !r.ok); await FB.refrescar(); }, "Deja tus datos como estaban justo antes");
}
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
  const nombre = ((await pedirTexto("Pon el nombre de la cuenta (p. ej. «Cuenta BBVA» o «Revolut»).", "Nombre de la cuenta", { titulo: "Cuenta nueva" })) || "").trim();
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
  const tipoNuevo = sug.clase && sug.clase !== "otro" ? ` (${TIPO_ACTIVO[sug.clase] || sug.clase})` : "";
  if (!entra && sug.accion === "activo" && sug.nuevo) chip(`✨ Crear «${nombreNuevo}»${tipoNuevo}`, () => ({ accion: "activo", nuevo_activo: nombreNuevo, clase: sug.clase }), "sug", "Crea el activo y guarda estas compras en él");
  if (sug.accion === "activo" && sug.activo) chip(`✨ ${entra ? "Venta de" : "Compra de"} ${sug.activo}`, () => ({ accion: "activo", activo: sug.activo }), "sug");
  if (sug.accion === "ignorar") chip(`✨ 🔁 Traspaso ${entra ? "desde" : "a"} mi banco`, () => ({ accion: "ignorar" }), "sug", "El dinero que pasas entre el banco y el bróker ya cuenta en el extracto del banco");
  if (sug.accion === "interes") chip(`✨ ${entra ? "💰 Intereses" : "🏦 Comisión"}`, () => ({ accion: "interes" }), "sug");
  if (sug.accion === "dividendo" && sug.activo) chip(`✨ 💵 Dividendo de ${sug.activo}`, () => ({ accion: "dividendo", activo: sug.activo }), "sug");
  for (const a of acts.filter((a) => a !== sug.activo)) chip(`📈 ${a}`, () => ({ accion: "activo", activo: a }));
  if (sug.accion !== "interes") chip(entra ? "💰 Intereses" : "🏦 Comisión", () => ({ accion: "interes" }));
  if (entra && acts.length) {  // un dividendo o cupón: de qué activo
    const sD = chips.createEl("select", { cls: "otra", attr: { "aria-label": "Dividendo de qué activo" } });
    const d0 = sD.createEl("option", { text: sug.accion === "dividendo" && !sug.activo ? "✨ Dividendo de…" : "Dividendo de…" }); d0.value = "";
    for (const a of acts) { const o = sD.createEl("option", { text: `💵 ${a}` }); o.value = a; }
    sD.onchange = () => { if (sD.value) hecho({ accion: "dividendo", activo: sD.value }, sD); };
  }
  if (sug.accion !== "ignorar") chip(entra ? "🔁 Traspaso desde mi banco" : "🔁 Traspaso a mi banco", () => ({ accion: "ignorar" }));
  if (entra && sug.nuevo) chip(`Venta: nuevo activo «${nombreNuevo}»`, () => ({ accion: "activo", nuevo_activo: nombreNuevo, clase: sug.clase }));
  plegable(card, "Más opciones: nombre del activo y qué recordar", (c) => {
    const f0 = c.createDiv({ cls: "fb-fila" });
    f0.createSpan({ cls: "fb-et", text: "Nombre del activo nuevo" });
    const iN = f0.createEl("input", { attr: { type: "text", "aria-label": "Nombre del activo nuevo" } }); iN.value = nombreNuevo; iN.oninput = () => (nombreNuevo = iN.value);
    const f1 = c.createDiv({ cls: "fb-fila" });
    const lab = f1.createEl("label"); const chk = lab.createEl("input", { attr: { type: "checkbox" } }); chk.checked = recordar; chk.onchange = () => (recordar = chk.checked);
    lab.appendText("Recordar para la próxima vez los que contengan:");
    const iPat = f1.createEl("input", { attr: { type: "text", "aria-label": "Texto a recordar" } }); iPat.value = patron; iPat.oninput = () => (patron = iPat.value);
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
    const b = caja.createEl("button", { cls: "fb-cand" });
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
// Consejo de categoría nueva: usa la misma decisión «La próxima vez» de la tarjeta.
function consejoCategoria(card, g, c, hecho) {
  const mostrar = c.accion === "mostrar";
  const caja = card.createDiv({ cls: "fb-nuevacat" });
  const bAbrir = caja.createEl("button", { cls: "abrir", attr: { type: "button", "aria-expanded": "false" },
    text: mostrar ? `¿Volver a mostrar la categoría «${c.icono || ""} ${c.nombre}»?` : `¿Crear la categoría «${c.icono || ""} ${c.nombre}»?` });
  caja.createDiv({ cls: "mot", text: c.motivo });
  const form = caja.createDiv({ cls: "form" }); form.hidden = true;
  bAbrir.onclick = () => { form.hidden = !form.hidden; bAbrir.setAttribute("aria-expanded", String(!form.hidden)); if (!form.hidden) iN.focus(); };
  let nombre = c.nombre, icono = c.icono || "", grupo = c.grupo || "variable";
  const fila = form.createDiv({ cls: "fb-fila" });
  fila.createSpan({ cls: "fb-et", text: "Nombre" });
  const iN = fila.createEl("input", { attr: { type: "text", maxlength: "40", "aria-label": "Nombre de la categoría" } }); iN.value = nombre; iN.oninput = () => (nombre = iN.value);
  if (!mostrar) {
    fila.createSpan({ cls: "fb-et", text: "Emoji" });
    const iE = fila.createEl("input", { cls: "mini", attr: { type: "text", maxlength: "8", "aria-label": "Emoji de la categoría" } }); iE.value = icono; iE.oninput = () => (icono = iE.value.trim());
    const sG = fila.createEl("select", { attr: { "aria-label": "Tipo de gasto" } });
    for (const [v, t] of [["variable", "Gasto variable"], ["fijo", "Gasto fijo"]]) { const o = sG.createEl("option", { text: t }); o.value = v; }
    sG.value = grupo; sG.onchange = () => (grupo = sG.value);
  }
  const acc = form.createDiv({ cls: "fb-fila" });
  const bOk = acc.createEl("button", { cls: "fb-btn", attr: { type: "button" }, text: mostrar ? "Mostrarla y usarla" : "Crearla y usarla" });
  const bNo = acc.createEl("button", { cls: "fb-btn sec", attr: { type: "button" }, text: "Cancelar" });
  bNo.onclick = () => { form.hidden = true; bAbrir.setAttribute("aria-expanded", "false"); bAbrir.focus(); };
  bOk.onclick = () => {
    if (!nombre.trim()) { mensaje(caja, "Escribe el nombre de la categoría.", "err"); return; }
    hecho({ accion: "guardar", clase: "gasto", categoria: nombre.trim(), categoria_nueva: { nombre: nombre.trim(), icono, grupo, mostrar } }, bOk);
  };
}
function tarjetaGrupo(padre, g) {
  const p = g[0], f = p.fila, entra = f.importe > 0, esTr = f.clase === "transferencia", bz = p.bizum;
  const sug = sugDe(g), historial = g.reparto ? [] : p.historial || [], racha = g.reparto ? null : p.racha;
  const card = padre.createDiv({ cls: "fb-grupo fb-grupo-banco" });
  const nombre = bz ? `Bizum ${entra ? "de" : "a"} ${bz.persona}` : f.concepto || C_titulo(sugerirPatron(f.texto));
  cabGrupo(card, g, sug ? { cat: sug.categoria } : { icono: esTr ? "🔁" : g.reparto ? "↩️" : entra ? "💰" : "❔" },
    g.reparto ? `Reparto: ${g.length} Bizums de ${eur(f.importe)}` : nombre);
  card.querySelector(".ext")?.remove();
  if (bz) card.querySelector(".duda")?.remove();
  if (bz && bz.concepto && !g.reparto) card.querySelector(".cab .s").appendText(` · concepto «${bz.concepto}»`);
  let proxima = racha && racha.n >= 3 ? "siempre" : "preguntar";
  let patron = g.reparto ? "" : f.patron || sugerirPatron(f.texto), concepto = f.concepto || "", palabra = bz ? bz.concepto : "";
  const hecho = resolverGrupo(card, g, () => ({ proxima: g.reparto ? "preguntar" : proxima, patron, palabra, concepto: g.length === 1 ? concepto : null }));
  let frase = "";
  if (!g.reparto) {
    if (p.preguntar) frase = "Me pediste que te preguntara cada vez.";
    else if (racha && racha.n >= 3) frase = `Las ${racha.n} últimas veces fue ${racha.categoria}. He marcado «Siempre»; puedes cambiarlo.`;
    else if (historial.length) {
      const cats = historial.slice(0, 2).map((h) => h.categoria).join(" u ");
      frase = bz ? `Las últimas veces que ${entra ? "te pagó" : "pagaste a"} ${C_titulo(bz.persona.split(" ")[0])} fue ${cats}.` : `Las otras veces fue ${cats}.`;
    } else if (p.palabra) frase = `‹${p.palabra.palabra}› suena a ${p.palabra.categoria}.`;
  }
  if (frase) card.createDiv({ cls: "fb-revision-voz" }).innerHTML = vozMascota(frase, "pensando", { tam: 40 });
  let siempre;
  if (!g.reparto) {
    const fs = card.createEl("fieldset", { cls: "fb-proxima" }); fs.createEl("legend", { text: "La próxima vez" });
    const radio = (valor, texto) => {
      const lab = fs.createEl("label");
      const r = lab.createEl("input", { attr: { type: "radio", name: `proxima-${p.id}`, value: valor } }); r.checked = proxima === valor; r.onchange = () => { if (r.checked) proxima = valor; };
      lab.appendText(texto); return lab;
    };
    radio("preguntar", "Pregúntame");
    siempre = radio("siempre", `Siempre esta categoría para ${bz ? bz.persona : patron}`);
    if (bz && bz.concepto) {
      const lab = radio("concepto", "Solo cuando el concepto diga ");
      const i = lab.createEl("input", { attr: { type: "text", "aria-label": "Palabra del concepto", maxlength: "120" } }); i.value = palabra;
      i.oninput = () => { palabra = i.value; }; i.onclick = () => { const r = lab.querySelector('input[type="radio"]'); r.checked = true; proxima = "concepto"; };
    }
    fs.createDiv({ cls: "fin-note", text: "Al elegir una categoría se guarda." });
  }
  if (entra && !esTr && esBizum(f.texto)) gastosCandidatos(card, g, sug, hecho);
  const chips = card.createDiv({ cls: "fb-cats" });
  const claseCat = (cat) => grupoDe(cat) === "ingreso" ? "ingreso" : "gasto";
  const chip = (texto, datos, cls) => { const b = chips.createEl("button", { text: texto, cls: cls || "", attr: { type: "button" } }); b.onclick = () => hecho(datos, b); return b; };
  if (esTr) {
    for (const c of cuentas().filter((c) => c.nombre !== p.cuenta)) chip(`🔁 ${entra ? "Desde" : "A"} ${c.nombre}`, { accion: "guardar", clase: "transferencia", cuenta_otra: c.nombre }, "sug");
    const bN = chips.createEl("button", { text: "＋ Otra cuenta mía…" }); bN.onclick = () => nuevaCuentaYTraspaso(hecho, bN);
  }
  const botones = p.botones || [...new Set([...(sug && sug.categoria ? [sug.categoria] : []), ...catsFrecuentes(entra, 6, f.importe)])].slice(0, 6);
  for (const c of botones) {
    const b = chip(`${catIcono(c)} ${c}`, { accion: "guardar", clase: claseCat(c), categoria: c }, historial.some((h) => h.categoria === c) ? "sug" : "");
    b.setAttribute("aria-label", `Clasificar como ${c}`);
  }
  const buscar = chips.createEl("button", { text: "Buscar categoría…", attr: { type: "button", "aria-expanded": "false" } });
  // Buscador propio (no <datalist>: su lista la pinta el sistema, en blanco aunque el tema sea oscuro): las categorías que casan, como los mismos botones
  const busqueda = card.createDiv({ cls: "fb-buscar-categoria" }); busqueda.hidden = true;
  const idBusca = `rev-cat-${p.id}`;
  const linea = busqueda.createDiv({ cls: "fb-buscar-linea" });
  linea.createEl("label", { text: "Buscar categoría", attr: { for: idBusca } });
  const input = linea.createEl("input", { attr: { id: idBusca, type: "search", autocomplete: "off", placeholder: "Escribe para filtrar", "aria-describedby": idBusca + "-n" } });
  const cuenta = linea.createSpan({ cls: "fb-buscar-n", attr: { id: idBusca + "-n", "aria-live": "polite" } });
  const resultados = busqueda.createDiv({ cls: "fb-cats fb-buscar-res" });
  const opciones = [...new Set(["gasto", "ingreso"].flatMap((clase) => catSegunClase({ clase }).map(([v]) => v)))];
  const casan = () => {
    const q = norm(input.value.trim()); if (!q) return opciones;
    const nivel = (c) => norm(c) === q ? 0 : norm(c).startsWith(q) ? 1 : 2;  // «ocio» elige Ocio antes que Negocio
    return opciones.filter((c) => norm(c).includes(q)).sort((a, b) => nivel(a) - nivel(b));
  };
  const pintar = () => {
    resultados.empty();
    const lista = casan();
    for (const c of lista) {
      const b = resultados.createEl("button", { text: `${catIcono(c)} ${c}`, attr: { type: "button", "aria-label": `Clasificar como ${c}` } });
      b.onclick = () => hecho({ accion: "guardar", clase: claseCat(c), categoria: c }, b);
    }
    cuenta.textContent = lista.length ? (input.value.trim() ? `${lista.length} ${lista.length === 1 ? "categoría" : "categorías"} · Enter elige la primera` : "") : "Ninguna categoría con ese nombre";
  };
  input.oninput = pintar;
  input.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); const b = resultados.querySelector("button"); if (b) b.click(); }
    else if (e.key === "Escape") { buscar.click(); buscar.focus(); }
  };
  buscar.onclick = () => {
    busqueda.hidden = !busqueda.hidden; buscar.setAttribute("aria-expanded", String(!busqueda.hidden));
    if (!busqueda.hidden) { input.value = ""; pintar(); input.focus(); }
  };
  const enlaces = chips.createDiv({ cls: "fb-revision-enlaces" });
  if (!esTr) {
    const tr = enlaces.createEl("button", { cls: "fb-revision-link", text: "Es entre mis cuentas", attr: { "aria-expanded": "false" } });
    const caja = card.createDiv({ cls: "fb-fila" }); caja.hidden = true;
    tr.onclick = () => { caja.hidden = !caja.hidden; tr.setAttribute("aria-expanded", String(!caja.hidden)); };
    const sTr = caja.createEl("select", { attr: { "aria-label": "Traspaso entre mis cuentas" } });
    sTr.createEl("option", { text: "Elige tu otra cuenta", attr: { value: "" } });
    for (const c of cuentas().filter((c) => c.nombre !== p.cuenta)) sTr.createEl("option", { text: `${entra ? "Desde" : "A"} ${c.nombre}`, attr: { value: String(c.nombre) } });
    sTr.onchange = () => { if (sTr.value) hecho({ accion: "guardar", clase: "transferencia", cuenta_otra: sTr.value }, sTr); };
    const bN = caja.createEl("button", { cls: "fb-revision-link", text: "Otra cuenta mía…" }); bN.onclick = () => nuevaCuentaYTraspaso(hecho, bN);
  }
  const bD = enlaces.createEl("button", { cls: "fb-revision-link", text: g.length > 1 ? "Descartar todos" : "Descartar" });
  bD.onclick = () => hecho({ accion: "ignorar" }, bD);
  if (p.categoria_nueva && !entra && !esTr && !g.reparto) consejoCategoria(card, g, p.categoria_nueva, hecho);
  if (!g.reparto) {
    plegable(card, "Texto del banco y nombre para mostrar", (c) => {
      c.createDiv({ cls: "ext", text: f.texto });
      const fila = c.createDiv({ cls: "fb-fila" });
      const lab = fila.createEl("label", { text: "Texto a recordar " });
      const iPat = lab.createEl("input", { attr: { type: "text", "aria-label": "Texto a recordar" } }); iPat.value = patron;
      iPat.oninput = () => { patron = iPat.value; siempre.lastChild.textContent = `Siempre esta categoría para ${bz ? bz.persona : patron}`; };
      if (g.length === 1) {
        const l = fila.createEl("label", { text: "Nombre para mostrar " });
        const iC = l.createEl("input", { attr: { type: "text", "aria-label": "Nombre para mostrar" } }); iC.value = concepto; iC.oninput = () => (concepto = iC.value);
      }
    });
  }
}
const C_titulo = (s) => String(s).split(" ").map((w) => cap(w)).join(" ");
const sugerirPatron = (t) => norm(String(t).replace(/^(compra|pago|recibo|adeudo|transferencia|bizum)( en| a favor de| de)?\s+/i, "").replace(/[,].*$/, "").replace(/\s+\d{3,}.*$/, "")).split(" ").slice(0, 3).join(" ");


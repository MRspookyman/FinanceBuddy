// ───────────── por revisar ─────────────
// Las dudas del banco se agrupan por comercio (mismo patrón, cuenta y sentido): una decisión resuelve el grupo entero.
// Cada grupo ofrece la categoría más probable (por tu historial) y las que más usas, a un clic.
function vistaRevisar() {
  const P = DB.pendientes || [];
  const S = (DB.registros.movimiento || []).filter((m) => m.sugerido).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.id - a.id);
  // Los grupos se cuentan antes del título: la insignia del menú y el subtítulo iban por movimientos y los chips de abajo
  // por grupos, con la misma pinta («6 movimientos» arriba y «Todo · 4» justo debajo). Ahora el título dice las dos cosas.
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
  const nG = G.length + GI.length;
  titulo("Por revisar", P.length ? `${nG} grupo${nG > 1 ? "s" : ""} · ${P.length} movimiento${P.length > 1 ? "s" : ""} que la app no ha sabido clasificar sola`
    + (nG < P.length ? " (lo del mismo comercio se resuelve de una vez)" : "") : "");
  avisoDeshacerPendiente(root);
  if (S.length) panelSugeridos(root, S);
  if (!P.length) {
    if (S.length) return;
    const ok = root.createDiv({ cls: "fb-hecho" });
    ok.createDiv({ cls: "i", text: "✓" });
    ok.createEl("b", { text: "Todo revisado" });
    ok.createDiv({ text: "Lo que elijas aquí se recuerda: cada vez tendrás menos que revisar." });
    enlace(ok, "Ir al inicio →", "#inicio");
    return;
  }
  const conProp = [...G.map((g) => [g, propuestaBanco(g)]), ...GI.map((g) => [g, propuestaBroker(g)])].filter(([, pr]) => pr);
  const conSug = new Set(conProp.map(([g]) => g));
  // Filtros (como en Lunch Money o Monarch): lo del banco, lo del bróker o solo lo que ya trae sugerencia
  const F = [["todo", "Todo", nG], ["banco", "Banco", G.length], ["broker", "Bróker", GI.length], ["sug", "Con sugerencia", conProp.length]].filter(([k, , n]) => k === "todo" || n);
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
// Movimientos ya guardados (y contados en el mes) con una categoría que la app eligió sola: se confirman de golpe o se corrigen uno a uno.
function panelSugeridos(padre, S) {
  const p = panel(padre, "Guardados con categoría sugerida", { text: `${S.length}` },
    "La app los ha guardado ya y cuentan en tu mes, con la categoría más probable según tu historial. Confírmalos o cambia la categoría de los que no acierte; si te equivocas, «Deshacer». Se puede apagar en Ajustes.");
  const cab = p.createDiv({ cls: "fb-fila" });
  const b = cab.createEl("button", { cls: "fb-btn", text: `Confirmar ${S.length === 1 ? "este movimiento" : `los ${S.length}`}` });
  cab.createSpan({ cls: "fin-note", text: "Si no tocas nada, se quedan como están." });
  b.onclick = async () => {
    b.disabled = true;
    const r = await FB.api("/api/confirmar_sugeridos", {});
    FB.aviso(r.mensaje || "Hecho", !r.ok, r.ok ? avisoDeshacer() : undefined);
    await FB.refrescar();
  };
  const lista = p.createDiv({ cls: "fb-sug-lista2" });
  const pg = paginacion(S, "rev_sug", render, 10);
  for (const m of pg.parte) {
    const f = lista.createDiv({ cls: "fb-sug2" });
    const n = f.createDiv({ cls: "n" });
    n.createDiv({ cls: "t", text: m.concepto });
    n.createDiv({ cls: "s", text: `${fechaCorta(m.fecha)} · ${eurS(m.clase === "gasto" ? -num(m.importe) : num(m.importe))} · ${m.categoria || "Sin categoría"} · ${m.sugerido}` });
    const ok = f.createEl("button", { cls: "fb-btn sec", text: "Está bien", attr: { "aria-label": `Confirmar la categoría de ${m.concepto}` } });
    ok.onclick = async () => { ok.disabled = true; await FB.api("/api/confirmar_sugeridos", { ids: [m.id] }); await FB.refrescar(); };
    enlace(f, "Cambiar", `#editar/movimiento/${m.id}`);
  }
  pg.pie(p);
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
// Consejo de categoría nueva (o de volver a mostrar una oculta) cuando ninguna tuya encaja. Es un botón discreto: nada se crea hasta que
// se confirma. Se puede cambiar el nombre, el emoji y el tipo antes; al confirmar se crea, se asigna este pago y, si sigue marcada la
// casilla, se recuerda el comercio como regla para los próximos.
function consejoCategoria(card, g, c, hecho, patronInicial) {
  const mostrar = c.accion === "mostrar";
  const caja = card.createDiv({ cls: "fb-nuevacat" });
  const bAbrir = caja.createEl("button", { cls: "abrir", attr: { type: "button", "aria-expanded": "false" },
    text: mostrar ? `¿Volver a mostrar la categoría «${c.icono || ""} ${c.nombre}»?` : `¿Crear la categoría «${c.icono || ""} ${c.nombre}»?` });
  caja.createDiv({ cls: "mot", text: c.motivo });
  const form = caja.createDiv({ cls: "form" }); form.hidden = true;
  bAbrir.onclick = () => { form.hidden = !form.hidden; bAbrir.setAttribute("aria-expanded", String(!form.hidden)); if (!form.hidden) iN.focus(); };
  let nombre = c.nombre, icono = c.icono || "", grupo = c.grupo || "variable", recordar = true, patron = patronInicial || "";
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
  if (patronInicial) {
    const f2 = form.createDiv({ cls: "fb-fila" });
    const lab = f2.createEl("label"); const chk = lab.createEl("input", { attr: { type: "checkbox" } }); chk.checked = true; chk.onchange = () => (recordar = chk.checked);
    lab.appendText("Recordar para los próximos los que contengan:");
    const iP = f2.createEl("input", { attr: { type: "text", "aria-label": "Texto a recordar" } }); iP.value = patron; iP.oninput = () => (patron = iP.value);
  }
  const acc = form.createDiv({ cls: "fb-fila" });
  const bOk = acc.createEl("button", { cls: "fb-btn", attr: { type: "button" }, text: mostrar ? "Mostrarla y usarla" : "Crearla y usarla" });
  const bNo = acc.createEl("button", { cls: "fb-btn sec", attr: { type: "button" }, text: "Cancelar" });
  bNo.onclick = () => { form.hidden = true; bAbrir.setAttribute("aria-expanded", "false"); bAbrir.focus(); };
  bOk.onclick = () => {
    if (!nombre.trim()) { mensaje(caja, "Escribe el nombre de la categoría.", "err"); return; }
    hecho({ accion: "guardar", clase: "gasto", categoria: nombre.trim(), categoria_nueva: { nombre: nombre.trim(), icono, grupo, mostrar }, recordar: recordar && !!patron.trim(), patron }, bOk);
  };
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
  if (p.categoria_nueva && !entra && !esTr && !g.reparto) consejoCategoria(card, g, p.categoria_nueva, hecho, patron);
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
const C_titulo = (s) => String(s).split(" ").map((w) => cap(w)).join(" ");
const sugerirPatron = (t) => norm(String(t).replace(/^(compra|pago|recibo|adeudo|transferencia|bizum)( en| a favor de| de)?\s+/i, "").replace(/[,].*$/, "").replace(/\s+\d{3,}.*$/, "")).split(" ").slice(0, 3).join(" ");


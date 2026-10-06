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
  let parecidos = false, recordar = false;
  const conExtracto = !!reg.ext_texto;
  // Qué va a pasar al pulsar una categoría, delante y a la vista: un clic puede cambiar decenas de movimientos y dejar una
  // regla para siempre, y eso estaba en dos casillas pequeñas debajo de los botones. Se marcan solas **la primera vez**;
  // si ya tienes una regla tuya de ese comercio salen desactivadas, porque entonces lo que manda es la regla.
  if (conExtracto) {
    const caja = p.createDiv({ cls: "fb-aplicar" });
    caja.createDiv({ cls: "et", text: "Al elegir una categoría" });
    const opcion = (texto) => {
      const l = caja.createEl("label");
      const c = l.createEl("input", { attr: { type: "checkbox" } });
      c.disabled = true;  // hasta saber si ya hay regla no se promete nada
      const t = l.createSpan({ text: texto });
      return { l, c, t };
    };
    const o1 = opcion("Cambiar también los demás movimientos de este comercio");
    const o2 = opcion("Recordarlo para los próximos");
    const por = caja.createDiv({ cls: "por", text: "Comprobando qué hay de este comercio…" });
    FB.api("/api/parecidos", { id: reg.id }).then((r) => {
      if (!r.ok) { por.setText("No se ha podido comprobar: se cambiará solo este movimiento."); return; }
      const quien = `«${C_titulo(r.patron)}»`;
      if (r.n) o1.t.setText(`Cambiar también ${r.n === 1 ? "el otro movimiento" : `los otros ${r.n} movimientos`} de ${quien}`);
      o2.t.setText(`Recordarlo para los próximos de ${quien}`);
      if (!r.n) o1.l.style.display = "none";
      por.empty();
      if (r.regla) {  // ya hay una regla tuya: ni se tocan los demás ni se reescribe sola
        for (const o of [o1, o2]) o.l.addClass("off");
        por.appendText(`Ya tienes una regla para ${quien}: lo suyo va a ${r.regla.categoria || "su categoría"}. Esto cambia solo este movimiento. `);
        enlace(por, "Para los demás y los próximos, cambia la regla →", `#editar/regla/${r.regla.id}`);
        return;
      }
      for (const o of [o1, o2]) { o.c.disabled = false; o.c.checked = true; }
      parecidos = !!r.n; recordar = true;
      o1.c.onchange = () => (parecidos = o1.c.checked);
      o2.c.onchange = () => (recordar = o2.c.checked);
      por.setText("Es la primera vez que clasificas este comercio: por eso van marcadas.");
    });
  }
  const chips = p.createDiv({ cls: "fb-cats" });
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


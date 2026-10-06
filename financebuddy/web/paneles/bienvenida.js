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
  zonaSoltar(arch, "Arrastra aquí el Excel o CSV, o pulsa para elegirlo", () => FB.ir("#importar"),
    (files) => { FB.soltados = files; FB.ir("#importar"); });
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


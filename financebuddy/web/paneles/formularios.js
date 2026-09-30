// ═════════════ formularios: alta y edición de registros ═════════════
// FORMS describe, por tipo de registro, sus campos (etiqueta, tipo de control, opciones, cuándo se ven) y cómo se
// listan en «Ajustes». formulario() dibuja el editor y guarda con /api/guardar.
const TIPO_CUENTA = { corriente: "Corriente (día a día)", ahorro: "Ahorro", broker: "Bróker (efectivo para invertir)", otro: "Otra (fianza, depósito…)" };
const CLASE_MOV = { gasto: "Gasto", ingreso: "Ingreso", reembolso: "Te lo devolvieron", transferencia: "Entre tus cuentas" };
const opcCategorias = (grupo) => () => categorias().filter((c) => !grupo || (grupo === "ingreso" ? c.grupo === "ingreso" : c.grupo !== "ingreso")).map((c) => [c.nombre, c.nombre]);
const opcCuentas = (filtro) => () => cuentas().filter((c) => !filtro || filtro(c)).map((c) => [c.nombre, c.nombre]);
const opcActivos = () => registros("activo").map((a) => [a.nombre, a.nombre]);
const opcRecurrentes = (clase) => () => registros("recurrente").filter((r) => !clase || r.clase === clase).map((r) => [r.nombre, r.nombre]);
const catSegunClase = (d) => d.clase === "ingreso" ? opcCategorias("ingreso")() : opcCategorias("gasto")();

const FORMS = {
  cuenta: { uno: "cuenta", plural: "Cuentas", ayuda: "Tus cuentas del banco, de ahorro y del bróker. Los saldos se anotan al cerrar cada mes.",
    campos: [
      { k: "nombre", l: "Nombre", req: true, ph: "p. ej. Cuenta nómina" },
      { k: "tipo", l: "Tipo", t: "opc", opc: Object.entries(TIPO_CUENTA) },
      { k: "extracto", l: "Importo sus movimientos", t: "bool", ayuda: "Márcalo si vas a importar el extracto de esta cuenta. Si no, su saldo se calcula con los traspasos desde tus otras cuentas." },
      { k: "notas", l: "Notas" }],
    fila: (r) => [r.nombre, TIPO_CUENTA[r.tipo] || r.tipo, r.extracto ? "importa extracto" : ""], cols: ["Nombre", "Tipo", ""] },
  categoria: { uno: "categoría", plural: "Categorías", ayuda: "Los gastos de las categorías «fijo» no cuentan para tu límite de gasto variable.",
    campos: [
      { k: "nombre", l: "Nombre", req: true },
      { k: "grupo", l: "Grupo", t: "opc", opc: [["variable", "Gasto variable"], ["fijo", "Gasto fijo (alquiler, recibos…)"], ["ingreso", "Ingreso"]] },
      { k: "presupuesto", l: "Presupuesto mensual (opcional)", t: "num", ayuda: "Si lo pones, verás una barra de lo gastado frente a este presupuesto y un aviso si te pasas." },
      { k: "icono", l: "Icono", t: "emoji" },
      { k: "color", l: "Color", t: "color" }],
    fila: (r) => [`${r.icono || catIcono(r.nombre)}  ${r.nombre}`, { variable: "variable", fijo: "fijo", ingreso: "ingreso" }[r.grupo] || r.grupo, r.presupuesto ? eur(r.presupuesto, 0) : ""], cols: ["Nombre", "Grupo", "Presupuesto"] },
  movimiento: { uno: "movimiento", plural: "Movimientos", ayuda: "Todo lo importado del banco y lo apuntado a mano.",
    campos: [
      { k: "fecha", l: "Fecha", t: "fecha", req: true, defecto: () => hoy.toISODate() },
      { k: "clase", l: "Tipo", t: "opc", opc: Object.entries(CLASE_MOV) },
      { k: "importe", l: "Importe (€, sin signo)", t: "num", req: true },
      { k: "concepto", l: "Concepto", req: true, ph: "p. ej. Cena con amigos" },
      { k: "categoria", l: "Categoría", t: "opc", opc: catSegunClase, si: (d) => d.clase !== "transferencia" },
      { k: "cuenta", l: "Cuenta", t: "opc", opc: opcCuentas(), defecto: () => principal() },
      { k: "_dir", l: "Dirección", t: "opc", opc: [["destino", "Sale hacia…"], ["origen", "Entra desde…"]], si: (d) => d.clase === "transferencia", virtual: true },
      { k: "_otra", l: "Otra cuenta", t: "opc", opc: opcCuentas(), si: (d) => d.clase === "transferencia", virtual: true },
      { k: "recurrente", l: "Es el pago/cobro de este recurrente", t: "opc", opc: opcRecurrentes(), vacio: "— ninguno —", si: (d) => d.clase === "gasto" || d.clase === "ingreso",
        ayuda: "Si lo enlazas, ese mes el recurrente no se cuenta dos veces." },
      { k: "nota", l: "Nota" }],
    fila: (r) => [fechaCorta(r.fecha), r.concepto, r.clase === "transferencia" ? `entre cuentas${r.destino ? " → " + r.destino : r.origen ? " ← " + r.origen : ""}` : r.categoria || "", { text: (r.clase === "gasto" ? "−" : r.clase === "transferencia" ? "" : "+") + eur(r.importe), cls: r.clase === "ingreso" ? "pos" : "" }],
    cols: ["Fecha", "Concepto", "Categoría", "Importe"], orden: (a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.id - a.id,
    antes: (d) => { if (d.clase === "transferencia") { d[d._dir || "destino"] = d._otra; d[d._dir === "origen" ? "destino" : "origen"] = ""; d.categoria = ""; } else { d.destino = d.origen = ""; } },
    cargar: (d) => { d._dir = d.origen ? "origen" : "destino"; d._otra = d.destino || d.origen || ""; } },
  recurrente: { uno: "fijo", plural: "Fijos", ayuda: "Lo que se repite cada mes (o ciertos meses): nómina, alquiler, recibos, aportaciones. Sirven para la previsión y para saber lo que falta por pagar.",
    campos: [
      { k: "nombre", l: "Nombre", req: true, ph: "p. ej. Alquiler" },
      { k: "clase", l: "Tipo", t: "opc", opc: [["gasto", "Gasto"], ["ingreso", "Ingreso"], ["aportacion", "Aportación a una inversión"]] },
      { k: "importe", l: "Importe (€)", t: "num", req: true },
      { k: "categoria", l: "Categoría", t: "opc", opc: catSegunClase, si: (d) => d.clase !== "aportacion" },
      { k: "activo_inversion", l: "Activo", t: "opc", opc: opcActivos, si: (d) => d.clase === "aportacion" },
      { k: "dia", l: "Día del mes", t: "int", defecto: () => 1 },
      { k: "desde", l: "Desde", t: "fecha", req: true, defecto: () => hoy.startOf("month").toISODate() },
      { k: "hasta", l: "Hasta (opcional)", t: "fecha" },
      { k: "meses", l: "Solo estos meses (opcional)", t: "meses", ayuda: "Números del 1 al 12 separados por comas. Vacío = todos los meses. Ej.: «3» para un seguro anual en marzo." },
      { k: "cuenta", l: "Cuenta", t: "opc", opc: opcCuentas(), vacio: "— la principal —" },
      { k: "activo", l: "Activo (desmárcalo si ya no se repite)", t: "bool", defecto: () => true }],
    fila: (r) => [r.nombre, { gasto: "gasto", ingreso: "ingreso", aportacion: "aportación" }[r.clase], eur(r.importe), `día ${r.dia || 1}${r.meses ? " · meses " + r.meses.join(", ") : ""}${r.activo === false ? " · inactivo" : ""}`],
    cols: ["Nombre", "Tipo", "Importe", "Cuándo"] },
  activo: { uno: "activo", plural: "Activos", ayuda: "Fondos, acciones, ETF o cripto. Actualiza su valor de vez en cuando (Inversión → Actualizar valores).",
    campos: [
      { k: "nombre", l: "Nombre", req: true, ph: "p. ej. Fondo indexado MSCI World" },
      { k: "clase", l: "Tipo", t: "opc", opc: [["fondo", "Fondo"], ["etf", "ETF"], ["accion", "Acción"], ["cripto", "Cripto"], ["otro", "Otro"]] },
      { k: "cuenta", l: "Cuenta del bróker", t: "opc", opc: opcCuentas((c) => c.tipo === "broker"), vacio: "— ninguna —" },
      { k: "valor", l: "Valor actual (€)", t: "num" },
      { k: "fecha_valor", l: "Fecha de ese valor", t: "fecha", defecto: () => hoy.toISODate() },
      { k: "aportado_inicial", l: "Aportado antes de usar la app (€)", t: "num", ayuda: "Lo que habías metido hasta ahora. Con esto se calcula la ganancia." },
      { k: "fecha_inicio", l: "Fecha de la primera compra", t: "fecha", ayuda: "Aproximada: sirve para la rentabilidad anual." },
      { k: "patrones", l: "Cómo aparece en el extracto del bróker", t: "lista", ayuda: "Textos separados por comas (p. ej. «msci world»). Al importar, las compras con ese texto se asignan a este activo." },
      { k: "isin", l: "ISIN (opcional)" },
      { k: "estado", l: "Estado", t: "opc", opc: [["activo", "Lo tengo"], ["vendido", "Vendido"]] }],
    fila: (r) => [r.nombre, r.clase, r.valor != null ? eur(r.valor, 0) : "—", r.fecha_valor ? `a ${fechaCorta(r.fecha_valor)}` : ""], cols: ["Nombre", "Tipo", "Valor", ""] },
  aportacion: { uno: "aportación", plural: "Aportaciones", ayuda: "Compras (+) y ventas (−) de tus activos.",
    campos: [
      { k: "fecha", l: "Fecha", t: "fecha", req: true, defecto: () => hoy.toISODate() },
      { k: "activo", l: "Activo", t: "opc", opc: opcActivos, req: true },
      { k: "importe", l: "Importe (€): + compra, − venta", t: "num", req: true },
      { k: "cuenta", l: "Cuenta del bróker", t: "opc", opc: opcCuentas((c) => c.tipo === "broker"), vacio: "— la del activo —" },
      { k: "recurrente", l: "Aportación periódica", t: "opc", opc: opcRecurrentes("aportacion"), vacio: "— ninguna —" }],
    fila: (r) => [fechaCorta(r.fecha), r.activo, { text: eurS(r.importe), cls: r.importe < 0 ? "neg" : "" }], cols: ["Fecha", "Activo", "Importe"],
    orden: (a, b) => String(b.fecha).localeCompare(String(a.fecha)) },
  patrimonio: { uno: "registro de saldos", plural: "Registros de saldos", ayuda: "El saldo de cada cuenta y el valor de cada activo en una fecha (se crean al cerrar el mes).",
    campos: [
      { k: "fecha", l: "Fecha", t: "fecha", req: true, defecto: () => hoy.toISODate() },
      { k: "saldos", l: "Saldo de", t: "mapa", claves: () => cuentas().map((c) => c.nombre) },
      { k: "valores", l: "Valor de", t: "mapa", claves: () => registros("activo").filter((a) => a.estado !== "vendido").map((a) => a.nombre) },
      { k: "otros", l: "Otros bienes (€)", t: "num" },
      { k: "deudas", l: "Deudas (€)", t: "num" },
      { k: "nota", l: "Nota" }],
    fila: (r) => [fechaCorta(r.fecha), eur(sum(Object.values(r.saldos || {}).map(num)), 0), eur(sum(Object.values(r.valores || {}).map(num)), 0)], cols: ["Fecha", "Cuentas", "Inversión"],
    orden: (a, b) => String(b.fecha).localeCompare(String(a.fecha)) },
  objetivo: { uno: "objetivo", plural: "Objetivos", ayuda: "Metas de ahorro. Si eliges una cuenta, lo ahorrado es su saldo.",
    campos: [
      { k: "nombre", l: "Nombre", req: true, ph: "p. ej. Fondo de emergencia" },
      { k: "meta", l: "Meta (€)", t: "num", si: (d) => !num(d.meta_meses) },
      { k: "meta_meses", l: "…o meta en meses de gasto", t: "num", ayuda: "Por ejemplo 3: la meta será 3 meses de tu gasto medio (se ajusta sola)." },
      { k: "cuenta", l: "Cuenta donde lo guardas", t: "opc", opc: opcCuentas(), vacio: "— ninguna (lo apunto yo) —" },
      { k: "ahorrado", l: "Ahorrado hasta ahora (€)", t: "num", si: (d) => !d.cuenta },
      { k: "fecha_limite", l: "Para cuándo (opcional)", t: "fecha" },
      { k: "prioridad", l: "Prioridad", t: "opc", opc: [["alta", "Alta"], ["media", "Media"], ["baja", "Baja"]] },
      { k: "estado", l: "Estado", t: "opc", opc: [["activo", "En marcha"], ["conseguido", "Conseguido"]] }],
    fila: (r) => [r.nombre, r.meta_meses ? `${r.meta_meses} meses de gasto` : eur(r.meta, 0), r.cuenta || "", r.estado === "conseguido" ? "conseguido" : ""], cols: ["Nombre", "Meta", "Cuenta", ""] },
  recordatorio: { uno: "recordatorio", plural: "Recordatorios", ayuda: "Cosas con fecha sin importe fijo (renta, ITV, seguro anual…). Salen en el Resumen unos días antes.",
    campos: [
      { k: "nombre", l: "Qué", req: true },
      { k: "fecha", l: "Fecha", t: "fecha", req: true },
      { k: "avisar_dias", l: "Avisar con (días de antelación)", t: "int", defecto: () => 14 },
      { k: "texto", l: "Nota" },
      { k: "estado", l: "Estado", t: "opc", opc: [["pendiente", "Pendiente"], ["hecho", "Hecho"]] }],
    fila: (r) => [r.nombre, fechaCorta(r.fecha), r.estado === "hecho" ? "hecho" : ""], cols: ["Qué", "Fecha", ""], orden: (a, b) => String(a.fecha).localeCompare(String(b.fecha)) },
  regla: { uno: "regla", plural: "Reglas de clasificación", ayuda: "Si el texto de un movimiento importado contiene el patrón, se clasifica así. Las tuyas mandan sobre las de serie.",
    campos: [
      { k: "patron", l: "El texto contiene", req: true, ph: "p. ej. mercadona" },
      { k: "clase", l: "Tipo", t: "opc", opc: [["gasto", "Gasto"], ["ingreso", "Ingreso"], ["reembolso", "Te lo devolvieron"], ["transferencia", "Entre tus cuentas"]] },
      { k: "categoria", l: "Categoría", t: "opc", opc: catSegunClase, si: (d) => d.clase !== "transferencia" },
      { k: "cuenta_otra", l: "Otra cuenta", t: "opc", opc: opcCuentas(), si: (d) => d.clase === "transferencia" },
      { k: "recurrente", l: "Enlazar con el recurrente", t: "opc", opc: opcRecurrentes(), vacio: "— ninguno —", si: (d) => d.clase !== "transferencia" },
      { k: "origen", l: "", t: "oculto", defecto: () => "usuario" }],
    fila: (r) => [r.patron, r.clase === "transferencia" ? `entre cuentas${r.cuenta_otra ? " · " + r.cuenta_otra : ""}` : r.categoria, r.origen === "plantilla" ? "de serie" : "tuya"], cols: ["Patrón", "Categoría", ""],
    orden: (a, b) => (a.origen === "plantilla") - (b.origen === "plantilla") || b.id - a.id },
  perfil: { uno: "formato de archivo", plural: "Formatos de archivo", ayuda: "Cómo leer el Excel/CSV de cada banco o bróker. Se crean solos al importar un archivo nuevo.",
    campos: [
      { k: "nombre", l: "Nombre", req: true },
      { k: "tipo", l: "Tipo", t: "opc", opc: [["banco", "Extracto del banco"], ["inversion", "Movimientos del bróker"]] },
      { k: "cuenta", l: "Se importa en la cuenta", t: "opc", opc: opcCuentas(), vacio: "— preguntar —" },
      { k: "columnas", l: "Columna (texto de la cabecera) para", t: "mapa", texto: true, claves: (d) => d.tipo === "inversion" ? ["fecha", "concepto", "importe"] : ["fecha", "fecha_valor", "concepto", "importe", "cargo", "abono", "saldo"] },
      { k: "compras_negativas", l: "Las compras aparecen en negativo", t: "bool", si: (d) => d.tipo === "inversion", defecto: () => true }],
    fila: (r) => [r.nombre, r.tipo === "inversion" ? "bróker" : "banco", r.cuenta || "(pregunta)"], cols: ["Nombre", "Tipo", "Cuenta"] },
  cierre: { uno: "cierre", plural: "Meses cerrados", campos: [{ k: "mes", l: "Mes (AAAA-MM)", req: true }, { k: "fecha", l: "Fecha", t: "fecha" }, { k: "notas", l: "Notas", t: "area" }],
    fila: (r) => [mesDT(r.mes).isValid ? mesLbl(r.mes) : r.mes, r.notas || ""], cols: ["Mes", "Notas"], orden: (a, b) => String(b.mes).localeCompare(String(a.mes)) },
};

const EMOJIS = ["🏠", "💡", "🛡️", "📺", "🛒", "🍽️", "☕", "🍺", "🎉", "🎬", "🎮", "🎾", "🏋️", "🚌", "🚗", "⛽", "✈️", "🏖️", "💊", "🦷", "🛍️", "👕", "🛋️", "🔧",
  "📚", "🎓", "🎁", "💇", "🐾", "👶", "💶", "🏦", "📱", "💻", "🧾", "❤️", "💼", "💰", "📈", "🏷️"];

// ───────────── editor ─────────────
// opciones: { titulo, volver (ruta tras guardar), datosIniciales, alGuardar(id) }
function formulario(padre, tipo, reg, opciones = {}) {
  const F = FORMS[tipo];
  const d = { ...(reg || {}) };
  if (!reg || !reg.id) for (const c of F.campos) if (d[c.k] == null && c.defecto) d[c.k] = c.defecto();
  if (F.cargar) F.cargar(d);
  const p = padre.createDiv({ cls: "fin-panel" });
  const form = p.createDiv({ cls: "fb-form" });
  const msg = p.createDiv();
  const dibujar = () => {
    form.innerHTML = "";
    for (const c of F.campos) {
      if (c.si && !c.si(d)) continue;
      if (c.t === "oculto") continue;
      if (c.t === "mapa") {
        const claves = c.claves(d);
        if (!claves.length) continue;
        d[c.k] = d[c.k] || {};
        for (const k of claves) {
          form.createDiv({ cls: "et", text: `${c.l} ${k}` });
          const i = form.createEl("input", { attr: { type: c.texto ? "text" : "number", step: "0.01" } });
          i.value = d[c.k][k] ?? "";
          i.oninput = () => { if (i.value === "") delete d[c.k][k]; else d[c.k][k] = i.value; };
        }
        continue;
      }
      const et = form.createDiv({ cls: "et", text: c.l + (c.req ? " *" : "") });
      if (c.ayuda) ayuda(et, c.ayuda);
      let el;
      if (c.t === "opc") {
        el = form.createEl("select");
        const ops = typeof c.opc === "function" ? c.opc(d) : c.opc;
        if (c.vacio || !c.req) { const o = el.createEl("option", { text: c.vacio || "—" }); o.value = ""; }
        for (const [v, t] of ops) { const o = el.createEl("option", { text: t }); o.value = v; }
        if (d[c.k] != null && d[c.k] !== "" && !ops.some(([v]) => v === d[c.k])) { const o = el.createEl("option", { text: d[c.k] }); o.value = d[c.k]; }
        el.value = d[c.k] ?? (c.vacio || !c.req ? "" : (ops[0] || [""])[0]);
        if (el.value === "" && !(c.vacio || !c.req) && ops.length) el.value = ops[0][0];
        d[c.k] = el.value;
        el.onchange = () => { d[c.k] = el.value; dibujar(); };
      } else if (c.t === "bool") {
        const l = form.createEl("label", { cls: "fb-check" });
        el = l.createEl("input", { attr: { type: "checkbox" } });
        el.checked = !!d[c.k];
        l.appendText(" sí");
        el.onchange = () => { d[c.k] = el.checked; };
      } else if (c.t === "emoji") {
        // Un emoji: escribirlo o elegir uno de la lista
        el = form.createDiv({ cls: "fb-picker" });
        const i = el.createEl("input", { cls: "mini", attr: { type: "text", maxlength: "8", placeholder: catIcono(d.nombre || "") } });
        i.value = d[c.k] ?? "";
        i.oninput = () => { d[c.k] = i.value.trim(); };
        const g = el.createDiv({ cls: "fb-emojis" });
        for (const e of EMOJIS) { const b = g.createEl("button", { text: e, attr: { type: "button" } }); if (e === d[c.k]) b.className = "act"; b.onclick = () => { d[c.k] = e; dibujar(); }; }
      } else if (c.t === "color") {
        el = form.createDiv({ cls: "fb-picker" });
        const g = el.createDiv({ cls: "fb-colores" });
        const actual = d[c.k] || "";
        const b0 = g.createEl("button", { cls: "auto" + (actual ? "" : " act"), text: "auto", attr: { type: "button", title: "El de serie" } }); b0.onclick = () => { d[c.k] = ""; dibujar(); };
        for (const col of PALETA) { const b = g.createEl("button", { cls: col.toLowerCase() === actual.toLowerCase() ? "act" : "", attr: { type: "button", title: col } }); b.style.background = col; b.onclick = () => { d[c.k] = col; dibujar(); }; }
        const i = g.createEl("input", { attr: { type: "color", title: "Otro color" } }); i.value = actual || catColor(d.nombre || "x");
        i.onchange = () => { d[c.k] = i.value.toUpperCase(); dibujar(); };
      } else if (c.t === "area") {
        el = form.createEl("textarea", { attr: { rows: "4" } });
        el.value = d[c.k] ?? "";
        el.oninput = () => { d[c.k] = el.value; };
      } else {
        const tipoInput = c.t === "fecha" ? "date" : c.t === "num" || c.t === "int" ? "number" : "text";
        el = form.createEl("input", { attr: { type: tipoInput, step: c.t === "int" ? "1" : "0.01", placeholder: c.ph || "" } });
        el.value = Array.isArray(d[c.k]) ? d[c.k].join(", ") : d[c.k] ?? "";
        el.oninput = () => { d[c.k] = el.value; };
        if (c.t === "num") el.onblur = () => { if (["meta", "meta_meses", "cuenta"].includes(c.k)) dibujar(); };
      }
    }
  };
  dibujar();
  const botones = p.createDiv({ cls: "fb-fila fb-botones" });
  const bG = botones.createEl("button", { cls: "fb-btn", text: opciones.textoGuardar || "Guardar" });
  bG.onclick = async () => {
    const datos = { ...d };
    if (F.antes) F.antes(datos);
    for (const c of F.campos) if (c.virtual) delete datos[c.k];
    bG.disabled = true;
    const r = await FB.api("/api/guardar", { tipo, id: reg && reg.id, datos });
    bG.disabled = false;
    if (!r.ok) { msg.innerHTML = ""; mensaje(msg, r.mensaje || "No se ha podido guardar", "err"); return; }
    FB.aviso(opciones.avisoGuardado || "Guardado ✓");
    await FB.recargar();
    if (opciones.alGuardar) opciones.alGuardar(r.id); else FB.ir(opciones.volver || `#gestionar/${tipo}`);
  };
  if (reg && reg.id) {
    const bB = botones.createEl("button", { cls: "fb-btn sec peligro", text: "Borrar" });
    bB.onclick = async () => {
      if (!confirm(`¿Borrar este ${F.uno}? No se puede deshacer (salvo restaurando una copia de seguridad).`)) return;
      const r = await FB.api("/api/borrar", { tipo, id: reg.id });
      if (!r.ok) { mensaje(msg, r.mensaje || "Error", "err"); return; }
      FB.aviso("Borrado");
      await FB.recargar();
      FB.ir(opciones.volver || `#gestionar/${tipo}`);
    };
  }
  const bC = botones.createEl("a", { cls: "fb-btn sec", text: "Cancelar", href: opciones.volver || `#gestionar/${tipo}` });
  return p;
}
const mensaje = (padre, texto, tipo) => { const m = padre.createDiv({ cls: "fb-msg " + (tipo || "") }); m.textContent = texto; return m; };

// ═════════════ formularios: alta y edición de registros ═════════════
// FORMS describe, por tipo de registro, sus campos (etiqueta, tipo de control, opciones, cuándo se ven) y cómo se
// listan en «Ajustes». formulario() dibuja el editor y guarda con /api/guardar.
const TIPO_CUENTA = { corriente: "Corriente (día a día)", ahorro: "Ahorro", broker: "Bróker (efectivo para invertir)", otro: "Otra (fianza, depósito…)" };
const CLASE_MOV = { gasto: "Gasto", ingreso: "Ingreso", reembolso: "Te lo devolvieron", transferencia: "Entre tus cuentas" };
const opcCategorias = (grupo) => () => categorias().filter((c) => !c.oculta).filter((c) => !grupo || (grupo === "ingreso" ? c.grupo === "ingreso" : c.grupo !== "ingreso")).map((c) => [c.nombre, c.nombre]);
const opcCuentas = (filtro) => () => cuentas().filter((c) => !filtro || filtro(c)).map((c) => [c.nombre, c.nombre]);
const opcActivos = () => registros("activo").map((a) => [a.nombre, a.nombre]);
// Los gastos de los 60 días anteriores a este movimiento (los más cercanos primero), con lo que ayuda a reconocerlos
const opcGastosRecientes = (d) => {
  const f = d.fecha || hoy.toISODate();
  return registros("movimiento").filter((m) => m.clase === "gasto" && m.fecha <= f && m.fecha >= DateTime.fromISO(f).minus({ days: 60 }).toISODate())
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.id - a.id).slice(0, 80)
    .map((m) => [String(m.id), `${fechaCorta(m.fecha)} · ${m.concepto} · ${eur(m.importe)} · ${m.categoria || "sin categoría"}`]);
};
const opcRecurrentes = (clase) => () => registros("recurrente").filter((r) => !clase || r.clase === clase).map((r) => [r.nombre, r.nombre]);
// Las categorías ocultas no se ofrecen, salvo la que ya tiene el registro que se está editando (para no perderla al guardar).
const catSegunClase = (d) => {
  const o = d.clase === "ingreso" ? opcCategorias("ingreso")() : opcCategorias("gasto")();
  return d.categoria && !o.some(([v]) => v === d.categoria) && catReg(d.categoria) ? [...o, [d.categoria, d.categoria + " (oculta)"]] : o;
};

const FORMS = {
  cuenta: { uno: "cuenta", plural: "Cuentas", ayuda: "Tus cuentas del banco, de ahorro y del bróker. Los saldos se anotan al cerrar cada mes.",
    campos: [
      { k: "nombre", l: "Nombre", req: true, ph: "p. ej. Cuenta nómina" },
      { k: "tipo", l: "Tipo", t: "opc", opc: Object.entries(TIPO_CUENTA) },
      { k: "extracto", l: "Importo sus movimientos", t: "bool", ayuda: "Márcalo si vas a importar el extracto de esta cuenta. Si no, su saldo se calcula con los traspasos desde tus otras cuentas." },
      { k: "iban", l: "Últimas 4 cifras del IBAN", ph: "p. ej. 8765", ayuda: "Si el extracto trae el IBAN, así la app sabe de qué cuenta es sin preguntar. Se rellena solo la primera vez que importas." },
      { k: "notas", l: "Notas" }],
    fila: (r) => [r.nombre, TIPO_CUENTA[r.tipo] || r.tipo, r.extracto ? "importa extracto" : ""], cols: ["Nombre", "Tipo", ""] },
  categoria: { uno: "categoría", plural: "Categorías", ayuda: "Los gastos de las categorías «fijo» no cuentan para tu límite de gasto variable.",
    campos: [
      { k: "nombre", l: "Nombre", req: true },
      { k: "grupo", l: "Grupo", t: "opc", opc: [["variable", "Gasto variable"], ["fijo", "Gasto fijo (alquiler, recibos…)"], ["ingreso", "Ingreso"]] },
      { k: "presupuesto", l: "Presupuesto mensual (opcional)", t: "num", ayuda: "Si lo pones, verás una barra de lo gastado frente a este presupuesto y un aviso si te pasas." },
      { k: "descripcion", l: "Qué entra aquí (opcional)", ph: "p. ej. clases de pádel y material deportivo", ayuda: "Si usas el asistente Jev, le ayuda a proponer esta categoría." },
      { k: "icono", l: "Icono", t: "emoji" },
      { k: "color", l: "Color", t: "color" },
      { k: "oculta", l: "Ocultar", t: "bool", ayuda: "Una categoría oculta no sale al elegir categoría ni la propone Jev, pero sus movimientos se conservan y siguen contando en los totales." }],
    fila: (r) => [`${r.icono || catIcono(r.nombre)}  ${r.nombre}`, ({ variable: "variable", fijo: "fijo", ingreso: "ingreso" }[r.grupo] || r.grupo) + (r.oculta ? " · oculta" : ""), r.presupuesto ? eur(r.presupuesto, 0) : ""], cols: ["Nombre", "Grupo", "Presupuesto"] },
  movimiento: { uno: "movimiento", plural: "Movimientos", ayuda: "Todo lo importado del banco y lo apuntado a mano.",
    campos: [
      { k: "fecha", l: "Fecha", t: "fecha", req: true, defecto: () => hoy.toISODate() },
      { k: "clase", l: "Tipo", t: "opc", opc: Object.entries(CLASE_MOV) },
      { k: "importe", l: "Importe (€, sin signo)", t: "num", req: true },
      { k: "concepto", l: "Concepto", req: true, ph: "p. ej. Cena con amigos", alSalir: sugerirCategoria },
      { k: "categoria", l: "Categoría", t: "opc", opc: catSegunClase, si: (d) => d.clase !== "transferencia",
        nota: (d) => (d._sug && d._sug.cat === d.categoria ? d._sug.txt : "") },
      { k: "cuenta", l: "Cuenta", t: "opc", opc: opcCuentas(), defecto: () => principal() },
      { k: "_dir", l: "Dirección", t: "opc", opc: [["destino", "Sale hacia…"], ["origen", "Entra desde…"]], si: (d) => d.clase === "transferencia", virtual: true },
      { k: "_otra", l: "Otra cuenta", t: "opc", opc: opcCuentas(), si: (d) => d.clase === "transferencia", virtual: true },
      { k: "reembolsa", l: "Devuelve parte de este gasto", t: "opc", opc: opcGastosRecientes, vacio: "— ninguno —", si: (d) => d.clase === "reembolso",
        ayuda: "Si te devuelven dinero de un gasto que pagaste tú (un Bizum de un amigo…), elige cuál: así ves cuánto te costó de verdad." },
      { k: "recurrente", l: "Es el pago/cobro de este recurrente", t: "opc", opc: opcRecurrentes(), vacio: "— ninguno —", si: (d) => d.clase === "gasto" || d.clase === "ingreso",
        ayuda: "Si lo enlazas, ese mes el recurrente no se cuenta dos veces." },
      { k: "nota", l: "Nota" }],
    fila: (r) => [fechaCorta(r.fecha), r.concepto, r.clase === "transferencia" ? `entre cuentas${r.destino ? " → " + r.destino : r.origen ? " ← " + r.origen : ""}` : r.categoria || "", { text: (r.clase === "gasto" ? "−" : r.clase === "transferencia" ? "" : "+") + eur(r.importe), cls: r.clase === "ingreso" ? "pos" : "" }],
    cols: ["Fecha", "Concepto", "Categoría", "Importe"], orden: (a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.id - a.id,
    antes: (d) => { if (d.clase === "transferencia") { d[d._dir || "destino"] = d._otra; d[d._dir === "origen" ? "destino" : "origen"] = ""; d.categoria = ""; } else { d.destino = d.origen = ""; } },
    cargar: (d) => { d._dir = d.origen ? "origen" : "destino"; d._otra = d.destino || d.origen || ""; d.reembolsa = d.reembolsa ? String(d.reembolsa) : ""; } },
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
      { k: "clase", l: "Tipo", t: "opc", opc: [["fondo", "Fondo"], ["etf", "ETF / ETC"], ["accion", "Acción"], ["cripto", "Cripto"], ["materia", "Materias primas (oro, cobre…)"], ["pension", "Plan de pensiones"], ["bono", "Bono / renta fija"], ["inmueble", "Inmueble (piso, local…)"], ["otro", "Otro"]] },
      { k: "cuenta", l: "Cuenta del bróker", t: "opc", opc: opcCuentas((c) => c.tipo === "broker"), vacio: "— ninguna —" },
      { k: "valor", l: "Valor actual (€)", t: "num" },
      { k: "fecha_valor", l: "Fecha de ese valor", t: "fecha", defecto: () => hoy.toISODate() },
      { k: "aportado_inicial", l: "Aportado antes de usar la app (€)", t: "num", ayuda: "Lo que habías metido hasta ahora. Con esto se calcula la ganancia." },
      { k: "fecha_inicio", l: "Fecha de la primera compra", t: "fecha", ayuda: "Aproximada: sirve para la rentabilidad anual." },
      { k: "patrones", l: "Cómo aparece en el extracto del bróker", t: "lista", ayuda: "Textos separados por comas (p. ej. «msci world»). Al importar, las compras con ese texto se asignan a este activo." },
      { k: "isin", l: "ISIN (opcional)" },
      { t: "buscador", si: () => preciosActivos() },
      { k: "fuente_precio", l: "Precio por internet", t: "opc", si: (d) => preciosActivos() || d.fuente_precio,
        opc: [["", "— lo anoto yo —"], ["morningstar", "Morningstar (fondos, por su ISIN)"], ["yahoo", "Yahoo Finance (ETF, acciones, materias primas)"], ["coingecko", "CoinGecko (cripto)"]],
        ayuda: "De dónde sale su precio si activas «Precios por internet» (Ajustes). Lo más fácil: «Buscar el precio por internet», justo encima." },
      { k: "codigo_precio", l: "Código para consultar el precio", ph: "p. ej. IWDA.AS · 0P0000YXQE · bitcoin", si: (d) => d.fuente_precio, ayuda: "Solo este código sale de tu ordenador." },
      { k: "moneda", l: "Moneda del precio", t: "opc", opc: MONEDAS_PRECIO, si: (d) => d.fuente_precio, defecto: () => "EUR", ayuda: "Si no es el euro, se pasa a euros con el cambio de cada día." },
      { k: "largo_plazo", l: "Inversión a largo plazo", t: "bool", ayuda: "Desmárcalo para lo que no es inversión a largo plazo (un colchón en un fondo monetario, una apuesta…): el botón «Solo largo plazo» de Inversión lo deja fuera de las cifras." },
      { k: "objetivo", l: "Peso que quieres que tenga (%, opcional)", t: "num", ayuda: "El porcentaje de tu inversión que querrías en este activo. Con él, Inversión te dice a dónde llevar tu próxima aportación para acercarte (sin vender nada)." },
      { k: "ter", l: "Gastos corrientes (% al año, opcional)", t: "num", ayuda: "El TER del fondo o ETF (p. ej. 0,06). Con él verás cuánto te cuesta al año." },
      { k: "estado", l: "Estado", t: "opc", opc: [["activo", "Lo tengo"], ["vendido", "Vendido"]] }],
    fila: (r) => [r.nombre, r.clase, r.valor != null ? eur(r.valor, 0) : "—", r.fecha_valor ? `a ${fechaCorta(r.fecha_valor)}` : ""], cols: ["Nombre", "Tipo", "Valor", ""] },
  aportacion: { uno: "aportación", plural: "Aportaciones", ayuda: "Compras (+) y ventas (−) de tus activos.",
    campos: [
      { k: "fecha", l: "Fecha", t: "fecha", req: true, defecto: () => hoy.toISODate() },
      { k: "activo", l: "Activo", t: "opc", opc: opcActivos, req: true },
      { k: "importe", l: "Importe (€): + compra, − venta", t: "num", req: true },
      { k: "participaciones", l: "Participaciones (opcional)", t: "num", paso: "any", ayuda: "Las que compras (+) o vendes (−). Con ellas la app calcula tu precio medio y estima lo que vale." },
      { k: "cuenta", l: "Cuenta del bróker", t: "opc", opc: opcCuentas((c) => c.tipo === "broker"), vacio: "— la del activo —" },
      { k: "recurrente", l: "Aportación periódica", t: "opc", opc: opcRecurrentes("aportacion"), vacio: "— ninguna —" },
      { k: "nota", l: "Nota" }],
    antes: (d) => { d.supuesta = ""; },  // al guardarla a mano, la compra/venta ya no es supuesta
    fila: (r) => [fechaCorta(r.fecha), r.activo, { text: eurS(r.importe), cls: r.importe < 0 ? "neg" : "" }], cols: ["Fecha", "Activo", "Importe"],
    orden: (a, b) => String(b.fecha).localeCompare(String(a.fecha)) },
  cobro: { uno: "dividendo o comisión", plural: "Dividendos y comisiones", ayuda: "Lo que un activo te da (dividendo, cupón) o te cobra (custodia) sin vender participaciones. Cuenta para su rentabilidad y para tu declaración.",
    campos: [
      { k: "fecha", l: "Fecha", t: "fecha", req: true, defecto: () => hoy.toISODate() },
      { k: "activo", l: "Activo", t: "opc", opc: opcActivos, req: true },
      { k: "tipo", l: "Qué es", t: "opc", opc: [["dividendo", "Dividendo o cupón (te lo ingresan)"], ["comision", "Comisión o custodia (te la cobran)"]] },
      { k: "importe", l: "Importe (€, sin signo)", t: "num", req: true },
      { k: "cuenta", l: "Cuenta del bróker", t: "opc", opc: opcCuentas((c) => c.tipo === "broker"), vacio: "— la del activo —", ayuda: "El dinero entra (o sale) del efectivo de esta cuenta." },
      { k: "nota", l: "Nota" }],
    fila: (r) => [fechaCorta(r.fecha), r.activo, r.tipo === "comision" ? "Comisión" : "Dividendo", { text: (r.tipo === "comision" ? "−" : "+") + eur(r.importe), cls: r.tipo === "comision" ? "neg" : "pos" }], cols: ["Fecha", "Activo", "Qué", "Importe"],
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
      { k: "prioridad", l: "Prioridad", t: "opc", opc: [["alta", "Alta"], ["media", "Media"], ["baja", "Baja"]], defecto: () => "media" },
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
    orden: (a, b) => (a.origen === "plantilla") - (b.origen === "plantilla") || b.id - a.id, extra: panelProbarRegla },
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
      if (c.t === "buscador") { buscadorPrecio(form, d, dibujar); continue; }
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
        const conVacio = !!c.vacio || (!c.req && typeof c.opc === "function");  // una lista cerrada (tipo, estado…) siempre tiene valor
        if (conVacio) { const o = el.createEl("option", { text: c.vacio || "—" }); o.value = ""; }
        for (const [v, t] of ops) { const o = el.createEl("option", { text: t }); o.value = v; }
        if (d._sug && d._sug.cat === d[c.k] && !ops.some(([v]) => v === d[c.k])) d[c.k] = "";  // lo sugerido ya no encaja (otro tipo)
        if (d[c.k] != null && d[c.k] !== "" && !ops.some(([v]) => v === d[c.k])) { const o = el.createEl("option", { text: d[c.k] }); o.value = d[c.k]; }
        el.value = d[c.k] ?? (conVacio ? "" : (ops[0] || [""])[0]);
        if (el.value === "" && !conVacio && ops.length) el.value = ops[0][0];
        d[c.k] = el.value;
        el.onchange = () => { d[c.k] = el.value; dibujar(); };
        const nota = c.nota && c.nota(d);
        if (nota) form.createDiv({ cls: "s", text: nota });
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
        el = form.createEl("input", { attr: { type: tipoInput, placeholder: c.ph || "" } });
        if (tipoInput === "number") el.setAttribute("step", c.paso || (c.t === "int" ? "1" : "0.01"));
        el.value = Array.isArray(d[c.k]) ? d[c.k].join(", ") : d[c.k] ?? "";
        el.oninput = () => { d[c.k] = el.value; };
        if (c.t === "num") el.onblur = () => { if (["meta", "meta_meses", "cuenta"].includes(c.k)) dibujar(); };
        if (c.alSalir) el.onblur = () => c.alSalir(d, dibujar, form);
      }
    }
    etiquetar(form);
  };
  dibujar();
  const botones = p.createDiv({ cls: "fb-fila fb-botones" });
  const bG = botones.createEl("button", { cls: "fb-btn", text: opciones.textoGuardar || "Guardar" });
  bG.onclick = async () => {
    const datos = { ...d };
    if (F.antes) F.antes(datos);
    for (const c of F.campos) if (c.virtual || !c.k) delete datos[c.k];
    for (const k of Object.keys(datos)) if (k[0] === "_") delete datos[k];  // ayudas de la pantalla (p. ej. _sug)
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
      const nOps = tipo === "activo" ? (DB.registros.aportacion || []).filter((x) => x.activo === reg.nombre).length : 0;
      if (!confirm(tipo === "activo" ? `¿Borrar «${reg.nombre}» con sus ${nOps} operaciones y dividendos? No se puede deshacer (salvo restaurando una copia de seguridad).\n\nSi solo quieres dejar de verlo porque lo vendiste, mejor cámbiale el estado a «Vendido».`
        : `¿Borrar este ${F.uno}? No se puede deshacer (salvo restaurando una copia de seguridad).`)) return;
      let r = tipo === "activo" ? await FB.api("/api/activo/borrar", { id: reg.id }) : await FB.api("/api/borrar", { tipo, id: reg.id });
      // Si algo se apoya en esto (movimientos de una cuenta, gastos de una categoría…), el servidor no lo borra sin que lo veas
      if (r.necesita_confirmar) {
        if (!confirm(`${r.mensaje}\n\n¿Lo borras de todas formas?`)) return;
        r = await FB.api("/api/borrar", { tipo, id: reg.id, confirmar: true });
      }
      if (!r.ok) { mensaje(msg, r.mensaje || "Error", "err"); return; }
      FB.aviso("Borrado");
      await FB.recargar();
      FB.ir(opciones.volver || `#gestionar/${tipo}`);
    };
  }
  const bC = botones.createEl("a", { cls: "fb-btn sec", text: "Cancelar", href: opciones.volver || `#gestionar/${tipo}` });
  if (F.extra) F.extra(p, d);
  return p;
}
// Probar una regla antes de guardarla: qué movimientos ya importados casarían (recuento y los más recientes) y, si quieres,
// pasarlos a la categoría de la regla (con confirmación y un «Deshacer»). No guarda la regla: eso lo hace «Guardar».
function panelProbarRegla(p, d) {
  const caja = p.createDiv({ cls: "fb-prueba" });
  caja.createDiv({ cls: "fb-prueba-t", text: "Probar la regla con lo que ya has importado" });
  const fila = caja.createDiv({ cls: "fb-fila" });
  const bP = fila.createEl("button", { cls: "fb-btn sec", text: "Ver qué movimientos casan", attr: { type: "button" } });
  const res = caja.createDiv({ cls: "fb-prueba-res", attr: { "aria-live": "polite" } });
  const pedir = () => ({ patron: String(d.patron || "").trim(), clase: d.clase || "gasto", categoria: d.categoria || "" });
  const probar = async () => {
    const q = pedir(); res.innerHTML = "";
    if (q.patron.length < 2) { res.createDiv({ cls: "fin-note", text: "Escribe primero el texto que debe contener (al menos 2 letras)." }); return; }
    bP.disabled = true;
    const r = await FB.api("/api/regla/probar", q);
    bP.disabled = false;
    res.innerHTML = "";
    if (!r.ok) { mensaje(res, r.mensaje || "No se ha podido probar", "err"); return; }
    if (!r.n) { res.createDiv({ cls: "fin-note", text: `Ningún movimiento importado contiene «${q.patron}».` + (r.pendientes ? ` Sí casan ${r.pendientes} en «Por revisar».` : "") }); return; }
    const t = res.createDiv({ cls: "fb-prueba-n" });
    t.createEl("b", { text: `${r.n} movimiento${r.n === 1 ? "" : "s"}` });
    t.appendText(q.clase === "transferencia" ? " casan con esta regla (se usará al importar)." : r.cambian ? ` casan · ${r.cambian} cambiarían de categoría${r.ya ? ` y ${r.ya} ya la tienen` : ""}.` : " casan y ya tienen esa categoría.");
    const ul = res.createEl("ul", { cls: "fb-prueba-lista" });
    for (const m of r.muestra) {
      const li = ul.createEl("li");
      li.createSpan({ cls: "f", text: fechaCorta(m.fecha) });
      li.createSpan({ cls: "x", text: m.texto });
      li.createSpan({ cls: "i", text: eur(m.importe) });
      li.createSpan({ cls: "c", text: m.categoria || "sin categoría" });
    }
    const resto = (r.cambian || r.n) - r.muestra.length;
    if (resto > 0) res.createDiv({ cls: "fin-note", text: `…y ${resto} más.` });
    if (r.pendientes) res.createDiv({ cls: "fin-note", text: `Además, ${r.pendientes} dudas de «Por revisar» casan con ella (se quedan ahí hasta que las revises).` });
    if (r.aplicable) {
      const b = res.createEl("button", { cls: "fb-btn", text: `Aplicar a los ${r.cambian} ya importados`, attr: { type: "button" } });
      b.onclick = async () => {
        if (!confirm(`¿Pasar ${r.cambian} movimiento${r.cambian === 1 ? "" : "s"} a «${q.categoria}»? Podrás deshacerlo justo después.`)) return;
        b.disabled = true;
        const a = await FB.api("/api/regla/aplicar", q);
        FB.aviso(a.mensaje || "Hecho", !a.ok, a.ok ? avisoDeshacer() : undefined);
        await FB.recargar(); probar();  // sin repintar la pantalla: lo que llevas escrito en el formulario se conserva
      };
      res.createDiv({ cls: "fin-note", text: "Esto no guarda la regla: para que valga con lo que importes después, pulsa «Guardar»." });
    }
  };
  bP.onclick = probar;
  if (d.id && d.patron) probar();
}
// Apuntar a mano: al escribir el concepto, la categoría que dicen tus reglas, tu historial o (si lo tienes activado) Jev.
// Solo si aún no has elegido una tú.
async function sugerirCategoria(d, dibujar, form) {
  const texto = String(d.concepto || "").trim();
  const libre = () => !d.categoria || (d._sug && d._sug.cat === d.categoria);
  if (d.id || d.clase === "transferencia" || texto.length < 3 || !libre()) return;
  if (d._sug && d._sug.texto === texto && d._sug.clase === d.clase) return;
  const imp = Math.abs(num(d.importe)) || 1;
  const r = await FB.api("/api/jev/categoria", { texto, importe: d.clase === "ingreso" ? imp : -imp }).catch(() => ({}));
  if (!r.ok || !r.categoria || String(d.concepto || "").trim() !== texto || !libre()) return;
  if ((grupoDe(r.categoria) === "ingreso") !== (d.clase === "ingreso")) return;
  d.categoria = r.categoria;
  d._sug = { cat: r.categoria, texto, clase: d.clase,
    txt: r.fuente === "jev" ? `✨ Sugerida por Jev (${Math.round(100 * num(r.confianza))} %): cámbiala si no es` : r.fuente === "regla" ? "✨ Según tu regla para este texto" : "✨ Como otras veces que apuntaste algo así" };
  const ctrls = () => [...form.querySelectorAll("input,select,textarea,button")];
  const foco = ctrls().indexOf(document.activeElement);  // redibujar sin perder dónde estabas escribiendo
  dibujar();
  if (foco >= 0 && ctrls()[foco]) ctrls()[foco].focus();
}
const mensaje = (padre, texto, tipo) => { const m = padre.createDiv({ cls: "fb-msg " + (tipo || "") }); m.textContent = texto; return m; };

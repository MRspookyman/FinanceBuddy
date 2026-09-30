// ═════════════ pantalla de Inversión ═════════════
// Lo que has metido y lo que vale cada activo, cómo evoluciona, cuánto aportas cada mes, cómo está repartido y lo
// que rinde el dinero sin invertir. Los datos salen de las aportaciones (importadas del bróker), del valor de cada
// activo (Actualizar valores) y de los registros de saldos (evolución).
const TIPO_ACTIVO = { fondo: "Fondo", etf: "ETF / ETC", accion: "Acción", cripto: "Cripto", materia: "Materias primas", otro: "Otro" };
const ICONO_ACTIVO = { fondo: "📊", etf: "🧺", accion: "🏢", cripto: "🪙", materia: "🥇", otro: "💼" };

function vistaInversion() {
  cabecera("Inversión", false, "Lo que has metido en tus fondos, ETF y cripto, y lo que vale hoy");
  const I = resumenInversion();
  if (!I.filas.length) {
    const v = root.createDiv({ cls: "fb-hecho" });
    v.createDiv({ cls: "i", text: "🌱" });
    v.createEl("b", { text: "Aún no hay activos" });
    v.createDiv({ text: "Importa los movimientos de tu bróker: la app te propondrá crear cada activo con un clic." });
    const f = v.createDiv({ cls: "fb-fila" });
    enlace(f, "Importar del bróker", "#importar").className = "fb-btn";
    enlace(f, "Añadir un activo a mano", "#editar/activo/nuevo").className = "fb-btn sec";
    return;
  }
  const E = estimacion();
  const efectivo = E ? E.c["Efectivo bróker"] : null;
  const INT = interesesBroker();
  const botones = root.createDiv({ cls: "fb-filtros" });
  enlace(botones, "Actualizar valores", "#valores").className = "fb-btn";
  enlace(botones, "+ Activo", "#editar/activo/nuevo").className = "fb-btn sec";
  enlace(botones, "Compras y ventas", "#gestionar/aportacion").className = "fb-btn sec";

  panelSalud(root, saludInversion());
  const pct0 = I.aportado > 0 ? I.gan / I.aportado : NaN;
  const notaValor = [I.estimados ? `≈ ${I.estimados === 1 ? "uno" : I.estimados} con el precio de su última compra` : "", I.sinValor ? `${I.sinValor === 1 ? "uno" : I.sinValor} por lo metido` : ""].filter(Boolean).join(" · ");
  tiles(root, [
    { l: "Vale hoy", v: eur(I.total, 0), s: notaValor || "según tus últimos valores" },
    { l: "Has metido", v: eur(I.aportadoTodo, 0), s: `${I.filas.reduce((s, f) => s + f.operaciones, 0)} compras y ventas` },
    isFinite(I.gan) && I.aportado > 0 ? { l: "Ganancia", v: (I.estimados ? "≈ " : "") + eurS(I.gan, 0), t: tone(I.gan), s: `${pct(pct0, true)} sobre lo metido${I.estimados ? " · estimada" : ""}` } : null,
    isFinite(I.tir) ? { l: "Rentabilidad anual", v: pct(I.tir, true), t: tone(I.tir), s: I.tirCorta ? "menos de un año: orientativa" : I.tirParcial ? "de los activos con datos" : "TIR, cuenta cuándo metiste cada euro" } : null,
    efectivo != null ? { l: "Sin invertir", v: eur(efectivo, 0), s: nombresBroker() } : null,
    INT.n ? { l: `Intereses ${hoy.year}`, v: eur(INT.año, 2), s: INT.comisiones ? `comisiones ${eur(INT.comisiones, 2)}` : "del dinero sin invertir" } : null,
  ]);

  const g1 = root.createDiv({ cls: "fin-grid dos" });
  tarjetaEvolucion(panel(g1, "Evolución", null, "Lo que llevas metido (línea discontinua) y lo que valía al final de cada mes en que anotaste los valores, más el de hoy."));
  tarjetaReparto(panel(g1, "Cómo está repartido"), I);

  tablaActivos(panel(root, "Tus activos", { text: "Editar", ruta: "#gestionar/activo" }), I);

  const g2 = root.createDiv({ cls: "fin-grid dos" });
  tarjetaAportaciones(panel(g2, "Lo que metes cada mes"));
  tarjetaSinInvertir(panel(g2, "Tu dinero sin invertir", { text: "Aportaciones periódicas", ruta: "#gestionar/recurrente" }), efectivo, INT);
}

function tarjetaEvolucion(p) {
  const EV = evolucionInversion();
  if (!EV) { vacio(p, "Sin aportaciones todavía", ""); return; }
  const n = EV.keys.length, paso = Math.max(1, Math.ceil(n / 6));
  const marcas = EV.keys.map((_, i) => i).filter((i) => i % paso === (n - 1) % paso);
  const series = [
    { nombre: "Metido", color: "var(--ink-3)", valores: EV.aportado, discontinua: true },
    { nombre: "Valor", color: "var(--brand)", valores: EV.valor, area: true },
  ];
  const ult = EV.valor[n - 1], met = EV.aportado[n - 1];
  const t = p.createDiv({ cls: "fb-total" });
  t.createDiv({ cls: "v", text: eur(ult, 0) });
  t.createDiv({ cls: "s", text: `hoy · ${eur(met, 0)} metidos` });
  lineas(p, { etiquetas: EV.keys.map(mesLbl), etiquetasX: EV.keys.map(mesCorto), series, marcas, alto: 190 });
  leyenda(p, series.map((s) => [s.nombre, s.color]));
  if (EV.valor.filter((v) => v != null).length < 2) p.createDiv({ cls: "fin-note", text: "La línea del valor se completa cada vez que actualizas los valores o cierras un mes." });
}

function tarjetaReparto(p, I) {
  const total = I.total;
  if (!(total > 0)) { vacio(p, "Sin valor todavía", ""); return; }
  const porTipo = new Map();
  const filas = I.filas.filter((f) => f.valor > 0.5);
  for (const f of filas) porTipo.set(f.clase, (porTipo.get(f.clase) || 0) + f.valor);
  const tipos = [...porTipo].sort((a, b) => b[1] - a[1]);
  // Un color por activo (el mismo que en la tabla); el reparto por tipo, en texto.
  stack(p, [...filas].sort((a, b) => b.valor - a.valor).map((f) => ({ nombre: f.nombre, valor: f.valor, color: colorActivo(f.nombre) })));
  p.createDiv({ cls: "fin-note fb-tipos", text: tipos.map(([t, v]) => `${TIPO_ACTIVO[t] || t} ${pct(v / total)}`).join(" · ") });
  const l = p.createDiv({ cls: "fb-lista" });
  for (const f of [...filas].sort((a, b) => b.valor - a.valor)) {
    const el = item(l, { av: { icono: ICONO_ACTIVO[f.clase] || "💼", sm: true }, t: f.nombre, s: `${TIPO_ACTIVO[f.clase] || f.clase} · ${pct(f.valor / total)}`, v: eur(f.valor, 0), ruta: `#activo/${f.p.id}` });
    const b = el.querySelector(".n").createDiv({ cls: "fb-barra fina reparto" });
    const d = b.createDiv(); d.style.width = `${((100 * f.valor) / total).toFixed(1)}%`; d.style.background = colorActivo(f.nombre);
  }
  const top = tipos[0];
  if (top && top[1] / total >= 0.6 && tipos.length > 1) p.createDiv({ cls: "fin-note", text: `El ${pct(top[1] / total)} está en ${(TIPO_ACTIVO[top[0]] || top[0]).toLowerCase()}.` });
}

// La rentabilidad anual (TIR) de algo que tienes desde hace semanas se dispara al anualizarla: solo con un año o más.
const unAño = (f) => !!(f.desde && hoy.diff(f.desde, "days").days >= 365);

function tablaActivos(p, I) {
  // Participaciones y precio medio solo si algún activo los tiene (el extracto del bróker los trae como «@ N»).
  const conPart = I.filas.some((f) => f.participaciones != null);
  const cols = [{ t: "Activo" }, conPart && { t: "Particip.", num: true, opt: true }, conPart && { t: "Precio medio", num: true, opt: true }, { t: "Metido", num: true, opt: true },
    { t: "Vale", num: true }, { t: "Ganancia", num: true }, { t: "Anual", num: true, opt: true }, { t: "Peso", num: true, opt: true }];
  const filas = [...I.filas].sort((a, b) => b.valor - a.valor).map((f) => [
    { text: f.nombre, ruta: `#activo/${f.p.id}`, dot: colorActivo(f.nombre), badge: { metido: "sin valor", precio: "estimado" }[f.fuente] || "" },
    conPart && (f.participaciones != null ? nf(f.participaciones, 0, 4) : "—"),
    conPart && (f.precioMedio != null ? eur(f.precioMedio) : "—"),
    eur(f.aportado, 0),
    (f.fuente === "anotado" ? "" : "≈ ") + eur(f.valor, 0),
    isFinite(f.gan) ? { text: `${eurS(f.gan, 0)} · ${pct(f.aportado > 0 ? f.gan / f.aportado : NaN, true)}`, cls: tone(f.gan) } : "—",
    isFinite(f.tir) && unAño(f) ? { text: pct(f.tir, true), cls: tone(f.tir) } : "—",
    I.total > 0 ? pct(f.valor / I.total) : "—",
  ].filter((c) => c !== false));
  tabla(p, cols.filter(Boolean), filas);
  const sinTer = I.filas.filter((f) => f.ter != null);
  if (sinTer.length) {
    const coste = sum(sinTer.map((f) => (f.valor * f.ter) / 100));
    p.createDiv({ cls: "fin-note", text: `Gastos corrientes: unos ${eur(coste, 2)} al año (${sinTer.map((f) => `${f.nombre} ${nf(f.ter, 2, 2)} %`).join(", ")}).` });
  }
  if (I.cerradas.length) {
    const n = p.createDiv({ cls: "fin-note" });
    n.appendText("Ya vendido: ");
    I.cerradas.forEach((c, i) => { if (i) n.appendText(", "); enlace(n, c.nombre, `#activo/${c.p.id}`); n.appendText(` (${eurS(c.resultado, 2)})`); });
    n.appendText(".");
  }
  if (I.estimados) p.createDiv({ cls: "fin-note", text: "≈ estimado: participaciones × el precio de tu última compra o venta. Para el valor exacto, anota lo que vale en tu bróker (Actualizar valores)." });
  if (I.sinAport) p.createDiv({ cls: "fin-note", text: "Sin «aportado antes de usar la app», la ganancia de ese activo no se puede calcular: edítalo y pon lo que habías metido (0 si empezaste con la app)." });
}

function tarjetaAportaciones(p) {
  let A = aportacionesMes(12);
  const conAlgo = A.filter((x) => x.compras || x.ventas);
  if (!conAlgo.length) { vacio(p, "Sin compras en el último año", ""); return; }
  // Sin columnas vacías antes de la primera compra (se enseñan al menos 6 meses)
  A = A.slice(Math.max(0, Math.min(A.indexOf(conAlgo[0]), A.length - 6)));
  const racha = constancia();
  const meses = A.filter((x) => x.compras > 0);
  const t = p.createDiv({ cls: "fb-total" });
  t.createDiv({ cls: "v", text: eur(media(meses.map((x) => x.compras)), 0) });
  t.createDiv({ cls: "s", text: `de media los meses que compras · ${racha ? `${racha} mes${racha > 1 ? "es" : ""} seguido${racha > 1 ? "s" : ""} 🔥` : "este mes aún nada"}` });
  const series = [{ nombre: "Compras", color: "var(--brand)", valores: A.map((x) => x.compras) }];
  if (A.some((x) => x.ventas)) series.push({ nombre: "Ventas", color: "var(--coral)", valores: A.map((x) => x.ventas) });
  columnas(p, { etiquetas: A.map((x) => mesCorto(x.key)), titulos: A.map((x) => mesLbl(x.key)), series, alto: 170 });
  if (series.length > 1) leyenda(p, series.map((s) => [s.nombre, s.color]));
}

function tarjetaSinInvertir(p, efectivo, INT) {
  if (efectivo == null && !INT.n) { vacio(p, "Anota el saldo de tu bróker", " Al actualizar saldos, pon el dinero sin invertir de tu cuenta del bróker."); return; }
  filasDato(p, [
    efectivo != null ? { l: "En la cuenta del bróker", v: eur(efectivo, 2), s: "estimado hoy: saldo anotado + traspasos − compras" } : null,
    INT.n ? { l: `Intereses cobrados en ${hoy.year}`, v: eur(INT.año, 2), s: INT.total > INT.año ? `${eur(INT.total, 2)} desde el principio` : "" } : null,
    INT.comisiones ? { l: `Comisiones en ${hoy.year}`, v: eur(-INT.comisiones, 2) } : null,
  ]);
  const prox = aportaciones().filter((a) => a.previsto && a.auto && a.fecha <= hoy.plus({ days: 40 })).slice(0, 4);
  if (prox.length) {
    p.createDiv({ cls: "sep fb-sep", text: "Próximas aportaciones" });
    const l = p.createDiv({ cls: "fb-lista" });
    for (const a of prox) item(l, { fecha: a.fecha, t: a.activo, s: a.recurrente, v: eur(a.importe, 0) });
  }
}

// ───────────── revisa tu inversión ─────────────
// Lo que la app ve raro en tus datos (salud de la cartera). Cada aviso lleva a donde se arregla; ✕ lo da por bueno.
const ICONO_SALUD = { error: "!", aviso: "!", info: "i" };
function panelSalud(padre, S, { titulo = "Revisa tu inversión", max = 4 } = {}) {
  if (!S.length) return;
  const p = panel(padre, titulo, { text: `${S.length} ${S.length === 1 ? "cosa" : "cosas"}` }, "Lo importado de los extractos puede venir incompleto o mal (un traspaso tomado por venta, operaciones sin participaciones, duplicados…). Aquí tienes lo que conviene mirar. ✕ si está bien así.");
  p.classList.add("fb-salud");
  const l = p.createDiv({ cls: "fb-salud-l" });
  let todos = false;
  const pintar = () => {
    l.empty();
    for (const x of todos ? S : S.slice(0, max)) {
      const r = l.createDiv({ cls: "r " + x.nivel });
      r.createSpan({ cls: "ic", text: ICONO_SALUD[x.nivel] });
      r.createSpan({ cls: "t", text: x.texto });
      if (x.accion) enlace(r, x.accion.text, x.accion.ruta).className = "fb-btn sec mini";
      const d = r.createEl("button", { cls: "x", text: "✕", attr: { title: "Está bien así: no volver a avisar", "aria-label": "Descartar aviso" } });
      d.onclick = async () => { await FB.api("/api/config/descartar_aviso", { clave: x.clave }); FB.aviso("Vale, no volveré a avisar de eso"); await FB.refrescar(); };
    }
    if (!todos && S.length > max) { const b = l.createEl("button", { cls: "fin-vermas", text: `Ver ${S.length - max} más` }); b.onclick = () => { todos = true; pintar(); }; }
  };
  pintar();
}

// ───────────── ficha de un activo ─────────────
// Todo lo de un activo en una pantalla: cuánto tienes y a qué precio, cada operación (de dónde viene, editable) y las
// herramientas para cuando lo importado no cuadra: cuadrar con tu bróker, unir con otro activo o deshacerlo.
const ORIGEN_OP = (x) => x.p.ajuste ? "ajuste" : x.p.ext_fecha && x.p.orden ? "extracto + órdenes" : x.p.ext_fecha ? "extracto" : x.p.orden ? "órdenes" : "a mano";
function vistaActivo() {
  const [id, que, otro] = params;
  const reg = (DB.registros.activo || []).find((r) => String(r.id) === String(id));
  if (!reg) { titulo("Activo", ""); vacio(root, "Ese activo ya no existe"); enlace(root.createDiv({ cls: "fin-note" }), "← Volver a Inversión", "#inversion"); return; }
  const a = activos().find((x) => x.p.id === reg.id) || activoDe(reg);
  const P = posicion(a), V = valorInfo(a);
  const ops = P.ops, normales = ops.filter((x) => !x.p.ajuste);
  const aportado = (a.aportadoIni || 0) + sum(ops.map((x) => x.importe));
  cabecera(a.nombre, false, [TIPO_ACTIVO[a.clase] || a.clase, reg.isin, a.cuenta].filter(Boolean).join(" · "));
  const bot = root.createDiv({ cls: "fb-filtros" });
  enlace(bot, "← Inversión", "#inversion").className = "fb-btn sec";
  enlace(bot, "+ Operación", `#editar/aportacion/nuevo/${reg.id}`).className = "fb-btn sec";
  enlace(bot, "Editar", `#editar/activo/${reg.id}`).className = "fb-btn sec";

  const real = V.fuente === "anotado" || V.fuente === "precio";
  const gan = real && a.aportadoIni != null && aportado > 0 ? V.valor - aportado : NaN;
  tiles(root, [
    { l: "Participaciones", v: P.part != null ? nf(P.part, 0, 4) : "—", s: P.part != null ? (P.ajustes ? "con tus ajustes" : "según tus operaciones") : `faltan en ${P.faltan} operaci${P.faltan === 1 ? "ón" : "ones"}` },
    { l: "Precio medio", v: P.precioMedio != null ? eur(P.precioMedio) : "—", s: P.precioMedio != null ? "de tus compras" : "necesita las participaciones" },
    { l: "Has metido", v: eur(aportado, 0), s: `${normales.length} operaci${normales.length === 1 ? "ón" : "ones"}` },
    { l: "Vale hoy", v: (V.fuente === "anotado" ? "" : "≈ ") + eur(V.valor, 0),
      s: V.fuente === "anotado" ? `anotado el ${a.fechaValor.toFormat("dd/MM/yy")}` : V.fuente === "precio" ? `precio del ${V.precio.fecha.toFormat("dd/MM/yy")}: ${eur(V.precio.precio, 4)}` : V.fuente === "vendido" ? "vendido del todo" : "sin valor: lo metido" },
    isFinite(gan) ? { l: "Ganancia", v: eurS(gan, 0), t: tone(gan), s: `${pct(gan / aportado, true)} sobre lo metido` } : null,
  ]);
  panelSalud(root, saludInversion(a.nombre), { titulo: "Revisa este activo", max: 10 });

  // Cuadrar con el bróker
  const pc = panel(root, "Cuadrar con tu bróker", null, "Si lo importado no cuadra, dile a la app lo que ves en tu bróker. Se añade un ajuste de participaciones (sin dinero) y, si lo pones, se anota lo que vale.");
  if (que === "cuadrar") pc.classList.add("resalta");
  const cuenta = P.contadas;
  pc.createDiv({ cls: "fin-note", text: `La app cuenta ${nf(cuenta, 0, 4)} participaciones${P.sinPart ? ` (${P.sinPart} operaci${P.sinPart === 1 ? "ón no dice" : "ones no dicen"} cuántas)` : ""}. ¿Cuántas te dice tu bróker que tienes hoy?` });
  const fc = pc.createDiv({ cls: "fb-fila fb-cuadrar" });
  const iP = fc.createEl("input", { attr: { type: "number", step: "any", min: "0", placeholder: "Participaciones", "aria-label": "Participaciones que tienes" } });
  const iV = fc.createEl("input", { attr: { type: "number", step: "0.01", min: "0", placeholder: "Lo que vale hoy (€, opcional)", "aria-label": "Valor de hoy" } });
  const bC = fc.createEl("button", { cls: "fb-btn", text: "Cuadrar" });
  const prev = pc.createDiv({ cls: "fin-note" });
  iP.oninput = () => { const v = parseFloat(iP.value); prev.setText(isFinite(v) ? (Math.abs(v - cuenta) < 1e-9 ? "Ya cuadra: no hace falta ajuste." : `Se añadirá un ajuste de ${v - cuenta > 0 ? "+" : ""}${nf(v - cuenta, 0, 6)} participaciones.`) : ""); };
  bC.onclick = async () => {
    if (iP.value === "" && iV.value === "") { prev.setText("Escribe las participaciones (y, si quieres, lo que vale)."); return; }
    bC.disabled = true;
    const r = iP.value !== "" ? await FB.api("/api/activo/cuadrar", { id: reg.id, participaciones: iP.value, valor: iV.value, fecha: hoy.toISODate() })
      : await FB.api("/api/valores", { fecha: hoy.toISODate(), valores: { [a.nombre]: iV.value } });
    bC.disabled = false;
    if (!r.ok) { mensaje(pc, r.mensaje || "Error", "err"); return; }
    FB.aviso(r.mensaje); await FB.refrescar();
  };

  // Operaciones
  const po = panel(root, `Operaciones (${ops.length})`, { text: "+ Añadir", ruta: `#editar/aportacion/nuevo/${reg.id}` });
  if (!ops.length) vacio(po, "Sin operaciones", " Añádelas a mano o importa el extracto de tu bróker.");
  else {
    const dudosas = new Set(saludInversion(a.nombre).flatMap((x) => x.ids || []));
    // Un traspaso entre fondos: su otra mitad es la operación contraria de otro activo por el mismo importe y fechas cercanas
    const otrosTr = aportacionesReales().filter((y) => y.p.traspaso && y.activo !== a.nombre);
    const pareja = (x) => otrosTr.find((y) => (y.importe > 0) !== (x.importe > 0) && Math.abs(y.fecha.diff(x.fecha, "days").days) <= 6
      && Math.abs(Math.abs(y.importe) - Math.abs(x.importe)) <= Math.max(1, 0.01 * Math.abs(x.importe)));
    const tipoOp = (x) => {
      if (x.p.ajuste) return "Ajuste";
      if (!x.p.traspaso) return x.importe > 0 ? "Compra" : "Venta";
      const y = pareja(x);
      return x.importe > 0 ? `Traspaso desde ${y ? y.activo : "otro fondo"}` : `Traspaso a ${y ? y.activo : "otro fondo"}`;
    };
    tabla(po, [{ t: "Fecha" }, { t: "Operación" }, { t: "Importe", num: true }, { t: "Particip.", num: true }, { t: "Precio", num: true, opt: true }, { t: "De", opt: true }],
      [...ops].reverse().map((x) => {
        const pa = hasNum(x.p.participaciones) ? num(x.p.participaciones) : null;
        const marcas = [x.p.supuesta ? "¿compra?" : "", pa == null && !x.p.ajuste ? "sin particip." : "", dudosas.has(x.p.id) ? "¿duplicada?" : ""].filter(Boolean);
        return [
          { text: x.fecha.toFormat("dd/MM/yy"), ruta: `#editar/aportacion/${x.p.id}` },
          { text: tipoOp(x), badge: marcas.join(" · ") },
          x.p.ajuste ? "—" : { text: eurS(x.importe), cls: x.importe < 0 ? "neg" : "" },
          pa != null ? (pa > 0 && x.p.ajuste ? "+" : "") + nf(pa, 0, 6) : "—",
          pa && Math.abs(x.importe) > 0.005 ? eur(Math.abs(x.importe / pa), 4) : "—",
          ORIGEN_OP(x),
        ];
      }));
    po.createDiv({ cls: "fin-note", text: "Pulsa la fecha para cambiar o borrar una operación. «¿compra?»: la orden no decía si era compra o venta." });
  }

  // Unir con otro activo
  const otros = (DB.registros.activo || []).filter((r) => r.id !== reg.id);
  if (otros.length) plegable(root, "Unir con otro activo", (c) => {
    c.createDiv({ cls: "fin-note", text: `Si «${a.nombre}» y otro activo son el mismo (p. ej. uno creado del extracto y otro de las órdenes), únelos: todas las operaciones pasan al que elijas y este desaparece.` });
    const f = c.createDiv({ cls: "fb-fila" });
    const s = f.createEl("select");
    for (const r of otros) { const o = s.createEl("option", { text: r.nombre }); o.value = r.id; }
    if (otro) s.value = otro;
    const b = f.createEl("button", { cls: "fb-btn", text: "Unir" });
    b.onclick = async () => {
      const dest = otros.find((r) => String(r.id) === s.value);
      if (!dest || !confirm(`¿Pasar las ${ops.length} operaciones de «${a.nombre}» a «${dest.nombre}» y quitar «${a.nombre}»?`)) return;
      const r = await FB.api("/api/activo/unir", { origen: reg.id, destino: dest.id });
      if (!r.ok) { mensaje(c, r.mensaje || "Error", "err"); return; }
      FB.aviso(r.mensaje); await FB.recargar(); FB.ir(`#activo/${dest.id}`);
    };
  }, { abierto: que === "unir" });

  // Deshacer
  plegable(root, "No es un activo / borrarlo", (c) => {
    const f = c.createDiv({ cls: "fb-fila" });
    const bT = f.createEl("button", { cls: "fb-btn sec", text: "Era dinero traspasado desde mi banco" });
    bT.title = "Quita el activo y sus «ventas»: era dinero que entró desde tu banco. La próxima vez se ignora solo.";
    bT.onclick = async () => {
      if (!confirm(`¿Quitar «${a.nombre}» y sus ${ops.length} operaciones? El dinero que entró en el bróker ya cuenta como traspaso desde tu banco.`)) return;
      const r = await FB.api("/api/activo/borrar", { id: reg.id, era_traspaso: true });
      if (!r.ok) { mensaje(c, r.mensaje || "Error", "err"); return; }
      FB.aviso(r.mensaje); await FB.recargar(); FB.ir("#inversion");
    };
    const bB = f.createEl("button", { cls: "fb-btn sec peligro", text: `Borrar el activo y sus ${ops.length} operaciones` });
    bB.onclick = async () => {
      if (!confirm(`¿Borrar «${a.nombre}» y sus ${ops.length} operaciones? Si vuelves a importar el mismo extracto, no reaparecerán.`)) return;
      const r = await FB.api("/api/activo/borrar", { id: reg.id });
      if (!r.ok) { mensaje(c, r.mensaje || "Error", "err"); return; }
      FB.aviso(r.mensaje); await FB.recargar(); FB.ir("#inversion");
    };
    c.createDiv({ cls: "fin-note", text: "Se guarda una copia de seguridad cada día: si te equivocas, puedes restaurarla en Ajustes." });
  }, { abierto: saludInversion(a.nombre).some((x) => x.clave.startsWith("traspaso|")) });
}

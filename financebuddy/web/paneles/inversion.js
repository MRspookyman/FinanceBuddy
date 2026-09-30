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

  if (I.sinValor) {
    const n = root.createDiv({ cls: "fin-note fb-aviso-inv" });
    n.appendText(`${I.sinValor === 1 ? "Un activo no tiene" : `${I.sinValor} activos no tienen`} su valor anotado: cuentan por lo que has metido (sin ganancia ni pérdida). `);
    enlace(n, "Anota lo que valen hoy →", "#valores");
  }
  const pct0 = I.aportado > 0 ? I.gan / I.aportado : NaN;
  tiles(root, [
    { l: "Vale hoy", v: eur(I.total, 0), s: I.sinValor ? "≈ con lo aportado de los que no tienen valor" : "según tus últimos valores" },
    { l: "Has metido", v: eur(I.aportadoTodo, 0), s: `${I.filas.reduce((s, f) => s + f.operaciones, 0)} compras y ventas` },
    isFinite(I.gan) && I.aportado > 0 ? { l: "Ganancia", v: eurS(I.gan, 0), t: tone(I.gan), s: `${pct(pct0, true)} sobre lo metido` } : null,
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
  for (const f of I.filas) porTipo.set(f.clase, (porTipo.get(f.clase) || 0) + f.valor);
  const tipos = [...porTipo].sort((a, b) => b[1] - a[1]);
  // Un color por activo (el mismo que en la tabla); el reparto por tipo, en texto.
  stack(p, [...I.filas].sort((a, b) => b.valor - a.valor).map((f) => ({ nombre: f.nombre, valor: f.valor, color: colorActivo(f.nombre) })));
  p.createDiv({ cls: "fin-note fb-tipos", text: tipos.map(([t, v]) => `${TIPO_ACTIVO[t] || t} ${pct(v / total)}`).join(" · ") });
  const l = p.createDiv({ cls: "fb-lista" });
  for (const f of [...I.filas].sort((a, b) => b.valor - a.valor)) {
    const el = item(l, { av: { icono: ICONO_ACTIVO[f.clase] || "💼", sm: true }, t: f.nombre, s: `${TIPO_ACTIVO[f.clase] || f.clase} · ${pct(f.valor / total)}`, v: eur(f.valor, 0), ruta: `#editar/activo/${f.p.id}` });
    const b = el.querySelector(".n").createDiv({ cls: "fb-barra fina reparto" });
    const d = b.createDiv(); d.style.width = `${((100 * f.valor) / total).toFixed(1)}%`; d.style.background = colorActivo(f.nombre);
  }
  const top = tipos[0];
  if (top && top[1] / total >= 0.6 && tipos.length > 1) p.createDiv({ cls: "fin-note", text: `El ${pct(top[1] / total)} está en ${(TIPO_ACTIVO[top[0]] || top[0]).toLowerCase()}.` });
}

function tablaActivos(p, I) {
  // Participaciones y precio medio solo si algún activo los tiene (el extracto del bróker los trae como «@ N»).
  const conPart = I.filas.some((f) => f.participaciones != null);
  const cols = [{ t: "Activo" }, conPart && { t: "Particip.", num: true, opt: true }, conPart && { t: "Precio medio", num: true, opt: true }, { t: "Metido", num: true },
    { t: "Vale", num: true }, { t: "Ganancia", num: true }, { t: "Anual", num: true, opt: true }, { t: "Peso", num: true, opt: true }];
  const filas = [...I.filas].sort((a, b) => b.valor - a.valor).map((f) => [
    { text: f.nombre, ruta: `#editar/activo/${f.p.id}`, dot: colorActivo(f.nombre), badge: f.conValor ? "" : "sin valor" },
    conPart && (f.participaciones != null ? nf(f.participaciones, 0, 4) : "—"),
    conPart && (f.precioMedio != null ? eur(f.precioMedio) : "—"),
    eur(f.aportado, 0),
    (f.conValor ? "" : "≈ ") + eur(f.valor, 0),
    isFinite(f.gan) ? { text: `${eurS(f.gan, 0)} · ${pct(f.aportado > 0 ? f.gan / f.aportado : NaN, true)}`, cls: tone(f.gan) } : "—",
    isFinite(f.tir) ? { text: pct(f.tir, true), cls: tone(f.tir) } : "—",
    I.total > 0 ? pct(f.valor / I.total) : "—",
  ].filter((c) => c !== false));
  tabla(p, cols.filter(Boolean), filas);
  const sinTer = I.filas.filter((f) => f.ter != null);
  if (sinTer.length) {
    const coste = sum(sinTer.map((f) => (f.valor * f.ter) / 100));
    p.createDiv({ cls: "fin-note", text: `Gastos corrientes: unos ${eur(coste, 2)} al año (${sinTer.map((f) => `${f.nombre} ${nf(f.ter, 2, 2)} %`).join(", ")}).` });
  }
  if (I.cerradas.length) p.createDiv({ cls: "fin-note", text: `Ya vendido: ${I.cerradas.map((c) => `${c.nombre} (${eurS(c.resultado, 2)})`).join(", ")}.` });
  if (I.sinAport) p.createDiv({ cls: "fin-note", text: "Sin «aportado antes de usar la app», la ganancia de ese activo no se puede calcular: edítalo y pon lo que habías metido (0 si empezaste con la app)." });
}

function tarjetaAportaciones(p) {
  const A = aportacionesMes(12);
  const conAlgo = A.filter((x) => x.compras || x.ventas);
  if (!conAlgo.length) { vacio(p, "Sin compras en el último año", ""); return; }
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

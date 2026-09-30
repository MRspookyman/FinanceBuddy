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
  queHayDentro(root, I);

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

// La rentabilidad anual (TIR) de algo que tienes desde hace semanas se dispara al anualizarla: solo con un año o más.
const unAño = (f) => !!(f.desde && hoy.diff(f.desde, "days").days >= 365);

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
    isFinite(f.tir) && unAño(f) ? { text: pct(f.tir, true), cls: tone(f.tir) } : "—",
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

// ───────────── qué hay dentro de tus fondos (X-Ray de Morningstar) ─────────────
const TIPO_XRAY = { acciones: "Acciones", renta_fija: "Renta fija", efectivo: "Efectivo", otro: "Otros" };
const COLOR_XRAY = { acciones: SERIES[0], renta_fija: SERIES[5], efectivo: SERIES[2], otro: SERIES[6], cripto: SERIES[1], materia: SERIES[3], sin: "var(--ink-3)" };
// El X-Ray más reciente (registro «composicion»).
const composicion = () => [...registros("composicion")].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))[0] || null;

function queHayDentro(padre, I) {
  const X = composicion();
  if (!X) {
    if (I.filas.some((f) => f.clase === "fondo" || f.clase === "etf")) {
      const n = padre.createDiv({ cls: "fb-alerta info" });
      n.createSpan({ cls: "i", text: "🔍" });
      const t = n.createSpan();
      t.appendText("¿Qué hay dentro de tus fondos? Sube el informe X-Ray de Morningstar (PDF) en ");
      enlace(t, "Importar", "#importar");
      t.appendText(" y verás sus países, sectores y mayores empresas. En MyInvestor: Cartera → X-Ray.");
    }
    return;
  }
  const D = X.datos || {};
  const enlazados = new Set(X.activos || []);
  const p = panel(padre, "Qué hay dentro de tus fondos", { text: `X-Ray del ${fechaCorta(X.fecha)}` });
  // A qué parte de tu cartera se refiere y fondos del informe que aún no son activos tuyos
  const cubre = I.filas.filter((f) => enlazados.has(f.nombre));
  const nota = p.createDiv({ cls: "fin-note fb-cubre" });
  if (cubre.length && I.total > 0) nota.appendText(`Describe ${cubre.map((f) => f.nombre).join(", ")}: el ${pct(sum(cubre.map((f) => f.valor)) / I.total)} de tu inversión.`);
  else nota.appendText("Sus fondos aún no están entre tus activos.");
  for (const f of (D.fondos || []).filter((f) => !(D.enlaces || {})[f.nombre])) {
    const b = nota.createEl("button", { cls: "fb-btn mini", text: `Crear «${f.nombre}»` });
    b.onclick = async () => {
      const r = await FB.api("/api/guardar", { tipo: "activo", datos: { nombre: f.nombre, clase: f.tipo === "ETF" ? "etf" : "fondo", ter: f.ter, aportado_inicial: 0 } });
      if (!r.ok) { FB.aviso(r.mensaje || "Error", true); return; }
      await FB.api("/api/guardar", { tipo: "composicion", id: X.id, datos: { ...X, file: undefined, activos: [...enlazados, f.nombre], datos: { ...D, enlaces: { ...(D.enlaces || {}), [f.nombre]: f.nombre } } } });
      FB.aviso("Activo creado ✓"); await FB.refrescar();
    };
  }
  avisosConcentracion(p, D);
  exposicionTotal(p, I, X);
  const g = p.createDiv({ cls: "fin-grid dos fb-xray" });
  const bloque = (titulo) => { const b = g.createDiv({ cls: "fb-bloque" }); b.createEl("h4", { text: titulo }); return b; };
  const barras = (b, filas, color, max = 6) => {
    const top = filas.slice(0, max), resto = 100 - sum(top.map((x) => x[1] || 0));
    for (const [n, v] of top) meter(b, { nombre: n, valor: v, total: 100, color, fuerte: `${nf(v, 1, 1)} %` });
    if (filas.length > max && resto > 0.5) b.createDiv({ cls: "fin-note", text: `Resto: ${nf(resto, 1, 1)} %` });
  };
  if (D.paises && D.paises.length) barras(bloque("Países (de las acciones)"), D.paises, SERIES[0], 5);
  if (D.sectores && D.sectores.length) barras(bloque("Sectores"), D.sectores, SERIES[5], 6);
  if (D.top && D.top.length) {
    const b = bloque(`Las ${D.top.length} mayores empresas · ${nf(sum(D.top.map((x) => x.peso || 0)), 1, 1)} %`);
    const l = b.createDiv({ cls: "fb-lista fb-top" });
    for (const x of D.top) item(l, { av: { icono: (x.nombre || "?").charAt(0), sm: true }, t: x.nombre, s: [x.sector, x.pais].filter(Boolean).join(" · "), v: `${nf(x.peso, 2, 2)} %` });
  }
  const b = bloque("Rentabilidad y riesgo del fondo");
  const R = D.rentabilidad || {}, K = D.riesgo || {}, f0 = (D.fondos || [])[0] || {};
  const tirMia = cubre.length === 1 && isFinite(cubre[0].tir) && unAño(cubre[0]) ? cubre[0].tir : NaN;
  filasDato(b, [
    R["1a"] != null ? { l: "Último año", v: `${nf(R["1a"], 1, 1)} %`, t: tone(R["1a"]), s: isFinite(tirMia) ? `la tuya: ${pct(tirMia, true)} al año (según cuándo metiste cada euro)` : "" } : null,
    R["3a"] != null ? { l: "3 años (al año)", v: `${nf(R["3a"], 1, 1)} %`, t: tone(R["3a"]) } : null,
    R["5a"] != null ? { l: "5 años (al año)", v: `${nf(R["5a"], 1, 1)} %`, t: tone(R["5a"]) } : null,
    K.volatilidad != null ? { l: "Volatilidad (3 años)", v: `${nf(K.volatilidad, 1, 1)} %`, h: "Cuánto sube y baja de un año a otro. Por encima del 15 % son vaivenes fuertes: lo normal en bolsa; en renta fija suele estar por debajo del 5 %." } : null,
    f0.ter != null ? { l: "Gastos corrientes", v: `${nf(f0.ter, 2, 2)} % al año`, s: f0.estrellas ? "★".repeat(f0.estrellas) + " Morningstar" : "" } : null,
  ]);
  p.createDiv({ cls: "fin-note", text: "Datos del informe de Morningstar: lo que el fondo tenía en su última publicación. Rentabilidades pasadas no garantizan las futuras." });
}

// Avisos cuando mucho depende de una sola cosa (país, sector o pocas empresas).
function avisosConcentracion(p, D) {
  const out = [];
  const pais = (D.paises || [])[0], sector = (D.sectores || [])[0], top = sum((D.top || []).map((x) => x.peso || 0));
  if (pais && pais[1] >= 60) out.push(`El ${nf(pais[1], 1, 1)} % de las acciones es de ${pais[0]}.`);
  if (sector && sector[1] >= 30) out.push(`El ${nf(sector[1], 1, 1)} % está en ${sector[0].toLowerCase()}.`);
  if (top >= 30) out.push(`Las ${(D.top || []).length} mayores empresas son el ${nf(top, 1, 1)} %.`);
  if (!out.length) return;
  const a = p.createDiv({ cls: "fb-alerta" });
  a.createSpan({ cls: "i", text: "⚖️" });
  a.createSpan({ text: `Muy concentrado: ${out.join(" ")} No es malo en sí, pero todo depende de lo mismo.` });
}

// Toda tu inversión mirando dentro de los fondos: lo que describe el X-Ray por sus tipos de activo; lo demás, por su tipo.
function exposicionTotal(p, I, X) {
  if (!(I.total > 0)) return;
  const D = X.datos || {}, enl = new Set(X.activos || []), t = D.tipos || {};
  const tot = sum(Object.keys(TIPO_XRAY).map((k) => t[k] || 0)) || 100;
  const parte = new Map();
  const suma = (k, v) => parte.set(k, (parte.get(k) || 0) + v);
  for (const f of I.filas) {
    if (enl.has(f.nombre)) for (const k of Object.keys(TIPO_XRAY)) suma(k, (f.valor * (t[k] || 0)) / tot);
    else if (f.clase === "cripto" || f.clase === "materia") suma(f.clase, f.valor);
    else suma("sin", f.valor);
  }
  const NOMBRE = { ...TIPO_XRAY, cripto: "Cripto", materia: "Materias primas", sin: "Otros fondos (sin X-Ray)" };
  const filas = [...parte].filter(([, v]) => v > 0.005 * I.total).sort((a, b) => b[1] - a[1]);
  const b = p.createDiv({ cls: "fb-expo" });
  b.createEl("h4", { text: "Tu inversión entera, mirando dentro de los fondos" });
  stack(b, filas.map(([k, v]) => ({ nombre: NOMBRE[k], valor: v, color: COLOR_XRAY[k] })));
  leyenda(b, filas.map(([k, v]) => [`${NOMBRE[k]} ${pct(v / I.total)}`, COLOR_XRAY[k]]));
  const pais = (D.paises || [])[0];
  const acc = parte.get("acciones") || 0;
  if (pais && acc > 0) b.createDiv({ cls: "fin-note", text: `≈ ${eur((acc * pais[1]) / 100, 0)} de tu dinero está en empresas de ${pais[0]} (${pct((acc * pais[1]) / 100 / I.total)} de tu inversión).` });
}

// ═════════════ pantallas principales: Inicio y Movimientos ═════════════
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const ICONO_CUENTA = { corriente: "💳", ahorro: "🐷", broker: "📈", otro: "🗝️" };
const DIAS = ["L", "M", "X", "J", "V", "S", "D"];

function saludo() {
  const h = DateTime.now().hour;
  return h < 6 ? "Buenas noches" : h < 14 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
}

// ───────────── inicio ─────────────
// Minimalista: arriba lo que se decide (cuánto puedes gastar, con el ritmo del mes al lado), debajo una franja con lo que
// pide actuar y luego a dónde va el dinero, tu patrimonio y los próximos cargos. Se puede ver cualquier mes pasado (selector de mes, compartido con Movimientos).
// Paneles: el usuario elige cuáles ve y en qué orden (Ajustes → Tu inicio; config.inicio / config.inicio_ocultos).
// ancho: ocupa toda la fila · defecto:false → oculto salvo que el usuario lo active.
const PANELES_INICIO = [
  { id: "gasto", t: "Cuánto puedes gastar (con el ritmo del mes y lo que entró y salió)", ancho: true },
  { id: "categorias", t: "A dónde va tu dinero" },
  { id: "patrimonio", t: "Tu patrimonio (cuentas e inversión)" },
  { id: "proximos", t: "Próximos cargos (el mes que viene)" },
  { id: "objetivos", t: "Objetivos y recordatorios" },
  { id: "semana", t: "Esta semana", defecto: false },
  { id: "meses", t: "Tus últimos meses", defecto: false },
];
// config.inicio: los visibles, en orden · config.inicio_ocultos: los ocultos. Uno que no está en ninguna: según `defecto`.
function panelesInicio() {
  const existe = (id) => PANELES_INICIO.find((p) => p.id === id);
  const porDefecto = (p) => p.defecto !== false;
  if (!Array.isArray(cfg.inicio)) return [...PANELES_INICIO.filter(porDefecto), ...PANELES_INICIO.filter((p) => !porDefecto(p))].map((p) => ({ ...p, visible: porDefecto(p) }));
  const ocultos = new Set(cfg.inicio_ocultos || []);
  const visibles = cfg.inicio.map(existe).filter(Boolean);
  const nuevos = PANELES_INICIO.filter((p) => !cfg.inicio.includes(p.id) && !ocultos.has(p.id) && porDefecto(p));
  const resto = PANELES_INICIO.filter((p) => !visibles.includes(p) && !nuevos.includes(p));
  return [...[...visibles, ...nuevos].map((p) => ({ ...p, visible: true })), ...resto.map((p) => ({ ...p, visible: false }))];
}
function vistaInicio() {
  if (mes > hoyKey) mes = hoyKey;  // el Inicio no mira al futuro
  const actual = mes === hoyKey;
  const S = presupuestoSemana(), M = finMes(mes);
  const cab = root.createDiv({ cls: "fb-saludo" });
  const iz = cab.createDiv();
  iz.createEl("h2", { text: actual ? saludo() : mesLbl(mes) });
  const sub = iz.createDiv({ cls: "sub" });
  const fd = S.fechaDatos;
  const rango = mesRango(mes) ? ` (${mesRango(mes)})` : "";
  if (actual) sub.appendText(fd ? `Así va ${mesLbl(hoyKey).toLowerCase().split(" ")[0]}${rango} · movimientos hasta el ${fd.setLocale("es").toFormat("d 'de' LLLL")}` : "Aún no hay movimientos");
  else sub.appendText((M.real.some((m) => !m.auto) ? "Cómo fue el mes" : "Sin movimientos importados de este mes") + rango);
  if (actual && (!fd || S.diasSinDatos > 6)) enlace(sub, "Importar el extracto", "#importar").className += " fb-chip aviso";
  const der = cab.createDiv({ cls: "fb-cab-der" });
  const box = der.createDiv({ cls: "fin-mes" });
  const btn = (t, key, title, off) => { const b = box.createEl("button", { text: t }); b.title = title; if (off) b.disabled = true; else b.onclick = () => cambiarMes(key); };
  btn("‹", mesAnterior(mes), "Mes anterior");
  box.createSpan({ cls: "lbl", text: mesLbl(mes) });
  btn("›", mesDT(mes).plus({ months: 1 }).toFormat("yyyy-MM"), "Mes siguiente", actual);
  if (!actual) btn("Hoy", hoyKey, "Volver al mes actual");
  const per = enlace(der, "Personalizar", "#ajustes/inicio");
  per.className += " fb-personalizar";
  per.title = "Elige qué ves en el inicio y en qué orden";

  const DIBUJAR = {
    gasto: (padre) => heroGasto(padre, S, M),
    categorias: (padre) => tarjetaCategorias(panel(padre, "A dónde va tu dinero", { text: "Ver todo", ruta: "#movimientos/categorias" }), mes),
    patrimonio: (padre) => tarjetaPatrimonio(panel(padre, "Tu patrimonio", { text: "Actualizar saldos", ruta: "#cerrar" })),
    proximos: (padre) => { if (actual) tarjetaProximos(panel(padre, "Próximos cargos", { text: "Fijos", ruta: "#gestionar/recurrente" })); },
    objetivos: (padre) => { if (objetivosActivos().length || recordatoriosCercanos().length) tarjetaObjetivos(panel(padre, "Objetivos y recordatorios", { text: "Editar", ruta: "#gestionar/objetivo" })); },
    semana: (padre) => { if (actual) tarjetaSemana(panel(padre, "Esta semana", { text: `${S.lunes.toFormat("d/M")} – ${S.domingo.toFormat("d/M")}` }), S); },
    meses: (padre) => tarjetaMeses(panel(padre, "Tus últimos meses")),
  };
  // La portada va primero y la franja de avisos justo debajo (o arriba del todo si la portada está oculta o movida).
  const visibles = panelesInicio().filter((p) => p.visible);
  const avisosArriba = actual && !(visibles[0] && visibles[0].id === "gasto");
  if (avisosArriba) franjaAvisos(root);
  let fila = null;
  visibles.forEach((p, i) => {
    if (p.ancho) { fila = null; DIBUJAR[p.id](root); if (actual && !avisosArriba && i === 0) franjaAvisos(root); return; }
    if (!fila) fila = root.createDiv({ cls: "fin-grid fb-inicio" });
    DIBUJAR[p.id](fila);
  });
}

// Lo que pide actuar, en una sola franja: lo que toca hacer ahora (importar, anotar saldos), los avisos de nivel «warn»
// (como máximo 2) y una frase con lo que conviene hacer con el dinero que sobra en la cuenta corriente (planReparto).
function franjaAvisos(padre) {
  const filas = accionesQueTocan().map((x) => ({ tipo: "toca", ic: x.ic, b: x.t, txt: x.s, ruta: x.ruta }));
  for (const a of avisos().filter((a) => a.nivel === "warn" && a.ruta !== "#revisar").slice(0, 2)) filas.push({ tipo: "warn", ic: "!", txt: a.texto, ruta: a.ruta && a.ruta.startsWith("#") ? a.ruta : "#inicio" });
  const R = planReparto(), r = R && R.acciones[0];
  if (r) filas.push({ tipo: "info", ic: "→", b: r.texto, txt: r.sub });
  if (!filas.length) return;
  const box = padre.createDiv({ cls: "fb-franja" });
  for (const f of filas) {
    const el = f.ruta ? box.createEl("a", { cls: "r internal-link " + f.tipo, href: f.ruta }) : box.createDiv({ cls: "r " + f.tipo });
    el.createSpan({ cls: "i", text: f.ic });
    const t = el.createSpan({ cls: "t" });
    if (f.b) t.createEl("b", { text: f.b });
    if (f.txt) t.appendText((f.b ? " · " : "") + f.txt);
    if (f.ruta) el.createSpan({ cls: "fl", text: "›" });
  }
}

// La cifra grande de la portada. El sufijo va pegado al número, no solo en el rótulo pequeño de arriba: «72 €» significaba
// lo que te queda o lo que te has pasado según un rótulo en versalitas, y de un vistazo las dos cosas se ven igual.
function cifraHero(padre, valor, sufijo) {
  const v = padre.createDiv({ cls: "v", text: eur(valor, 0) });
  if (sufijo) v.createEl("small", { text: " " + sufijo });
  return v;
}
// La portada: una cifra grande que ayuda a decidir, una barra, una frase de estado y, en pequeño, entró · salió · te queda.
// Mes en curso: «Puedes gastar». Mes pasado: cuánto gastaste frente a tu límite.
function heroGasto(padre, S, M) {
  const actual = M.key === hoyKey;
  const h0 = padre.createDiv({ cls: "fb-hero" }), h = h0.createDiv({ cls: "iz" });
  const dm = diasMes(M.key);
  const dia = actual ? (S.fechaDatos && keyDe(S.fechaDatos) === hoyKey ? diaDeMes(S.fechaDatos) : diaDeMes(hoy)) : dm;
  const barra = (frac, etiqueta) => {
    const b = h.createDiv({ cls: "fb-progreso" });
    b.createDiv({ cls: "rel" }).style.width = `${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)}%`;
    if (actual) { const m = b.createDiv({ cls: "dia" }); m.style.left = `${((100 * dia) / dm).toFixed(1)}%`; m.title = `Hoy: día ${dia} de ${dm}`; }
    h.createDiv({ cls: "pie", text: etiqueta });
  };
  const vari = gastoVariable(M);
  const R = ritmoMes(M.key);
  const estado = () => {
    if (!isFinite(R.mediaHoy) || !R.hoyV) return "";
    const dif = R.hoyV - R.mediaHoy;
    if (Math.abs(dif) < 15) return actual ? "Vas como sueles ir" : "Como sueles gastar";
    return `${actual ? "Vas" : "Gastaste"} ${eur(Math.abs(dif), 0)} ${dif < 0 ? "por debajo" : "por encima"} de lo normal${actual ? " a estas alturas" : ""}`;
  };
  if (!(limiteVar > 0)) {
    h0.classList.add("neutro"); // sin límite, la cifra es lo gastado: no va en verde
    h.createDiv({ cls: "l", text: actual ? "Llevas gastado este mes" : "Gastaste" });
    cifraHero(h, vari);
    if (actual) barra(dia / dm, `día ${dia} de ${dm}`);
    h.createDiv({ cls: "s", text: estado() || "en gasto variable: comer fuera, compras, ocio…" });
    if (actual) {
      const pills = h.createDiv({ cls: "pills" }), sug = limiteSugerido();
      if (sug) { const b = pills.createEl("button", { cls: "pill fb-hero-link", text: `Usar ${eur(sug, 0)} al mes como límite (tu media)`, attr: { type: "button" } }); b.onclick = async () => { await FB.api("/api/config", { limite_variable: sug }); FB.aviso("Límite guardado ✓"); await FB.refrescar(); }; }
      enlace(pills, "Poner otro límite →", "#ajustes").className += " pill fb-hero-link";
    }
  } else if (actual) {
    const pasado = S.disponible < 0, usado = S.vari / limiteVar;
    if (pasado) h0.classList.add("pasado");
    else if (usado >= 0.85) h0.classList.add("alto"); // queda poco: ámbar, antes de pasarse
    h.createDiv({ cls: "l", text: pasado ? "Te has pasado este mes" : "Puedes gastar este mes" });
    cifraHero(h, Math.abs(S.disponible), pasado && "de más");
    barra(usado, `${Math.round(usado * 100)} % de tu límite de ${eur(limiteVar, 0)}`);
    const frase = pasado ? "Frena el gasto variable hasta fin de mes"
      : S.disponible < 5 ? "Has llegado a tu límite"
      : S.restantes > 1 ? `≈ ${eur(S.porDia, 0)} al día durante ${S.restantes} días` : "Último día del mes";
    h.createDiv({ cls: "s", text: [frase, estado()].filter(Boolean).join(" · ") });
  } else {
    const pasado = vari > limiteVar;
    if (pasado) h0.classList.add("pasado");
    h.createDiv({ cls: "l", text: pasado ? "Te pasaste del límite" : "Te sobró de tu límite" });
    cifraHero(h, Math.abs(limiteVar - vari), pasado ? "de más" : "de sobra");
    barra(vari / limiteVar, `gastaste ${eur(vari, 0)} de ${eur(limiteVar, 0)}`);
    const e = estado(); if (e) h.createDiv({ cls: "s", text: e });
  }
  const sinRev = M.real.filter((m) => m.pendiente);
  if (sinRev.length) {
    const g = sum(sinRev.filter((m) => m.clase === "gasto").map((m) => m.importe)), e = sum(sinRev.filter((m) => m.clase !== "gasto").map((m) => m.importe));
    // «de este mes»: la insignia del menú cuenta todo lo que hay por revisar y aquí solo lo del mes que se ve
    enlace(h.createDiv({ cls: "pie" }), `Incluye ${[g ? `${eur(g, 0)} de gasto` : "", e ? `${eur(e, 0)} de entradas` : ""].filter(Boolean).join(" y ")} sin revisar (${sinRev.length} movimiento${sinRev.length > 1 ? "s" : ""} de ${actual ? "este" : "ese"} mes) →`, "#revisar");
  }
  if (fechaDatos()) {  // el ritmo del mes, dentro de la portada: cómo vas frente a tu media y tu límite
    const g = h0.createDiv({ cls: "graf" });
    ayuda(g.createDiv({ cls: "l", text: "Ritmo del mes" }), "Tu gasto variable acumulado día a día, comparado con lo que sueles llevar a estas alturas del mes.");
    graficoRitmo(g, R, M.key);
  }
  const r = h0.createDiv({ cls: "fb-resumen" });
  const dato = (l, v, cls) => { const d = r.createDiv({ cls: "d " + (cls || "") }); d.createDiv({ cls: "k", text: l }); d.createDiv({ cls: "n", text: v }); };
  dato(actual ? "Ha entrado" : "Entró", eur(M.ingresos, 0), "entra");
  dato(actual ? "Ha salido" : "Salió", eur(M.gastos, 0), "sale");
  dato("Ahorro del mes", eurS(M.ahorro, 0), M.ahorro < 0 ? "neg" : "");
}

// Media de gasto variable de los últimos meses completos con movimientos, redondeada a 50 €
function limiteSugerido() {
  const K = mesesHasta(mesAnterior(hoyKey), 3).filter((k) => finMes(k).real.some((m) => !m.auto));
  return K.length ? Math.round(sum(K.map((k) => gastoVariable(finMes(k)))) / K.length / 50) * 50 : 0;
}
function tarjetaSemana(p, S) {
  if (!S.fechaDatos) { vacio(p, "Sin movimientos todavía", " Importa el extracto de tu banco."); return; }
  const variable = movimientos().filter((m) => !m.previsto && m.gasto && grupoDe(m.categoria) !== "fijo");
  const dias = DIAS.map((l, i) => {
    const d = S.lunes.plus({ days: i });
    const valor = sum(variable.filter((m) => m.fecha.hasSame(d, "day")).map((m) => m.gasto));
    return { etiqueta: l, titulo: d.setLocale("es").toFormat("cccc d"), valor: Math.max(0, valor), futuro: d > S.fechaDatos.endOf("day"), hoy: d.hasSame(S.fechaDatos, "day") };
  });
  const meta = limiteVar > 0 ? limiteVar / S.dm : 0;
  const t = p.createDiv({ cls: "fb-total" });
  t.createDiv({ cls: "v", text: eur(S.semana, 0) });
  t.createDiv({ cls: "s", text: meta ? `de ${eur(S.metaSemana, 0)} a la semana` : "en gasto variable" });
  barrasSemana(p, dias, meta);
}

// Diferencia con tu media, en euros y solo si es notable (≥ 20 € y ≥ 15 %): un % sobre una media pequeña engaña.
function difMedia(c) {
  if (!isFinite(c.media) || c.media < 1) return null;
  const dif = c.valor - c.media;
  return Math.abs(dif) >= 20 && Math.abs(dif) / c.media >= 0.15 ? dif : null;
}
const textoDif = (dif) => `${dif > 0 ? "+" : "−"}${eur(Math.abs(dif), 0)} vs tu media`;

// Gasto del mes por categoría: las 5 mayores en barras en píldora de su color (el contorno discontinuo es su presupuesto).
function tarjetaCategorias(p, key) {
  const TODAS = resumenCategorias(key).filter((c) => c.valor > 0.5);
  const total = sum(TODAS.map((c) => c.valor));
  if (!TODAS.length) { vacio(p, "Sin gastos este mes", ""); return; }
  // Lo que puedes mover (variable) en barras; los fijos, en una línea aparte: el alquiler no debe aplastar al resto
  const C = TODAS.filter((c) => c.grupo !== "fijo").length ? TODAS.filter((c) => c.grupo !== "fijo") : TODAS;
  const fijos = C === TODAS ? [] : TODAS.filter((c) => c.grupo === "fijo");
  const t = p.createDiv({ cls: "fb-total" });
  t.createDiv({ cls: "v", text: eur(total - sum(fijos.map((c) => c.valor)), 0) });
  t.createDiv({ cls: "s", text: `${fijos.length ? "de gasto variable" : "gastado"} en ${mesLbl(key).toLowerCase()}` });
  const VISIBLES = 5, top = C.slice(0, VISIBLES), resto = C.slice(VISIBLES);
  const max = Math.max(...top.map((c) => Math.max(c.valor, c.presupuesto || 0)));
  const box = p.createDiv({ cls: "fb-pildoras" });
  for (const c of top) {
    const r = box.createEl("a", { cls: "fb-pildora", href: "#movimientos" });
    r.onclick = (e) => { e.preventDefault(); guardarEstado({ filtroCat: c.nombre }); FB.ir("#movimientos/lista"); };
    const n = r.createDiv({ cls: "n" });
    n.createSpan({ cls: "ic", text: catIcono(c.nombre) });
    n.createSpan({ text: c.nombre });
    const pista = r.createDiv({ cls: "pista" });
    if (c.presupuesto > 0) { const pr = pista.createDiv({ cls: "tope" }); pr.style.width = `${((100 * c.presupuesto) / max).toFixed(1)}%`; pr.title = `Presupuesto: ${eur(c.presupuesto, 0)}`; }
    const b = pista.createDiv({ cls: "barra" + (c.presupuesto > 0 && c.valor > c.presupuesto ? " pasado" : "") });
    b.style.width = `${Math.max((100 * c.valor) / max, 3).toFixed(1)}%`;
    setVar(b, "--cc", catColor(c.nombre));
    const v = r.createDiv({ cls: "val" });
    v.createDiv({ text: eur(c.valor, 0) });
    const dif = difMedia(c);
    if (dif != null) v.createDiv({ cls: "dif " + (dif > 0 ? "sube" : "baja"), text: textoDif(dif) });
    r.title = `${c.nombre}: ${eur(c.valor, 0)} · ${pct(c.valor / total)} del gasto${isFinite(c.media) ? ` · tu media ${eur(c.media, 0)}` : ""}${c.presupuesto > 0 ? ` · presupuesto ${eur(c.presupuesto, 0)}` : ""}`;
  }
  if (fijos.length) enlace(p.createDiv({ cls: "fin-note" }), `Además, ${eur(sum(fijos.map((c) => c.valor)), 0)} de gastos fijos (${fijos.map((c) => c.nombre.toLowerCase()).join(", ")}) →`, "#movimientos/categorias");
  if (resto.length) enlace(p.createDiv({ cls: "fin-note" }), `y ${resto.length} categoría${resto.length > 1 ? "s" : ""} más (${eur(sum(resto.map((c) => c.valor)), 0)}) →`, "#movimientos/categorias");
}
// Una categoría (vista «Por categoría»): nombre, cuánto es de su panel y diferencia con la media; barra si tiene presupuesto.
// `total` es la suma del panel en el que va la fila (la cifra que se ve en su cabecera), no el gasto entero del mes: el
// 21 % de Supermercado bajo «Gasto variable 672 €» se leía como 21 % de 672 cuando era 21 % de los 1.485 € que salieron.
function filaCategoria(padre, c, total, onclick) {
  const el = item(padre, { av: { cat: c.nombre, sm: true }, t: c.nombre, v: eur(c.valor, 0), onclick });
  const s = el.querySelector(".n").createDiv({ cls: "s" });
  const dif = difMedia(c);
  if (dif != null) s.createSpan({ cls: "fb-var " + (dif > 0 ? "sube" : "baja"), text: textoDif(dif) });
  s.appendText([total > 0 ? pct(c.valor / total) : "", isFinite(c.media) && c.media >= 1 ? `media ${eur(c.media, 0)}` : ""].filter(Boolean).join(" · "));
  if (c.presupuesto > 0) {
    const f = c.valor / c.presupuesto;
    const b = el.querySelector(".n").createDiv({ cls: "fb-barra fina " + (f > 1 ? "pasado" : f >= 0.9 ? "alto" : "") });
    b.createDiv().style.width = `${Math.min(100, f * 100).toFixed(1)}%`;
    b.title = `${eur(c.valor, 0)} de ${eur(c.presupuesto, 0)} de presupuesto`;
  }
  return el;
}
// Curva de gasto acumulado del mes frente a tu media y tu límite: ¿voy mejor o peor que otros meses?
function graficoRitmo(p, R, key = hoyKey) {
  const actual = key === hoyKey;
  const series = [];
  // El gasto, en coral (como «Salió» en toda la app); las dos referencias, en tinta neutra y con trazos distintos.
  if (R.media) series.push({ nombre: "Tu media", color: "var(--ink-3)", valores: R.media, discontinua: true });
  if (limiteVar > 0) series.push({ nombre: "Límite", color: "var(--ink)", valores: Array.from({ length: R.dm }, (_, i) => (limiteVar * (i + 1)) / R.dm), discontinua: "1.5 4" });
  series.push({ nombre: actual ? "Este mes" : mesLbl(key), color: "var(--coral)", valores: R.actual, area: true });
  const marcas = [0, 6, 13, 20, 27].filter((i) => i < R.dm);
  const dias = Array.from({ length: R.dm }, (_, i) => iniMes(key).plus({ days: i }));
  lineas(p, { etiquetas: dias.map((d) => d.setLocale("es").toFormat("cccc d")), etiquetasX: dias.map((d) => String(d.day)), series, marcas, alto: 150 });
  leyenda(p, series.map((s) => [s.nombre, s.color, s.discontinua ? "rayas" : "continua"]).reverse());
}

// Lo que se hace cada semana o cada mes y toca ahora (importar movimientos, anotar saldos); el resto está en el menú.
function accionesQueTocan() {
  const P = patrimonio(), u = P[P.length - 1], fd = fechaDatos();
  const diasSaldos = u ? diasDesde(u.fecha) : null, diasMov = fd ? diasDesde(fd) : null;
  return [
    { ic: "📥", t: "Importar movimientos", s: fd ? `último movimiento: ${fd.toFormat("dd/MM")}` : "sube el extracto de tu banco", ruta: "#importar", toca: !fd || diasMov > 6 },
    { ic: "🧾", t: "Actualizar saldos", s: u ? `anotados el ${u.fecha.toFormat("dd/MM")}` : "lo que tienes en cada cuenta", ruta: "#cerrar", toca: !u || diasSaldos > 35 || (keyCal(u.fecha) < hoyCal && (hoy.day <= 5 || hoy.day >= 25)) },
  ].filter((x) => x.toca);
}

// Tu patrimonio: un total (cuentas + inversión − deudas), su evolución y una línea por grupo. El detalle, en su pantalla.
function tarjetaPatrimonio(p) {
  const E = estimacion();
  if (!E) { vacio(p, "Aún no hay saldos", " Anota cuánto tienes en cada cuenta."); enlace(p.createDiv({ cls: "fin-note" }), "Anotar saldos →", "#cerrar"); return; }
  const I = resumenInversion();
  const t = p.createDiv({ cls: "fb-total" });
  // El total cuenta tu inversión por lo que has metido; lo que ha ganado (o perdido) va aparte, en pequeño.
  const gan = isFinite(I.gan) ? I.gan : 0, conGan = Math.abs(gan) >= 1;
  t.createDiv({ cls: "v", text: eur(E.neto - gan, 0) });
  const P = patrimonio();
  const ant = [...P].reverse().find((x) => x.fecha < hoy.startOf("month").minus({ months: 2 })) || P[0];
  const dif = ant ? E.neto - ant.neto : NaN;
  if (conGan) t.createDiv({ cls: "s " + tone(gan), text: `${eurS(gan, 0)} de tu inversión` });
  else t.createDiv({ cls: "s", text: isFinite(dif) && ant.fecha < hoy.startOf("month") ? `${eurS(dif, 0)} desde ${ant.fecha.setLocale("es").toFormat("LLLL")}` : "en total, estimado hoy" });
  const serie = [...P.map((x) => x.neto), E.neto];
  if (serie.length >= 3) miniArea(p.createDiv({ cls: "fb-spark" }), serie.slice(-12));
  const filas = [
    { l: "En tus cuentas", v: eur(E.c.Liquidez, 0), s: cuentasTipo("ahorro").length ? `día a día ${eur(E.cuentas.corriente, 0)} · ahorro ${eur(E.cuentas.ahorro || 0, 0)}` : "", ruta: "#gestionar/cuenta" },
    I.filas.length ? { l: "Invertido", v: eur(I.total - gan, 0), s: conGan ? "lo que has metido, sin la ganancia" : "", ruta: "#inversion" } : null,
    E.c["Efectivo bróker"] ? { l: "Sin invertir en el bróker", v: eur(E.c["Efectivo bróker"], 0) } : null,
    E.c.Otros ? { l: "Otros", v: eur(E.c.Otros, 0) } : null,
    E.deudas ? { l: "Deudas", v: eur(-E.deudas, 0) } : null,
  ];
  filasDato(p, filas);
  const ult = P[P.length - 1], dAn = E.neto - ult.neto;
  if (Math.abs(dAn) >= 1) {  // por qué no coincide con lo que anotaste
    const n = p.createDiv({ cls: "fin-note" });
    n.appendText(`Anotaste ${eur(ult.neto, 0)} el ${ult.fecha.toFormat("dd/MM")}; desde entonces ${eurS(dAn, 0)} por los movimientos y el cambio de valor de tu inversión. `);
    enlace(n, "Anotar saldos de hoy →", "#cerrar");
  }
  enlace(p.createDiv({ cls: "fin-note" }), "Tus hitos →", "#inversion");
}

// Evolución en pequeño: área suave a todo lo ancho (sin ejes), con el último punto marcado.
function miniArea(padre, vals) {
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1, n = vals.length - 1;
  const X = (i) => (i * 100) / n, Y = (v) => 36 - ((v - min) * 30) / span;
  const d = vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(2)},${Y(v).toFixed(2)}`).join("");
  padre.innerHTML = `<svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="${d}L100,40L0,40Z" style="fill:var(--brand);opacity:.1"/>`
    + `<path d="${d}" style="fill:none;stroke:var(--brand);stroke-width:2;vector-effect:non-scaling-stroke;stroke-linejoin:round"/></svg>`;
}

// Los cargos y cobros fijos del próximo mes (30 días); se enseñan los 8 primeros y el total cuenta todos.
function tarjetaProximos(p) {
  const hasta = hoy.plus({ days: 30 }).endOf("day");
  const P = movimientos().filter((m) => m.previsto && m.recurrente && m.fecha <= hasta && (m.clase === "gasto" || m.clase === "ingreso"))
    .sort((a, b) => a.fecha - b.fecha);
  if (!P.length) {
    const hay = recurrentes().some((r) => r.clase !== "aportacion");
    vacio(p, hay ? "Nada en el próximo mes" : "Sin fijos todavía", hay ? "" : " Nómina, alquiler, recibos… la app puede detectarlos en tus movimientos.");
    if (!hay) enlace(p.createDiv({ cls: "fin-note" }), "Detectar mis fijos →", "#fijos");
    return;
  }
  const l = p.createDiv({ cls: "fb-lista" });
  for (const m of P.slice(0, 8)) item(l, { fecha: m.fecha, t: m.concepto, s: m.categoria, v: (m.clase === "ingreso" ? "+" : "−") + eur(m.importe, 0), pos: m.clase === "ingreso", ruta: m.p && m.p.id ? `#editar/recurrente/${m.p.id}` : null });
  const tot = sum(P.map((m) => (m.clase === "ingreso" ? m.importe : -m.importe)));
  p.createDiv({ cls: "fin-note", text: `${P.length > 8 ? `y ${P.length - 8} más · ` : ""}En total ${eurS(tot, 0)} en los próximos 30 días` });
}

const objetivosActivos = () => objetivos().filter((o) => o.estado !== "conseguido" && o.meta > 0);
const recordatoriosCercanos = () => recordatorios().filter((r) => r.estado !== "hecho" && r.estado !== "hecha" && r.fecha >= hoy.startOf("day") && r.fecha <= hoy.plus({ days: Math.max(30, r.avisar) }).endOf("day")).sort((a, b) => a.fecha - b.fecha);
// Tus metas de ahorro con su progreso y lo que vence pronto (renta, seguros, ITV…)
function tarjetaObjetivos(p) {
  for (const o of objetivosActivos().slice(0, 3)) {
    const f = Math.min(1, o.ahorrado / o.meta);
    const fila = p.createDiv({ cls: "fb-obj" });
    const cab = fila.createDiv({ cls: "fb-fila" });
    cab.createSpan({ cls: "fb-et", text: o.nombre });
    cab.createSpan({ cls: "fin-note", text: `${eur(o.ahorrado, 0)} de ${eur(o.meta, 0)}${o.limite ? ` · para el ${o.limite.toFormat("dd/MM/yyyy")}` : ""}` });
    const b = fila.createDiv({ cls: "fb-barra fina" }); b.createDiv().style.width = `${(f * 100).toFixed(1)}%`;
  }
  const R = recordatoriosCercanos().slice(0, 3);
  if (R.length) { const l = p.createDiv({ cls: "fb-lista" }); for (const r of R) item(l, { fecha: r.fecha, t: r.nombre, s: r.texto || "recordatorio", v: "", ruta: `#editar/recordatorio/${r.p.id}` }); }
}

function tarjetaMeses(p) {
  const K = mesesHasta(hoyKey, 6).filter((k) => finMes(k).real.some((m) => !m.auto));
  if (K.length < 2) { vacio(p, "Aún hay pocos meses", " Con dos o más meses importados verás aquí cómo evolucionas."); return; }
  columnas(p, {
    alto: 190, etiquetas: K.map(mesCorto), titulos: K.map(mesLbl),
    series: [{ nombre: "Entró", color: "var(--mint)", valores: K.map((k) => finMes(k).ingresos) }, { nombre: "Salió", color: "var(--coral)", valores: K.map((k) => finMes(k).gastos) }],
  });
  leyenda(p, [["Entró", "var(--mint)"], ["Salió", "var(--coral)"]]);
}

// ───────────── movimientos ─────────────
function vistaMovimientos() {
  cabecera("Movimientos", true, "Todo lo que ha entrado y salido. Pulsa uno para cambiarlo.");
  enlace(root.createDiv({ cls: "fin-note" }), "+ Apuntar un gasto a mano", "#apuntar");
  const M = finMes(mes);
  const g = root.createDiv({ cls: "fb-stats" });
  const st = (cls, ic, l, v) => { const c = g.createDiv({ cls: "fb-stat " + cls }); c.createDiv({ cls: "ic", text: ic }); c.createDiv({ cls: "l", text: l }); c.createDiv({ cls: "v", text: v }); };
  st("entra", "↑", "Entró", eur(M.ingresos, 0));
  st("sale", "↓", "Salió", eur(M.gastos, 0));
  st("ahorro", "⚖️", "Ahorro del mes", eurS(M.ahorro, 0));
  const modo = params[0] === "lista" || filtroCat ? "lista" : "categorias";  // de primeras, por categoría; con una categoría elegida, su lista
  const seg = root.createDiv({ cls: "fb-seg" });
  for (const [k, t, r] of [["categorias", "Por categoría", "#movimientos"], ["lista", "Lista", "#movimientos/lista"]]) { const l = enlace(seg, t, r); l.className += k === modo ? " act" : ""; if (k === "categorias") l.addEventListener("click", () => { filtroCat = null; guardarEstado({ filtroCat: null }); }); }
  const nJev = ((((DB.config || {}).jev || {}).revision || {}).hallazgos || []).length;  // lo que el asistente Jev ve en otra categoría
  if (nJev) enlace(root.createDiv({ cls: "fin-note fb-pista" }), `✨ El asistente Jev cree que ${nJev === 1 ? "un comercio está" : `${nJev} comercios están`} en otra categoría · revísalo →`, "#revision");
  if (modo === "categorias") { vistaPorCategoria(M); return; }

  // Un mes o todo el historial (buscar un concepto siempre mira en todo)
  let todos = [], cats = [];
  const cargar = (todo) => {
    todos = (todo ? movimientos().filter((m) => !m.auto && !m.previsto) : [...M.ms]).sort((a, b) => b.fecha - a.fecha || (b.p.id || 0) - (a.p.id || 0));
    cats = [...new Set(todos.map((m) => (m.clase === "transferencia" ? "Entre tus cuentas" : m.categoria)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  };
  cargar(FB.estado.hist);
  const filtros = root.createDiv({ cls: "fb-filtros" });
  const inp = filtros.createEl("input", { cls: "fin-search", attr: { type: "search", placeholder: "Buscar un concepto, comercio o importe…" } });
  inp.value = busqueda;
  const per = filtros.createDiv({ cls: "fb-seg mini" });
  for (const [k, t] of [[false, mesLbl(mes)], [true, "Todo el historial"]]) { const b = per.createEl("button", { text: t, cls: !!FB.estado.hist === k ? "act" : "", attr: { type: "button" } }); b.onclick = () => { FB.estado.hist = k; FB.estado.pagMov = 0; render(); }; }
  const chips = root.createDiv({ cls: "fb-chips" });
  const total = root.createDiv({ cls: "fin-note" });
  const lista = root.createDiv({ cls: "fin-panel" });
  const pie = root.createDiv({ cls: "fb-pagina" });
  const POR_PAGINA = porPagina();
  const pintarChips = () => {
    chips.innerHTML = "";
    for (const c of [null, ...cats]) {
      const b = chips.createEl("button", { text: c ? `${c === "Entre tus cuentas" ? "🔁" : catIcono(c)} ${c}` : "Todo" });
      if ((filtroCat || null) === c) b.className = "act";
      b.onclick = () => { filtroCat = c; FB.estado.pagMov = 0; pintarChips(); pintar(); };
    }
  };
  const devuelto = new Map();  // gasto → lo que te han devuelto de él (Bizums enlazados)
  for (const r of registros("movimiento")) if (r.reembolsa) devuelto.set(r.reembolsa, (devuelto.get(r.reembolsa) || 0) + num(r.importe));
  const pintar = () => {
    lista.innerHTML = ""; pie.innerHTML = ""; total.textContent = "";
    const q = norm(inp.value.trim());
    if (q && !FB.estado.hist) { cargar(true); }  // buscar mira en todo el historial; sin búsqueda vuelve al mes
    else if (!q && !FB.estado.hist) cargar(false);
    const f = todos.filter((m) => (!filtroCat || (m.clase === "transferencia" ? "Entre tus cuentas" : m.categoria) === filtroCat)
      && (!q || norm(`${m.concepto} ${m.categoria} ${m.cuenta} ${m.p.ext_texto || ""} ${nf(m.importe, 2, 2)}`).includes(q)));
    if (!f.length) { vacio(lista, todos.length ? "Nada coincide" : "Sin movimientos este mes", todos.length ? "" : " Importa el extracto de tu banco o apunta uno a mano."); return; }
    const neto = sum(f.map((x) => (x.clase === "ingreso" || x.clase === "reembolso" ? x.importe : x.clase === "gasto" ? -x.importe : 0)));
    total.textContent = `${f.length} movimiento${f.length > 1 ? "s" : ""}${q && !FB.estado.hist ? " en todo el historial" : ""} · ${eurS(neto, 0)} en total (sin contar traspasos)`;
    let dia = null, cont = null;
    const paginas = Math.ceil(f.length / POR_PAGINA), pag = Math.min(FB.estado.pagMov || 0, paginas - 1);
    for (const m of f.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA)) {
      const k = m.fecha.toISODate();
      if (k !== dia) {
        dia = k;
        const d = lista.createDiv({ cls: "fb-dia" });
        const cab = d.createDiv({ cls: "cab" });
        cab.createSpan({ text: m.fecha.setLocale("es").toFormat("cccc d 'de' LLLL") });
        const neto = sum(f.filter((x) => x.fecha.toISODate() === k).map((x) => (x.clase === "ingreso" || x.clase === "reembolso" ? x.importe : x.clase === "gasto" ? -x.importe : 0)));
        cab.createSpan({ text: eurS(neto, 0) });
        cont = d.createDiv({ cls: "fb-lista" });
      }
      const entra = m.clase === "ingreso" || m.clase === "reembolso";
      const signo = m.clase === "transferencia" ? (m.origen ? "+" : "−") : entra ? "+" : "−";
      const sub = m.clase === "transferencia" ? `Entre tus cuentas ${m.destino ? "→ " + m.destino : m.origen ? "← " + m.origen : ""}` : `${m.categoria}${m.clase === "reembolso" ? " · te lo devolvieron" : ""}${devuelto.has(m.p.id) ? ` · te devolvieron ${eur(devuelto.get(m.p.id))}` : ""}`;
      item(cont, {
        av: { cat: m.clase === "transferencia" ? null : m.categoria, clase: m.clase }, t: m.concepto,
        s: `${sub}${cuentas().length > 1 ? " · " + m.cuenta : ""}${m.auto ? " · previsto" : ""}${m.pendiente ? " · sin revisar" : ""}${m.p && m.p.sugerido ? " · categoría por confirmar" : ""}`,
        v: signo + eur(m.importe), pos: entra, prev: m.auto || m.previsto,
        ruta: m.pendiente ? "#revisar" : m.auto ? (m.p.id ? `#editar/recurrente/${m.p.id}` : null) : `#editar/movimiento/${m.p.id}`,
      });
    }
    if (paginas > 1) {  // paginación: la lista larga se corta en páginas de 40
      const ir = (n) => { FB.estado.pagMov = n; pintar(); window.scrollTo(0, 0); };
      const a = pie.createEl("button", { cls: "fb-btn sec", text: "← Anterior" }); a.disabled = pag === 0; a.onclick = () => ir(pag - 1);
      pie.createSpan({ cls: "fin-note", text: `${pag * POR_PAGINA + 1}–${Math.min(f.length, (pag + 1) * POR_PAGINA)} de ${f.length} · página ${pag + 1} de ${paginas}` });
      const s = pie.createEl("button", { cls: "fb-btn sec", text: "Siguiente →" }); s.disabled = pag >= paginas - 1; s.onclick = () => ir(pag + 1);
    }
  };
  inp.oninput = () => { busqueda = inp.value; FB.estado.pagMov = 0; pintar(); };
  pintarChips(); pintar();
}

// Gasto del mes por categoría (variable y fijo) frente a tu media y tu presupuesto; ingresos por categoría.
function vistaPorCategoria(M) {
  const C = resumenCategorias(mes);
  const abrirCat = (n) => () => { filtroCat = n; guardarEstado({ filtroCat: n }); FB.ir("#movimientos/lista"); };
  if (!C.length) { vacio(root, "Sin gastos este mes", " Importa el extracto de tu banco o cambia de mes."); return; }
  const refs = mesesReferencia(mes);
  const g = root.createDiv({ cls: "fin-grid dos" });
  for (const [grupo, tit] of [["variable", "Gasto variable"], ["fijo", "Gastos fijos"]]) {
    const cs = C.filter((c) => (c.grupo === "fijo") === (grupo === "fijo"));
    if (!cs.length) continue;
    const suma = sum(cs.map((c) => c.valor));  // el % de cada fila es sobre esta cifra, que es la que se ve en la cabecera
    const p = panel(g, tit, { text: eur(suma, 0) });
    const l = p.createDiv({ cls: "fb-lista" });
    for (const c of cs) filaCategoria(l, c, suma, abrirCat(c.nombre));
  }
  const ing = new Map();
  for (const m of M.real.filter((m) => m.clase === "ingreso")) ing.set(m.categoria, (ing.get(m.categoria) || 0) + m.importe);
  if (ing.size) {
    const p = panel(g, "Ingresos", { text: eur(M.ingresos, 0) });
    const l = p.createDiv({ cls: "fb-lista" });
    for (const [n, v] of [...ing].sort((a, b) => b[1] - a[1])) item(l, { av: { cat: n, sm: true }, t: n, s: ing.size > 1 ? pct(v / M.ingresos) : "", v: eur(v, 0), pos: true, onclick: abrirCat(n) });
  }
  // «Salió» es el gasto menos lo que te devolvieron; una devolución de un gasto de otro mes deja su categoría en negativo y no sale en las listas
  const dev = [...gastoPorCategoria(mes)].filter(([, v]) => v < -0.005);
  if (dev.length) {
    const totalDev = -sum(dev.map(([, v]) => v));
    root.createDiv({ cls: "fin-note", text: `Salió ${eur(M.gastos, 0)} = ${eur(M.gastos + totalDev, 0)} de gasto − ${eur(totalDev, 0)} que te han devuelto de gastos de otros meses (${dev.map(([n, v]) => `${n} ${eur(-v, 0)}`).join(", ")}).` });
  }
  const nota = root.createDiv({ cls: "fin-note" });
  nota.appendText(refs.length ? `▲▼ comparado con la media de ${refs.map(mesCorto).join(", ").toLowerCase()}. ` : "");
  nota.appendText("¿Quieres un tope para una categoría? ");
  enlace(nota, "Ponle un presupuesto →", "#gestionar/categoria");
}

// Pantallas antiguas → las nuevas (enlaces guardados y avisos).
const VISTAS = { inicio: vistaInicio, resumen: vistaInicio, movimientos: vistaMovimientos, gastos: vistaMovimientos,
  prevision: vistaInicio, patrimonio: vistaInicio, inversion: vistaInversion };

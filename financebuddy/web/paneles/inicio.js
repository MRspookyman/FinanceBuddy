// ═════════════ pantallas principales: Inicio y Movimientos ═════════════
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const ICONO_CUENTA = { corriente: "💳", ahorro: "🐷", broker: "📈", otro: "🗝️" };
const DIAS = ["L", "M", "X", "J", "V", "S", "D"];

function saludo() {
  const h = DateTime.now().hour;
  return h < 6 ? "Buenas noches" : h < 14 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
}

// ───────────── inicio ─────────────
// Arriba, en dos columnas: lo que dice Nubo con los dos medidores (cuánto puedes gastar y lo que tus cuentas aguantan) y, al
// lado, «Qué conviene mirar» (los avisos). Debajo, tus cuentas y los paneles por parejas: ritmo y a dónde va tu dinero,
// previsión y próximos cargos, dinero total y metas. Se puede ver cualquier mes pasado (selector de mes, compartido con Movimientos).
// Paneles: el usuario elige cuáles ve y en qué orden (Ajustes → Tu inicio; config.inicio / config.inicio_ocultos).
// ancho: ocupa toda la fila · defecto:false → oculto salvo que el usuario lo active. Los demás van de dos en dos.
const PANELES_INICIO = [
  { id: "gasto", t: "Nubo y cuánto puedes gastar" },
  { id: "avisos", t: "Qué conviene mirar" },
  { id: "cuentas", t: "Tus cuentas", ancho: true },
  { id: "ritmo", t: "Ritmo del mes (y lo que entró y salió)" },
  { id: "categorias", t: "A dónde va tu dinero" },
  { id: "prevision", t: "Tus próximos meses (cuánto tendrás en tus cuentas)" },
  { id: "proximos", t: "Próximos cargos (el mes que viene)" },
  { id: "patrimonio", t: "Tu dinero total (cuentas e inversión)" },
  { id: "objetivos", t: "Tus metas y recordatorios" },
  { id: "permitir", t: "¿Me puedo permitir un gasto?" },
  { id: "semana", t: "Esta semana", defecto: false },
  { id: "meses", t: "Tus últimos meses", defecto: false },
];
// Los ids desconocidos se ignoran; los paneles nuevos se añaden al orden guardado.
function panelesInicio() {
  const existe = (id) => PANELES_INICIO.find((p) => p.id === id);
  const porDefecto = (p) => p.defecto !== false;
  if (!Array.isArray(cfg.inicio)) return [...PANELES_INICIO.filter(porDefecto), ...PANELES_INICIO.filter((p) => !porDefecto(p))].map((p) => ({ ...p, visible: porDefecto(p) }));
  const ocultos = new Set(cfg.inicio_ocultos || []);
  const visibles = cfg.inicio.map(existe).filter(Boolean);
  for (const p of PANELES_INICIO.filter((p) => !cfg.inicio.includes(p.id) && !ocultos.has(p.id) && porDefecto(p))) visibles.push(p);
  const resto = PANELES_INICIO.filter((p) => !visibles.includes(p));
  return [...visibles.map((p) => ({ ...p, visible: true })), ...resto.map((p) => ({ ...p, visible: false }))];
}
function vistaInicio() {
  if (mes > hoyKey) mes = hoyKey;  // el Inicio no mira al futuro
  const actual = mes === hoyKey;
  const S = presupuestoSemana(), M = finMes(mes);
  const cab = root.createDiv({ cls: "fb-saludo" });
  const iz = cab.createDiv();
  iz.createEl("h1", { text: actual ? saludo() : mesLbl(mes), attr: { "data-titulo": actual ? "Inicio" : mesLbl(mes) } });  // la pestaña dice «Inicio»; el saludo cambia con la hora
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
  const año = enlace(der, "Mi año", "#anual");
  año.className += " fb-personalizar";
  año.title = "Lo que entró, salió y ahorraste en el año, comparado con el anterior";
  const per = enlace(der, "Personalizar", "#ajustes/inicio");
  per.className += " fb-personalizar";
  per.title = "Elige qué ves en el inicio y en qué orden";

  const DIBUJAR = {
    gasto: (padre) => heroGasto(padre, S, M),
    avisos: (padre) => { if (actual) franjasInicio(padre, estadoPortada); },
    permitir: (padre) => { if (actual && fechaDatos()) permitirGasto(panel(padre, "¿Me puedo permitir un gasto?")); },
    cuentas: (padre) => { if (actual && cuentas().length) tarjetaCuentasInicio(padre); },
    ritmo: (padre) => { if (fechaDatos() && finMes(mes).real.length) tarjetaRitmo(panel(padre, "Ritmo del mes", null, "Tu gasto variable acumulado día a día, comparado con lo que sueles llevar a estas alturas del mes y con tu límite."), M); },
    categorias: (padre) => { if (resumenCategorias(mes).some((c) => c.valor > .5)) tarjetaCategorias(panel(padre, "A dónde va tu dinero"), mes); },
    patrimonio: (padre) => { if ((actual && estimacion()) || patrimonio().some((x) => x.fecha >= mesDT(mes).startOf("month") && x.fecha <= mesDT(mes).endOf("month"))) tarjetaPatrimonio(panel(padre, "Tu dinero total", actual ? { text: "Actualizar saldos", ruta: "#cerrar" } : null), mes); },
    proximos: (padre) => { if (actual && movimientos().some((m) => m.previsto && m.recurrente && m.fecha <= hoy.plus({ days: 30 }).endOf("day") && ["gasto", "ingreso"].includes(m.clase))) tarjetaProximos(panel(padre, "Próximos cargos", { text: "Tus fijos", ruta: "#gestionar/recurrente" })); },
    prevision: (padre) => { if (actual && estimacion()) { const p = panel(padre, "Tus próximos meses", { text: "Tus fijos", ruta: "#gestionar/recurrente" }, "Lo que tendrás en tus cuentas al acabar cada mes si todo sigue igual: parte de lo que tienes hoy y suma tus fijos, tus aportaciones y lo que sueles gastar de verdad (tu media, no tu límite)."); p.id = "inicio-prevision"; tarjetaPrevision(p); } },
    objetivos: (padre) => { if (objetivosActivos().length || recordatoriosCercanos().length) tarjetaObjetivos(panel(padre, "Tus metas y recordatorios", { text: "Editar", ruta: "#gestionar/objetivo" })); },
    semana: (padre) => { if (actual && S.fechaDatos) tarjetaSemana(panel(padre, "Esta semana", { text: `${S.lunes.toFormat("d/M")} – ${S.domingo.toFormat("d/M")}` }), S); },
    meses: (padre) => { if (mesesHasta(hoyKey, 6).filter((k) => finMes(k).real.some((m) => !m.auto)).length >= 2) tarjetaMeses(panel(padre, "Tus últimos meses", { text: "Mi año", ruta: "#anual" })); },
  };
  const visibles = panelesInicio().filter((p) => p.visible);
  estadoPortada = actual && visibles.some((p) => p.id === "gasto") ? estadoCompaneroInicio(M).id : "";
  const metasALaVista = actual && visibles.some((p) => p.id === "objetivos");
  conMetas = metasALaVista && objetivosActivos().length > 0;
  recordatoriosALaVista = [];
  const rejilla = root.createDiv({ cls: "fin-grid fb-inicio fb-parejas" });
  for (const p of visibles) {
    const antes = rejilla.children.length;
    DIBUJAR[p.id](rejilla);
    if (rejilla.children.length === antes) continue;
    const caja = rejilla.lastElementChild;
    caja.dataset.panel = p.id;
    if (p.ancho) caja.classList.add("fb-inicio-ancho");
  }
  if (actual) tarjetaPrimerosPasos(rejilla);
  // Cierra cada pareja antes de una caja ancha y al terminar: tampoco quedan huecos al ocultar paneles.
  let anterior = null;
  for (const caja of rejilla.children) {
    if (caja.classList.contains("fb-inicio-ancho")) {
      if (anterior) anterior.classList.add("fb-inicio-ancho");
      anterior = null;
    } else anterior = anterior ? null : caja;
  }
  if (anterior) anterior.classList.add("fb-inicio-ancho");
  ajustarCajasInicio(rejilla);
}

// La vista resumida termina siempre en un elemento entero. El detalle conserva los nodos originales y sus acciones.
function ampliarCajaInicio(caja, extra) {
  const d = caja.createEl("dialog", { cls: "fb-dialogo fb-inicio-detalle", attr: { "aria-label": caja.querySelector("h2,h3")?.textContent || "Detalle del Inicio" } });
  const cerrar = d.createEl("button", { cls: "fb-btn sec", text: "Cerrar", attr: { type: "button" } });
  const cuerpo = caja.querySelector(".fb-caja-cuerpo");
  const origen = cuerpo || caja;
  const nodos = [...origen.children].filter((n) => n !== caja.querySelector(".fb-caja-ver"));
  const ocultos = [...origen.querySelectorAll("[hidden]")];
  if (extra) extra(d);
  else { for (const n of ocultos) n.hidden = false; for (const n of nodos) d.appendChild(n); }
  cerrar.onclick = () => d.close();
  const foco = document.activeElement;
  d.addEventListener("close", () => {
    if (!extra) { for (const n of nodos) origen.appendChild(n); for (const n of ocultos) n.hidden = true; }
    d.remove(); if (foco?.isConnected) foco.focus();
  }, { once: true });
  d.showModal(); cerrar.focus();
}
function ajustarCajasInicio(rejilla) {
  if (!rejilla.isConnected) return;
  const rutas = { categorias: "#movimientos/categorias", proximos: "#gestionar/recurrente", objetivos: "#gestionar/objetivo", patrimonio: "#inversion", cuentas: "#cuentas", ritmo: "#movimientos", meses: "#anual", semana: "#movimientos" };
  for (const caja of rejilla.children) {
    const cuerpo = caja.createDiv({ cls: "fb-caja-cuerpo" });
    const titulo = caja.firstElementChild?.tagName === "H3" ? caja.firstElementChild : null;
    const masAvisos = caja.querySelector(":scope > .fb-avisos-mas");
    for (const n of [...caja.children]) if (n !== cuerpo && n !== titulo && n !== masAvisos) cuerpo.appendChild(n);
    if (masAvisos) caja.appendChild(masAvisos);
    const ruta = rutas[caja.dataset.panel];
    const limite = () => cuerpo.getBoundingClientRect().bottom;
    const desborda = [...cuerpo.querySelectorAll("*")].some((n) => n.getBoundingClientRect().bottom > limite() + .5);
    if (!desborda && caja.dataset.resumen !== "si") continue;
    if (!masAvisos) {
      const ver = ruta ? enlace(caja, "Ver todo →", ruta) : caja.createEl("button", { cls: "fin-link", text: "Ver todo →", attr: { type: "button" } });
      ver.classList.add("fb-caja-ver");
      if (!ruta) ver.onclick = () => ampliarCajaInicio(caja);
    }
    // Baja por los contenedores de listas antes de retirar una sección: nunca se corta texto con CSS.
    const recortar = (el) => {
      for (const n of [...el.children].reverse()) {
        if (n.getBoundingClientRect().bottom <= limite() + .5) continue;
        if (n.matches(".fb-lista,.fb-pasos-lista,.fb-pildoras,.fb-medidores,.fb-companero-voz,.iz,.fb-permitir,.res") && n.children.length) recortar(n);
        if (n.getBoundingClientRect().bottom > limite() + .5) n.hidden = true;
      }
    };
    recortar(cuerpo);
  }
}
// Lo que la portada ya está pidiendo (para no repetirlo en los avisos) y si el panel de metas está a la vista (entonces la
// sugerencia de a dónde llevar lo que sobra va con su meta, no en los avisos). Los calcula vistaInicio al empezar.
let estadoPortada = "", conMetas = false, recordatoriosALaVista = [];

// Los avisos y «Desde la última vez» comparten la misma comparación con la última visita (qué avisos son nuevos).
function cambiosInicio() {
  const regs = registros("movimiento").map((m) => ({ id: m.id, fecha: txt(m.fecha), parte_de: m.parte_de }));
  const E = estimacion();
  return cambiosDesdeVista((DB.config || {}).ultima_vista, { movs: regs, neto: E ? E.neto : null, avisos: avisos() });
}
const franjasInicio = (padre, estado) => { const C = cambiosInicio(); franjaAvisos(padre, estado, C); franjaCambios(padre.lastElementChild, C); };

// «Desde la última vez» vive dentro de «Qué conviene mirar», sin añadir otra franja entre las cajas. Los
// avisos nuevos no se repiten aquí: van marcados «Nuevo» en «Qué conviene mirar». La primera vez no sale: solo se anota
// hasta dónde llegaba lo que había (config.ultima_vista). «Entendido» solo da lo nuevo por visto: no quita ni resuelve avisos.
function franjaCambios(padre, C) {
  const foto = () => ({ max_id: C.snap.max_id, neto: C.snap.neto, avisos: C.snap.avisos, fecha: hoy.toISODate() });
  if (C.primera) {
    if (!FB.estado.vistaAnotada) { FB.estado.vistaAnotada = true; FB.api("/api/config/visto", foto()); }
    return;
  }
  if (!C.hay) return;
  const f = (iso) => DateTime.fromISO(iso).toFormat("dd/MM");
  const box = padre.createDiv({ cls: "fb-cambios", attr: { role: "region", "aria-label": "Lo que ha cambiado desde la última vez" } });
  const cuerpo = box.createDiv({ cls: "cuerpo" });
  const partes = [];
  if (C.nuevos) partes.push(`${C.nuevos} movimiento${C.nuevos > 1 ? "s" : ""} nuevo${C.nuevos > 1 ? "s" : ""}${C.desde ? (C.desde === C.hasta ? ` del ${f(C.desde)}` : ` (del ${f(C.desde)} al ${f(C.hasta)})`) : ""}`);
  if (C.avisosNuevos.length) partes.push(`${C.avisosNuevos.length} aviso${C.avisosNuevos.length > 1 ? "s" : ""} nuevo${C.avisosNuevos.length > 1 ? "s" : ""}, marcado${C.avisosNuevos.length > 1 ? "s" : ""} arriba`);
  cuerpo.createDiv({ cls: "t", text: `Desde la última vez${C.fecha ? ` (${f(C.fecha)})` : ""}: ${partes.join(" · ")}` });
  if (C.dif != null) cuerpo.createDiv({ text: `Tu dinero total ha ${C.dif > 0 ? "subido" : "bajado"} ${eur(Math.abs(C.dif), 2)} según lo anotado.` });
  if (C.nuevos) enlace(cuerpo.createDiv(), "Ver los movimientos →", "#movimientos/lista");
  const b = box.createEl("button", { cls: "fb-btn sec mini", text: "Entendido", attr: { type: "button", "aria-label": "Entendido: dar por visto lo que ha cambiado desde la última vez" } });
  b.onclick = async () => {
    const r = await FB.api("/api/config/visto", foto());
    if (!r.ok) { FB.aviso(r.mensaje || "No se ha podido anotar", true); return; }
    await FB.refrescar();
  };
}

// Cómo se ve cada aviso: su grupo y su señal (color + palabra, nunca solo el color). Rosa = algo va mal (no cuadra, no
// llega); coral = gasto; ámbar = pendiente o cuidado; violeta = para saber o sugerencia. Ni verde ni rojo: no son ganancias.
function señalAviso(f) {
  const k = (f.clave || "").replace(/^inicio:/, "").split(":")[0];
  if (f.tipo === "toca") return { grupo: "atencion", sev: "cautela", et: "Toca ahora", ic: f.ic };
  if (f.tipo === "sugiere") return { grupo: "puedas", sev: "info", et: "Sugerencia", ic: "→" };
  if (k === "rec") return { grupo: "pronto", sev: f.nivel === "warn" ? "cautela" : "info", et: f.nivel === "warn" ? "Vence ya" : "Próximamente", ic: "📅" };
  if (["cuadre", "salud", "minimo", "agota"].includes(k) && f.nivel === "warn") return { grupo: "atencion", sev: "mal", et: k === "minimo" || k === "agota" ? "No llega" : "No cuadra", ic: "!" };
  if (["comision", "subida", "pres", "pres90", "ritmo", "cat", "repetido"].includes(k)) return { grupo: f.nivel === "warn" ? "atencion" : "puedas", sev: "gasto", et: "Gasto", ic: "€" };
  if (f.nivel === "warn") return { grupo: "atencion", sev: "cautela", et: "Pendiente", ic: "!" };
  return { grupo: "puedas", sev: "info", et: "Para saber", ic: "i" };
}
const GRUPOS_AVISO = [["atencion", "Necesita atención"], ["pronto", "Próximamente"], ["puedas", "Para cuando puedas"]];

// «Qué conviene mirar»: hasta tres acciones y avisos; se priorizan los «warn» con repartirAvisos y el resto
// se consulta en el detalle. Agrupado y con su señal; los nuevos desde la
// última visita, marcados. Lo que la portada ya está pidiendo no se repite aquí.
function franjaAvisos(padre, estado, C) {
  const cubierto = (a) => (estado === "datos-pendientes" && a.ruta === "#revisar" && porRevisar().every((q) => { const f = toDate((q.fila || {}).op); return f && keyDe(f) === mes; }))
    || (estado === "saldos" && (a.ruta === "#cerrar" && (!a.clave || /:(cuadre|sinsaldos|saldosviejos):/.test(a.clave))))
    || (estado === "cerrar-mes" && /:cierre:/.test(a.clave || ""))
    || (estado === "no-llega" && /:minimo:/.test(a.clave || ""))
    // un recordatorio que ya se ve (con su «Hecho») en «Tus metas y recordatorios» no se repite aquí
    || recordatoriosALaVista.some((id) => (a.clave || "").startsWith(`inicio:rec:${id}:`));
  const nuevos = new Set(((C && C.avisosNuevos) || []).map((a) => a.clave));
  const tocan = accionesQueTocan().filter((a) => !cubierto(a));
  const filas = tocan.map((x) => ({ tipo: "toca", ic: x.ic, b: x.t, txt: x.s, ruta: x.ruta }));
  const { arriba, resto } = repartirAvisos(avisos().filter((a) => !cubierto(a)), tocan.map((x) => x.ruta), Math.max(0, 3 - tocan.length));
  const deAviso = (a) => ({ tipo: a.nivel === "warn" ? "warn" : "nota", nivel: a.nivel, txt: a.texto, ruta: a.ruta && a.ruta.startsWith("#") ? a.ruta : "#inicio", clave: a.clave });
  filas.push(...arriba.map(deAviso));
  const R = planReparto(), r = R && R.acciones[0];
  if (r && !conMetas) filas.push({ tipo: "sugiere", b: r.texto, txt: r.sub });
  resto.unshift(...filas.splice(3));
  const box = padre.createDiv({ cls: "fin-panel fb-franja", attr: { role: "region", "aria-labelledby": "fb-mirar-titulo" } });
  const cab = box.createDiv({ cls: "fb-franja-cab" });
  cab.createEl("h2", { text: "Qué conviene mirar", attr: { id: "fb-mirar-titulo" } });
  const total = filas.length + resto.length;
  if (total) cab.createSpan({ cls: "fb-franja-n", text: String(total), attr: { "aria-label": `${total} cosa${total > 1 ? "s" : ""}` } });
  if (!total) {
    const v = box.createDiv({ cls: "fb-franja-vacia" });
    v.innerHTML = vozMascota("Todo en orden. Te aviso aquí cuando haya algo.", "normal", { tam: 56 });
    return;
  }
  // Un aviso se puede quitar con su ×: la fila es entonces una caja con el enlace y, al lado, el botón (no uno dentro del otro).
  const fila = (donde, f) => {
    const S = señalAviso(f), sev = "sev-" + S.sev;
    const caja = f.clave ? donde.createDiv({ cls: `r con-x ${f.tipo} ${sev}` }) : null;
    const el = f.ruta ? (caja || donde).createEl("a", { cls: (caja ? "" : `r ${f.tipo} ${sev} `) + "internal-link", href: f.ruta }) : (caja || donde).createDiv({ cls: caja ? "" : `r ${f.tipo} ${sev}` });
    el.createSpan({ cls: "i", text: S.ic, attr: { "aria-hidden": "true" } });
    const t = el.createSpan({ cls: "t" });
    const et = t.createSpan({ cls: "et" });
    et.createSpan({ cls: "sev", text: S.et });
    if (f.clave && nuevos.has(f.clave)) et.createSpan({ cls: "nuevo", text: "Nuevo" });
    const linea = t.createSpan({ cls: "txt" });
    if (f.b) linea.createEl("b", { text: f.b });
    if (f.txt) linea.appendText((f.b ? " · " : "") + f.txt);
    if (f.ruta) el.createSpan({ cls: "fl", text: "›", attr: { "aria-hidden": "true" } });
    if (!caja) return;
    const x = caja.createEl("button", { cls: "x", text: "×", attr: { type: "button", title: "Quitar este aviso", "aria-label": `Quitar este aviso: ${f.txt}` } });
    x.onclick = async () => {
      const res = await FB.api("/api/config/descartar_aviso", { clave: f.clave });
      if (!res.ok) { FB.aviso(res.mensaje || "No se ha podido quitar", true); return; }
      await FB.refrescar();
      FB.aviso("Aviso quitado", false, { texto: "Volver a ponerlo", fn: async () => { await FB.api("/api/config/descartar_aviso", { clave: f.clave, volver: true }); await FB.refrescar(); } });
    };
  };
  // Por grupos: título del grupo y sus filas, en el orden de GRUPOS_AVISO.
  const porGrupos = (donde, lista) => {
    for (const [g, titulo] of GRUPOS_AVISO) {
      const del = lista.filter((f) => señalAviso(f).grupo === g);
      if (!del.length) continue;
      donde.createEl("h3", { cls: "fb-franja-grupo", text: titulo });
      for (const f of del) fila(donde, f);
    }
  };
  porGrupos(box, filas);
  if (resto.length) {
    const b = box.createEl("button", { cls: "fin-link fb-avisos-mas", text: `y ${resto.length} avisos más →`, attr: { type: "button" } });
    b.onclick = () => ampliarCajaInicio(box, (d) => {
      porGrupos(d, [...filas, ...resto.map((a) => a.texto ? deAviso(a) : a)]);
      franjaCambios(d, C);
    });
  }
}


// «Primeros pasos»: mientras falte algo y lleves menos de dos meses cerrados (luego ya no es empezar). Cada paso se tacha solo
// según lo que hay; «Ocultar» la quita para siempre (se guarda como un aviso descartado más, en config.avisos_descartados).
const CLAVE_PASOS = "inicio:primeros-pasos";
function tarjetaPrimerosPasos(padre) {
  if (((DB.config || {}).avisos_descartados || []).includes(CLAVE_PASOS) || cierres().length >= 2) return;
  const P = primerosPasos({ cuentas: cuentas().length, movimientos: registros("movimiento").length, pendientes: porRevisar().length,
    fijos: recurrentes().length, limite: limiteVar, saldos: patrimonio().length });
  const hechos = P.filter((x) => x.hecho).length;
  if (hechos === P.length) return;
  const p = panel(padre, "Primeros pasos", { text: `${hechos} de ${P.length} hechos` });
  p.classList.add("fb-primeros-pasos");
  p.dataset.panel = "primeros-pasos";
  const l = p.createEl("ol", { cls: "fb-pasos-lista" });
  for (const x of [...P].sort((a, b) => Number(a.hecho) - Number(b.hecho))) {
    const li = l.createEl("li", { cls: x.hecho ? "hecho" : "" });
    li.createSpan({ cls: "c", text: x.hecho ? "✓" : "", attr: { "aria-hidden": "true" } });
    const n = li.createDiv({ cls: "n" });
    if (x.hecho) { n.createSpan({ cls: "t", text: x.t }); n.createSpan({ cls: "s", text: " · hecho" }); }
    else { enlace(n, x.t, x.ruta); if (x.s) n.createSpan({ cls: "s", text: ` · ${x.s}` }); }
  }
  const b = p.createEl("button", { cls: "fb-btn sec mini", text: "Ocultar", attr: { type: "button", "aria-label": "Ocultar los primeros pasos (no vuelven a salir)" } });
  b.onclick = async () => {
    const r = await FB.api("/api/config/descartar_aviso", { clave: CLAVE_PASOS });
    if (!r.ok) { FB.aviso(r.mensaje || "No se ha podido ocultar", true); return; }
    await FB.refrescar();
    FB.aviso("Primeros pasos ocultos", false, { texto: "Volver a ponerlos", fn: async () => { await FB.api("/api/config/descartar_aviso", { clave: CLAVE_PASOS, volver: true }); await FB.refrescar(); } });
  };
}

// El estado orienta la siguiente acción; las cifras del mes siguen visibles en todos los casos.
function estadoCompaneroInicio(M, F = prevision()) {
  if (M.key !== hoyKey) return { id: "pasado", pose: "normal", titulo: `Así fue ${mesLbl(M.key).toLowerCase()}`, texto: "Tu resumen del mes, con los movimientos y saldos que anotaste." };
  const pendientes = porRevisar().filter((q) => { const f = toDate((q.fila || {}).op); return f && keyDe(f) === M.key; });
  if (pendientes.length) {
    const sinRev = M.real.filter((m) => m.pendiente), n = pendientes.length, s = n === 1 ? "" : "s";
    const gasto = sum(sinRev.filter((m) => m.clase === "gasto").map((m) => m.importe)), entradas = sum(sinRev.filter((m) => m.clase !== "gasto").map((m) => m.importe));
    const importes = [gasto ? `${eur(gasto, 2)} de gasto` : "", entradas ? `${eur(entradas, 2)} de entradas` : ""].filter(Boolean).join(" y ");
    return { id: "datos-pendientes", pose: "pensando", titulo: "Antes de fiarte de la cifra del mes, mira esto", texto: `Hay ${n} movimiento${s} de ${mesLbl(M.key).toLowerCase()} sin revisar${importes ? `: ${importes}` : ""}. Mientras no sepamos qué ${n === 1 ? "es" : "son"}, tu gasto del mes puede estar mal contado.`, accion: `Revisar ${n} movimiento${s}`, ruta: "#repaso/dudas" };
  }
  if (F.conRegistro && F.minimo.saldo < 0) {
    // Un ahorro mensual empieza en la parte del mes que aún no tiene datos y se acumula en los siguientes.
    const parcial = Math.max(0, (diasMes(hoyKey) - diasConDatos()) / diasMes(hoyKey));
    const rebaja = Math.max(...F.filas.slice(1).map((f, i) => Math.max(0, -f.saldo) / (i + 1 + parcial)));
    return { id: "no-llega", pose: "preocupado", titulo: `En ${mesLbl(F.minimo.key).toLowerCase()} tus cuentas no llegan`, texto: `La previsión baja a ${eur(F.minimo.saldo, 2)}. Reducir tus salidas unos ${eur(Math.ceil(rebaja), 2)} al mes desde ahora compensaría el déficit de los próximos meses, si lo demás sigue igual.`, accion: "Ver la previsión", ruta: "#inicio", prevision: true };
  }
  const C = conciliacion(), desc = C && C.filas.filter((f) => Math.abs(f.dif) > 1);
  const P = patrimonio(), ultimo = P[P.length - 1];
  if ((desc && desc.length) || accionesQueTocan().some((a) => a.ruta === "#cerrar")) return {
    id: "saldos", pose: desc && desc.length ? "preocupado" : "pensando",
    titulo: desc && desc.length ? "Hay un saldo que no cuadra" : ultimo ? `Tus saldos son del ${ultimo.fecha.toFormat("dd/MM")}` : "Falta comprobar tus saldos",
    texto: desc && desc.length ? `Lo anotado y tus movimientos no coinciden en ${desc.map((f) => f.nombre).join(", ")}. Comprueba los saldos para saber si falta algo.` : "Compruébalos y sabré si lo que te enseño coincide con tu banco.",
    accion: "Comprobar saldos", ruta: "#repaso/saldos" };
  const ant = mesAnterior(hoyCal), faltaCierre = P.length && ant >= keyCal(P[0].fecha) && !cierres().some((c) => c.mes === ant);
  if (faltaCierre || hoy.day >= hoy.daysInMonth - 3) return { id: "cerrar-mes", pose: "normal", titulo: `Cerrar ${mesLbl(faltaCierre ? ant : hoyCal).toLowerCase()}`, texto: "Revisa lo que entró y salió y anota los saldos del último día para dejar el mes comprobado.", accion: "Cerrar el mes", ruta: "#cerrar" };
  const dif = gastoVariable(M) - limiteVar;
  return { id: "al-dia", pose: "normal", titulo: `Todo al día: así va ${mesLbl(M.key).toLowerCase()}`, texto: limiteVar > 0 ? dif > 0 ? `Te has pasado ${eur(dif, 2)} de tu límite${F.conRegistro ? ", pero tus cuentas lo aguantan según la previsión" : "; comprueba tus saldos para conocer el margen de tus cuentas"}.` : `Vas ${eur(-dif, 2)} por debajo de tu límite de gasto variable.` : "Aquí tienes tu gasto y la previsión de tus cuentas, por separado.", accion: "Ver tus metas", ruta: "#inicio", metas: true };
}

function tarjetaCuentasInicio(padre) {
  const p = panel(padre, "Tus cuentas", { text: "Ver cuentas", ruta: "#cuentas" });
  p.classList.add("fb-cuentas-inicio");
  const fila = p.createDiv({ cls: "fb-cuentas-fila" });
  for (const c of cuentas().slice(0, 4)) fila.insertAdjacentHTML("beforeend", tarjetaCuenta(c));
  if (cuentas().length > 4) p.dataset.resumen = "si";
  if (cuentas().length > 4) enlace(p, `+${cuentas().length - 4} cuentas →`, "#cuentas");
  const E = estimacion();
  if (!E) return;
  // Aquí, lo de tus cuentas; cuánto tienes en total (con la inversión) lo explica «Tu dinero total».
  p.createDiv({ cls: "fin-note", text: `En tus cuentas ${eur(E.c.Liquidez, 2)} en total.` });
}

// La cifra grande de la portada. El sufijo va pegado al número, no solo en el rótulo pequeño de arriba: «72,00 €» significaba
// lo que te queda o lo que te has pasado según un rótulo en versalitas, y de un vistazo las dos cosas se ven igual.
function cifraHero(padre, valor, sufijo) {
  const v = padre.createDiv({ cls: "v", text: eur(valor, 2) });
  if (sufijo) v.createEl("small", { text: " " + sufijo });
  return v;
}
// La portada: una cifra grande que ayuda a decidir, una barra, una frase de estado y, en pequeño, entró · salió · te queda.
// Mes en curso: «Puedes gastar». Mes pasado: cuánto gastaste frente a tu límite.
function heroGasto(padre, S, M) {
  const actual = M.key === hoyKey;
  const F = prevision(), estadoPrincipal = estadoCompaneroInicio(M, F);
  const h0 = padre.createDiv({ cls: "fb-companero", attr: { "data-estado": estadoPrincipal.id } });
  const intro = h0.createDiv({ cls: "fb-companero-intro" });
  if (mascotaVisible()) {
    const b = intro.createEl("button", { cls: "fb-companero-mascota", attr: { type: "button", "aria-label": `Saludar a ${nombreMascota()}` } });
    b.innerHTML = mascota(estadoPrincipal.pose, { tam: 96 });
    b.onclick = () => celebrarMascota(b);
  }
  const voz = intro.createDiv({ cls: "fb-companero-voz" });
  if (mascotaVisible()) voz.createDiv({ cls: "fb-voz-etiqueta", text: `${nombreMascota()} dice` });
  voz.createEl("h2", { text: estadoPrincipal.titulo });
  voz.createEl("p", { text: estadoPrincipal.texto });
  if (estadoPrincipal.accion) {
    const salto = estadoPrincipal.prevision || estadoPrincipal.metas;
    // Los saltos dentro del Inicio son botones: un enlace a «#inicio» lo atraparía la navegación global y volvería arriba.
    const a = salto ? voz.createEl("button", { cls: "fb-btn", text: estadoPrincipal.accion, attr: { type: "button" } }) : enlace(voz, estadoPrincipal.accion, estadoPrincipal.ruta);
    if (!salto) a.className += " fb-btn";
    else a.onclick = () => { const destino = document.getElementById(estadoPrincipal.prevision ? "inicio-prevision" : "inicio-metas"); if (destino) { destino.scrollIntoView({ behavior: movimientoMascota() ? "smooth" : "instant", block: "start" }); destino.setAttribute("tabindex", "-1"); destino.focus({ preventScroll: true }); } else FB.ir(estadoPrincipal.prevision ? "#ajustes/inicio" : "#gestionar/objetivo"); };
  }
  const medidores = h0.createDiv({ cls: "fb-medidores" }), h = medidores.createDiv({ cls: "iz" });
  h.createEl("h3", { text: "Tu presupuesto" });
  const dm = diasMes(M.key);
  const dia = actual ? diaDeMes(hoy) : dm;  // la marca es hoy, como la frase de «días que quedan»
  const barra = (frac, etiqueta) => {
    const b = h.createDiv({ cls: "fb-progreso" });
    b.createDiv({ cls: "rel" }).style.width = `${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)}%`;
    if (actual) { const m = b.createDiv({ cls: "dia" }); m.style.left = `min(${((100 * dia) / dm).toFixed(1)}%, calc(100% - 2px))`; m.title = `Hoy: día ${dia} de ${dm}`; }
    h.createDiv({ cls: "pie", text: etiqueta });
  };
  const vari = gastoVariable(M);
  const R = ritmoMes(M.key);
  const estado = () => {
    if (!isFinite(R.mediaHoy) || !R.hoyV) return "";
    const dif = R.hoyV - R.mediaHoy;
    if (Math.abs(dif) < 15) return actual ? "Vas como sueles ir" : "Como sueles gastar";
    return `${actual ? "Vas" : "Gastaste"} ${eur(Math.abs(dif), 2)} ${dif < 0 ? "por debajo" : "por encima"} de tu media${actual ? " a estas alturas" : ""}`;
  };
  if (!(limiteVar > 0)) {
    h0.classList.add("neutro"); // sin límite, la cifra es lo gastado: no va en verde
    h.createDiv({ cls: "l", text: actual ? "Llevas gastado este mes" : "Gastaste" });
    cifraHero(h, vari);
    if (actual) barra(dia / dm, `día ${dia} de ${dm}`);
    h.createDiv({ cls: "s", text: estado() || "en gasto variable: comer fuera, compras, ocio…" });
    if (actual) {
      // Con una meta de ahorro (Ajustes), lo que se propone es el límite que la permite; si no, tu media
      const pills = h.createDiv({ cls: "pills" }), meta = metaAhorro(), L = meta > 0 ? limitePorMeta(meta, datosMeta()) : null;
      const porMeta = !!(L && L.ingresos > 0 && L.llega), sug = porMeta ? L.limite : limiteSugerido();
      if (sug) { const b = pills.createEl("button", { cls: "pill fb-companero-link", text: `Usar ${eur(sug, 2)} al mes como límite (${porMeta ? `para ahorrar ${eur(meta, 2)}` : "tu media"})`, attr: { type: "button" } }); b.onclick = async () => { await FB.api("/api/config", { limite_variable: sug }); FB.aviso("Límite guardado ✓"); await FB.refrescar(); }; }
      enlace(pills, "Poner otro límite →", "#ajustes").className += " pill fb-companero-link";
    }
  } else if (actual) {
    const pasado = S.disponible < 0, usado = S.vari / limiteVar;
    if (pasado) h0.classList.add("pasado");
    else if (usado >= 0.85) h0.classList.add("alto"); // queda poco: ámbar, antes de pasarse
    h.createDiv({ cls: "l", text: pasado ? "Te has pasado este mes" : "Puedes gastar este mes" });
    cifraHero(h, Math.abs(S.disponible), pasado && "de más");
    barra(usado, `de tu límite de ${eur(limiteVar, 2)}`);
    const frase = pasado ? "Es tu límite de gasto variable"
      : S.disponible < 5 ? "Has llegado a tu límite"
      : S.restantes > 1 ? `≈ ${eur(S.porDia, 2)} al día durante ${S.restantes} días` : "Último día del mes";
    h.createDiv({ cls: "s", text: [frase, estado()].filter(Boolean).join(" · ") });
    // Con datos de antes de ayer, la cuenta llega solo hasta esa fecha: se dice, como en el simulador
    if (S.fechaDatos && S.diasSinDatos >= 2) h.createDiv({ cls: "pie", text: `Con tus movimientos hasta el ${S.fechaDatos.setLocale("es").toFormat("d 'de' LLLL")}` });
  } else {
    const pasado = vari > limiteVar;
    if (pasado) h0.classList.add("pasado");
    h.createDiv({ cls: "l", text: pasado ? "Te pasaste del límite" : "Te sobró de tu límite" });
    cifraHero(h, Math.abs(limiteVar - vari), pasado ? "de más" : "de sobra");
    barra(vari / limiteVar, `gastaste ${eur(vari, 2)} de ${eur(limiteVar, 2)}`);
    const e = estado(); if (e) h.createDiv({ cls: "s", text: e });
  }
  const sinRev = M.real.filter((m) => m.pendiente);
  if (sinRev.length && estadoPrincipal.id !== "datos-pendientes") {
    const g = sum(sinRev.filter((m) => m.clase === "gasto").map((m) => m.importe)), e = sum(sinRev.filter((m) => m.clase !== "gasto").map((m) => m.importe));
    // «de este mes»: la insignia del menú cuenta todo lo que hay por revisar y aquí solo lo del mes que se ve
    enlace(h.createDiv({ cls: "pie" }), `Incluye ${[g ? `${eur(g, 2)} de gasto` : "", e ? `${eur(e, 2)} de entradas` : ""].filter(Boolean).join(" y ")} sin revisar (${sinRev.length} movimiento${sinRev.length > 1 ? "s" : ""} de ${actual ? "este" : "ese"} mes) →`, "#revisar");
  }
  const liquidez = medidores.createDiv({ cls: "fb-aguante" + (F.conRegistro && F.minimo.saldo < 0 ? " no-llega" : "") });
  liquidez.createEl("h3", { text: "Lo que tus cuentas aguantan" });
  liquidez.createDiv({ cls: "v", text: !F.conRegistro ? "Faltan tus saldos" : F.minimo.saldo < 0 ? "No llegan" : "Con margen" });
  if (F.conRegistro) {
    if (!actual) liquidez.createDiv({ cls: "s", text: "Previsión de hoy, no de ese mes." });
    liquidez.createDiv({ cls: "s", text: `Lo más bajo de los próximos meses: ${eur(F.minimo.saldo, 2)} en ${mesLbl(F.minimo.key).toLowerCase()}.` });
    const prudente = escenariosPrevision()[0];
    liquidez.createDiv({ cls: "pie", text: `Si gastas un 15 % más y te entra un 10 % menos: ${eur(prudente.minimo.saldo, 2)}.` });
    if (actual && limiteVar > 0 && vari > limiteVar && F.minimo.saldo >= 0) h.createDiv({ cls: "pie fb-companero-aclara", text: "Pasarte del límite no te deja en números rojos: es tu propio tope, no el del banco." });
    if (actual) {  // el detalle de la previsión está más abajo: un salto directo, sin buscarlo
      const b = liquidez.createEl("button", { cls: "fin-link fb-ver-prevision", text: "Ver la previsión mes a mes ↓", attr: { type: "button" } });
      b.onclick = () => { const d = document.getElementById("inicio-prevision"); if (d) { d.scrollIntoView({ behavior: movimientoMascota() ? "smooth" : "instant", block: "start" }); d.setAttribute("tabindex", "-1"); d.focus({ preventScroll: true }); } else FB.ir("#ajustes/inicio"); };
    }
  } else enlace(liquidez, "Anotar saldos", "#cerrar");
  // El simulador tiene su propio panel configurable.
}

// El ritmo del mes (cómo vas frente a tu media y tu límite) y lo que entró y salió: su propio panel, junto a «A dónde va tu dinero».
function tarjetaRitmo(p, M) {
  const actual = M.key === hoyKey;
  const cuerpo = p.createDiv({ cls: "fb-ritmo" });
  const g = cuerpo.createDiv({ cls: "graf" });
  graficoRitmo(g, ritmoMes(M.key), M.key);
  const r = cuerpo.createDiv({ cls: "fb-resumen" });
  const dato = (l, v, cls, pie) => { const d = r.createDiv({ cls: "d " + (cls || "") }); d.createDiv({ cls: "k", text: l }); d.createDiv({ cls: "n", text: v }); if (pie) d.createDiv({ cls: "p", text: pie }); };
  dato(actual ? "Ha entrado" : "Entró", eur(M.ingresos, 2), "entra");
  dato(actual ? "Ha salido" : "Salió", eur(M.gastos, 2), "sale");
  dato("Ahorro del mes", eurS(M.ahorro, 2), M.ahorro < 0 ? "neg" : "", M.ahorro > 0 && isFinite(M.tasa) ? `${pct(M.tasa)} de lo que ${actual ? "ha entrado" : "entró"}` : "");
}

// Simulador independiente: no guarda datos; el importe vive en FB.estado y sobrevive a FB.refrescar().
function permitirGasto(padre) {
  const E = FB.estado.permitir = FB.estado.permitir || { texto: "" };
  const d = padre.createDiv({ cls: "fb-permitir" });
  const fila = d.createDiv({ cls: "campo" });
  fila.createEl("label", { text: "Importe del gasto", attr: { for: "fb-permitir-importe" } });
  const inp = fila.createEl("input", { cls: "corto", attr: { id: "fb-permitir-importe", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "300" } });
  fila.createSpan({ text: "€" });
  inp.value = E.texto;
  const res = d.createDiv({ cls: "res", attr: { "aria-live": "polite" } });
  const pintar = () => {
    res.empty();
    const imp = leerImporte(E.texto);
    if (!E.texto.trim()) return;
    if (!(imp > 0)) { res.createDiv({ cls: "nota", text: "Escribe solo el importe, por ejemplo 300 o 1.200,50." }); return; }
    const D = datosPermitir(), P = puedoPermitirme(imp, D);
    res.createDiv({ cls: "veredicto " + P.nivel, text: P.texto });
    const linea = (k, v, cls) => { const r = res.createDiv({ cls: "r" }); r.createSpan({ cls: "k", text: k }); return r.createSpan({ cls: "n " + (cls || ""), text: v || "" }); };
    if (P.limite == null) enlace(linea("Tu límite del mes", "no tienes límite de gasto puesto · "), "Ponlo en Ajustes →", "#ajustes");
    else linea("Tu límite del mes", P.limite <= -0.5 ? `te pasarías ${eur(-P.limite, 2)}` : `te quedarían ${eur(P.limite, 2)}`, P.limite <= -0.5 ? "pasa" : "");
    const finDe = `Al acabar ${mesLbl(hoyKey).toLowerCase().split(" ")[0]}`;
    if (P.finMes == null) enlace(linea(finDe, "faltan tus saldos · "), "Anótalos →", "#cerrar");
    else linea(finDe, `tendrías ${eur(P.finMes, 2)} en tus cuentas`, P.finMes <= -0.5 ? "mal" : "");
    if (P.minimo) linea("Lo más bajo de los próximos meses", `${eur(P.minimo.saldo, 2)} en ${mesLbl(P.minimo.key).toLowerCase()}`, P.minimo.saldo <= -0.5 ? "mal" : "");
    else if (D.sinIngresos) enlace(linea("Lo más bajo de los próximos meses", "faltan tus ingresos fijos · "), "Detectar mis fijos →", "#fijos");
    else if (P.finMes == null) linea("Lo más bajo de los próximos meses", "faltan tus saldos");
    if (P.nivel === "ojo" && P.bajoColchon) res.createDiv({ cls: "nota", text: `Tu colchón es de ${eur(D.colchon.importe, 2)} en la cuenta del día a día; hoy ${D.colchon.sobra < 0 ? `te faltan ${eur(-D.colchon.sobra, 2)}` : `te sobran ${eur(D.colchon.sobra, 2)}`}.` });
    res.createDiv({ cls: "nota", text: `Con tus movimientos hasta el ${fechaDatos().setLocale("es").toFormat("d 'de' LLLL")}: lo que hayas gastado después no está contado. Es solo una cuenta: no se apunta nada.` });
  };
  inp.oninput = () => { E.texto = inp.value; pintar(); };
  pintar();
}

// Media de gasto variable de los últimos meses completos con movimientos, redondeada a 50 €
function limiteSugerido() {
  const K = mesesHasta(mesAnterior(hoyKey), 3).filter((k) => finMes(k).real.some((m) => !m.auto));
  return K.length ? Math.round(sum(K.map((k) => gastoVariable(finMes(k)))) / K.length / 50) * 50 : 0;
}
function tarjetaSemana(p, S) {
  if (!S.fechaDatos) { vacio(p, "Sin movimientos todavía", " Importa el extracto de tu banco."); return; }
  const fijosG = nombresFijosDeGasto();
  const variable = movimientos().filter((m) => !m.previsto && esGastoVariable(m, fijosG));
  const dias = DIAS.map((l, i) => {
    const d = S.lunes.plus({ days: i });
    const valor = sum(variable.filter((m) => m.fecha.hasSame(d, "day")).map((m) => m.gasto));
    return { etiqueta: l, titulo: d.setLocale("es").toFormat("cccc d"), valor: Math.max(0, valor), futuro: d > S.fechaDatos.endOf("day"), hoy: d.hasSame(S.fechaDatos, "day") };
  });
  const meta = limiteVar > 0 ? limiteVar / S.dm : 0;
  const t = p.createDiv({ cls: "fb-total" });
  t.createDiv({ cls: "v", text: eur(S.semana, 2) });
  t.createDiv({ cls: "s", text: meta ? `de ${eur(S.metaSemana, 2)} a la semana` : "en gasto variable" });
  barrasSemana(p, dias, meta);
}

// Diferencia con tu media, en euros y solo si es notable (≥ 20 € y ≥ 15 %): un % sobre una media pequeña engaña.
function difMedia(c) {
  if (!isFinite(c.media) || c.media < 1) return null;
  const dif = c.valor - c.media;
  return Math.abs(dif) >= 20 && Math.abs(dif) / c.media >= 0.15 ? dif : null;
}
const textoDif = (dif) => `${dif > 0 ? "+" : "−"}${eur(Math.abs(dif), 2)} vs tu media`;

// Gasto del mes por categoría: las 5 mayores en barras en píldora de su color (el contorno discontinuo es su presupuesto).
function tarjetaCategorias(p, key) {
  const TODAS = resumenCategorias(key).filter((c) => c.valor > 0.5);
  const total = sum(TODAS.map((c) => c.valor));
  if (!TODAS.length) { vacio(p, "Sin gastos este mes", ""); return; }
  // Lo que puedes mover (variable) en barras; los fijos, en una línea aparte: el alquiler no debe aplastar al resto
  const C = TODAS.filter((c) => c.grupo !== "fijo").length ? TODAS.filter((c) => c.grupo !== "fijo") : TODAS;
  const fijos = C === TODAS ? [] : TODAS.filter((c) => c.grupo === "fijo");
  const t = p.createDiv({ cls: "fb-total" });
  t.createDiv({ cls: "v", text: eur(total - sum(fijos.map((c) => c.valor)), 2) });
  t.createDiv({ cls: "s", text: `${fijos.length ? "de gasto variable" : "gastado"} en ${mesLbl(key).toLowerCase()}` });
  const VISIBLES = 4, top = C.slice(0, VISIBLES), resto = C.slice(VISIBLES);
  if (resto.length) p.dataset.resumen = "si";
  const max = Math.max(...top.map((c) => Math.max(c.valor, c.presupuesto || 0)));
  const box = p.createDiv({ cls: "fb-pildoras" });
  for (const c of top) {
    const r = box.createEl("a", { cls: "fb-pildora", href: "#movimientos" });
    r.onclick = (e) => { e.preventDefault(); guardarEstado({ filtroCat: c.nombre }); FB.ir("#movimientos/lista"); };
    const n = r.createDiv({ cls: "n" });
    n.createSpan({ cls: "ic", text: catIcono(c.nombre) });
    n.createSpan({ text: c.nombre });
    const pista = r.createDiv({ cls: "pista" });
    if (c.presupuesto > 0) { const pr = pista.createDiv({ cls: "tope" }); pr.style.width = `${((100 * c.presupuesto) / max).toFixed(1)}%`; pr.title = `Presupuesto: ${eur(c.presupuesto, 2)}`; }
    const b = pista.createDiv({ cls: "barra" + (c.presupuesto > 0 && c.valor > c.presupuesto ? " pasado" : "") });
    b.style.width = `${Math.max((100 * c.valor) / max, 3).toFixed(1)}%`;
    setVar(b, "--cc", catColor(c.nombre));
    const v = r.createDiv({ cls: "val" });
    v.createDiv({ text: eur(c.valor, 2) });
    const dif = difMedia(c);
    if (dif != null) v.createDiv({ cls: "dif " + (dif > 0 ? "sube" : "baja"), text: textoDif(dif) });
    r.title = `${c.nombre}: ${eur(c.valor, 2)} · ${pct(c.valor / total)} del gasto${isFinite(c.media) ? ` · tu media ${eur(c.media, 2)}` : ""}${c.presupuesto > 0 ? ` · presupuesto ${eur(c.presupuesto, 2)}` : ""}`;
  }
  if (fijos.length) enlace(p.createDiv({ cls: "fin-note" }), `Además, ${eur(sum(fijos.map((c) => c.valor)), 2)} de gastos fijos (${fijos.map((c) => c.nombre.toLowerCase()).join(", ")}) →`, "#movimientos/categorias");
  if (resto.length) p.createDiv({ cls: "fin-note", text: `${resto.length} categorías más` });
}
// Una categoría (vista «Por categoría»): nombre, cuánto es de su panel y diferencia con la media; barra si tiene presupuesto.
// `total` es la suma del panel en el que va la fila (la cifra que se ve en su cabecera), no el gasto entero del mes: el
// 21 % de Supermercado bajo «Gasto variable 672,00 €» se leía como 21 % de 672,00 € cuando era 21 % de los 1.485,00 € que salieron.
function filaCategoria(padre, c, total, onclick) {
  const el = item(padre, { av: { cat: c.nombre, sm: true }, t: c.nombre, v: eur(c.valor, 2), onclick });
  const s = el.querySelector(".n").createDiv({ cls: "s" });
  const dif = difMedia(c);
  if (dif != null) s.createSpan({ cls: "fb-var " + (dif > 0 ? "sube" : "baja"), text: textoDif(dif) });
  s.appendText([total > 0 ? pct(c.valor / total) : "", isFinite(c.media) && c.media >= 1 ? `media ${eur(c.media, 2)}` : ""].filter(Boolean).join(" · "));
  if (c.presupuesto > 0) {
    const f = c.valor / c.presupuesto;
    const b = el.querySelector(".n").createDiv({ cls: "fb-barra fina " + (f > 1 ? "pasado" : f >= 0.9 ? "alto" : "") });
    b.createDiv().style.width = `${Math.min(100, f * 100).toFixed(1)}%`;
    b.title = `${eur(c.valor, 2)} de ${eur(c.presupuesto, 2)} de presupuesto`;
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

// Tu dinero total: lo que tienes en cuentas, la inversión a valor de mercado y lo que debes. Un mes pasado, la foto de su
// último día con saldos. El detalle, en su pantalla.
function tarjetaPatrimonio(p, key = hoyKey) {
  const actual = key === hoyKey, P = patrimonio();
  const R = actual ? null : P.filter((x) => x.fecha >= mesDT(key).startOf("month") && x.fecha <= mesDT(key).endOf("month")).pop();  // los saldos van por mes natural
  const E = actual ? estimacion() : R;
  if (!E) {
    if (actual) { vacio(p, "Aún no hay saldos", " Anota cuánto tienes en cada cuenta."); enlace(p.createDiv({ cls: "fin-note" }), "Anotar saldos →", "#cerrar"); }
    return;
  }
  const I = actual ? resumenInversion() : null;
  const invMercado = (E.c["Inversión"] || 0) + (E.c.Cripto || 0);
  // Lo invertido, partido en lo que metiste y lo que ha cambiado de valor: solo si cada activo tiene su coste y su valor anotados.
  let desglose = "";
  if (I && I.filas.length && I.filas.every((f) => f.conocido && f.conValorReal && f.aportado > 0) && Math.abs(invMercado - I.total) < 0.01) {  // con compras sin dar de alta no cuadra: no se parte
    const g = invMercado - I.aportado;
    desglose = Math.abs(g) < 0.005 ? `${eur(I.aportado, 2)} aportados, sin cambio de valor`
      : `${eur(I.aportado, 2)} aportados y ${eur(Math.abs(g), 2)} de ${g > 0 ? "subida" : "bajada"} de valor`;
  }
  const t = p.createDiv({ cls: "fb-total" });
  t.createDiv({ cls: "v", text: eur(E.neto, 2) });
  if (actual) {
    const ant = [...P].reverse().find((x) => x.fecha < hoy.startOf("month").minus({ months: 2 })) || P[0];
    // Solo se compara con un registro que tenía lo mismo que hoy: si una cuenta o tu inversión no estaban, la «subida» sería darlas de alta
    const comparable = ant && Object.keys(E.cuentas.saldos).every((c) => c in ant.cuentas.saldos) && (!invMercado || Object.keys(ant.valores).length > 0);
    const dif = comparable ? E.neto - ant.neto : NaN;
    t.createDiv({ cls: "s", text: isFinite(dif) && ant.fecha < hoy.startOf("month") ? `${eurS(dif, 2)} desde ${ant.fecha.setLocale("es").toFormat("LLLL")}` : "en total, estimado hoy" });
  } else t.createDiv({ cls: "s", text: `${R.fecha.hasSame(R.fecha.endOf("month"), "day") ? `a fin de ${mesLbl(key).toLowerCase()}` : `en ${mesLbl(key).toLowerCase()}`} · saldos del ${R.fecha.toFormat("dd/MM/yyyy")}` });
  const serie = actual ? [...P.map((x) => x.neto), E.neto] : P.filter((x) => x.fecha <= mesDT(key).endOf("month")).map((x) => x.neto);
  if (serie.length >= 3) miniArea(p.createDiv({ cls: "fb-spark" }), serie.slice(-12));
  filasDato(p, [
    { l: "En tus cuentas", v: eur(E.c.Liquidez, 2), s: cuentasTipo("ahorro").length ? `día a día ${eur(E.cuentas.corriente, 2)} · ahorro ${eur(E.cuentas.ahorro || 0, 2)}` : "", ruta: "#gestionar/cuenta" },
    (invMercado || (I && I.filas.length)) ? { l: "Inversión a valor de mercado", v: eur(invMercado, 2), s: desglose, ruta: "#inversion" } : null,
    E.c["Efectivo bróker"] ? { l: "Sin invertir en el bróker", v: eur(E.c["Efectivo bróker"], 2) } : null,
    E.c.Otros ? { l: "Otros", v: eur(E.c.Otros, 2) } : null,
    E.deudas ? { l: "Deudas", v: eur(-E.deudas, 2) } : null,
  ]);
  const ult = P[P.length - 1], dAn = ult ? E.neto - ult.neto : 0;
  if (actual && Math.abs(dAn) >= 1) {  // por qué no coincide con lo que anotaste
    const n = p.createDiv({ cls: "fin-note" });
    // Si ese registro no llevaba el valor de tu inversión (la diste de alta después), la diferencia no es «lo que ha cambiado»: es tu inversión
    const sinInversion = !Object.keys(ult.valores || {}).length && invMercado > 0;
    n.appendText(sinInversion
      ? `Anotaste ${eur(ult.neto, 2)} en tus cuentas el ${ult.fecha.toFormat("dd/MM")}; tu inversión (${eur(invMercado, 2)}) no estaba en ese registro. `
      : `Anotaste ${eur(ult.neto, 2)} el ${ult.fecha.toFormat("dd/MM")}; desde entonces ${eurS(dAn, 2)} por los movimientos y el cambio de valor de tu inversión. `);
    enlace(n, "Anotar saldos de hoy →", "#cerrar");
  }
  enlace(p.createDiv({ cls: "fin-note" }), "Tus metas de patrimonio →", "#inversion");
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
  if (P.length > 4) p.dataset.resumen = "si";
  for (const m of P.slice(0, 4)) item(l, { fecha: m.fecha, t: m.concepto, s: m.categoria, v: (m.clase === "ingreso" ? "+" : "−") + eur(m.importe, 2), ruta: m.p && m.p.id ? `#editar/recurrente/${m.p.id}` : null });
  const tot = sum(P.map((m) => (m.clase === "ingreso" ? m.importe : -m.importe)));
  p.createDiv({ cls: "fin-note", text: `${P.length > 4 ? `y ${P.length - 4} más · ` : ""}En total ${eurS(tot, 2)} en los próximos 30 días` });
}

const objetivosActivos = () => objetivos().filter((o) => o.estado !== "conseguido" && o.meta > 0);
const recordatoriosCercanos = () => recordatorios().filter((r) => r.estado !== "hecho" && r.estado !== "hecha" && r.fecha >= hoy.startOf("day") && r.fecha <= hoy.plus({ days: Math.max(30, r.avisar) }).endOf("day")).sort((a, b) => a.fecha - b.fecha);
// Tus metas de ahorro con su progreso y lo que vence pronto (renta, seguros, ITV…)
function tarjetaObjetivos(p) {
  p.id = "inicio-metas";
  if (objetivosActivos().length > 3 || recordatoriosCercanos().length > 3) p.dataset.resumen = "si";
  for (const o of objetivosActivos().slice(0, 3)) {
    const f = Math.min(1, o.ahorrado / o.meta);
    const fila = p.createDiv({ cls: "fb-obj" });
    const cab = fila.createDiv({ cls: "fb-fila" });
    cab.createSpan({ cls: "fb-et", text: o.nombre });
    const alMes = ritmoObjetivo(o, hoy);
    cab.createSpan({ cls: "fin-note", text: `${eur(o.ahorrado, 2)} de ${eur(o.meta, 2)}${o.limite ? ` · para el ${o.limite.toFormat("dd/MM/yyyy")}` : ""}${alMes ? ` · ≈ ${eur(alMes, 2)} al mes` : ""}` });
    const b = fila.createDiv({ cls: "fb-barra fina" }); b.createDiv().style.width = `${(f * 100).toFixed(1)}%`;
  }
  const R = recordatoriosCercanos().slice(0, 3);
  if (R.length) {
    const l = p.createDiv({ cls: "fb-lista" });
    for (const r of R) {
      const el = item(l, { fecha: r.fecha, t: "", s: [r.texto, cuantoFalta(r.fecha, hoy), REPETIR[r.repetir]].filter(Boolean).join(" · ") });
      enlace(el.querySelector(".t"), r.nombre, `#editar/recordatorio/${r.p.id}`);
      botonHecho(el, r);
    }
  }
  // Lo que conviene hacer con lo que sobra en la cuenta del día a día va aquí, junto a la meta a la que apunta (no en los avisos).
  const PR = planReparto(), sug = PR && PR.acciones[0];
  if (sug && objetivosActivos().length) {
    const s = p.createDiv({ cls: "fb-sugiere" });
    s.createSpan({ cls: "ic", text: "→", attr: { "aria-hidden": "true" } });
    const t = s.createDiv();
    t.createEl("b", { text: sug.texto });
    if (sug.sub) t.createDiv({ cls: "fin-note", text: sug.sub });
  }
  p.createDiv({ cls: "fin-note", text: "Las metas no apartan dinero de tus cuentas: miden tu avance." });
}
// «Hecho»: un recordatorio que se repite pasa a su próxima fecha; el que no, queda como hecho (se cambia editándolo).
// p: el registro tal cual está guardado.
async function marcarHecho(p) {
  const sig = siguienteFecha(toDate(p.fecha), txt(p.repetir).toLowerCase(), hoy);
  const { id, file, ...datos } = p;
  const res = await FB.api("/api/guardar", { tipo: "recordatorio", id, datos: sig ? { ...datos, fecha: sig.toISODate(), estado: "pendiente" } : { ...datos, estado: "hecho" } });
  FB.aviso(res.ok ? (sig ? `Hecho ✓ · el próximo, el ${sig.toFormat("dd/MM/yyyy")}` : "Hecho ✓") : res.mensaje || "No se ha podido guardar", !res.ok);
  if (res.ok) await FB.refrescar();
}
function botonHecho(padre, r) {
  const b = padre.createEl("button", { cls: "fb-btn sec mini", text: "Hecho", attr: { type: "button", "aria-label": `Marcar como hecho: ${r.nombre}` } });
  b.onclick = () => marcarHecho(r.p);
  return b;
}
// Lo que tendrás en tus cuentas al acabar cada uno de los próximos 12 meses (prevision()), y cuándo toca fondo.
function tarjetaPrevision(p) {
  const F = prevision(), u = F.filas[F.filas.length - 1];
  const t = p.createDiv({ cls: "fb-total" });
  t.createDiv({ cls: "v", text: eur(u.saldo, 2) });
  t.createDiv({ cls: "s " + (u.saldo < 0 ? "neg" : ""), text: `en tus cuentas en ${mesLbl(u.key).toLowerCase()} · hoy ${eur(F.inicio, 2)}` });
  columnas(p, { alto: 150, etiquetas: F.filas.map((f) => mesCorto(f.key)), titulos: F.filas.map((f) => `${mesLbl(f.key)}: entra ${eur(f.ing, 2)}, sale ${eur(f.salidas, 2)}`),
    series: [{ nombre: "Al acabar el mes", color: (v) => (v < 0 ? "var(--rose)" : "var(--brand)"), valores: F.filas.map((f) => Math.round(f.saldo)) }] });
  if (F.minimo.saldo < F.inicio - 1) p.createDiv({ cls: "fin-note", text: `Lo más bajo: ${eur(F.minimo.saldo, 2)} en ${mesLbl(F.minimo.key).toLowerCase()}.` });
  const n = p.createDiv({ cls: "fin-note" });
  if (!hayIngresosFijos()) { n.appendText("Tus ingresos aún no están como fijos, así que aquí solo se ve lo que sale. "); enlace(n, "Detectar mis fijos →", "#fijos"); }
  else n.appendText(`Cuenta tus fijos, tus aportaciones y ${eur(F.varEst, 2)} al mes de gasto variable (${F.fuenteVar}${isFinite(F.varReal) && limiteVar > 0 && Math.abs(F.varReal - limiteVar) >= 1 ? `; tu límite es ${eur(limiteVar, 2)}` : ""}).`
    + (F.sueltoEst >= 1 ? ` Y ${eur(F.sueltoEst, 2)} al mes de otros gastos fijos que no tienes dados de alta (${F.nMesesSuelto > 1 ? `tu media de los últimos ${F.nMesesSuelto} meses` : "lo del mes pasado"}).` : ""));
  tarjetaEscenarios(p);
}
// Prudente / normal / optimista (escenariosPrevision). Los porcentajes se cambian en un plegable y viven en FB.estado: no se guardan.
function tarjetaEscenarios(p0) {
  // Plegado: la cifra prudente ya se ve en «Lo que tus cuentas aguantan»; aquí está la tabla entera y los supuestos.
  const p = p0.createEl("details", { cls: "fb-escenarios-mas" });
  p.open = !!FB.estado.escenariosAbierto;
  p.addEventListener("toggle", () => { FB.estado.escenariosAbierto = p.open; });
  p.createEl("summary", { text: "Con tres supuestos: prudente, normal y optimista" });
  const caja = p.createDiv({ cls: "fb-escenarios", attr: { role: "region", "aria-label": "Tres escenarios de la previsión" } });
  const cuanto = (v, cero) => (v > 0 ? `un ${nf(v, 0, 0)} % más` : v < 0 ? `un ${nf(-v, 0, 0)} % menos` : cero);
  const pintar = () => {
    caja.empty();
    const S = escenariosPrevision(FB.estado.escenarios || {});
    caja.createDiv({ cls: "fin-note", text: "Para no fiarte de una sola cifra, la misma previsión con tres supuestos:" });
    // Una fila por escenario: el supuesto va debajo del nombre para que las dos cifras quepan en una tarjeta de un tercio.
    const t = caja.createEl("table", { cls: "fin-table fb-esc-tabla" });
    const hr = t.createEl("thead").createEl("tr");
    hr.createEl("th", { text: "Escenario", attr: { scope: "col" } });
    for (const c of [`En ${mesLbl(S[1].final.key).toLowerCase()}`, "Lo más bajo"]) hr.createEl("th", { text: c, cls: "num", attr: { scope: "col" } });
    const tb = t.createEl("tbody");
    for (const s of S) {
      const tr = tb.createEl("tr", { cls: s.id === "normal" ? "fb-normal" : "" });
      const n = tr.createEl("th", { attr: { scope: "row" } });
      n.createDiv({ cls: "t", text: s.nombre });
      n.createDiv({ cls: "s", text: s.id === "normal" ? "todo sigue igual" : `gastas ${cuanto(s.gasto, "lo de siempre")}, te entra ${cuanto(s.ingresos, "lo previsto")}` });
      tr.createEl("td", { cls: "num", text: eur(s.final.saldo, 2) });
      const m = tr.createEl("td", { cls: "num", text: eur(s.minimo.saldo, 2) });
      m.createEl("small", { text: ` en ${mesLbl(s.minimo.key).toLowerCase()}` });
    }
    caja.createDiv({ cls: "fin-note", text: "«Gastas» es tu gasto variable y los gastos fijos que no tienes dados de alta. Tus fijos y tus aportaciones no cambian: ya sabes cuánto son."
      + (hayIngresosFijos() ? "" : " Como tus ingresos aún no están como fijos, lo que te entra no cambia nada.") });
  };
  pintar();
  plegable(p, "Cambiar los supuestos", (cuerpo) => {
    cuerpo.createDiv({ cls: "fin-note", text: "Solo mientras miras: al cerrar la app vuelven a los de serie. Pon + para más y − para menos." });
    const campos = [];
    for (const [id, nombre] of [["prudente", "Prudente"], ["optimista", "Optimista"]]) for (const [k, t] of [["gasto", "lo que gastas"], ["ingresos", "lo que te entra"]]) {
      const fila = cuerpo.createDiv({ cls: "fb-fila fb-aportar" });
      const idInp = `fb-esc-${id}-${k}`;
      fila.createEl("label", { text: `${nombre}: ${t}`, attr: { for: idInp } });
      const inp = fila.createEl("input", { cls: "corto", attr: { id: idInp, type: "number", step: "1", min: "-90", max: "100", inputmode: "numeric" } });
      fila.createSpan({ text: "%" });
      inp.value = String(((FB.estado.escenarios || {})[id] || {})[k] ?? ESCENARIOS[id][k]);
      inp.onchange = () => {
        const v = Math.round(num(inp.value));
        if (!isFinite(v) || v < -90 || v > 100) { FB.aviso("Pon un porcentaje entre −90 y 100", true); return; }
        const E = FB.estado.escenarios = { ...(FB.estado.escenarios || {}) };
        E[id] = { ...(E[id] || {}), [k]: v };
        pintar();
      };
      campos.push([inp, id, k]);
    }
    const b = cuerpo.createEl("button", { cls: "fb-btn sec mini", text: "Volver a los de serie", attr: { type: "button" } });
    b.onclick = () => { FB.estado.escenarios = null; for (const [inp, id, k] of campos) inp.value = String(ESCENARIOS[id][k]); pintar(); };
  });
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
// Lo que añaden la divisa (B-018), «a medias» (B-063) y las etiquetas (B-064) al subtítulo de una fila de la lista.
const extrasMov = (m) => {
  const p = m.p || {}, x = [];
  if (p.divisa && hasNum(p.importe_divisa)) x.push(`${nf(num(p.importe_divisa), 2, 2)} ${p.divisa}`);
  if (m.medias) x.push(`a medias: tu parte ${eur(m.medias.miParte)} · ${m.medias.pendiente > 0.005 ? `te deben ${eur(m.medias.pendiente)}` : "ya cobrado"}`);
  if (Array.isArray(p.etiquetas) && p.etiquetas.length) x.push(`🏷️ ${p.etiquetas.join(", ")}`);
  return x.map((t) => " · " + t).join("");
};
function vistaMovimientos() {
  if (FB.estado.restaurarMovimientos) {
    const v = FB.estado.restaurarMovimientos;
    Object.assign(FB.estado, v.estado);
    busqueda = v.busqueda; filtroCat = v.filtroCat; mes = v.mes;
    delete FB.estado.restaurarMovimientos;
  }
  const modo = params[0] === "lista" || filtroCat ? "lista" : "categorias";  // de primeras, por categoría; con una categoría elegida, su lista
  cabecera("Movimientos", true, modo === "lista" ? "Pulsa un movimiento para verlo o cambiarlo; la categoría se cambia en su propia fila." : "Lo que ha entrado y salido, por categoría. Pulsa una para ver sus movimientos.");
  const notaMov = root.createDiv({ cls: "fin-note" });
  enlace(notaMov, "+ Apuntar un gasto a mano", "#apuntar");
  notaMov.appendText(" · ");
  enlace(notaMov, "Mi año: el año entero comparado con el anterior →", "#anual");
  const M = finMes(mes);
  const g = root.createDiv({ cls: "fb-stats" });
  const st = (cls, ic, l, v) => { const c = g.createDiv({ cls: "fb-stat " + cls }); c.createDiv({ cls: "ic", text: ic }); c.createDiv({ cls: "l", text: l }); c.createDiv({ cls: "v", text: v }); };
  st("entra", "↑", "Entró", eur(M.ingresos, 2));
  st("sale", "↓", "Salió", eur(M.gastos, 2));
  st("ahorro", "⚖️", "Ahorro del mes", eurS(M.ahorro, 2));
  const seg = root.createDiv({ cls: "fb-seg" });
  for (const [k, t, r] of [["categorias", "Por categoría", "#movimientos"], ["lista", "Lista", "#movimientos/lista"]]) { const l = enlace(seg, t, r); l.className += k === modo ? " act" : ""; if (k === "categorias") l.addEventListener("click", () => { filtroCat = null; guardarEstado({ filtroCat: null }); }); }
  if (modo === "categorias") {
    // El buscador también aquí: al escribir, abre la lista con lo que buscas (antes había que pulsar «Lista» primero)
    const bq = root.createDiv({ cls: "fb-filtros" }).createEl("input", { cls: "fin-search", attr: { type: "search", "aria-label": "Buscar movimientos", placeholder: "Buscar un concepto, comercio o importe…" } });
    bq.oninput = () => { if (!bq.value.trim()) return; guardarEstado({ busqueda: bq.value }); FB._buscar = true; FB.ir("#movimientos/lista"); };
    vistaPorCategoria(M);
    return;
  }

  // Un mes, su año entero o todo el historial (buscar un concepto mira en todo, salvo que hayas elegido el año)
  let todos = [], cats = [];
  const año = mes.slice(0, 4);
  const cargar = (todo) => {
    todos = (todo ? movimientos().filter((m) => !m.auto && !m.previsto && (todo !== "año" || keyDe(m.fecha).slice(0, 4) === año)) : [...M.ms]).sort((a, b) => b.fecha - a.fecha || (b.p.id || 0) - (a.p.id || 0));
    cats = [...new Set(todos.map((m) => (m.clase === "transferencia" ? "Entre tus cuentas" : m.categoria)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  };
  cargar(FB.estado.hist);
  const filtros = root.createDiv({ cls: "fb-filtros" });
  const inp = filtros.createEl("input", { cls: "fin-search", attr: { type: "search", "aria-label": "Buscar movimientos", placeholder: "Buscar un concepto, comercio o importe…" } });
  inp.value = busqueda;
  inp.addEventListener("focus", () => { const n = inp.value.length; inp.setSelectionRange(n, n); }, { once: true });  // al llegar escribiendo desde «Por categoría», se sigue al final
  const per = filtros.createDiv({ cls: "fb-seg mini" });
  for (const [k, t] of [[false, mesLbl(mes)], ["año", `Todo ${año}`], [true, "Todo el historial"]]) { const b = per.createEl("button", { text: t, cls: (FB.estado.hist || false) === k ? "act" : "", attr: { type: "button" } }); b.onclick = () => { FB.estado.hist = k; FB.estado.pagMov = 0; render(); }; }
  const sOrd = filtros.createEl("select", { attr: { "aria-label": "Ordenar los movimientos" } });
  for (const [k, t] of [["fecha", "Más recientes primero"], ["importe", "Mayor importe primero"]]) { const o = sOrd.createEl("option", { text: t }); o.value = k; }
  sOrd.value = FB.estado.ordenMov || "fecha";
  sOrd.onchange = () => { FB.estado.ordenMov = sOrd.value; FB.estado.pagMov = 0; pintar(); };
  // «Más filtros» (plegado): cuenta, importe (sin signo), etiqueta, lo que te deben y solo lo sin revisar. Viven en FB.estado: sobreviven a FB.refrescar().
  const MF = FB.estado.masFiltros = FB.estado.masFiltros || { cuenta: "", desde: "", hasta: "", sinRevisar: false, etiqueta: "", deben: false, abierto: false };
  const detF = root.createEl("details", { cls: "fin-more fb-masfiltros" });
  detF.open = !!MF.abierto;
  detF.addEventListener("toggle", () => { MF.abierto = detF.open; });
  const sumF = detF.createEl("summary");
  sumF.createSpan({ cls: "t", text: "Más filtros" });
  const resF = sumF.createSpan({ cls: "x" });
  const cuerpoF = detF.createDiv({ cls: "fin-more-body fb-masfiltros-cuerpo" });
  const campoF = (etq) => { const l = cuerpoF.createEl("label", { cls: "fb-campo" }); l.createSpan({ text: etq }); return l; };
  const selCta = campoF("Cuenta").createEl("select");
  for (const [v, t] of [["", "Todas las cuentas"], ...cuentas().map((c) => [String(c.nombre), c.nombre])]) { const o = selCta.createEl("option", { text: t }); o.value = v; }
  if (MF.cuenta && ![...selCta.options].some((o) => o.value === MF.cuenta)) { const o = selCta.createEl("option", { text: MF.cuenta }); o.value = MF.cuenta; }
  selCta.value = String(MF.cuenta || "");
  const inpDes = campoF("Importe desde (€, sin signo)").createEl("input", { attr: { type: "text", inputmode: "decimal", placeholder: "Sin tope" } });
  const inpHas = campoF("Importe hasta (€, sin signo)").createEl("input", { attr: { type: "text", inputmode: "decimal", placeholder: "Sin tope" } });
  inpDes.value = MF.desde; inpHas.value = MF.hasta;
  const selEtq = campoF("Etiqueta").createEl("select");
  for (const [v, t] of [["", "Todas las etiquetas"], ...etiquetasUsadas().map((e) => [e, e])]) { const o = selEtq.createEl("option", { text: t }); o.value = v; }
  if (MF.etiqueta && ![...selEtq.options].some((o) => o.value === MF.etiqueta)) { const o = selEtq.createEl("option", { text: MF.etiqueta }); o.value = MF.etiqueta; }
  selEtq.value = String(MF.etiqueta || "");
  const lDeb = cuerpoF.createEl("label", { cls: "fb-campo fb-campo-casilla" });
  const casDeben = lDeb.createEl("input", { attr: { type: "checkbox" } });
  casDeben.checked = !!MF.deben;
  lDeb.createSpan({ text: "Solo lo que te deben (gastos a medias)" });
  const lSin = cuerpoF.createEl("label", { cls: "fb-campo fb-campo-casilla" });
  const casSin = lSin.createEl("input", { attr: { type: "checkbox" } });
  casSin.checked = !!MF.sinRevisar;
  lSin.createSpan({ text: "Solo sin revisar" });
  const quitarF = cuerpoF.createEl("button", { cls: "fb-btn sec", text: "Quitar filtros", attr: { type: "button" } });
  const resumirF = () => { const n = filtrosMasActivos(MF); resF.textContent = n ? `${n} filtro${n > 1 ? "s" : ""}` : ""; quitarF.disabled = !n; };
  const leerF = () => { Object.assign(MF, { cuenta: selCta.value, desde: inpDes.value, hasta: inpHas.value, sinRevisar: casSin.checked, etiqueta: selEtq.value, deben: casDeben.checked }); FB.estado.pagMov = 0; resumirF(); pintar(); };
  selCta.onchange = casSin.onchange = selEtq.onchange = casDeben.onchange = leerF; inpDes.oninput = inpHas.oninput = leerF;
  quitarF.onclick = () => { selCta.value = ""; inpDes.value = ""; inpHas.value = ""; casSin.checked = false; selEtq.value = ""; casDeben.checked = false; leerF(); };
  // «Filtros guardados» (plegado): búsqueda, categoría, periodo, orden y «Más filtros» con un nombre, para volver a ellos con un clic.
  // Van en config.filtros_movimientos (la lista entera, que valida el servidor).
  const detG = root.createEl("details", { cls: "fin-more fb-masfiltros fb-guardados" });
  detG.open = !!FB.estado.guardadosAbierto;
  detG.addEventListener("toggle", () => { FB.estado.guardadosAbierto = detG.open; });
  const sumG = detG.createEl("summary");
  sumG.createSpan({ cls: "t", text: "Filtros guardados" });
  const cuerpoG = detG.createDiv({ cls: "fin-more-body fb-guardados-cuerpo" });
  const guardados = () => (DB.config || {}).filtros_movimientos || [];
  sumG.createSpan({ cls: "x", text: guardados().length ? `${guardados().length}` : "" });
  const guardarLista = async (lista, msg, previa) => {
    const r = await FB.api("/api/config/filtros_movimientos", { lista });
    if (!r.ok) { FB.aviso(r.mensaje || "No se han podido guardar los filtros", true); return; }
    guardarEstado({ filtroCat, busqueda: inp.value });  // la lista se vuelve a pintar con lo mismo que tenías puesto
    await FB.refrescar();
    FB.aviso(msg, false, previa ? { texto: "Volver a ponerlo", fn: async () => { await FB.api("/api/config/filtros_movimientos", { lista: previa }); guardarEstado({ filtroCat, busqueda: inp.value }); await FB.refrescar(); } } : undefined);
  };
  const aplicarG = (f) => {
    const v = vistaDeFiltro(f);
    busqueda = v.busqueda; filtroCat = v.categoria; FB.estado.hist = v.hist; FB.estado.ordenMov = v.orden;
    Object.assign(MF, v.mf); FB.estado.pagMov = 0;
    render();
  };
  const filaG = (f, i) => {
    const fila = cuerpoG.createDiv({ cls: "fb-guardado" });
    const ap = fila.createEl("button", { cls: "fb-btn sec aplicar", attr: { type: "button", "aria-label": `Aplicar el filtro «${f.nombre}»` } });
    ap.createEl("b", { text: f.nombre });
    ap.createSpan({ cls: "fin-note", text: resumenFiltro(f) || "Sin filtros: todo el mes" });
    ap.onclick = () => aplicarG(f);
    const ren = fila.createEl("button", { cls: "fb-btn sec", text: "Renombrar", attr: { type: "button", "aria-label": `Renombrar el filtro «${f.nombre}»` } });
    ren.onclick = async () => {
      const n = await pedirTexto("Escribe el nombre nuevo.", "Nombre del filtro", { titulo: "Renombrar el filtro", si: "Renombrar", valor: f.nombre });
      if (n == null) return;
      const R = filtrosConNombre(guardados(), i, n);
      if (R.error) { FB.aviso(R.error, true); return; }
      await guardarLista(R.lista, "Nombre cambiado ✓");
    };
    const bor = fila.createEl("button", { cls: "fb-btn sec peligro", text: "Borrar", attr: { type: "button", "aria-label": `Borrar el filtro «${f.nombre}»` } });
    bor.onclick = async () => {
      if (!(await confirmar(`Se borra «${f.nombre}» de tus filtros guardados. Tus movimientos no se tocan.`, { titulo: "¿Borrar este filtro?", si: "Borrar", peligro: true }))) return;
      await guardarLista(filtrosSin(guardados(), i), `Filtro «${f.nombre}» borrado`, guardados());
    };
  };
  if (!guardados().length) cuerpoG.createDiv({ cls: "fin-note", text: "Aún no has guardado ninguno. Pon los filtros que quieras (búsqueda, categoría, periodo, «Más filtros»…) y pulsa «Guardar este filtro»." });
  guardados().forEach(filaG);
  const guardarG = cuerpoG.createEl("button", { cls: "fb-btn", text: "Guardar este filtro", attr: { type: "button" } });
  guardarG.onclick = async () => {
    const f = filtroDeVista({ busqueda: inp.value, categoria: filtroCat, hist: FB.estado.hist, orden: FB.estado.ordenMov, mf: MF });
    const que = resumenFiltro(f);
    if (!que) { FB.aviso("Ahora mismo no hay ningún filtro puesto: escribe una búsqueda, elige una categoría o abre «Más filtros».", true); return; }
    const nombre = await pedirTexto(`Ponle un nombre para encontrarlo después.\n\nSe guarda lo que tienes puesto: ${que}.`, "Nombre del filtro", { titulo: "Guardar este filtro", si: "Guardar" });
    if (nombre == null) return;
    const R = filtrosConGuardado(guardados(), nombre, f);
    if (R.error) { FB.aviso(R.error, true); return; }
    if (R.sustituye && !(await confirmar(`Ya tienes un filtro que se llama «${nombre.trim()}». ¿Lo sustituyo por este?`, { titulo: "¿Sustituirlo?", si: "Sustituir" }))) return;
    FB.estado.guardadosAbierto = true;
    await guardarLista(R.lista, `Filtro «${nombre.trim()}» guardado ✓`);
  };
  const chips = root.createDiv({ cls: "fb-chips" });
  const total = root.createDiv({ cls: "fin-note" });
  const bloque = root.createDiv({ cls: "fb-bloque", attr: { role: "region", "aria-label": "Cambiar la categoría de los elegidos" } });
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
  const entero = new Map();  // movimiento dividido → su importe entero (la suma de sus partes)
  for (const r of registros("movimiento")) if (r.parte_de) entero.set(r.parte_de, (entero.get(r.parte_de) || 0) + num(r.importe));
  const devuelto = new Map();  // gasto → lo que te han devuelto de él (Bizums enlazados)
  for (const r of registros("movimiento")) if (r.reembolsa) devuelto.set(r.reembolsa, (devuelto.get(r.reembolsa) || 0) + num(r.importe));
  // Cambiar la categoría sin abrir la ficha: en la fila (uno) o a los elegidos con las casillas (varios). Se puede deshacer.
  const conCategoria = (m) => !m.pendiente && !m.auto && !m.previsto && m.p && m.p.id && ["gasto", "ingreso", "reembolso"].includes(m.clase);
  const elegidos = new Set();
  let paginaIds = [];
  const cambiarCat = async (ids, cat, ctrl) => {
    ctrl.disabled = true;
    const r = await FB.api("/api/movimiento/categoria", { ids, categoria: cat });
    if (!r.ok) { ctrl.disabled = false; FB.aviso(r.mensaje || "No se ha podido cambiar la categoría", true); pintar(); return; }
    guardarEstado({ filtroCat, busqueda });  // que la lista siga con el mismo filtro y la misma búsqueda
    await FB.refrescar();
    FB.aviso(r.mensaje + " ✓", false, { texto: "Deshacer", fn: async () => { await FB.api("/api/deshacer", {}); guardarEstado({ filtroCat, busqueda }); await FB.refrescar(); } });
  };
  const pintarBloque = () => {
    bloque.innerHTML = "";
    const sel = todos.filter((m) => m.p && elegidos.has(m.p.id));
    bloque.style.display = sel.length ? "" : "none";
    if (!sel.length) return;
    bloque.createEl("b", { text: `${sel.length} elegido${sel.length > 1 ? "s" : ""}` });
    const grupos = new Set(sel.map((m) => (m.clase === "ingreso" ? "ingreso" : "gasto")));
    if (grupos.size > 1) {
      bloque.createSpan({ cls: "fin-note", text: "Has elegido gastos e ingresos, que no comparten categorías: deja solo unos u otros." });
    } else {
      const s = bloque.createEl("select", { attr: { "aria-label": "Nueva categoría para los elegidos" } });
      const o0 = s.createEl("option", { text: "Pasarlos a…" }); o0.value = "";
      for (const [v, t] of catSegunClase({ clase: [...grupos][0] })) { const o = s.createEl("option", { text: t }); o.value = String(v); }
      const b = bloque.createEl("button", { cls: "fb-btn", text: "Cambiar la categoría", attr: { type: "button" } });
      b.onclick = () => { if (!s.value) { FB.aviso("Elige a qué categoría pasarlos", true); s.focus(); return; } cambiarCat(sel.map((m) => m.p.id), s.value, b); };
    }
    const libres = paginaIds.filter((id) => !elegidos.has(id));
    if (libres.length) accion(bloque, "Elegir todos los de esta página", () => { for (const id of libres) elegidos.add(id); pintar(); });
    accion(bloque, "Quitar la selección", () => { elegidos.clear(); pintar(); });
  };
  const pintar = () => {
    lista.innerHTML = ""; pie.innerHTML = ""; total.textContent = "";
    const q = norm(inp.value.trim());
    if (q && !FB.estado.hist) { cargar(true); }  // buscar mira en todo el historial; sin búsqueda vuelve al mes
    else if (!q && !FB.estado.hist) cargar(false);
    const f = filtrarMas(todos, MF).filter((m) => (!filtroCat || (m.clase === "transferencia" ? "Entre tus cuentas" : m.categoria) === filtroCat)
      && (!q || norm(`${m.concepto} ${m.categoria} ${m.cuenta} ${m.p.ext_texto || ""} ${m.p.nota || ""} ${(m.p.etiquetas || []).join(" ")} ${m.p.divisa || ""} ${nf(m.importe, 2, 2)}`).includes(q)));
    for (const id of [...elegidos]) if (!f.some((m) => m.p && m.p.id === id)) elegidos.delete(id);  // lo elegido que ya no está a la vista no se cambia
    paginaIds = [];
    if (!f.length) {
      pintarBloque();
      if (!todos.length) { vacio(lista, "Sin movimientos este mes", " Importa el extracto de tu banco o apunta uno a mano."); return; }
      // Qué es lo que no encuentra y una salida de un clic (antes solo decía «Nada coincide»)
      const que = [q ? `«${inp.value.trim()}»` : "", filtroCat ? `la categoría ${filtroCat}` : "", filtrosMasActivos(MF) ? "lo elegido en «Más filtros»" : ""].filter(Boolean);
      vacio(lista, "Nada coincide", que.length ? ` No hay movimientos con ${que.join(" y ")}${q && !FB.estado.hist ? " en todo el historial" : FB.estado.hist === "año" ? ` en ${año}` : FB.estado.hist ? "" : ` en ${mesLbl(mes).toLowerCase()}`}.` : "");
      const bq = lista.querySelector(".fin-empty").createEl("button", { cls: "fb-btn sec", text: "Quitar la búsqueda y los filtros", attr: { type: "button" } });
      bq.onclick = () => { inp.value = ""; busqueda = ""; filtroCat = null; pintarChips(); quitarF.onclick(); inp.focus(); };
      return;
    }
    const neto = sum(f.map((x) => (x.clase === "ingreso" || x.clase === "reembolso" ? x.importe : x.clase === "gasto" ? -x.importe : 0)));
    const deben = sum(f.map((x) => (x.medias ? x.medias.pendiente : 0)));  // lo que te deben de los gastos a medias que se ven
    total.textContent = `${f.length} movimiento${f.length > 1 ? "s" : ""}${q && !FB.estado.hist ? " en todo el historial" : FB.estado.hist === "año" ? ` en ${año}` : ""} · ${eurS(neto, 2)} en total (sin contar traspasos)${deben > 0.005 ? ` · te deben ${eur(deben, 2)} de gastos a medias` : ""}`;
    const porImporte = FB.estado.ordenMov === "importe";  // de mayor a menor, sin agrupar por días: la fecha va en cada fila
    if (porImporte) f.sort((a, b) => b.importe - a.importe);
    let dia = null, cont = porImporte ? lista.createDiv({ cls: "fb-lista" }) : null;
    const paginas = Math.ceil(f.length / POR_PAGINA), pag = Math.min(FB.estado.pagMov || 0, paginas - 1);
    for (const m of f.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA)) {
      const k = m.fecha.toISODate();
      if (!porImporte && k !== dia) {
        dia = k;
        const d = lista.createDiv({ cls: "fb-dia" });
        const cab = d.createDiv({ cls: "cab" });
        cab.createSpan({ text: m.fecha.setLocale("es").toFormat("cccc d 'de' LLLL") });
        const neto = sum(f.filter((x) => x.fecha.toISODate() === k).map((x) => (x.clase === "ingreso" || x.clase === "reembolso" ? x.importe : x.clase === "gasto" ? -x.importe : 0)));
        cab.createSpan({ text: eurS(neto, 2) });
        cont = d.createDiv({ cls: "fb-lista" });
      }
      const entra = m.clase === "ingreso" || m.clase === "reembolso";
      const signo = m.clase === "transferencia" ? (m.origen ? "+" : "−") : entra ? "+" : "−";
      const sub = m.clase === "transferencia" ? `Entre tus cuentas ${m.destino ? "→ " + m.destino : m.origen ? "← " + m.origen : ""}` : `${m.categoria}${m.clase === "reembolso" ? " · te lo devolvieron" : ""}${devuelto.has(m.p.id) ? ` · te devolvieron ${eur(devuelto.get(m.p.id))}` : ""}`;
      const fila = {
        av: { cat: m.clase === "transferencia" ? null : m.categoria, clase: m.clase }, t: m.concepto,
        s: `${porImporte ? fechaCorta(k) + " · " : ""}${sub}${extrasMov(m)}${cuentas().length > 1 ? " · " + m.cuenta : ""}${m.auto ? " · previsto" : ""}${m.pendiente ? " · sin revisar" : ""}${m.p && m.p.parte_de ? ` · parte de ${eur(entero.get(m.p.parte_de) || m.importe)}` : ""}${m.p && m.p.nota ? ` · «${m.p.nota}»` : ""}`,
        v: signo + eur(m.importe), pos: entra, prev: m.auto || m.previsto,
        ruta: m.pendiente ? "#revisar" : m.auto ? (m.p.id ? `#editar/recurrente/${m.p.id}` : null) : `#editar/movimiento/${m.p.id}`,
        onclick: m.pendiente ? () => {
          FB.estado.revisarMovimiento = m.p.id;
          FB.estado.volverMovimientos = { ruta: "#movimientos/lista", mes, busqueda: inp.value, filtroCat,
            estado: { hist: FB.estado.hist, ordenMov: FB.estado.ordenMov, masFiltros: { ...MF }, pagMov: FB.estado.pagMov } };
        } : undefined,
      };
      const w = cont.createDiv({ cls: "fb-mov" });
      if (!conCategoria(m)) {  // traspasos, previstos y dudas: sin casilla ni categoría, con su hueco para que los importes cuadren
        w.createSpan({ cls: "hueco", attr: { "aria-hidden": "true" } }); item(w, fila); w.createSpan({ cls: "hueco cat", attr: { "aria-hidden": "true" } });
        continue;
      }
      // La categoría se cambia en la propia fila; la casilla, para cambiar varios a la vez (las partes de un dividido, no)
      const marca = w.createEl("input", { attr: { type: "checkbox", "aria-label": `Elegir «${m.concepto}» para cambiar varios a la vez` } });
      if (m.p.parte_de) { marca.disabled = true; marca.title = "Es una parte de un movimiento dividido: su categoría se cambia una a una, en su fila"; }
      else paginaIds.push(m.p.id);
      marca.checked = elegidos.has(m.p.id);
      marca.onchange = () => { if (marca.checked) elegidos.add(m.p.id); else elegidos.delete(m.p.id); pintarBloque(); };
      item(w, fila);
      const sel = w.createEl("select", { cls: "fb-mov-cat", attr: { "aria-label": `Categoría de «${m.concepto}»` } });
      const opc = catSegunClase({ clase: m.clase === "ingreso" ? "ingreso" : "gasto", categoria: m.categoria });
      if (!opc.some(([v]) => v === m.categoria)) { const o = sel.createEl("option", { text: m.categoria || "Sin categoría" }); o.value = String(m.categoria || ""); }
      for (const [v, t] of opc) { const o = sel.createEl("option", { text: t }); o.value = String(v); }
      sel.value = String(m.categoria || "");
      sel.onchange = () => cambiarCat([m.p.id], sel.value, sel);
    }
    pintarBloque();
    if (paginas > 1) {  // paginación: la lista larga se corta en páginas de 40
      const ir = (n) => { FB.estado.pagMov = n; pintar(); window.scrollTo(0, 0); };
      const a = pie.createEl("button", { cls: "fb-btn sec", text: "← Anterior" }); a.disabled = pag === 0; a.onclick = () => ir(pag - 1);
      pie.createSpan({ cls: "fin-note", text: `${pag * POR_PAGINA + 1}–${Math.min(f.length, (pag + 1) * POR_PAGINA)} de ${f.length} · página ${pag + 1} de ${paginas}` });
      const s = pie.createEl("button", { cls: "fb-btn sec", text: "Siguiente →" }); s.disabled = pag >= paginas - 1; s.onclick = () => ir(pag + 1);
    }
  };
  inp.oninput = () => { busqueda = inp.value; FB.estado.pagMov = 0; pintar(); };
  resumirF(); pintarChips(); pintar();
}

// Gasto del mes por categoría (variable y fijo) frente a tu media y tu presupuesto; ingresos por categoría.
function vistaPorCategoria(M) {
  const C = resumenCategorias(mes);
  const abrirCat = (n) => () => { filtroCat = n; guardarEstado({ filtroCat: n }); FB.ir("#movimientos/lista"); };
  if (!C.length) { vacio(root, "Sin gastos este mes", " Importa el extracto de tu banco o cambia de mes."); return; }
  const g = root.createDiv({ cls: "fin-grid dos" });
  for (const [grupo, tit] of [["variable", "Gasto variable"], ["fijo", "Gastos fijos"]]) {
    const cs = C.filter((c) => (c.grupo === "fijo") === (grupo === "fijo"));
    if (!cs.length) continue;
    const suma = sum(cs.map((c) => c.valor));  // el % de cada fila es sobre esta cifra, que es la que se ve en la cabecera
    const p = panel(g, tit, { text: eur(suma, 2) });
    const l = p.createDiv({ cls: "fb-lista" });
    for (const c of cs) filaCategoria(l, c, suma, abrirCat(c.nombre));
  }
  const ing = new Map();
  for (const m of M.real.filter((m) => m.clase === "ingreso")) ing.set(m.categoria, (ing.get(m.categoria) || 0) + m.importe);
  if (ing.size) {
    const p = panel(g, "Ingresos", { text: eur(M.ingresos, 2) });
    const l = p.createDiv({ cls: "fb-lista" });
    for (const [n, v] of [...ing].sort((a, b) => b[1] - a[1])) item(l, { av: { cat: n, sm: true }, t: n, s: ing.size > 1 ? pct(v / M.ingresos) : "", v: eur(v, 2), pos: true, onclick: abrirCat(n) });
  }
  // «Salió» es el gasto menos lo que te devolvieron; una devolución de un gasto de otro mes deja su categoría en negativo y no sale en las listas
  const dev = [...gastoPorCategoria(mes)].filter(([, v]) => v < -0.005);
  if (dev.length) {
    const totalDev = -sum(dev.map(([, v]) => v));
    root.createDiv({ cls: "fin-note", text: `Salió ${eur(M.gastos, 2)} = ${eur(M.gastos + totalDev, 2)} de gasto − ${eur(totalDev, 2)} que te han devuelto de gastos de otros meses (${dev.map(([n, v]) => `${n} ${eur(-v, 2)}`).join(", ")}).` });
  }
  const nota = root.createDiv({ cls: "fin-note" });
  nota.appendText("¿Quieres un tope para una categoría? ");
  enlace(nota, "Ponle un presupuesto →", "#gestionar/categoria");
}

// Pantallas antiguas → las nuevas (enlaces guardados y avisos).
const VISTAS = { inicio: vistaInicio, resumen: vistaInicio, movimientos: vistaMovimientos, gastos: vistaMovimientos,
  prevision: vistaInicio, patrimonio: vistaInicio, inversion: vistaInversion };

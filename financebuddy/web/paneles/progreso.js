// ═════════════ pantalla «Tu progreso» ═════════════
// Hacia dónde vas: los hitos de tu patrimonio, una proyección con tus propios números («Si sigo así…»), cuánto de lo que
// ha crecido tu inversión lo has puesto tú y cuánto el mercado, y la rentabilidad por año. Todo sale de los registros de
// saldos y de las aportaciones: sin conexión a nada.
function vistaProgreso() {
  cabecera("Tu progreso", false, "Hitos, hacia dónde vas y cuánto ha puesto cada parte: tú y el mercado");
  const E = estimacion();
  if (!E) {
    vacio(root, "Aún no hay saldos", " Anota cuánto tienes en cada cuenta y aquí verás tu progreso.");
    enlace(root.createDiv({ cls: "fin-note" }), "Anotar saldos →", "#cerrar");
    return;
  }
  const I = resumenInversion();
  const P = patrimonio();
  // Lo que metes al mes: la media desde el primer mes con compras (como mucho, el último año)
  const apoMedia = (() => { const m = aportacionesMes(12), i = m.findIndex((x) => x.compras || x.ventas); return i < 0 ? 0 : sum(m.map((x) => x.compras - x.ventas)) / (m.length - i); })();
  const rentPropia = isFinite(I.tir) && !I.tirCorta ? Math.min(0.05, Math.max(0, I.tir)) : 0.05;
  const pts = puntosInversion(P, aportacionesReales(), I.total, hoy);
  const R = pts.length >= 3 ? rendimientoPuntos(pts) : null;

  tiles(root, [
    { l: "Tu patrimonio hoy", v: eur(E.neto, 0), s: "estimado hoy" },
    { l: "Metes al mes", v: eur(Math.max(0, apoMedia), 0), s: "de media en tu inversión, el último año" },
    R && R.peor ? { l: "Peor caída", v: pct(R.peor.caida, true), t: "neg", s: `de ${mesLbl(R.peor.desde).toLowerCase()} a ${mesLbl(R.peor.hasta).toLowerCase()}` } : null,
    constancia() ? { l: "Racha", v: `${constancia()} mes${constancia() > 1 ? "es" : ""}`, s: "aportando sin fallar" } : null,
  ]);

  panelHitos(panel(root, "Hitos", null, "Las cifras redondas que tu patrimonio ha ido cruzando. La fecha es la del primer registro de saldos que lo supera."), P, E.neto, apoMedia, rentPropia);
  panelProyeccion(panel(root, "Si sigo así…", null, "Una proyección orientativa con rentabilidad y aportación constantes. No es una promesa ni un consejo: sin impuestos ni inflación."), E.neto, apoMedia, rentPropia, isFinite(I.tir) && !I.tirCorta ? I.tir : NaN, I.total);
  panelEsfuerzoMercado(panel(root, "Tu inversión, mes a mes", null, "De lo que cambia cada mes el valor de tu inversión: lo que has puesto tú (compras menos ventas) y lo que ha subido o bajado el mercado."), pts);
  panelComparador(panel(root, "¿Y si lo hubieras metido en un indexado?", null, "Tus mismas compras y ventas, en las mismas fechas, en un ETF indexado o en dinero sin riesgo: lo que habría pasado, no lo que pasará."), I);
  if (R) panelAños(panel(root, "Rentabilidad por año", null, "Lo que ha rendido tu inversión cada año natural, sin el efecto de cuándo metiste el dinero (rentabilidad encadenada mes a mes con tus valores anotados)."), R);
}

// Los hitos tal cual, para otras pantallas (Inversión): mismos cálculos que en «Tu progreso».
function hitosEnPantalla(padre) {
  const E = estimacion();
  if (!E) return;
  const I = resumenInversion(), P = patrimonio();
  const m = aportacionesMes(12), i = m.findIndex((x) => x.compras || x.ventas);
  const apo = i < 0 ? 0 : sum(m.map((x) => x.compras - x.ventas)) / (m.length - i);
  const rent = isFinite(I.tir) && !I.tirCorta ? Math.min(0.05, Math.max(0, I.tir)) : 0.05;
  panelHitos(panel(padre, "Hitos", { text: "Tu progreso", ruta: "#progreso" }, "Las cifras redondas que tu patrimonio ha ido cruzando. La fecha es la del primer registro de saldos que lo supera."), P, E.neto, apo, rent);
}

// Chips de hitos y la barra hacia el siguiente, con cuánto tardarías al ritmo actual.
function panelHitos(p, P, neto, apo, rent) {
  const H = hitosPatrimonio(P.map((x) => ({ fecha: x.fecha, neto: x.neto })), neto, hoy);
  const fila = p.createDiv({ cls: "fb-hitos" });
  for (const h of H.logrados.filter((x) => !x.inicial).slice(-5)) {  // los que ya tenías al empezar no se celebran
    const c = fila.createDiv({ cls: "h ok" });
    c.createDiv({ cls: "v", text: `✓ ${compactoEur(h.valor)}` });
    c.createDiv({ cls: "s", text: h.hoy ? "ya, según tu estimación de hoy" : h.fecha.setLocale("es").toFormat("LLL yyyy").replace(".", "") });
  }
  for (const h of H.proximos) {
    const c = fila.createDiv({ cls: "h" });
    c.createDiv({ cls: "v", text: compactoEur(h.valor) });
    c.createDiv({ cls: "s", text: `faltan ${eur(h.falta, 0)}` });
  }
  if (!H.siguiente) { p.createDiv({ cls: "fin-note", text: "Has superado todos los hitos de la lista. 🎉" }); return; }
  const previo = H.logrados.length ? H.logrados[H.logrados.length - 1].valor : 0;
  const frac = Math.max(0, Math.min(1, (neto - previo) / (H.siguiente - previo)));
  p.createDiv({ cls: "fin-note", text: `Próximo: ${compactoEur(H.siguiente)} · llevas el ${nf(frac * 100, 0, 0)} % del camino desde ${compactoEur(previo) || "0"}.` });
  const b = p.createDiv({ cls: "fb-barra fina" }); b.createDiv().style.width = `${(frac * 100).toFixed(1)}%`;
  const m = mesesHasta50(neto, apo, rent, H.siguiente);
  if (m != null && m > 0) {
    const cuando = hoy.plus({ months: m }).setLocale("es").toFormat("LLLL yyyy");
    p.createDiv({ cls: "fin-note", text: `Al ritmo de ${eur(Math.max(0, apo), 0)} al mes y un ${nf(rent * 100, 0, 1)} % anual, lo alcanzarías hacia ${cuando} (${m < 24 ? `${m} meses` : `${nf(m / 12, 0, 1)} años`}). Orientativo.` });
  } else if (m == null) p.createDiv({ cls: "fin-note", text: "Con ese ritmo no se llega en 50 años: sube la aportación en «Si sigo así…» para ver qué haría falta." });
}
const compactoEur = (v) => (v >= 1e6 ? `${nf(v / 1e6, 0, 1)} M€` : v >= 1000 ? `${nf(v / 1000, 0, 1)} k€` : `${nf(v, 0, 0)} €`);

// Tres deslizadores (años, rentabilidad, aportación mensual) y la curva resultante frente a lo que habrías aportado.
function panelProyeccion(p, neto, apoMedia, rentPropia, tirReal, invertido) {
  const inv = Math.max(0, Math.min(neto, invertido || 0)), resto = neto - inv;  // la rentabilidad solo se aplica a lo invertido; el resto (cuentas) se queda igual
  const S = (FB.estado.proy = FB.estado.proy || { años: 15, rent: Math.round(rentPropia * 1000) / 10, apo: Math.max(0, Math.round(apoMedia / 50) * 50) });
  const cont = p.createDiv();
  const salida = p.createDiv({ cls: "fin-note fb-proy-res" });
  const grafico = p.createDiv();
  const pintar = () => {
    const R = proyeccion(inv, S.apo, S.rent / 100, S.años);
    for (const k of ["valor", "aportado"]) R[k] = R[k].map((x) => x + resto);
    R.final += resto; R.aportadoFinal += resto;
    const redondeo = (v) => { const u = v >= 20000 ? 1000 : 500; return Math.round(v / u) * u; };
    const bajo = proyeccion(inv, S.apo, Math.max(0, S.rent - 2) / 100, S.años).final + resto, alto = proyeccion(inv, S.apo, (S.rent + 2) / 100, S.años).final + resto;
    salida.empty();
    salida.appendText(`Partiendo de ${eur(neto, 0)}, en `);
    salida.createEl("b", { text: `${S.años} años` }); salida.appendText(" tendrías entre ");
    salida.createEl("b", { text: `${eur(redondeo(bajo), 0)} y ${eur(redondeo(alto), 0)}` });
    salida.appendText(` (con ${nf(S.rent, 0, 1)} % ± 2 puntos) · habrías aportado ${eur(redondeo(R.aportadoFinal), 0)}. Orientativo: la rentabilidad real es incierta.`);
    grafico.empty();
    const etq = R.valor.map((_, i) => String(hoy.year + i));
    const paso = Math.max(1, Math.ceil(etq.length / 7));
    lineas(grafico, { etiquetas: etq, etiquetasX: etq, marcas: etq.map((_, i) => i).filter((i) => i % paso === 0 || i === etq.length - 1),
      series: [{ nombre: "Tendrías", color: "var(--brand)", valores: R.valor, area: true }, { nombre: "Lo que habrás aportado", color: "var(--ink-3)", valores: R.aportado, discontinua: true }], alto: 190 });
    leyenda(grafico, [["Tendrías", "var(--brand)"], ["Lo que habrás aportado", "var(--ink-3)"]]);
  };
  deslizador(cont, { et: "Años", min: 1, max: 40, paso: 1, valor: S.años, fmt: (v) => `${v} años`, cambia: (v) => { S.años = v; pintar(); } });
  deslizador(cont, { et: "Rentabilidad anual", min: 0, max: 15, paso: 0.5, valor: S.rent, fmt: (v) => `${nf(v, 0, 1)} %`, cambia: (v) => { S.rent = v; pintar(); },
    pista: isFinite(tirReal) ? `Tu rentabilidad real (TIR) es ${nf(tirReal * 100, 0, 1)} %${tirReal > 0.1 || tirReal < 0 ? " · aquí se limita a entre 0 y 10 % por prudencia" : ""}` : "La bolsa mundial ha dado de media un 6–8 % anual a largo plazo, con mucha variación" });
  deslizador(cont, { et: "Aportación mensual", min: 0, max: Math.max(2000, Math.ceil((apoMedia * 2) / 100) * 100, S.apo), paso: 25, valor: S.apo, fmt: (v) => eur(v, 0), cambia: (v) => { S.apo = v; pintar(); },
    pista: apoMedia > 0 ? `De media has metido ${eur(apoMedia, 0)} al mes en el último año` : "" });
  pintar();
}
function deslizador(padre, { et, min, max, paso, valor, fmt, cambia, pista }) {
  const f = padre.createDiv({ cls: "fb-slider" });
  const cab = f.createDiv({ cls: "c" });
  cab.createSpan({ cls: "et", text: et });
  const v = cab.createSpan({ cls: "v", text: fmt(valor) });
  const i = f.createEl("input", { attr: { type: "range", min: String(min), max: String(max), step: String(paso), "aria-label": et } });
  i.value = String(valor);
  i.oninput = () => { const x = parseFloat(i.value); v.textContent = fmt(x); cambia(x); };
  if (pista) f.createDiv({ cls: "s", text: pista });
}

// Columnas por mes: lo que pusiste tú y lo que puso el mercado (verde si sube, rojo si baja).
function panelEsfuerzoMercado(p, pts) {
  const M = pts.filter((x) => x.aport != null).slice(-14);
  if (M.length < 2) { vacio(p, "Aún no hay meses para comparar", " Se completa cada vez que actualizas tus valores o cierras un mes."); return; }
  const tot = { aport: sum(M.map((x) => x.aport)), mercado: sum(M.map((x) => x.mercado)) };
  const t = p.createDiv({ cls: "fb-total" });
  t.createDiv({ cls: "v " + tone(tot.mercado), text: eurS(tot.mercado, 0) });
  t.createDiv({ cls: "s", text: `lo que ha puesto el mercado en ${M.length} meses · tú has puesto ${eur(tot.aport, 0)}` });
  const series = [{ nombre: "Tú (compras − ventas)", color: "var(--fin-s3)", valores: M.map((x) => x.aport) }, { nombre: "Mercado", color: (v) => (v >= 0 ? GOOD : BAD), valores: M.map((x) => x.mercado) }];
  columnas(p, { etiquetas: M.map((x) => mesCorto(x.key)), titulos: M.map((x) => mesLbl(x.key)), series, alto: 190 });
  leyenda(p, [["Tú", "var(--fin-s3)"], ["Mercado (sube / baja)", GOOD]]);
  plegable(p, "Ver la tabla mes a mes", (c) => {
    tabla(c, [{ t: "Mes" }, { t: "Valor al cierre", num: true }, { t: "Tú", num: true }, { t: "Mercado", num: true }, { t: "Rentab.", num: true, opt: true }],
      [...M].reverse().map((x) => [mesLbl(x.key), eur(x.valor, 0), eurS(x.aport, 0), { text: eurS(x.mercado, 0), cls: tone(x.mercado) }, { text: pct(x.r, true), cls: tone(x.r) }]));
    c.createDiv({ cls: "fin-note", text: "Se calcula con los valores que anotas al cerrar cada mes. Si un mes falta, el cambio se reparte entre los que sí tienes." });
  });
}

function panelAños(p, R) {
  if (!R.años.length) { vacio(p, "Sin años completos todavía"); return; }
  const filas = R.años.map((a) => [{ text: `${a.año}${a.meses < 12 ? " *" : ""}` }, { text: pct(a.r, true), cls: tone(a.r) }, `${a.meses} mes${a.meses > 1 ? "es" : ""}`]);
  tabla(p, [{ t: "Año" }, { t: "Rentabilidad", num: true }, { t: "Con datos de", num: true, opt: true }], filas);
  p.createDiv({ cls: "fin-note", text: `Desde que empezaste: ${pct(R.indice / 100 - 1, true)} encadenado${R.años.some((a) => a.meses < 12) ? " · * año incompleto" : ""}.` });
  if (R.peor) p.createDiv({ cls: "fin-note", text: `Peor caída: ${pct(R.peor.caida, true)} entre ${mesLbl(R.peor.desde).toLowerCase()} y ${mesLbl(R.peor.hasta).toLowerCase()}. Es lo que más ha bajado tu inversión desde un máximo, sin contar lo que metiste.` });
}

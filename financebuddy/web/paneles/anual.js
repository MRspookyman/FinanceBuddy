// ═════════════ pantalla «Mi año» ═════════════
// Lo que entró, salió y ahorraste en un año, mes a mes y por categoría, comparado con el año anterior; tu patrimonio de
// enero a diciembre y cómo fue tu inversión. Ingresos y gastos van por «tu mes» (keyDe); patrimonio e inversión, por mes natural.
// En el año en curso se compara con los mismos meses del año anterior, no con el año entero.
function vistaAnual() {
  cabecera("Mi año", false, "Lo que entró, salió y ahorraste, comparado con el año anterior");
  const bot = root.createDiv({ cls: "fb-filtros" });
  enlace(bot, "← Movimientos", "#movimientos").className = "fb-btn sec";
  // Imprimir o guardar como PDF: se abren los plegables (si no, sus tablas saldrían vacías) y se cierran al terminar
  const imprimir = bot.createEl("button", { text: "Imprimir / guardar como PDF", cls: "fb-btn sec", attr: { type: "button", title: "Abre el cuadro de impresión del navegador; elige «Guardar como PDF» para tener un archivo" } });
  imprimir.onclick = () => {
    const cerrados = [...root.querySelectorAll("details.fin-more:not([open])")];
    cerrados.forEach((d) => { d.open = true; });
    const fin = () => { cerrados.forEach((d) => { d.open = false; }); window.removeEventListener("afterprint", fin); };
    window.addEventListener("afterprint", fin);
    setTimeout(() => window.print(), 150);
  };
  const años = [...new Set(movimientos().filter((m) => !m.auto && !m.previsto).map((m) => Number(keyDe(m.fecha).slice(0, 4))))].sort((a, b) => b - a);
  if (!años.length) { vacio(root, "Aún no hay movimientos", " Cuando importes el extracto de tu banco, aquí verás el resumen de cada año.", { texto: "Importar el extracto", ruta: "#importar" }); return; }
  const añoHoy = Number(hoyKey.slice(0, 4));
  const año = FB.estado.añoAnual && años.includes(FB.estado.añoAnual) ? FB.estado.añoAnual : años[0];
  const seg = root.createDiv({ cls: "fb-chips", attr: { role: "group", "aria-label": "Año" } });
  for (const a of años) { const b = seg.createEl("button", { text: String(a), cls: a === año ? "act" : "", attr: { type: "button", "aria-pressed": String(a === año) } }); b.onclick = () => { FB.estado.añoAnual = a; FB.montar(); }; }

  const hasta = año === añoHoy ? hoyKey : `${año}-12`;
  const A = resumenAño(año, movimientos(), hasta), B = resumenAño(año - 1, movimientos(), `${año - 1}-${hasta.slice(5)}`);
  const enCurso = año === añoHoy && hasta < `${año}-12`;
  const tramo = enCurso ? `de enero a ${mesLbl(hasta).split(" ")[0].toLowerCase()}` : "el año entero";
  // Sin importes el año anterior (p. ej. solo traspasos), no hay con qué comparar: tarjetas, nota y tablas lo dicen igual
  const sinB = Math.abs(B.ingresos) < 0.5 && Math.abs(B.gastos) < 0.5;
  const hayB = B.meses > 0 && !sinB;
  // Pulsar un mes lleva a sus movimientos; una categoría, a los suyos de todo el año
  const verMes = (key) => () => { guardarEstado({ mes: key, filtroCat: null, hist: null }); FB.ir("#movimientos/lista"); };
  const verCat = (cat) => () => { guardarEstado({ mes: hasta, filtroCat: cat, hist: "año" }); FB.ir("#movimientos/lista"); };
  // «2025: 1.234 € (+5 %)»: la misma cifra del año anterior, en neutro (más gasto no es una pérdida)
  const frente = (a, b) => frenteAño(a, b, año - 1, B.meses > 0);
  // Un ahorro de céntimos se ve «0 €», no «+0 €» ni «−0 €»
  const ahorroTxt = (n) => eurS(Math.abs(n) < 0.5 ? 0 : n, 0);
  const ahorroCls = (n) => (n <= -0.5 ? "neg" : "");

  const g = root.createDiv({ cls: "fb-stats" });
  const st = (cls, l, v, s, t) => { const c = g.createDiv({ cls: "fb-stat " + cls }); c.createDiv({ cls: "l", text: l }); c.createDiv({ cls: "v " + (t || ""), text: v }); if (s) c.createDiv({ cls: "s", text: s }); };
  st("entra", "Entró", eur(A.ingresos, 0), frente(A.ingresos, B.ingresos));
  st("sale", "Salió", eur(A.gastos, 0), frente(A.gastos, B.gastos));
  st("ahorro", "Ahorraste", ahorroTxt(A.ahorro), [tasaAñoTexto(A), hayB ? `${año - 1}: ${ahorroTxt(B.ahorro)}` : B.meses > 0 ? `sin datos de ${año - 1}` : ""].filter(Boolean).join(" · "), ahorroCls(A.ahorro));
  root.createDiv({ cls: "fin-note", text: `${año}: ${A.meses} mes${A.meses === 1 ? "" : "es"} con movimientos${enCurso ? ` (${tramo}; este mes aún no ha acabado)` : ""}. `
    + (hayB ? `Se compara con ${tramo === "el año entero" ? "todo" : "los mismos meses de"} ${año - 1} (${B.meses} mes${B.meses === 1 ? "" : "es"} con movimientos).` : B.meses > 0 ? `${año - 1} no tiene datos para comparar.` : `De ${año - 1} no hay movimientos con los que comparar.`) });
  // Media al mes (solo meses acabados con movimientos) y, plegado, a dónde llegaría el año a este ritmo
  const MM = mediaMensualAño(A);
  if (MM) {
    root.createDiv({ cls: "fin-note", text: `De media al mes, en ${MM.meses} mes${MM.meses === 1 ? "" : "es"} acabado${MM.meses === 1 ? "" : "s"}: entran ${eur(MM.ingresos, 0)} y salen ${eur(MM.gastos, 0)}${MM.enCurso ? " (sin contar este mes, que no ha acabado)" : ""}.` });
    const RI = enCurso ? ritmoAño(A) : null;
    if (RI) plegable(root, "Ver el ritmo del año", (c) => {
      c.createDiv({ cls: "fin-note", text: `A este paso, acabarías ${año} con unos ${ahorroTxt(RI.año)} ahorrados: ${ahorroTxt(RI.hasta)} de lo que va de año más ${eurS(RI.mensual, 0)} al mes (la media de ${RI.meses} meses acabados) por los ${RI.quedan} mes${RI.quedan === 1 ? "" : "es"} que quedan después de este. Es una estimación: no cuenta pagas extra, gastos puntuales ni cambios de ingresos.` });
    });
  }

  // Mes a mes: entró y salió, con lo que salió el año anterior al lado
  const pM = panel(root, "Mes a mes", null, "Cada mes es «tu mes»: si en Ajustes tu mes empieza otro día, va de ese día al mismo del mes siguiente. Pulsa un mes para ver sus movimientos.");
  const K = A.keys;
  columnas(pM, { alto: 200, etiquetas: K.map(mesCorto), titulos: K.map(mesLbl),
    series: [{ nombre: "Entró", color: "var(--mint)", valores: A.filas.map((f) => f.ingresos) }, { nombre: "Salió", color: "var(--coral)", valores: A.filas.map((f) => f.gastos) }],
    alPulsar: (i) => { if (A.filas[i] && A.filas[i].datos) verMes(K[i])(); } });
  leyenda(pM, [["Entró", "var(--mint)"], ["Salió", "var(--coral)"]]);
  // Si todos los meses ahorraron lo mismo (p. ej. 0 €), no hay mejor ni peor
  if (A.mejor && A.mejor.ahorro - A.peor.ahorro >= 0.5) pM.createDiv({ cls: "fin-note", text: `Tu mejor mes: ${mesLbl(A.mejor.key).split(" ")[0].toLowerCase()} (ahorraste ${ahorroTxt(A.mejor.ahorro)}). El peor: ${mesLbl(A.peor.key).split(" ")[0].toLowerCase()} (${ahorroTxt(A.peor.ahorro)}).` });
  plegable(pM, "Ver la tabla mes a mes", (c) => {
    tabla(c, [{ t: "Mes" }, { t: "Entró", num: true }, { t: "Salió", num: true }, { t: "Ahorro", num: true }, { t: `Salió en ${año - 1}`, num: true, opt: true }],
      [...A.filas.map((f, i) => {
        const b = B.filas[i];
        const nombre = mesLbl(f.key).split(" ")[0];
        return [f.datos ? { text: nombre, onclick: verMes(f.key), title: `Ver los movimientos de ${mesLbl(f.key).toLowerCase()}` } : nombre, f.datos ? eur(f.ingresos, 0) : "—", f.datos ? eur(f.gastos, 0) : "—", f.datos ? { text: ahorroTxt(f.ahorro), cls: ahorroCls(f.ahorro) } : "—", hayB && b && b.datos ? eur(b.gastos, 0) : "—"];
      }), conFila(["Total", eur(A.ingresos, 0), eur(A.gastos, 0), { text: ahorroTxt(A.ahorro), cls: ahorroCls(A.ahorro) }, hayB ? eur(B.gastos, 0) : "—"], "total")]);
  });

  // En qué gastaste, por categoría, frente al año anterior
  const pC = panel(root, "En qué gastaste", { text: eur(A.gastos, 0) }, "Lo gastado en cada categoría, menos lo que te devolvieron. La diferencia es con los mismos meses del año anterior.");
  const nombres = [...new Set([...A.gastoCat.keys(), ...B.gastoCat.keys()])].filter((n) => Math.abs(A.gastoCat.get(n) || 0) >= 0.5 || Math.abs(B.gastoCat.get(n) || 0) >= 0.5)
    .sort((a, b) => (A.gastoCat.get(b) || 0) - (A.gastoCat.get(a) || 0) || (B.gastoCat.get(b) || 0) - (B.gastoCat.get(a) || 0));
  if (!nombres.length) vacio(pC, "Sin gastos este año");
  else {
    const dif = (n) => (A.gastoCat.get(n) || 0) - (B.gastoCat.get(n) || 0);
    const RD = repartoDonut([...A.gastoCat]);
    if (RD.partes.length) donut(pC, RD.partes.map((p) => ({ ...p, color: p.otras ? "var(--ink-3)" : catColor(p.nombre) })), { centro: eur(RD.total, 0) });
    const pg = paginacion(nombres, "anual_cat", () => FB.montar());
    tabla(pC, [{ t: "Categoría" }, { t: String(año), num: true }, { t: String(año - 1), num: true }, { t: "Diferencia", num: true }],
      [...pg.parte.map((n) => [A.gastoCat.has(n) ? { text: n, dot: catColor(n), onclick: verCat(n), title: `Ver los movimientos de ${n} en ${año}` } : { text: n, dot: catColor(n) },eur(A.gastoCat.get(n) || 0, 0), hayB ? eur(B.gastoCat.get(n) || 0, 0) : "—", hayB ? eurS(dif(n), 0) : "—"]),
        conFila(["Total", eur(A.gastos, 0), hayB ? eur(B.gastos, 0) : "—", hayB ? eurS(A.gastos - B.gastos, 0) : "—"], "total")]);
    pg.pie(pC);
    if (hayB) {
      const subidas = nombres.filter((n) => dif(n) >= 50).sort((a, b) => dif(b) - dif(a)).slice(0, 3);
      if (subidas.length) pC.createDiv({ cls: "fin-note", text: `Lo que más ha subido: ${subidas.map((n) => `${n.toLowerCase()} (${eurS(dif(n), 0)})`).join(", ")}.` });
      const bajadas = categoriasQueBajan(A.gastoCat, B.gastoCat, hayB);
      if (bajadas.length) pC.createDiv({ cls: "fin-note", text: `Lo que más bajó: ${bajadas.map((x) => `${x.nombre.toLowerCase()} (${eurS(x.dif, 0)})`).join(", ")}.` });
    }
  }
  // Dónde más gastas: los comercios del año (gasto variable), y lo que suman las compras pequeñas
  const conMov = new Set(A.filas.filter((f) => f.datos).map((f) => f.key));
  const PC = porComercio(movimientos(), (m) => conMov.has(keyDe(m.fecha)), (c) => grupoDe(c) === "fijo");
  if (PC.lista.length) {
    const pD = panel(root, "Dónde más gastas", { text: `${PC.lista.length} comercio${PC.lista.length === 1 ? "" : "s"}` }, "Tu gasto variable del año por comercio (sin los fijos). Si un Bizum está enlazado a un gasto, lo que te devolvieron se resta de su comercio. Pulsa uno para ver sus movimientos.");
    const verCom = (nombre) => () => { guardarEstado({ mes: hasta, filtroCat: null, hist: "año", busqueda: nombre }); FB.ir("#movimientos/lista"); };
    const TOP = 10, top = PC.lista.slice(0, TOP);
    tabla(pD, [{ t: "Comercio" }, { t: "Gastado", num: true }, { t: "Compras", num: true }, { t: "De media", num: true, opt: true }],
      top.map((c) => [{ text: c.nombre, onclick: verCom(c.nombre), title: `Ver los movimientos de ${c.nombre} en ${año}` }, eur(c.total, 0), String(c.n), eur(c.medio, 2)]));
    const resto = PC.lista.slice(TOP);
    if (resto.length) pD.createDiv({ cls: "fin-note", text: `Y ${resto.length} comercio${resto.length === 1 ? "" : "s"} más: ${eur(sum(resto.map((c) => c.total)), 0)}.` });
    if (PC.pequeñas.n) pD.createDiv({ cls: "fin-note", text: `Compras de menos de 10 €: ${PC.pequeñas.n}, que suman ${eur(PC.pequeñas.total, 0)}${A.meses > 1 ? ` (unos ${eur(PC.pequeñas.total / A.meses, 0)} al mes)` : ""}.` });
  }
  if (A.ingresoCat.size) {
    const pI = panel(root, "De dónde entró", { text: eur(A.ingresos, 0) });
    filasDato(pI, [...A.ingresoCat].sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ l: n, dot: catColor(n), v: eur(v, 0), s: hayB ? `${año - 1}: ${eur(B.ingresoCat.get(n) || 0, 0)}` : "", onclick: verCat(n) })));
  }

  // Patrimonio (mes natural): de enero a diciembre
  const E = estimacion();
  const PA = patrimonioAño(año, patrimonio(), E ? E.neto : null);
  const pP = panel(root, `Tu patrimonio en ${año}`, { text: "Actualizar saldos", ruta: "#cerrar" }, "Lo que tenías al final de cada mes según los saldos que anotaste (cuentas, inversión y otros, menos deudas). En el mes en curso, lo estimado hoy.");
  if (PA.fin == null) vacio(pP, `Sin saldos anotados en ${año}`, " Anota cada mes lo que tienes en cada cuenta y aquí verás cómo cambia.");
  else {
    const NOMBRES = PA.keys.map(mesCorto);
    if (PA.valores.filter((v) => v != null).length >= 2) lineas(pP, { etiquetas: PA.keys.map(mesLbl), etiquetasX: NOMBRES, marcas: PA.keys.map((_, i) => i), series: [{ nombre: "Patrimonio", color: "var(--brand)", valores: PA.valores }], alto: 170 });
    const finTxt = año === añoHoy && PA.mesFin === hoyCal ? "Hoy (estimado)" : `Al final de ${mesLbl(PA.mesFin).toLowerCase()}`;
    filasDato(pP, [
      PA.cambio != null ? { l: PA.dentro ? `El ${PA.fechaInicio.toFormat("dd/MM/yyyy")}` : "Al empezar el año", v: eur(PA.inicio, 0), s: PA.dentro ? "tus primeros saldos anotados de este año" : `saldos del ${PA.fechaInicio.toFormat("dd/MM/yyyy")}` } : null,
      { l: finTxt, v: eur(PA.fin, 0) },
      PA.cambio != null ? { l: "Cuánto ha cambiado", v: eurS(PA.cambio, 0), t: tone(PA.cambio) } : null,
    ]);
    if (PA.dentro) pP.createDiv({ cls: "fin-note", text: `No hay saldos de antes de ${año}: ${PA.cambio != null ? "el cambio se mide desde los primeros que anotaste este año" : "no se puede saber cuánto ha cambiado en el año"}.` });
  }

  // Inversión (mes natural): lo que metiste y lo que ganó
  if (activos().length || aportacionesReales().length) {
    const pV = panel(root, `Tu inversión en ${año}`, { text: "Inversión", ruta: "#inversion" }, "Rentabilidad: lo que ha cambiado el valor menos lo que metiste, dividido entre el valor de partida más la mitad de lo metido. No cuenta dividendos.");
    const ops = sinTraspasos().filter((x) => x.fecha.year === año);
    const compras = sum(ops.filter((x) => x.importe > 0).map((x) => x.importe)), ventas = -sum(ops.filter((x) => x.importe < 0).map((x) => x.importe));
    const DV = cobros().filter((c) => c.fecha.year === año && c.tipo === "dividendo");
    const R = rentabilidadAño(evolucionInversion(), año);
    const hastaTxt = (k) => (k === hoyCal ? "hoy" : `fin de ${mesLbl(k).toLowerCase()}`);
    filasDato(pV, [
      { l: "Lo que metiste", v: eur(compras, 0), s: ventas > 0.5 ? `y sacaste ${eur(ventas, 0)} vendiendo` : "compras (los traspasos entre fondos no cuentan)" },
      DV.length ? { l: "Dividendos cobrados", v: eur(sum(DV.map((c) => c.importe)), 0), ruta: "#renta" } : null,
      R.ok ? { l: "Lo que ganó tu inversión", v: eurS(R.gan, 0), t: tone(R.gan), s: `de fin de ${mesLbl(R.desde).toLowerCase()} a ${hastaTxt(R.hasta)}` } : null,
      R.ok && isFinite(R.r) ? { l: "Rentabilidad", v: pct(R.r, true), t: tone(R.r) } : null,
    ]);
    if (!R.ok) pV.createDiv({ cls: "fin-note", text: `No se puede calcular la rentabilidad del año: ${R.motivo}.` });
  }
}

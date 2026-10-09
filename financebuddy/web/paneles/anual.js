// ═════════════ pantalla «Mi año» ═════════════
// Lo que entró, salió y ahorraste en un año, mes a mes y por categoría, comparado con el año anterior; tu patrimonio de
// enero a diciembre y cómo fue tu inversión. Ingresos y gastos van por «tu mes» (keyDe); patrimonio e inversión, por mes natural.
// En el año en curso se compara con los mismos meses del año anterior, no con el año entero.
function vistaAnual() {
  cabecera("Mi año", false, "Lo que entró, salió y ahorraste, comparado con el año anterior");
  const bot = root.createDiv({ cls: "fb-filtros" });
  enlace(bot, "← Movimientos", "#movimientos").className = "fb-btn sec";
  const años = [...new Set(movimientos().filter((m) => !m.auto && !m.previsto).map((m) => Number(keyDe(m.fecha).slice(0, 4))))].sort((a, b) => b - a);
  if (!años.length) { vacio(root, "Aún no hay movimientos", " Cuando importes el extracto de tu banco, aquí verás el resumen de cada año."); return; }
  const añoHoy = Number(hoyKey.slice(0, 4));
  const año = FB.estado.añoAnual && años.includes(FB.estado.añoAnual) ? FB.estado.añoAnual : años[0];
  const seg = root.createDiv({ cls: "fb-chips", attr: { role: "group", "aria-label": "Año" } });
  for (const a of años) { const b = seg.createEl("button", { text: String(a), cls: a === año ? "act" : "", attr: { type: "button", "aria-pressed": String(a === año) } }); b.onclick = () => { FB.estado.añoAnual = a; FB.montar(); }; }

  const hasta = año === añoHoy ? hoyKey : `${año}-12`;
  const A = resumenAño(año, movimientos(), hasta), B = resumenAño(año - 1, movimientos(), `${año - 1}-${hasta.slice(5)}`);
  const enCurso = año === añoHoy && hasta < `${año}-12`;
  const tramo = enCurso ? `de enero a ${mesLbl(hasta).split(" ")[0].toLowerCase()}` : "el año entero";
  const hayB = B.meses > 0;
  // «2025: 1.234 € (+5 %)»: la misma cifra del año anterior, en neutro (más gasto no es una pérdida)
  const frente = (a, b) => (hayB ? `${año - 1}: ${eur(b, 0)}${b > 0 ? ` (${pct((a - b) / b, true)})` : ""}` : "");

  const g = root.createDiv({ cls: "fb-stats" });
  const st = (cls, l, v, s, t) => { const c = g.createDiv({ cls: "fb-stat " + cls }); c.createDiv({ cls: "l", text: l }); c.createDiv({ cls: "v " + (t || ""), text: v }); if (s) c.createDiv({ cls: "s", text: s }); };
  st("entra", "Entró", eur(A.ingresos, 0), frente(A.ingresos, B.ingresos));
  st("sale", "Salió", eur(A.gastos, 0), frente(A.gastos, B.gastos));
  st("ahorro", "Ahorraste", eurS(A.ahorro, 0), [isFinite(A.tasa) && A.ahorro > 0 ? `${pct(A.tasa)} de lo que entró` : "", hayB ? `${año - 1}: ${eurS(B.ahorro, 0)}` : ""].filter(Boolean).join(" · "), A.ahorro < 0 ? "neg" : "");
  root.createDiv({ cls: "fin-note", text: `${año}: ${A.meses} mes${A.meses === 1 ? "" : "es"} con movimientos${enCurso ? ` (${tramo}; este mes aún no ha acabado)` : ""}. `
    + (hayB ? `Se compara con ${tramo === "el año entero" ? "todo" : "los mismos meses de"} ${año - 1} (${B.meses} mes${B.meses === 1 ? "" : "es"} con movimientos).` : `De ${año - 1} no hay movimientos con los que comparar.`) });

  // Mes a mes: entró y salió, con lo que salió el año anterior al lado
  const pM = panel(root, "Mes a mes", null, "Cada mes es «tu mes»: si en Ajustes tu mes empieza otro día, va de ese día al mismo del mes siguiente.");
  const K = A.keys;
  columnas(pM, { alto: 200, etiquetas: K.map(mesCorto), titulos: K.map(mesLbl),
    series: [{ nombre: "Entró", color: "var(--mint)", valores: A.filas.map((f) => f.ingresos) }, { nombre: "Salió", color: "var(--coral)", valores: A.filas.map((f) => f.gastos) }] });
  leyenda(pM, [["Entró", "var(--mint)"], ["Salió", "var(--coral)"]]);
  if (A.mejor) pM.createDiv({ cls: "fin-note", text: `Tu mejor mes: ${mesLbl(A.mejor.key).split(" ")[0].toLowerCase()} (ahorraste ${eurS(A.mejor.ahorro, 0)}). El peor: ${mesLbl(A.peor.key).split(" ")[0].toLowerCase()} (${eurS(A.peor.ahorro, 0)}).` });
  plegable(pM, "Ver la tabla mes a mes", (c) => {
    tabla(c, [{ t: "Mes" }, { t: "Entró", num: true }, { t: "Salió", num: true }, { t: "Ahorro", num: true }, { t: `Salió en ${año - 1}`, num: true, opt: true }],
      [...A.filas.map((f, i) => {
        const b = B.filas[i];
        return [mesLbl(f.key).split(" ")[0], f.datos ? eur(f.ingresos, 0) : "—", f.datos ? eur(f.gastos, 0) : "—", f.datos ? { text: eurS(f.ahorro, 0), cls: f.ahorro < 0 ? "neg" : "" } : "—", b && b.datos ? eur(b.gastos, 0) : "—"];
      }), conFila(["Total", eur(A.ingresos, 0), eur(A.gastos, 0), { text: eurS(A.ahorro, 0), cls: A.ahorro < 0 ? "neg" : "" }, hayB ? eur(B.gastos, 0) : "—"], "total")]);
  });

  // En qué gastaste, por categoría, frente al año anterior
  const pC = panel(root, "En qué gastaste", { text: eur(A.gastos, 0) }, "Lo gastado en cada categoría, menos lo que te devolvieron. La diferencia es con los mismos meses del año anterior.");
  const nombres = [...new Set([...A.gastoCat.keys(), ...B.gastoCat.keys()])].filter((n) => Math.abs(A.gastoCat.get(n) || 0) >= 0.5 || Math.abs(B.gastoCat.get(n) || 0) >= 0.5)
    .sort((a, b) => (A.gastoCat.get(b) || 0) - (A.gastoCat.get(a) || 0) || (B.gastoCat.get(b) || 0) - (B.gastoCat.get(a) || 0));
  if (!nombres.length) vacio(pC, "Sin gastos este año");
  else {
    const dif = (n) => (A.gastoCat.get(n) || 0) - (B.gastoCat.get(n) || 0);
    const pg = paginacion(nombres, "anual_cat", () => FB.montar());
    tabla(pC, [{ t: "Categoría" }, { t: String(año), num: true }, { t: String(año - 1), num: true }, { t: "Diferencia", num: true }],
      [...pg.parte.map((n) => [{ text: n, dot: catColor(n) }, eur(A.gastoCat.get(n) || 0, 0), hayB ? eur(B.gastoCat.get(n) || 0, 0) : "—", hayB ? eurS(dif(n), 0) : "—"]),
        conFila(["Total", eur(A.gastos, 0), hayB ? eur(B.gastos, 0) : "—", hayB ? eurS(A.gastos - B.gastos, 0) : "—"], "total")]);
    pg.pie(pC);
    if (hayB) {
      const subidas = nombres.filter((n) => dif(n) >= 50).sort((a, b) => dif(b) - dif(a)).slice(0, 3);
      if (subidas.length) pC.createDiv({ cls: "fin-note", text: `Lo que más ha subido: ${subidas.map((n) => `${n.toLowerCase()} (${eurS(dif(n), 0)})`).join(", ")}.` });
    }
  }
  if (A.ingresoCat.size) {
    const pI = panel(root, "De dónde entró", { text: eur(A.ingresos, 0) });
    filasDato(pI, [...A.ingresoCat].sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ l: n, dot: catColor(n), v: eur(v, 0), s: hayB ? `${año - 1}: ${eur(B.ingresoCat.get(n) || 0, 0)}` : "" })));
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

// ═════════════ pantalla «Para la renta» ═════════════
// Ganancias y pérdidas de lo que has vendido (por FIFO), los dividendos que has cobrado y las comisiones, año por año, para
// tener a mano los números de la declaración. Orientativo: no sustituye a un asesor ni al programa de Hacienda.
function vistaRenta() {
  cabecera("Para la renta", false, "Lo que ganaste o perdiste al vender, y los dividendos cobrados, por año");
  const OPS = opsParaRenta(), R = fifoVentas(OPS);
  const DUDOSAS = reglaDosMeses(OPS, R.ventas, claseActivo);
  const CB = cobros();
  const años = [...new Set([...R.ventas.map((v) => v.fecha.year), ...CB.map((c) => c.fecha.year)])].sort((a, b) => b - a);
  const bot = root.createDiv({ cls: "fb-filtros" });
  enlace(bot, "← Inversión", "#inversion").className = "fb-btn sec";
  enlace(bot, "+ Dividendo o comisión", "#editar/cobro/nuevo").className = "fb-btn sec";
  if (!años.length) {
    vacio(root, "Aún no hay ventas ni dividendos", " Cuando vendas algo o cobres un dividendo, aquí verás el resultado de cada año.");
    if (R.sinDatos.length) root.createDiv({ cls: "fin-note", text: `Para calcular las ventas hacen falta las participaciones de cada operación. Faltan en: ${R.sinDatos.join(", ")}.` });
    return;
  }
  let año = FB.estado.añoRenta && años.includes(FB.estado.añoRenta) ? FB.estado.añoRenta : años[0];
  const seg = root.createDiv({ cls: "fb-chips" });
  for (const a of años) { const b = seg.createEl("button", { text: String(a), cls: a === año ? "act" : "" }); b.onclick = () => { FB.estado.añoRenta = a; montar(); }; }

  const V = R.ventas.filter((v) => v.fecha.year === año).sort((a, b) => a.fecha - b.fecha);
  const D = CB.filter((c) => c.fecha.year === año);
  const resultado = sum(V.map((v) => v.resultado)), com = sum(D.filter((c) => c.tipo === "comision").map((c) => c.importe));
  const DV = D.filter((c) => c.tipo === "dividendo"), ret = sum(DV.map((c) => c.retencion)), div = sum(DV.map((c) => c.importe)) + ret;  // bruto = lo que llegó + lo retenido
  const bDesc = bot.createEl("button", { cls: "fb-btn sec", text: `Descargar ${año} (CSV)`, attr: { type: "button" } });
  bDesc.onclick = () => { descargarArchivo(`FinanceBuddy-renta-${año}.csv`, csvRenta(año, V, D), "text/csv;charset=utf-8"); FB.aviso("Descargado ✓ · se abre con Excel"); };
  tiles(root, [
    { l: `Resultado de las ventas de ${año}`, v: eurS(resultado, 2), t: tone(resultado), s: `${V.length} venta${V.length === 1 ? "" : "s"} · ganancias ${eur(sum(V.filter((v) => v.resultado > 0).map((v) => v.resultado)), 2)} · pérdidas ${eur(-sum(V.filter((v) => v.resultado < 0).map((v) => v.resultado)), 2)}` },
    { l: ret ? "Dividendos (brutos)" : "Dividendos cobrados", v: eur(div, 2), s: DV.length ? `${DV.length} cobro${DV.length === 1 ? "" : "s"} · ${ret ? `ya retenido ${eur(ret, 2)}` : "sin retención anotada"}` : "ninguno" },
    com ? { l: "Comisiones", v: eur(-com, 2), s: "custodia y similares" } : null,
  ]);

  const DU = DUDOSAS.filter((x) => x.fecha.year === año), dudosa = new Set(DU.map((x) => x.id)), perdidaDudosa = sum(DU.map((x) => x.perdida));
  const pV = panel(root, `Ventas de ${año}`, null, "Cada venta resta el coste de las compras más antiguas de ese activo (FIFO). Los traspasos entre fondos no cuentan: no tributan y el coste pasa al fondo nuevo.");
  if (!V.length) vacio(pV, "Sin ventas este año");
  else {
    const pgV = paginacion(V, "renta_v", () => FB.montar());
    tabla(pV, [{ t: "Fecha" }, { t: "Activo" }, { t: "Particip.", num: true, opt: true }, { t: "Vendido por", num: true }, { t: "Coste", num: true }, { t: "Resultado", num: true }],
      [...pgV.parte.map((v) => [fechaCorta(v.fecha.toISODate()), { text: v.activo + (v.faltan > 1e-6 ? " ⚠" : ""), ruta: `#activo/${(DB.registros.activo || []).find((a) => a.nombre === v.activo)?.id ?? ""}` },
        nf(v.unidades, 0, 4), eur(v.valor, 2), eur(v.coste, 2), { text: eurS(v.resultado, 2), cls: tone(v.resultado), badge: dudosa.has(v.id) ? "podría no contar" : "" }]),
        conFila(["Total", "", "", eur(sum(V.map((v) => v.valor)), 2), eur(sum(V.map((v) => v.coste)), 2), { text: eurS(resultado, 2), cls: tone(resultado) }], "total")]);
    pgV.pie(pV);
    if (V.some((v) => v.faltan > 1e-6)) pV.createDiv({ cls: "fin-note", text: "⚠ Se vendieron más participaciones de las que constan comprados: falta alguna compra y el coste está incompleto. Revisa la ficha del activo." });
    if (DU.length) pV.createDiv({ cls: "fin-note", text: `⚠ ${eur(perdidaDudosa, 2)} de pérdidas podrían no contar en ${año}: `
      + DU.map((x) => `${x.activo} (${eurS(-x.perdida, 2)} el ${x.fecha.toFormat("dd/MM")}; compraste el ${x.compra.toFormat("dd/MM/yyyy")})`).join(", ")
      + ". Hacienda no deja restar una pérdida si compras lo mismo en los dos meses de antes o de después de vender (en fondos de inversión, un año): se resta cuando vendas lo que compraste. Aquí se siguen restando; compruébalo con el informe fiscal de tu bróker." });
  }
  // Lo que saldría a pagar: ventas (con las pérdidas que arrastras de los 4 años anteriores) + dividendos, por los tramos del ahorro
  // sinDudosas: lo mismo, pero sin restar las pérdidas que podrían no contar este año (solo para decir cuánto cambiaría)
  const porAño = (sinDudosas) => rentaPorAño(años.map((a) => {
    const dv = CB.filter((c) => c.fecha.year === a && c.tipo === "dividendo");
    return { año: a, ventas: sum(R.ventas.filter((v) => v.fecha.year === a).map((v) => v.resultado)) + (sinDudosas && a === año ? perdidaDudosa : 0), dividendos: sum(dv.map((c) => c.importe + c.retencion)), retenido: sum(dv.map((c) => c.retencion)) };
  })).get(año);
  const E = porAño(false);
  if (E && (V.length || DV.length)) {
    const pE = panel(root, `Lo que te saldría por ${año}`, { text: "estimación" }, "Suma el resultado de tus ventas y tus dividendos brutos, resta las pérdidas que arrastras de los cuatro años anteriores y aplica los tramos del ahorro: 19 % hasta 6.000 €, 21 % hasta 50.000 €, 23 % hasta 200.000 €, 27 % hasta 300.000 € y 30 % desde ahí.");
    filasDato(pE, [
      { l: "Resultado de tus ventas", v: eurS(resultado, 2), t: tone(resultado) },
      E.pendAntes > 0.005 ? { l: "Pérdidas de años anteriores", v: eur(-E.usado, 2), s: `tenías ${eur(E.pendAntes, 2)} por compensar` } : null,
      div ? { l: "Dividendos brutos", v: eur(div, 2) } : null,
      { l: "Sobre lo que pagas", v: eur(E.base, 2), s: "lo que queda después de compensar" },
      { l: "Impuesto", v: eur(E.cuota, 2) },
      E.retenido ? { l: "Ya retenido", v: eur(-E.retenido, 2) } : null,
      E.retenido ? { l: E.diferencia >= 0 ? "Te quedaría por pagar" : "Te devolverían", v: eur(Math.abs(E.diferencia), 2) } : null,
    ]);
    if (DU.length) {
      const E2 = porAño(true);
      pE.createDiv({ cls: "fin-note", text: Math.abs(E2.cuota - E.cuota) >= 0.005
        ? `Si no cuentan los ${eur(perdidaDudosa, 2)} de pérdidas marcados arriba, el impuesto sería ${eur(E2.cuota, 2)} en vez de ${eur(E.cuota, 2)}.`
        : `Aunque no contaran los ${eur(perdidaDudosa, 2)} de pérdidas marcados arriba, el impuesto de ${año} sería el mismo (cambiaría lo que te queda por compensar).` });
    }
    if (E.pendDespues > 0.005) pE.createDiv({ cls: "fin-note", text: `Te quedan ${eur(E.pendDespues, 2)} de pérdidas para compensar con ganancias de los próximos años (cada una vale cuatro años).` });
    pE.createDiv({ cls: "fin-note", text: "Solo cuenta lo que hay en esta app, como si no tuvieras más rentas del ahorro: faltan los intereses de tus cuentas y lo de otros brókers, que pueden subir el tramo." });
  }
  const pD = panel(root, `Dividendos y comisiones de ${año}`, { text: "Editar", ruta: "#gestionar/cobro" }, "Lo que cobras de un activo (dividendo, cupón) o te cobran (custodia) sin vender participaciones.");
  if (!D.length) vacio(pD, "Nada este año", " Se apuntan a mano o salen solos al importar el extracto de tu bróker.");
  else { const pgD = paginacion(D, "renta_d", () => FB.montar()); tabla(pD, [{ t: "Fecha" }, { t: "Activo" }, { t: "Qué" }, { t: "Retenido", num: true, opt: true }, { t: "Te llegó", num: true }],
    pgD.parte.map((c) => [{ text: fechaCorta(c.fecha.toISODate()), ruta: `#editar/cobro/${c.p.id}` }, c.activo, c.tipo === "comision" ? "Comisión" : "Dividendo", c.retencion ? eur(c.retencion, 2) : "", { text: (c.tipo === "comision" ? "−" : "+") + eur(c.importe, 2), cls: c.tipo === "comision" ? "neg" : "pos" }])); pgD.pie(pD); }

  if (R.sinDatos.length) root.createDiv({ cls: "fin-note", text: `No se pueden calcular las ventas de: ${R.sinDatos.join(", ")} (faltan participaciones en alguna operación). Ábrelos y cuádralos con tu bróker.` });
  root.createDiv({ cls: "fin-note", text: "Orientativo: cálculo por FIFO con lo que hay anotado en la app. Las pérdidas que podrían caer en la regla de los dos meses se marcan, pero se siguen restando; tampoco mira la fiscalidad de cada producto. Compáralo con el informe fiscal de tu bróker y consulta a un profesional si tienes dudas." });
}

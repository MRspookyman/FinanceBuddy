// ═════════════ pantalla «Para la renta» ═════════════
// Ganancias y pérdidas de lo que has vendido (por FIFO), los dividendos que has cobrado y las comisiones, año por año, para
// tener a mano los números de la declaración. Orientativo: no sustituye a un asesor ni al programa de Hacienda.
function vistaRenta() {
  cabecera("Para la renta", false, "Lo que ganaste o perdiste al vender, y los dividendos cobrados, por año");
  const R = fifoVentas(opsParaRenta());
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
  const resultado = sum(V.map((v) => v.resultado)), div = sum(D.filter((c) => c.tipo === "dividendo").map((c) => c.importe)), com = sum(D.filter((c) => c.tipo === "comision").map((c) => c.importe));
  tiles(root, [
    { l: `Resultado de las ventas de ${año}`, v: eurS(resultado, 2), t: tone(resultado), s: `${V.length} venta${V.length === 1 ? "" : "s"} · ganancias ${eur(sum(V.filter((v) => v.resultado > 0).map((v) => v.resultado)), 2)} · pérdidas ${eur(-sum(V.filter((v) => v.resultado < 0).map((v) => v.resultado)), 2)}` },
    { l: "Dividendos cobrados", v: eur(div, 2), s: D.filter((c) => c.tipo === "dividendo").length ? `${D.filter((c) => c.tipo === "dividendo").length} cobro${D.filter((c) => c.tipo === "dividendo").length === 1 ? "" : "s"}` : "ninguno" },
    com ? { l: "Comisiones", v: eur(-com, 2), s: "custodia y similares" } : null,
  ]);

  const pV = panel(root, `Ventas de ${año}`, null, "Cada venta resta el coste de las compras más antiguas de ese activo (FIFO). Los traspasos entre fondos no cuentan: no tributan y el coste pasa al fondo nuevo.");
  if (!V.length) vacio(pV, "Sin ventas este año");
  else {
    const pgV = paginacion(V, "renta_v", () => FB.montar());
    tabla(pV, [{ t: "Fecha" }, { t: "Activo" }, { t: "Particip.", num: true, opt: true }, { t: "Vendido por", num: true }, { t: "Coste", num: true }, { t: "Resultado", num: true }],
      [...pgV.parte.map((v) => [fechaCorta(v.fecha.toISODate()), { text: v.activo + (v.faltan > 1e-6 ? " ⚠" : ""), ruta: `#activo/${(DB.registros.activo || []).find((a) => a.nombre === v.activo)?.id ?? ""}` },
        nf(v.unidades, 0, 4), eur(v.valor, 2), eur(v.coste, 2), { text: eurS(v.resultado, 2), cls: tone(v.resultado) }]),
        conFila(["Total", "", "", eur(sum(V.map((v) => v.valor)), 2), eur(sum(V.map((v) => v.coste)), 2), { text: eurS(resultado, 2), cls: tone(resultado) }], "total")]);
    pgV.pie(pV);
    if (V.some((v) => v.faltan > 1e-6)) pV.createDiv({ cls: "fin-note", text: "⚠ Se vendieron más participaciones de las que constan comprados: falta alguna compra y el coste está incompleto. Revisa la ficha del activo." });
  }
  const pD = panel(root, `Dividendos y comisiones de ${año}`, { text: "Editar", ruta: "#gestionar/cobro" }, "Lo que cobras de un activo (dividendo, cupón) o te cobran (custodia) sin vender participaciones.");
  if (!D.length) vacio(pD, "Nada este año", " Se apuntan a mano o salen solos al importar el extracto de tu bróker.");
  else { const pgD = paginacion(D, "renta_d", () => FB.montar()); tabla(pD, [{ t: "Fecha" }, { t: "Activo" }, { t: "Qué" }, { t: "Importe", num: true }],
    pgD.parte.map((c) => [{ text: fechaCorta(c.fecha.toISODate()), ruta: `#editar/cobro/${c.p.id}` }, c.activo, c.tipo === "comision" ? "Comisión" : "Dividendo", { text: (c.tipo === "comision" ? "−" : "+") + eur(c.importe, 2), cls: c.tipo === "comision" ? "neg" : "pos" }])); pgD.pie(pD); }

  if (R.sinDatos.length) root.createDiv({ cls: "fin-note", text: `No se pueden calcular las ventas de: ${R.sinDatos.join(", ")} (faltan participaciones en alguna operación). Ábrelos y cuádralos con tu bróker.` });
  root.createDiv({ cls: "fin-note", text: "Orientativo: cálculo por FIFO con lo que hay anotado en la app. No aplica la regla de los dos meses para pérdidas ni retenciones, ni mira la fiscalidad de cada producto. Compáralo con el informe fiscal de tu bróker y consulta a un profesional si tienes dudas." });
}

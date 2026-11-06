// ───────────── fijos detectados y de dónde viene el dinero ─────────────
const GRUPO_TXT = { ingreso: "ingreso", fijo: "gasto fijo", variable: "gasto variable" };
function vistaFijos() {
  titulo("Tus fijos y de dónde viene tu dinero", "Lo que la app deduce de tus movimientos importados");
  const cont = root.createDiv();
  cont.createDiv({ cls: "fin-note", text: "Analizando tus movimientos…" });
  FB.api("/api/detectar", {}).then((r) => pintarFijos(cont, r));
}
function pintarFijos(cont, r) {
  cont.innerHTML = "";
  if (!r.ok) { mensaje(cont, r.mensaje || "Error", "err"); return; }
  const p1 = panel(cont, "Ingresos y gastos que se repiten cada mes", null, "Mismo pagador o comercio, al menos dos meses seguidos, una vez al mes y con importe y día parecidos.");
  tarjetasFijos(p1, r);
  enlace(p1.createDiv({ cls: "fin-note" }), "Ver todos tus fijos →", "#gestionar/recurrente");

  const H = huchaAnual(recurrentes(), hoy);
  if (H.filas.length) {
    const pH = panel(cont, "Lo que tienes que ir apartando al mes", null, "Para los gastos fijos que no se pagan cada mes (un seguro, el IBI…): su importe de todo el año repartido en 12 meses, para que el día del pago ya lo tengas guardado.");
    filasDato(pH, [{ l: "Apartar cada mes", s: `para ${H.filas.length} pago${H.filas.length > 1 ? "s" : ""} que no ${H.filas.length > 1 ? "son" : "es"} mensual${H.filas.length > 1 ? "es" : ""}`, v: eur(H.total) }]);
    const cuando = (f) => `${f.proximo.toFormat("dd/MM/yyyy")} · ${f.enMeses === 0 ? "este mes" : f.enMeses === 1 ? "el mes que viene" : `en ${f.enMeses} meses`}`;
    const veces = (n) => (n === 1 ? "una vez al año" : n === 2 ? "dos veces al año" : n === 4 ? "cada trimestre" : `${n} veces al año`);
    plegable(pH, "Ver el detalle", (c) => tabla(c, [{ t: "Pago" }, { t: "Importe", num: true }, { t: "Cuándo toca" }, { t: "Apartar al mes", num: true }],
      H.filas.map((f) => [{ text: f.nombre, badge: veces(f.veces) }, eur(f.importe), cuando(f), eur(f.alMes)])), { extra: `${H.filas.length}` });
  }

  const p2 = panel(cont, "De dónde viene tu dinero", null, "Tus ingresos, lo que te devuelven y lo que entra desde tus otras cuentas, agrupado por quién lo paga. «Al mes» es la media de los meses con movimientos.");
  if (!r.origenes.length) { vacio(p2, "Aún no hay ingresos importados", "", registros("movimiento").length ? null : { texto: "Importar el extracto", ruta: "#importar" }); return; }
  const porTipo = {};
  for (const o of r.origenes) porTipo[o.tipo] = (porTipo[o.tipo] || 0) + o.media_mes;
  filasDato(p2, Object.entries(porTipo).sort((a, b) => b[1] - a[1]).map(([t, v]) => ({ l: t, v: `${eur(v, 2)} al mes` })));
  const cols = [{ t: "Origen" }, { t: "Qué es" }, { t: "Veces", num: true, opt: true }, { t: "Al mes", num: true }, { t: "Total", num: true, opt: true }];
  const fila = (o) => [{ text: o.origen, badge: o.fijo ? "fijo" : "" }, o.categoria ? `${o.tipo} · ${o.categoria}` : o.tipo, String(o.veces), eur(o.media_mes, 2), eur(o.total, 2)];
  const VISIBLES = 8;
  tabla(p2, cols, r.origenes.slice(0, VISIBLES).map(fila));
  if (r.origenes.length > VISIBLES) plegable(p2, "Ver el resto", (c) => tabla(c, cols, r.origenes.slice(VISIBLES).map(fila)), { extra: `${r.origenes.length - VISIBLES}` });
}
// Lo que la app detecta que se repite y aún no tienes como fijo: una ficha por cada uno (marcar, nombre, categoría, importe y
// día) y «Crear los marcados». Va en «Tus fijos» (plegado, Posibles fijos) y en esta pantalla.
function tarjetasFijos(p1, r) {
  if (!r.fijos.length) {
    vacio(p1, "No hay nada nuevo que se repita cada mes", " Hacen falta al menos dos meses de movimientos importados. Lo que ya tienes como fijo no se vuelve a proponer.", registros("movimiento").length ? null : { texto: "Importar el extracto", ruta: "#importar" });
  } else {
    p1.createDiv({ cls: "fin-note", text: "Revisa el nombre, la categoría y el importe, desmarca lo que no sea fijo y pulsa «Crear». Se usarán para la previsión y los próximos se reconocerán solos al importar." });
    const sel = r.fijos.map((f) => ({ ...f, marcado: f.grupo !== "variable" }));
    for (const f of sel) {
      const card = p1.createDiv({ cls: "fb-card" });
      const top = card.createDiv({ cls: "top" });
      top.createSpan({ text: f.clase === "ingreso" ? "Ingreso que se repite" : f.grupo === "variable" ? "Se repite, pero es gasto variable (¿fijo?)" : "Gasto fijo" });
      top.createSpan({ cls: "imp " + (f.clase === "ingreso" ? "pos" : "neg"), text: eurS(f.clase === "ingreso" ? f.importe : -f.importe) });
      card.createDiv({ cls: "txt", text: `«${f.ejemplo}» · ${f.meses} meses: ${f.importes.map((x) => eur(x)).join(" · ")}` });
      const fila = card.createDiv({ cls: "fb-fila" });
      const l = fila.createEl("label"); const c = l.createEl("input", { attr: { type: "checkbox" } }); c.checked = f.marcado; l.appendText("Es fijo");
      const iN = fila.createEl("input", { attr: { type: "text", placeholder: "Nombre" } }); iN.value = f.nombre; iN.oninput = () => (f.nombre = iN.value);
      const sC = fila.createEl("select"); for (const [v, t] of catSegunClase(f)) { const o = sC.createEl("option", { text: t }); o.value = v; }
      sC.value = f.categoria; sC.onchange = () => (f.categoria = sC.value);
      const iI = fila.createEl("input", { cls: "corto", attr: { type: "number", step: "0.01" } }); iI.value = f.importe; iI.oninput = () => (f.importe = iI.value);
      fila.appendText("día");
      const iD = fila.createEl("input", { cls: "mini", attr: { type: "number", min: "1", max: "31" } }); iD.value = f.dia; iD.oninput = () => (f.dia = iD.value);
      c.onchange = () => { f.marcado = c.checked; card.style.opacity = c.checked ? "" : ".55"; };
      c.onchange();
    }
    const res = p1.createDiv();
    const b = p1.createEl("button", { cls: "fb-btn", text: "Crear los marcados" });
    b.onclick = async () => {
      const lista = sel.filter((f) => f.marcado);
      if (!lista.length) return;
      b.disabled = true;
      const x = await FB.api("/api/fijos", { fijos: lista });
      b.disabled = false;
      if (!x.ok) { res.innerHTML = ""; mensaje(res, x.mensaje || "Error", "err"); return; }
      FB.aviso(x.mensaje + " ✓", false, x.deshacer ? { texto: "Deshacer", fn: async () => { await FB.api("/api/deshacer", {}); await FB.refrescar(); } } : null);
      await FB.refrescar();
    };
  }
}



// ───────────── Independencia financiera ─────────────
// Cuánto capital haría falta para vivir de lo invertido, y cuándo se alcanzaría con unos supuestos que eliges tú. El cálculo es
// `independencia` (calculos_avisos.js). Los supuestos que cambias se guardan en config.independencia (en %, como se escriben);
// los que dejas sin tocar salen de tus datos. La pensión pública la escribes a mano: la app no la conoce ni la consulta.
const CAMPOS_INDEP = ["gasto", "tasa", "rent", "apo", "edad", "pension", "edadPension"];

function supuestosIndependencia() {
  const E = estimacion(), R = resumenInversion(), { apo, rent } = ritmoInversion(R);
  const g = gastoMedioReciente(), r2 = (x) => Math.round(x * 100) / 100;
  const deTusDatos = {
    gasto: isFinite(g) && g > 0 ? r2(g * 12) : null, tasa: 4, rent: r2(rent * 100), apo: r2(Math.max(0, apo)), edad: null, pension: null, edadPension: 67,
  };
  const guardados = cfg.independencia && typeof cfg.independencia === "object" ? cfg.independencia : {};
  const v = {};
  for (const k of CAMPOS_INDEP) v[k] = guardados[k] != null && isFinite(Number(guardados[k])) ? Number(guardados[k]) : deTusDatos[k];
  return { v, guardados, deTusDatos, patrimonio: E ? E.neto : 0 };
}

function vistaIndependencia() {
  cabecera("Independencia financiera", false, "Cuánto capital necesitas para vivir de lo que inviertes y cuándo lo alcanzarías");
  const bot = root.createDiv({ cls: "fb-filtros" });
  enlace(bot, "← Inversión", "#inversion").className = "fb-btn sec";
  const S = supuestosIndependencia();

  const pS = panel(root, "Tus supuestos", null, "Lo que ves son los valores sacados de tus datos; cámbialos y se guardan al salir del campo. Dejar un campo vacío vuelve al valor de tus datos.");
  const filas = [
    ["gasto", "Gasto que quieres tener al año", "€ al año", "10", "Lo que gastarías al año ya independiente. Por defecto, 12 veces tu gasto medio de los últimos meses."],
    ["tasa", "Cuánto retiras cada año del capital", "% del capital", "0.1", "Con el 4 % el capital dura, en el pasado, unos 30 años o más. Más bajo es más prudente."],
    ["rent", "Rentabilidad esperada al año, descontando la subida de precios", "% al año", "0.1", "Por defecto, la de tus inversiones con un tope del 5 %. Nadie sabe lo que rentará de verdad."],
    ["apo", "Lo que metes a invertir al mes", "€ al mes", "10", "Por defecto, tu media del último año."],
    ["edad", "Tu edad", "años", "1", "Opcional: sin ella no se puede decir a qué edad llegarías ni contar la pensión."],
    ["pension", "Pensión pública que esperas cobrar", "€ al mes, neta", "10", "La escribes tú, en euros de hoy y ya sin impuestos (la Seguridad Social te da una estimación). Déjala vacía si no quieres contarla."],
    ["edadPension", "Edad desde la que la cobrarías", "años", "1", ""],
  ];
  const guardar = (k, el) => {
    const g = { ...S.guardados };
    const n = el.value === "" ? NaN : Number(el.value);
    if (isFinite(n)) g[k] = n; else delete g[k];
    return guardarAjuste("/api/config", { independencia: g });
  };
  for (const [k, nombre, unidad, paso, nota] of filas) {
    const f = pS.createDiv({ cls: "fb-fila" });
    f.createSpan({ cls: "fb-et", text: nombre }).style.minWidth = "26em";
    const i = f.createEl("input", { cls: "corto", attr: { type: "number", min: "0", step: paso, "aria-label": `${nombre}, en ${unidad}` } });
    i.value = S.v[k] == null ? "" : S.v[k];
    i.dataset.fb = "indep-" + k;
    i.onchange = () => guardar(k, i);
    f.createSpan({ cls: "fin-note", text: unidad });
    if (nota) pS.createDiv({ cls: "fin-note", text: nota });
  }
  if (Object.keys(S.guardados).length) {
    const r = pS.createEl("button", { cls: "fb-btn sec", text: "Volver a los valores de mis datos", attr: { type: "button" } });
    r.onclick = () => guardarAjuste("/api/config", { independencia: {} });
  }

  const R = independencia({ gasto: S.v.gasto, tasa: S.v.tasa / 100, rent: S.v.rent / 100, apo: S.v.apo, patrimonio: S.patrimonio, edad: S.v.edad,
    pension: S.v.pension, edadPension: S.v.edadPension });
  const pR = panel(root, "Resultado");
  if (!R.ok) { pR.createDiv({ cls: "fin-note", text: R.motivo }); }
  else {
    const cuando = (m) => hoy.plus({ months: m }).setLocale("es").toFormat("LLLL yyyy");
    const plazo = (m) => (m < 24 ? `${m} meses` : `${nf(m / 12, 0, 1)} años`);
    const edadTxt = (e) => (e == null ? "" : `, a los ${Math.floor(e)} años`);
    const m = R.conPension ? R.mesesCon : R.mesesSin;
    const e = R.conPension ? R.edadCon : R.edadSin;
    tiles(pR, [
      { l: "Capital que hace falta", v: eur(R.conPension ? R.capitalCon : R.capitalSin, 2), s: R.conPension ? `contando tu pensión · sin ella, ${eur(R.capitalSin, 2)}` : `${eur(S.v.gasto, 2)} al año ÷ ${nf(S.v.tasa, 0, 1)} %` },
      { l: "Lo tendrías", v: m === 0 ? "Ya" : m == null ? "—" : cuando(m), s: m === 0 ? `ya tienes ${eur(S.patrimonio, 2)}` : m == null ? "a este ritmo no llegas en 50 años" : `dentro de ${plazo(m)}${edadTxt(e)}` },
    ]);
    if (m === 0) pR.createDiv({ cls: "fin-note", text: `Con lo que tienes hoy (${eur(S.patrimonio, 2)}) ya llegas al capital que hace falta con estos supuestos.` });
    else if (m == null) pR.createDiv({ cls: "fin-note", text: `Con ${eur(S.v.apo, 2)} al mes y un ${nf(S.v.rent, 0, 1)} % al año no se llega en 50 años. Prueba a meter más al mes, a gastar menos o a retirar un poco más del capital.` });
    else pR.createDiv({ cls: "fin-note", text: `Con ${eur(S.patrimonio, 2)} hoy, ${eur(S.v.apo, 2)} al mes y un ${nf(S.v.rent, 0, 1)} % al año, llegarías hacia ${cuando(m)} (${plazo(m)}${edadTxt(e)}).` });
    if (S.v.pension > 0 && S.v.edad == null) pR.createDiv({ cls: "fin-note", text: "Para contar la pensión escribe tu edad: sin ella no se sabe cuánto falta para cobrarla." });
    if (R.conPension) {
      const adelanto = R.mesesSin != null && R.mesesCon != null ? R.mesesSin - R.mesesCon : null;
      const txt = R.ahorro >= 1
        ? `Tu pensión de ${eur(S.v.pension, 2)} al mes desde los ${nf(S.v.edadPension, 0, 0)} años te ahorra ${eur(R.ahorro, 2)} de capital${adelanto >= 1 ? ` y adelanta tu independencia ${plazo(adelanto)}` : ""}.`
        : `Con la pensión que has escrito y la edad desde la que la cobras, no hace falta menos capital: llega demasiado tarde para compensar los años hasta cobrarla.`;
      pR.createDiv({ cls: "fin-note", text: txt });
    }
  }
  const aviso = root.createDiv({ cls: "fin-note" });
  aviso.setText("Es orientativo: no sabe lo que rentarán de verdad tus inversiones, no cuenta impuestos y no es asesoramiento financiero. La pensión pública es la cifra que tú escribes; la app no la calcula.");
}

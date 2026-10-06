// ───────────── apuntar a mano ─────────────
function vistaApuntar() {
  titulo("Apuntar un movimiento", "Un gasto en efectivo, algo que aún no ha llegado al banco…");
  formulario(root, "movimiento", null, { volver: "#movimientos", avisoGuardado: "Apuntado ✓", textoGuardar: "Apuntar" });
  root.createDiv({ cls: "fin-note", text: "Si luego importas el extracto y el movimiento está (misma fecha e importe), no se duplica." });
}

// ───────────── cerrar el mes ─────────────
function vistaCerrar() {
  titulo("Actualizar saldos", "Anota lo que tienes en cada cuenta (mejor el último día del mes): así la app comprueba que no falta nada");
  const P = patrimonio();
  const ant = mesAnterior(hoyCal);  // los saldos se cierran por mes natural, empiece cuando empiece «tu mes»
  const primer = P.length ? keyCal(P[0].fecha) : hoyCal;
  const pendienteAnt = ant >= primer && !cierres().some((c) => c.mes === ant);
  let fecha = pendienteAnt ? mesDT(ant).endOf("month") : hoy;
  const resumen = resumenMes(ant);
  if (resumen.length) { const pr = panel(root, `Así fue ${mesLbl(ant).toLowerCase()}`); for (const t of resumen) pr.createDiv({ cls: "fin-note fb-frase", text: t }); }
  const p = panel(root, pendienteAnt ? `Cierre de ${mesLbl(ant).toLowerCase()}` : "Registro de saldos de hoy");
  if (!pendienteAnt && cierres().some((c) => c.mes === ant)) p.createDiv({ cls: "fin-note", text: `${mesLbl(ant)} ya está cerrado. Puedes anotar los saldos de hoy si quieres (por ejemplo, para comprobar que todo cuadra).` });
  const form = p.createDiv({ cls: "fb-form" });
  const campos = {}, refs = { s: {}, v: {} };
  const pintar = () => {
    form.innerHTML = "";
    refs.s = {}; refs.v = {};
    const u = [...P].reverse().find((x) => x.fecha < fecha.startOf("day")) || P[P.length - 1];
    const pr = u ? proyectar(u, fecha.endOf("day")) : null;
    form.createDiv({ cls: "et", text: "Fecha" });
    const iF = form.createEl("input", { attr: { type: "date" } }); iF.value = fecha.toISODate();
    iF.onchange = () => { const d = DateTime.fromISO(iF.value); if (d.isValid) { fecha = d; pintar(); } };
    form.createDiv({ cls: "sep", text: "Saldo de tus cuentas ese día" });
    for (const c of cuentas()) {
      const est = pr ? pr.cuentas.saldos[c.nombre] : null;
      const ext = cfg[`saldo_extracto:${c.nombre}`];
      const et = form.createDiv({ cls: "et", text: c.nombre });
      const i = form.createEl("input", { attr: { type: "number", step: "0.01" } });
      const prefill = ext && ext.fecha === fecha.toISODate() ? ext.saldo : est != null ? Math.round(est * 100) / 100 : "";
      i.value = campos["s:" + c.nombre] ?? prefill;
      i.oninput = () => (campos["s:" + c.nombre] = i.value);
      refs.s[c.nombre] = i;
      form.createDiv({ cls: "s", text: est != null ? `según los movimientos: ${eur(est)}${ext ? ` · último extracto: ${eur(ext.saldo)} el ${fmtISO(ext.fecha)}` : ""}` : "saldo de ese día" });
      if (est != null && ext && ext.fecha <= fecha.toISODate() && Math.abs(ext.saldo - est) >= 0.01) {  // el banco dice otra cosa: por qué puede ser
        const dif = ext.saldo - est;
        const n = form.createDiv({ cls: "s aviso-saldo" });
        n.appendText(`El banco dice ${eur(ext.saldo)}: ${eurS(dif, 2)} respecto a la cuenta de la app. `);
        n.appendText("Falta algún movimiento (o sobra uno apuntado a mano o previsto) entre el último registro y hoy. Si tu banco dice " + eur(ext.saldo) + ", anota ese saldo.");
      }
    }
    const A = activos().filter((a) => !vendidoDelTodo(a));
    if (A.length) {
      form.createDiv({ cls: "sep", text: "Valor de tu inversión ese día" });
      for (const a of A) {
        form.createDiv({ cls: "et", text: a.nombre });
        const i = form.createEl("input", { attr: { type: "number", step: "0.01" } });
        i.value = campos["v:" + a.nombre] ?? Math.round(valorHoy(a) * 100) / 100;
        i.oninput = () => (campos["v:" + a.nombre] = i.value);
        refs.v[a.nombre] = i;
        const sa = form.createDiv({ cls: "s" });
        const part = resumenInversion().filas.find((x) => x.nombre === a.nombre);
        if (part && part.participaciones > 0) {
          sa.appendText(`${nf(part.participaciones, 0, 4)} participaciones × precio `);
          const pr = sa.createEl("input", { cls: "fb-precio", attr: { type: "number", step: "0.0001", min: "0", placeholder: "€", "aria-label": `Precio de ${a.nombre}` } });
          pr.oninput = () => { const v = parseFloat(pr.value); if (v > 0) { i.value = (Math.round(v * part.participaciones * 100) / 100).toFixed(2); campos["v:" + a.nombre] = i.value; } };
          sa.appendText(" € · ");
        }
        sa.appendText(a.fechaValor ? `último valor anotado: ${eur(a.valor)} el ${a.fechaValor.toFormat("dd/MM")}` : "lo que vale hoy en tu bróker");
      }
    }
    form.createDiv({ cls: "sep", text: "Otros" });
    form.createDiv({ cls: "et", text: "Otros bienes (€)" });
    const iO = form.createEl("input", { attr: { type: "number", step: "0.01" } }); iO.value = campos.otros ?? (u ? u.otros || "" : ""); iO.oninput = () => (campos.otros = iO.value);
    form.createDiv({ cls: "et", text: "Deudas (€)" });
    const iD = form.createEl("input", { attr: { type: "number", step: "0.01" } }); iD.value = campos.deudas ?? (u ? u.deudas || "" : ""); iD.oninput = () => (campos.deudas = iD.value);
    form.createDiv({ cls: "et", text: "Lo destacable del mes (opcional)" });
    const iN = form.createEl("textarea", { attr: { rows: "3" } }); iN.value = campos.notas ?? ""; iN.oninput = () => (campos.notas = iN.value);
    Object.assign(refs, { otros: iO, deudas: iD, notas: iN });
  };
  pintar();
  const res = p.createDiv();
  const b = p.createEl("button", { cls: "fb-btn", text: pendienteAnt ? `Cerrar ${mesLbl(ant).toLowerCase()}` : "Guardar los saldos" });
  b.onclick = async () => {
    const saldos = {}, valores = {};
    for (const [n, i] of Object.entries(refs.s)) if (i.value !== "") saldos[n] = i.value;
    for (const [n, i] of Object.entries(refs.v)) if (i.value !== "") valores[n] = i.value;
    b.disabled = true;
    const r = await FB.api("/api/cierre", { fecha: fecha.toISODate(), mes: pendienteAnt ? ant : fecha.toFormat("yyyy-MM"), saldos, valores,
      otros: refs.otros.value, deudas: refs.deudas.value, notas: refs.notas.value });
    b.disabled = false;
    if (!r.ok) { res.innerHTML = ""; mensaje(res, r.mensaje || "Error", "err"); return; }
    FB.aviso(r.mensaje);
    await FB.recargar(); FB.ir("#inicio");
  };
  // Meses cerrados: resumen de cada uno (calculado con los movimientos) y sus notas
  const C = [...cierres()].sort((a, b) => String(b.mes).localeCompare(String(a.mes)));
  if (C.length) plegable(root, "Meses cerrados", (c) => {
    tabla(c, [{ t: "Mes" }, { t: "Ingresos", num: true }, { t: "Gastos", num: true }, { t: "Ahorro", num: true }, { t: "Tasa", num: true, opt: true }, { t: "Notas", opt: true }],
      C.filter((x) => mesDT(x.mes).isValid).map((x) => { const M = finMes(x.mes); return [{ text: mesLbl(x.mes), ruta: x.file.path }, eur(M.ingresos, 0), eur(M.gastos, 0), { text: eurS(M.ahorro, 0), cls: tone(M.ahorro) }, pct(M.tasa), x.notas || ""]; }));
  }, { extra: `${C.length}` });
}


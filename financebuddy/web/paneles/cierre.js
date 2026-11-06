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
  const intro = root.createDiv({ cls: "fb-cierre-intro" });
  const limiteInicial = limiteVar;
  let limiteAplicado = false;
  const cifras = (padre, mes) => {
    const M = finMes(mes), variable = gastoVariable(M);
    const g = padre.createDiv({ cls: "fb-cierre-resumen" });
    const dato = (clave, etiqueta, valor, cls = "") => {
      const d = g.createDiv({ cls: "fb-total", attr: { "data-cierre-cifra": clave } });
      d.createDiv({ cls: "l", text: etiqueta });
      d.createDiv({ cls: `v ${cls}`, text: valor });
    };
    dato("ingresos", "Ha entrado", eur(M.ingresos, 2));
    dato("gastos", "Ha salido", eur(M.gastos, 2), "gasto");
    dato("ahorro", `Ahorro del mes (${pct(M.tasa)})`, eurS(M.ahorro, 2));
    dato("limite", limiteInicial > 0 ? variable > limiteInicial ? "Te pasaste del límite" : "Te sobraron del límite" : "Gasto variable · sin límite",
      eur(limiteInicial > 0 ? Math.abs(variable - limiteInicial) : variable, 2), variable > limiteInicial && limiteInicial > 0 ? "gasto" : "");
  };
  const pintarIntro = () => {
    intro.innerHTML = ""; extra.innerHTML = ""; recap.innerHTML = "";
    const h = root.querySelector("h1");
    if (h) h.textContent = cierra() ? `Cerrar ${mesLbl(mesDe()).toLowerCase()}` : "Actualizar saldos";
    // Sin cerrar ningún mes, lo del mes anterior es un repaso que se puede mirar, plegado: lo que toca aquí es anotar los saldos
    if (!cierra()) { const fr = resumenMes(ant); if (fr.length) plegable(recap, `Así fue ${mesLbl(ant).toLowerCase()}`, (c) => { for (const t of fr) c.createDiv({ cls: "fin-note fb-frase", text: t }); }); return; }
    const mes = mesDe(), nombre = mesLbl(mes).toLowerCase();
    intro.innerHTML = vozMascota("Cerrar el mes guarda cómo ha ido y los saldos del último día. Después podrás seguir corrigiendo movimientos.", "pensando");
    // Primero lo que conviene mirar antes de cerrar; luego cómo ha ido, todo junto en un panel (antes había otro con el mes anterior)
    const pendientes = porRevisar().filter((q) => String((q.fila || {}).fecha || (q.fila || {}).op || "").slice(0, 7) === mes);
    const ch = panel(intro, "Antes de cerrar");
    ch.classList.add("fb-cierre-checklist");
    const lista = ch.createEl("ul");
    const item = lista.createEl("li");
    if (pendientes.length) {
      item.appendText(`${pendientes.length} movimiento${pendientes.length === 1 ? "" : "s"} de ${nombre} sin revisar. `);
      enlace(item, "Revisar ahora", "#repaso/dudas");
    } else item.appendText("No quedan movimientos sin clasificar de este mes.");
    lista.createEl("li", { text: "Comprueba los saldos de abajo con tu banco antes de guardarlos." });
    ch.createDiv({ cls: "fin-note", text: "Puedes cerrar aunque quede algo pendiente: esta lista informa, no bloquea el cierre." });
    const pr = panel(intro, `Así ha ido ${nombre}`);
    cifras(pr, mes);
    // Las frases del mes, sin repetir las cifras de arriba ni lo pendiente de la lista
    for (const t of resumenMes(mes).slice(1).filter((t) => !/^Quedan /.test(t))) pr.createDiv({ cls: "fin-note fb-frase", text: t });
    const metas = objetivosActivos();
    if (metas.length) plegable(extra, "Tus metas", (pm) => {
      for (const o of metas) {
        const f = pm.createDiv({ cls: "fb-obj" });
        f.createEl("b", { text: o.nombre });
        f.createDiv({ cls: "fin-note", text: `${eur(o.ahorrado, 2)} de ${eur(o.meta, 2)} · ${pct(o.ahorrado / o.meta)}` });
        f.createEl("progress", { attr: { max: "1", value: String(Math.max(0, Math.min(1, o.ahorrado / o.meta))), "aria-label": `Progreso de ${o.nombre}` } });
      }
      pm.createDiv({ cls: "fin-note", text: "Las metas no apartan dinero de tus cuentas: miden tu avance actual." });
    }, { extra: `${metas.length}` });
    const pl = panel(intro, "Tu límite para los próximos meses");
    const variable = gastoVariable(finMes(mes));
    if (limiteInicial > 0 && variable > limiteInicial && limiteInicial > 50) {
      // Un ajuste pequeño y previsible: 50 € menos, sin bajar de 50 €. Nunca se aplica al cerrar.
      const propuesta = Math.max(50, limiteInicial - 50);
      const siguiente = mesLbl(mesDT(mes).plus({ months: 1 }).toFormat("yyyy-MM")).toLowerCase();
      pl.createDiv({ cls: "fin-note", text: `Si quieres compensar poco a poco, puedes bajar tu límite ${eur(limiteInicial - propuesta, 2)} (sin bajar de 50 €). Vale para ${siguiente} y los meses siguientes; puedes cambiarlo en Ajustes. Es un límite general: al cambiarlo también se usa como referencia al consultar meses anteriores; no cambia las fotos ya guardadas.` });
      const boton = pl.createEl("button", { cls: "fb-btn sec", text: limiteAplicado ? "Límite guardado ✓" : `Bajar tu límite a ${eur(propuesta, 2)}`, attr: { type: "button", "data-cierre-limite": "" } });
      boton.disabled = limiteAplicado;
      boton.onclick = async () => {
        boton.disabled = true;
        const r = await FB.api("/api/config", { limite_variable: propuesta });
        if (!r.ok) { FB.aviso(r.mensaje || "No se ha podido guardar el límite", true); boton.disabled = false; return; }
        limiteAplicado = true;
        // Deshacer vuelve a poner el límite de antes (el del servidor no cubre /api/config)
        FB.aviso(`Límite bajado a ${eur(propuesta, 2)} ✓`, false, { texto: "Deshacer", fn: async () => {
          const x = await FB.api("/api/config", { limite_variable: limiteInicial });
          FB.aviso(x.ok ? `Límite de nuevo en ${eur(limiteInicial, 2)}` : x.mensaje || "No se ha podido deshacer", !x.ok);
          if (x.ok) { limiteAplicado = false; await FB.recargar(); pintarIntro(); }
        } });
        await FB.recargar();
        pintarIntro();
      };
    } else pl.createDiv({ cls: "fin-note", text: limiteInicial > 0 ? variable <= limiteInicial ? `Te sobraron ${eur(limiteInicial - variable, 2)} de tu límite. No hace falta cambiarlo.` : "Puedes mantener tu límite o cambiarlo en Ajustes." : "No tienes un límite de gasto variable. Puedes ponerlo en Ajustes." });
  };
  const recap = root.createDiv();
  const p = panel(root, "Saldos");
  const extra = root.createDiv();  // debajo del formulario: lo que se mira sin hacer falta para cerrar
  const tit = p.querySelector("h3 span");
  const nota = p.createDiv({ cls: "fin-note" });
  const form = p.createDiv({ cls: "fb-form" });
  const campos = {}, refs = { s: {}, v: {} };
  // Qué mes cierran estos saldos, si cierran alguno: tienen que ser de su último día o de después (el servidor aplica lo mismo).
  // Anotar los saldos a mitad de mes es un registro más: ese mes se sigue pidiendo cuando acabe.
  const mesDe = () => (pendienteAnt ? ant : fecha.toFormat("yyyy-MM"));
  const cierra = () => fecha.toISODate() >= mesDT(mesDe()).endOf("month").toISODate();
  const textoBoton = () => (cierra() ? `Cerrar ${mesLbl(mesDe()).toLowerCase()}` : "Guardar los saldos");
  let b = null;
  const pintar = () => {
    pintarIntro();
    form.innerHTML = "";
    refs.s = {}; refs.v = {};
    tit.textContent = cierra() ? `Cierre de ${mesLbl(mesDe()).toLowerCase()}` : `Saldos del ${fecha.toFormat("dd/MM")}`;
    nota.textContent = !cierra() && cierres().some((c) => c.mes === ant) ? `${mesLbl(ant)} ya está cerrado: esto es solo un registro más, por ejemplo para comprobar que todo cuadra.` : "";
    nota.hidden = !nota.textContent;
    const u = [...P].reverse().find((x) => x.fecha < fecha.startOf("day")) || P[P.length - 1];
    const pr = u ? proyectar(u, fecha.endOf("day"), true) : null;  // como el aviso «No cuadra»: solo lo que el banco ya ha apuntado
    const pInicio = u ? proyectar(u, fecha.endOf("day")) : null;  // lo que cuenta el Inicio: con los fijos y aportaciones que aún no han llegado
    form.createDiv({ cls: "et", text: "Fecha" });
    const iF = form.createEl("input", { attr: { type: "date", "aria-label": "Fecha" } }); iF.value = fecha.toISODate();
    iF.onchange = () => { const d = DateTime.fromISO(iF.value); if (d.isValid) { fecha = d; pintar(); } };
    if (pendienteAnt && !cierra()) form.createDiv({ cls: "s", text: `Para cerrar ${mesLbl(ant).toLowerCase()} hacen falta los saldos de su último día (${mesDT(ant).endOf("month").toFormat("dd/MM")}) o de después: con esta fecha se guardan, pero el mes sigue sin cerrar.` });
    form.createDiv({ cls: "sep", text: "Saldo de tus cuentas ese día" });
    for (const c of cuentas()) {
      const est = pr ? pr.cuentas.saldos[c.nombre] : null;
      const ext = cfg[`saldo_extracto:${c.nombre}`];
      const et = form.createDiv({ cls: "et", text: c.nombre });
      const i = form.createEl("input", { attr: { type: "number", step: "0.01", "aria-label": `Saldo de ${c.nombre}` } });
      const prefill = ext && ext.fecha === fecha.toISODate() ? ext.saldo : est != null ? Math.round(est * 100) / 100 : "";
      i.value = campos["s:" + c.nombre] ?? prefill;
      // Un saldo que no has escrito tú ni trae el extracto de ese día es la estimación de tus movimientos: al guardar se pide confirmar (B-111)
      i.dataset.estimada = est != null && campos["s:" + c.nombre] == null && !(ext && ext.fecha === fecha.toISODate()) ? "1" : "";
      i.oninput = () => (campos["s:" + c.nombre] = i.value);
      refs.s[c.nombre] = i;
      const sinLlegar = est != null && pInicio ? Math.abs(pInicio.cuentas.saldos[c.nombre] - est) : 0;
      form.createDiv({ cls: "s", text: est != null ? `según los movimientos: ${eur(est)}${sinLlegar >= 0.01 ? ` (sin contar ${eur(sinLlegar)} de fijos o aportaciones que aún no han llegado)` : ""}${ext ? ` · último extracto: ${eur(ext.saldo)} el ${fmtISO(ext.fecha)}` : ""}` : "saldo de ese día" });
      if (est != null && u && saldoManual(u, c.nombre)) {  // solo se compara lo escrito con otro saldo manual
        const cu = form.createDiv({ cls: "s cuadre", attr: { "aria-live": "polite" } });
        const cuadre = () => {
          cu.innerHTML = "";
          const v = parseFloat(i.value);
          if (campos["s:" + c.nombre] == null) { cu.hidden = true; return; }
          cu.hidden = false;
          if (!isFinite(v)) { cu.hidden = true; return; }
          const d = Math.round((v - est) * 100) / 100;
          if (d === 0) { cu.appendText("Cuadra con tus movimientos ✓"); return; }
          cu.appendText(`${d > 0 ? "Tienes" : "Te faltan"} ${eur(Math.abs(d))} ${d > 0 ? "más de lo que suman" : "respecto a lo que suman"} tus movimientos: ${d > 0 ? "falta un ingreso o sobra un gasto" : "falta un gasto o sobra un ingreso"}. `);
          accion(cu, `Buscar ${eur(Math.abs(d))}`, () => { FB.estado.masFiltros = null; guardarEstado({ mes: keyDe(fecha), busqueda: nf(Math.abs(d), 2, 2), hist: true }); FB.ir("#movimientos/lista"); }, "Abre tus movimientos buscando ese importe");
        };
        const antes = i.oninput;
        i.oninput = () => { antes(); cuadre(); };
        cuadre();
      }
    }
    const A = activos().filter((a) => !vendidoDelTodo(a));
    if (A.length) {
      form.createDiv({ cls: "sep", text: "Valor de tu inversión ese día" });
      for (const a of A) {
        form.createDiv({ cls: "et", text: a.nombre });
        const i = form.createEl("input", { attr: { type: "number", step: "0.01", "aria-label": `Valor de ${a.nombre}` } });
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
    const iO = form.createEl("input", { attr: { type: "number", step: "0.01", "aria-label": "Otros bienes (€)" } }); iO.value = campos.otros ?? (u ? u.otros || "" : ""); iO.oninput = () => (campos.otros = iO.value);
    form.createDiv({ cls: "et", text: "Deudas (€)" });
    const iD = form.createEl("input", { attr: { type: "number", step: "0.01", "aria-label": "Deudas (€)" } }); iD.value = campos.deudas ?? (u ? u.deudas || "" : ""); iD.oninput = () => (campos.deudas = iD.value);
    let iN = null;  // la nota es del mes que se cierra: sin cierre, no se pide
    if (cierra()) {
      form.createDiv({ cls: "et", text: "Lo destacable del mes (opcional)" });
      iN = form.createEl("textarea", { attr: { rows: "3", "aria-label": "Lo destacable del mes (opcional)" } }); iN.value = campos.notas ?? ""; iN.oninput = () => (campos.notas = iN.value);
    }
    Object.assign(refs, { otros: iO, deudas: iD, notas: iN });
    if (b) b.textContent = textoBoton();
  };
  pintar();
  const res = p.createDiv();
  b = p.createEl("button", { cls: "fb-btn", text: textoBoton() });
  b.onclick = async () => {
    const saldos = {}, valores = {};
    for (const [n, i] of Object.entries(refs.s)) if (i.value !== "") saldos[n] = i.value;
    for (const [n, i] of Object.entries(refs.v)) if (i.value !== "") valores[n] = i.value;
    // Lo que sale de la estimación no es el saldo del banco: se confirma antes de guardarlo (B-111)
    const estimados = Object.entries(refs.s).filter(([n, i]) => i.dataset.estimada === "1" && campos["s:" + n] == null && i.value !== "");
    if (estimados.length && !(await confirmar(`Estos saldos no los has escrito tú: son lo que suman tus movimientos (${estimados.map(([n, i]) => `${n} ${eur(Number(i.value))}`).join(", ")}).\n\nGuárdalos solo si coinciden con lo que dice tu banco. Si no, escribe el saldo de tu banco antes de guardar.`, { titulo: "¿Guardar saldos estimados?", si: "Guardarlos igualmente", no: "Revisarlos" }))) return;
    b.disabled = true;
    // Al cerrar el mes se guarda su foto: lo que dicen hoy los datos de ese mes, que ya no cambia aunque luego edites movimientos
    const foto = cierra() ? fotoCierre(mesDe(), saldos, valores, refs.otros.value, refs.deudas.value, hoy.toISODate()) : undefined;
    const r = await FB.api("/api/cierre", { fecha: fecha.toISODate(), mes: mesDe(), saldos, valores, foto,
      otros: refs.otros.value, deudas: refs.deudas.value, notas: refs.notas ? refs.notas.value : "" });
    b.disabled = false;
    if (!r.ok) { res.innerHTML = ""; mensaje(res, r.mensaje || "Error", "err"); return; }
    const cerrado = cierra(), mesGuardado = mesDe();
    // Lo que ha pasado, en palabras de la pantalla (el mensaje del servidor habla de «registro de patrimonio»)
    const hecho = `Saldos del ${fecha.toFormat("dd/MM/yyyy")} guardados`;
    FB.aviso(cerrado ? `${mesLbl(mesGuardado)} cerrado ✓ · ${hecho.toLowerCase()}` : `${hecho} ✓`, false, r.deshacer ? avisoDeshacer() : undefined);
    await FB.recargar();
    if (!cerrado) { FB.ir("#inicio"); return; }
    root.innerHTML = "";
    titulo(`${mesLbl(mesGuardado)} cerrado`, `${hecho}. Puedes seguir corrigiendo movimientos: la foto del cierre se conserva.`);
    const final = root.createDiv({ cls: "fb-cierre-final", attr: { role: "status" } });
    final.innerHTML = vozMascota("Mes cerrado. Si luego corriges algo, la foto de cómo estaba al cerrarlo no cambia.", "celebra", { etiqueta: true });
    cifras(panel(final, `Así ha ido ${mesLbl(mesGuardado).toLowerCase()}`), mesGuardado);
    enlace(final, "Volver al Inicio", "#inicio").className += " fb-btn";
    celebrarMascota(final);
    panelMesesCerrados(root);
  };
  panelMesesCerrados(root);
}

// Meses cerrados: resumen de cada uno (calculado con los movimientos), sus notas y su foto. También tras cerrar uno, en la misma pantalla.
function panelMesesCerrados(padre) {
  const C = [...cierres()].sort((a, b) => String(b.mes).localeCompare(String(a.mes)));
  if (C.length) plegable(padre, "Meses cerrados", (c) => {
    tabla(c, [{ t: "Mes" }, { t: "Ingresos", num: true }, { t: "Gastos", num: true }, { t: "Ahorro", num: true }, { t: "Tasa", num: true, opt: true }, { t: "Notas", opt: true }],
      C.filter((x) => mesDT(x.mes).isValid).map((x) => { const M = finMes(x.mes); return [{ text: mesLbl(x.mes), ruta: x.file.path }, eur(M.ingresos), eur(M.gastos), { text: eurS(M.ahorro), cls: tone(M.ahorro) }, pct(M.tasa), x.notas || ""]; }));
    const conFoto = C.filter((x) => mesDT(x.mes).isValid && x.foto);
    for (const x of conFoto) plegable(c, `Foto de ${mesLbl(x.mes).toLowerCase()}`, (d) => fotoDelCierre(d, x));
    if (conFoto.length < C.length) c.createDiv({ cls: "fin-note", text: "Los meses cerrados antes de que existiera la foto no la tienen: se guarda al cerrar un mes." });
  }, { extra: `${C.length}` });
}

// La foto de un mes cerrado: lo que decían los datos al cerrarlo y lo que dicen hoy, con lo que ha cambiado desde entonces.
function fotoDelCierre(c, x) {
  const f = x.foto, H = fotoHoy(x), D = cambiosFoto(f, H);
  c.createDiv({ cls: "fin-note", text: `Así estaban tus datos de ${mesLbl(x.mes).toLowerCase()} al cerrarlo${f.hecha && mesDT(f.hecha.slice(0, 7)).isValid ? ` (el ${DateTime.fromISO(f.hecha).toFormat("dd/MM/yyyy")})` : ""}. La foto no cambia aunque edites movimientos; la columna «Hoy» sí.` });
  const fila = (nombre, antes, ahora) => [nombre, eur(antes), eur(ahora ?? antes)];
  tabla(c, [{ t: "Cifra" }, { t: "Al cerrar", num: true }, { t: "Hoy", num: true }], FOTO_CIFRAS.filter(([k]) => f[k] != null).map(([k, l]) => fila(l, f[k], H[k])));
  const nombres = D.cifras.map((y) => `${y.etiqueta.toLowerCase()}: ${eur(y.antes)} → ${eur(y.ahora)}`);
  c.createDiv({ cls: "fin-note fb-frase", text: nombres.length ? `Desde entonces ha cambiado: ${nombres.join("; ")}.` : "Desde entonces no ha cambiado nada." });
  if (D.categorias.length) plegable(c, "Gasto por categoría que ha cambiado", (e) => {
    tabla(e, [{ t: "Categoría" }, { t: "Al cerrar", num: true }, { t: "Hoy", num: true }], D.categorias.map((y) => fila(y.nombre, y.antes, y.ahora)));
  }, { extra: `${D.categorias.length}` });
}


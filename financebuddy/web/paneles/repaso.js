// ───────────── revisión guiada del extracto ─────────────
function guardarRepaso(e) {
  FB.estado.repaso = e;
  try { localStorage.setItem("fb-repaso", JSON.stringify(e)); } catch (_) {}
}
function filasRepaso(ids) {
  const out = [];
  for (const m of DB.registros.movimiento || []) if (ids.includes(m.lote)) out.push({ cuenta: m.cuenta, fecha: m.fecha, texto: m.ext_texto || m.concepto, categoria: m.categoria || "Entre tus cuentas", importe: m.ext_importe != null ? num(m.ext_importe) : m.clase === "gasto" ? -num(m.importe) : ["ingreso", "reembolso"].includes(m.clase) ? num(m.importe) : 0 });
  for (const p of DB.pendientes || []) if (ids.includes(p.lote)) out.push({ cuenta: p.cuenta, fecha: p.fila.op, texto: p.fila.texto, categoria: "Por revisar", importe: p.fila.importe });
  for (const tipo of ["aportacion", "cobro", "operacion"]) for (const m of DB.registros[tipo] || []) if (ids.includes(m.lote)) out.push({ cuenta: m.cuenta || (cfg.importaciones || []).find((l) => l.id === m.lote)?.cuenta || "Inversión", fecha: m.fecha, texto: m.activo || m.concepto || "Operación de inversión", categoria: tipo === "aportacion" ? "Inversión" : tipo === "cobro" ? "Cobro de inversión" : "Orden de inversión", importe: tipo === "aportacion" ? -num(m.importe) : num(m.importe) });
  return out.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
}
function iniciarRepaso(resultados = []) {
  const ids = resultados.map((r) => r.lote).filter(Boolean);
  const ultimo = (cfg.importaciones || [])[0];
  if (!ids.length && ultimo) ids.push(ultimo.id);
  const e = { lote: ids.join("|"), carpeta: (DB.info || {}).carpeta, paso: 1, saldos: {}, iniciales: porRevisar().length, resultados, filas: filasRepaso(ids) };
  guardarRepaso(e);
  return e;
}
function estadoRepaso() {
  // Consumir el resultado con los datos del montaje nuevo, después de refrescar.
  if (FB.repasoImportado) { const r = FB.repasoImportado; delete FB.repasoImportado; return iniciarRepaso(r); }
  if (FB.estado.repaso) return FB.estado.repaso;
  let e;
  try { e = JSON.parse(localStorage.getItem("fb-repaso")); } catch (_) {}
  const ultimo = (cfg.importaciones || [])[0];
  if (!e || e.carpeta !== (DB.info || {}).carpeta || (ultimo && !(e.lote || "").split("|").includes(ultimo.id)) || (e.lote && !ultimo)) return iniciarRepaso();
  FB.estado.repaso = e;
  return e;
}
function importeRepaso(t) {
  const s = String(t || "").trim();
  if (!s) return null;
  const signo = /^[−-]/.test(s) ? -1 : 1;
  return signo * leerImporte(s.replace(/^[−+-]/, ""));
}
// Lo que el banco ya debería decir hoy, igual que el cierre: proyectar con `exacto`, sin fijos ni aportaciones que aún no han llegado.
// Se calcula en cada pintado: si resuelves dudas o llega otro extracto, cambia con ellos.
// Cada cuenta, desde el último registro de antes de hoy que la tenga; una cuenta que solo está anotada hoy se compara con eso, y una
// que no está en ningún registro no tiene estimación (lo que escribas será su saldo de partida): nunca se compara con un 0 inventado.
function estimadosRepaso(soloManuales = false) {
  const P = patrimonio(), out = {};
  const tiene = (x, n) => Object.prototype.hasOwnProperty.call(x.cuentas.saldos, n);
  const cache = new Map(), desde = (u) => { if (!cache.has(u)) cache.set(u, proyectar(u, hoy.endOf("day"), true).cuentas.saldos); return cache.get(u); };
  for (const c of cuentas()) {
    const u = [...P].reverse().find((x) => x.fecha < hoy.startOf("day") && tiene(x, c.nombre)) || [...P].reverse().find((x) => tiene(x, c.nombre));
    if (u && (!soloManuales || saldoManual(u, c.nombre))) out[c.nombre] = desde(u)[c.nombre];
  }
  return out;
}
function cuadreRepaso(e, c, est = estimadosRepaso(true)[c.nombre]) {
  const n = importeRepaso(e.saldos[c.nombre]);
  return n === null ? null : !Number.isFinite(n) ? { invalido: true } : est == null ? { sinBase: true } : { diferencia: Math.round((n - est) * 100) / 100 };
}
function vistaRepaso() {
  const e = estadoRepaso(), CS = cuentas(), n = porRevisar().length;
  const lotes = new Set((e.lote || "").split("|").filter(Boolean));
  const dudas = porRevisar(), deEste = dudas.filter((q) => lotes.has(q.lote)), anteriores = dudas.filter((q) => !lotes.has(q.lote));
  // #repaso/dudas y #repaso/saldos abren directamente el paso 2 o 3 (desde el Inicio y las Cuentas). Solo al llegar:
  // después el usuario se mueve con Atrás/Siguiente sin que la ruta lo devuelva al mismo paso en cada repintado.
  const directo = { "#repaso/dudas": 2, "#repaso/saldos": 3 }[location.hash];
  if (!directo) FB.estado.repasoDirecto = null;
  else if (FB.estado.repasoDirecto !== location.hash) { e.paso = directo; FB.estado.repasoDirecto = location.hash; FB.estado.repasoSeguir = true; guardarRepaso(e); }
  titulo("Revisión del extracto", "Tú decides qué revisar ahora y qué dejar para luego.");
  const cambiar = (paso) => { e.paso = paso; guardarRepaso(e); FB.estado.repasoSeguir = true; render(); root.querySelector(".fb-paso-titulo")?.focus(); };
  const boton = (padre, texto, fn, sec = false) => { const b = padre.createEl("button", { cls: "fb-btn" + (sec ? " sec" : ""), text: texto }); b.onclick = fn; return b; };
  if ([2, 3].includes(e.paso) && !FB.estado.repasoSeguir) {
    const p = panel(root, `Seguir donde lo dejaste (paso ${e.paso} de 3)`);
    boton(p, "Seguir", () => { FB.estado.repasoSeguir = true; render(); });
    boton(p, "Empezar de nuevo", () => { e.paso = 1; e.saldos = {}; e.guardados = false; guardarRepaso(e); FB.estado.repasoSeguir = true; render(); }, true);
    return;
  }
  const ol = root.createEl("ol", { cls: "fb-pasos", attr: { "aria-label": "Pasos de la revisión" } });
  for (const [i, t] of ["Qué ha entrado", "Qué necesita revisión", "Comprobar saldos"].entries()) ol.createEl("li", { text: `${i + 1} · ${t}`, attr: e.paso === i + 1 ? { "aria-current": "step" } : {} });
  const p = root.createDiv({ cls: "fin-panel" });
  p.createEl("h2", { cls: "fb-paso-titulo", text: e.paso === "hecho" ? "Hecho por hoy" : ["Qué ha entrado", "Qué necesita revisión", "Comprobar saldos"][e.paso - 1], attr: { tabindex: "-1" } });
  const voz = (texto, pose) => { const v = p.createDiv(); v.innerHTML = vozMascota(texto, pose); return v; };
  const EST = estimadosRepaso(), CMP = estimadosRepaso(true);
  const cuadros = CS.map((c) => cuadreRepaso(e, c, CMP[c.nombre]));
  const cuadran = cuadros.filter((x) => x && !x.invalido && !x.sinBase && x.diferencia === 0).length;
  const conDiferencia = cuadros.filter((x) => x && !x.invalido && !x.sinBase && x.diferencia !== 0).length;
  const sinComprobar = CS.length - cuadran - conDiferencia;
  if (e.paso === 1) {
    if (!e.lote && n) { voz(`No hay ninguna importación reciente, pero tienes ${n === 1 ? "1 movimiento" : `${n} movimientos`} por revisar. Empezamos por ahí.`, "pensando"); }
    else if (!e.lote) { voz("No hay ninguna importación reciente. Importa un extracto y lo miramos juntos.", "normal"); enlace(p, "Importar un extracto", "#importar"); }
    else {
      voz(deEste.length ? "Esto es lo que he leído; en el paso siguiente vemos lo que falta clasificar de este extracto. Lo pendiente de antes queda aparte." : "Esto es lo que he leído. Este extracto no tiene dudas; en el paso siguiente puedes ir directo a comprobar saldos o revisar lo pendiente de antes.", "normal");
      resumenImportaciones(p);
      avisoDeshacerPendiente(p);
      for (const r of e.resultados) resultadoImport(p, r);
      const grupos = [...new Set(e.filas.map((m) => m.cuenta))];
      for (const cuenta of grupos) {
        const filas = e.filas.filter((m) => m.cuenta === cuenta), rs = e.resultados.filter((r) => r.cuenta === cuenta);
        p.createEl("h3", { text: `${cuenta} · del ${fechaCorta(filas[0].fecha)} al ${fechaCorta(filas[filas.length - 1].fecha)}` });
        tiles(p, [{ l: "Nuevos", v: String(rs.length ? sum(rs.map((r) => num(r.nuevas) + num(r.dudas))) : filas.length) }, { l: "Ya estaban", v: rs.length ? String(sum(rs.map((r) => num(r.existentes)))) : "No disponible" }, { l: "Entradas", v: eur(sum(filas.filter((m) => m.importe > 0).map((m) => m.importe)), 2) }, { l: "Salidas", v: eur(-sum(filas.filter((m) => m.importe < 0).map((m) => m.importe)), 2) }, { l: "Sin clasificar", v: String(filas.filter((m) => m.categoria === "Por revisar").length) }]);
      }
      plegable(p, `Ver los ${e.filas.length} movimientos importados`, (c) => tabla(c, [{ t: "Cuenta" }, { t: "Fecha" }, { t: "Texto del banco" }, { t: "Categoría" }, { t: "Importe", num: true }], e.filas.map((m) => [m.cuenta, fechaCorta(m.fecha), m.texto, m.categoria, eurS(m.importe)])));
      if (!e.resultados.length) for (const lote of (cfg.importaciones || []).filter((l) => e.lote.split("|").includes(l.id))) botonQuitarImportacion(p, lote, "Quitar esta importación");
    }
  } else if (e.paso === 2) {
    voz(deEste.length ? "Elige qué es cada grupo de este extracto; si no lo sabes, déjalo para luego. Lo pendiente de antes está aparte." : "Este extracto no tiene dudas pendientes. Puedes ir directo a saldos; lo pendiente de antes puede esperar.", deEste.length ? "pensando" : "normal");
    p.createEl("h3", { text: `De este extracto: ${deEste.length}`, attr: { role: "status" } });
    if (deEste.length) montarRevision(p, { soloIds: new Set(deEste.map((q) => q.id)), clavePagina: `repaso_actual_${e.lote}` });
    else {
      p.createDiv({ text: "No hay dudas pendientes de este extracto." });
      boton(p, "Ir directamente a saldos", () => cambiar(3));
    }
    if (anteriores.length) {
      const anterior = FB.estado.repasoAnteriores;
      const d = plegable(p, `Pendiente de antes: ${anteriores.length} · Revisarlos ahora`, (c) => montarRevision(c, { soloIds: new Set(anteriores.map((q) => q.id)), clavePagina: `repaso_anteriores_${e.lote}` }), { abierto: anterior?.lote === e.lote && anterior.abierto });
      d.addEventListener("toggle", () => { if (d.isConnected) FB.estado.repasoAnteriores = { lote: e.lote, abierto: d.open }; });
    }
  } else if (e.paso === 3) {
    const preocupacion = cuadros.some((x) => x && (x.invalido || (!x.sinBase && x.diferencia !== 0)));
    const v = voz("Comprueba los saldos con tu banco. Los campos empiezan vacíos: no hace falta comprobarlos todos ahora.", preocupacion ? "preocupado" : "pensando");
    const actualizarVoz = () => { const mal = CS.some((c) => { const x = cuadreRepaso(e, c, CMP[c.nombre]); return x && (x.invalido || (!x.sinBase && x.diferencia !== 0)); }); v.innerHTML = vozMascota("Comprueba los saldos con tu banco. Tú decides cuándo guardarlos.", mal ? "preocupado" : "pensando"); };
    const rejilla = p.createDiv({ cls: "fb-repaso-saldos" });
    for (const c of CS) {
      const f = rejilla.createDiv({ cls: "fb-card" });
      f.createEl("h3", { text: nombreCuenta(c) });
      f.createDiv({ cls: "fb-repaso-est", text: EST[c.nombre] == null ? "Aún no hay saldo desde el que estimar." : `Según tus movimientos: ${eur(EST[c.nombre], 2)}` });
      const l = f.createEl("label", { cls: "fb-repaso-campo", text: `Saldo que ves en tu banco hoy (${nombreCuenta(c)})` });
      const inp = l.createEl("input", { attr: { type: "text", inputmode: "decimal", autocomplete: "off" } }); inp.value = e.saldos[c.nombre] || "";
      const res = f.createDiv({ attr: { role: "status" } });
      const comprobar = () => {
        const x = cuadreRepaso(e, c, CMP[c.nombre]); res.empty(); if (!x) return;
        const mal = x.invalido || (!x.sinBase && x.diferencia !== 0);
        const texto = x.invalido ? "Escribe una cifra, por ejemplo 1.697,06" : x.sinBase ? "Se guardará como saldo comprobado por ti." : x.diferencia === 0 ? "✓ Cuadra" : `No cuadra por ${eur(Math.abs(x.diferencia), 2)}`;
        const t = res.createSpan({ text: texto }); if (mal) t.style.color = "var(--rose)";
        if (mal) {
          const fd = fechaDatos();
          const n = res.createDiv({ cls: "fin-note", text: `¿Falta alguna entrada o algún gasto${fd ? ` después del ${fechaCorta(fd.toISODate())}` : ""}? Revisa también los traspasos entre tus cuentas. ` });
          // Un clic hasta la causa: los movimientos de esa cuenta (lo escrito aquí se queda; «Comprobar saldo» trae de vuelta)
          enlace(n, `Ver los movimientos de ${nombreCuenta(c)} →`, `#cuentas/${c.p.id}`);
        }
      };
      inp.oninput = () => { e.saldos[c.nombre] = inp.value; e.guardados = false; guardarRepaso(e); };
      inp.onchange = () => { comprobar(); actualizarVoz(); };
      inp.onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); comprobar(); actualizarVoz(); } };
      comprobar();
    }
    boton(p, e.guardados ? "Saldos guardados" : "Guardar estos saldos", async () => {
      const escritos = CS.filter((c) => String(e.saldos[c.nombre] || "").trim());
      if (!escritos.length) { FB.aviso("Escribe al menos un saldo de tu banco."); return; }
      if (escritos.some((c) => !Number.isFinite(importeRepaso(e.saldos[c.nombre])))) { FB.aviso("Hay un saldo que no es una cifra.", true); return; }
      // /api/saldo_banco sustituye los saldos de ese día: una cuenta que no has escrito conserva lo anotado hoy; si hoy
      // no hay nada suyo, se guardaría la estimación de tus movimientos, y eso se confirma antes, como en el cierre (B-111).
      const deHoy = (DB.registros.patrimonio || []).find((x) => x.fecha === hoy.toISODate());
      const saldos = {}, estimados = [];
      for (const c of CS) {
        if (escritos.includes(c)) saldos[c.nombre] = importeRepaso(e.saldos[c.nombre]);
        else if (!(deHoy && deHoy.saldos && deHoy.saldos[c.nombre] != null) && EST[c.nombre] != null) { saldos[c.nombre] = Math.round(EST[c.nombre] * 100) / 100; estimados.push(c); }
      }
      if (estimados.length && !(await confirmar(`Estos saldos no los has escrito tú: son lo que suman tus movimientos (${estimados.map((c) => `${nombreCuenta(c)} ${eur(saldos[c.nombre], 2)}`).join(", ")}).\n\nGuárdalos solo si coinciden con lo que dice tu banco. Si no, escribe el saldo de tu banco antes de guardar.`, { titulo: "¿Guardar saldos estimados?", si: "Guardarlos igualmente", no: "Revisarlos" }))) return;
      const r = await FB.api("/api/saldo_banco", { fecha: hoy.toISODate(), saldos });
      if (r.ok) { e.guardados = true; guardarRepaso(e); }
      FB.aviso(r.ok ? "Saldos de hoy guardados. No se ha cerrado el mes." : r.mensaje || "No se han podido guardar", !r.ok, r.ok && r.deshacer ? avisoDeshacer() : undefined);
      await FB.refrescar();
    });
  } else {
    const texto = n ? `Hecho por hoy. Te quedan ${n} movimientos por revisar; te los recuerdo en el Inicio, sin prisa.` : CS.length && cuadran === CS.length ? "Extracto revisado y saldos comprobados. Este mes ya cuadra." : "Movimientos revisados. Cuando quieras, comprueba los saldos.";
    const v = voz(texto, "celebra"); celebrarMascota(v);
    const lista = p.createEl("ul");
    lista.createEl("li", { text: `${Math.max(0, e.iniciales - n)} revisados de ${e.iniciales}` });
    const resumenSaldos = cuadran + conDiferencia === 0 ? `Saldos sin comprobar${CS.length ? `: ${CS.length}` : ""}` : `Saldos que cuadran: ${cuadran} · Con diferencia: ${conDiferencia} · Sin comprobar: ${sinComprobar}`;
    lista.createEl("li", { text: `${resumenSaldos}${e.guardados ? " · guardados" : " · comprobar no guarda los saldos"}` });
    lista.createEl("li", { text: `Gasto variable del mes: ${eur(gastoVariable(finMes(hoyKey)), 2)}` });
    enlace(p, "Volver al Inicio", "#inicio");
    return;
  }
  const f = root.createDiv({ cls: "fb-fila" });
  if (e.paso > 1) boton(f, "Atrás", () => cambiar(e.paso - 1), true);
  boton(f, e.paso === 3 ? "Terminar" : e.paso === 2 && deEste.length ? "Dejarlo para luego" : "Siguiente", () => cambiar(e.paso === 3 ? "hecho" : e.paso + 1));
  enlace(f, "Salir y seguir luego", "#inicio");
}

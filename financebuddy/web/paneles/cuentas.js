// Las preferencias son solo de presentación: los movimientos siguen usando `nombre`.
const ICONOS_CUENTA = [["🏦", "Banco"], ["🌱", "Planta"], ["📈", "Gráfico"], ["💼", "Maletín"], ["🏠", "Casa"], ["✈️", "Avión"], ["🎯", "Diana"], ["💶", "Billetes"]];
const nombreCuenta = (c) => c.alias || c.nombre;
const diseñoCuenta = (c) => ({ color: c.color || ({ corriente: 1, ahorro: 2, broker: 3 }[c.tipo] || 6), icono: c.icono || ({ corriente: "🏦", ahorro: "🌱", broker: "📈" }[c.tipo] || "💼") });
function datoSaldoCuenta(c) {
  const E = estimacion(), base = E && E.base;
  const conocido = !!(base && Object.prototype.hasOwnProperty.call(base.cuentas.saldos, c.nombre));
  return { saldo: conocido ? E.cuentas.saldos[c.nombre] : null, fecha: conocido ? base.fecha.toFormat("dd/MM") : "" };
}
function tarjetaCuenta(c, opts = {}) {
  // Construir con nodos evita que un nombre o alias se interprete como HTML.
  const a = document.createElement("a"), d = diseñoCuenta(c), s = datoSaldoCuenta(c);
  a.className = `fb-tcuenta fb-cuenta-color-${d.color} internal-link`;
  a.href = `#cuentas/${encodeURIComponent(c.p.id)}`;
  if (opts.actual) a.setAttribute("aria-current", "page");
  const agregar = (clase, texto) => { const el = document.createElement("span"); el.className = clase; el.textContent = texto; a.appendChild(el); return el; };
  agregar("fb-tcuenta-nombre", nombreCuenta(c));
  const tipo = { corriente: "Cuenta corriente", ahorro: "Ahorro", broker: "Bróker · sin invertir", otro: "Otra cuenta" }[c.tipo];
  if (norm(nombreCuenta(c)) !== norm(tipo)) agregar("fb-tcuenta-tipo", tipo);
  agregar("fb-tcuenta-icono", d.icono).setAttribute("aria-hidden", "true");
  agregar("fb-tcuenta-saldo", s.saldo == null ? "Sin saldo anotado" : eur(s.saldo, 2));
  agregar("fb-tcuenta-origen", s.fecha ? `estimado hoy · anotado el ${s.fecha}` : "Comprueba el saldo para empezar");
  return a.outerHTML;
}
function vistaCuentas() {
  cabecera("Tus cuentas", false, "Cuentas reales, con su saldo estimado. El nombre visible no cambia tus movimientos.");
  if (!cuentas().length) { vacio(root, "Todavía no tienes cuentas", " Añade la primera para ver su saldo y sus movimientos.", { texto: "Añadir una cuenta", ruta: "#editar/cuenta/nuevo" }); return; }
  const c = cuentas().find((x) => String(x.p.id) === params[0]);
  const tarjetas = root.createDiv({ cls: "fb-cuentas-grid" });
  tarjetas.innerHTML = cuentas().map((x) => tarjetaCuenta(x, { actual: x === c })).join("");
  enlace(root.createDiv({ cls: "fb-fila" }), "+ Añadir una cuenta", "#editar/cuenta/nuevo").className += " fb-btn sec";
  if (!c) {
    root.createDiv({ cls: "fin-note", text: params[0] ? "Esa cuenta ya no existe. Elige otra de arriba." : "Pulsa una tarjeta para anotar su saldo, ver sus movimientos o personalizarla." });
    return;
  }
  const columnas = root.createDiv({ cls: "fb-cuenta-detalle" }), lista = panel(columnas, `Movimientos de ${nombreCuenta(c)}`);
  lista.createDiv({ cls: "fin-note", text: mesLbl(hoyKey) });
  const saldo = datoSaldoCuenta(c);
  // Lo primero que se hace con una cuenta: anotar (o comprobar) lo que tiene en el banco. Un botón a la vista, no un enlace en la nota.
  const fs = lista.createDiv({ cls: "fb-fila fb-cuenta-saldo-accion" });
  enlace(fs, saldo.fecha ? "Comprobar el saldo con tu banco" : "Anotar el saldo de hoy", "#repaso/saldos").className += " fb-btn";
  lista.createEl("p", { cls: "fin-note", text: saldo.fecha ? `Saldo estimado hoy: anotado el ${saldo.fecha} + los movimientos de después. No es el saldo del banco hasta que lo compruebes.` : "Aún no hay un saldo anotado para esta cuenta: escribe lo que ves hoy en tu banco y la app lo usará como punto de partida." });
  const ms = movimientos().filter((m) => !m.auto && !m.previsto && keyDe(m.fecha) === hoyKey && (m.cuenta === c.nombre || m.destino === c.nombre || m.origen === c.nombre)).sort((a, b) => b.fecha - a.fecha);
  const filas = lista.createDiv({ cls: "fb-lista" });
  if (!ms.length) vacio(filas, "Sin movimientos este mes");
  for (const m of ms) {
    const entrada = m.clase === "ingreso" || m.clase === "reembolso" || (m.clase === "transferencia" && (m.destino === c.nombre || (m.cuenta === c.nombre && m.origen)));
    const fila = item(filas, { fecha: m.fecha, t: m.concepto, s: m.categoria || (m.clase === "transferencia" ? "Entre tus cuentas" : "Sin revisar"), v: `${entrada ? "+" : "−"}${eur(m.importe, 2)}`, ruta: m.pendiente ? "#revisar" : `#editar/movimiento/${m.p.id}` });
    if (!entrada) fila.classList.add("fb-cuenta-salida");
  }
  const ver = enlace(lista, "Ver todos en Movimientos →", "#movimientos/lista");
  ver.onclick = () => guardarEstado({ filtroCat: null, busqueda: null, hist: true, cuentaMov: c.nombre });
  const personal = panel(columnas, "Personalizar"), form = personal.createEl("form", { cls: "fb-cuenta-form" });
  const label = form.createEl("label", { cls: "fb-campo" });
  label.createSpan({ text: "Nombre visible" });
  const campoAlias = label.createEl("input", { attr: { type: "text", name: "alias", maxlength: "24", placeholder: c.nombre } }); campoAlias.value = c.alias;
  form.createDiv({ cls: "fin-note", text: `Nombre interno: ${c.nombre}. Tus movimientos siguen usando ese nombre.` });
  const radios = (titulo, nombre, opciones, elegido) => {
    const grupo = form.createEl("fieldset", { cls: "fb-cuenta-opciones" }); grupo.createEl("legend", { text: titulo });
    for (const [v, texto] of opciones) {
      const l = grupo.createEl("label", { cls: nombre === "color" ? `fb-cuenta-muestra fb-cuenta-color-${v}` : "fb-cuenta-icono-opcion" });
      const r = l.createEl("input", { attr: { type: "radio", name: nombre, value: String(v), "aria-label": texto } }); r.checked = String(elegido) === String(v);
      l.createSpan({ text: nombre === "color" ? texto : v, attr: { "aria-hidden": "true" } });
    }
  };
  const diseño = diseñoCuenta(c);
  radios("Icono", "icono", ICONOS_CUENTA, diseño.icono);
  radios("Color", "color", [1, 2, 3, 4, 5, 6].map((n) => [n, `Color ${n}`]), diseño.color);
  const botones = form.createDiv({ cls: "fb-cuenta-botones" });
  const guardar = botones.createEl("button", { cls: "fb-btn", text: "Guardar", attr: { type: "submit" } });
  const original = botones.createEl("button", { cls: "fb-btn sec", text: "Volver al diseño original", attr: { type: "button" } });
  const salvar = async (campos) => {
    guardar.disabled = original.disabled = true;
    try {
      const r = await FB.api("/api/guardar", { tipo: "cuenta", id: c.p.id, datos: { ...c.p, ...campos } });
      if (!r.ok) { FB.aviso(r.mensaje || "No se ha podido guardar la cuenta", true); return; }
      await FB.refrescar();
      FB.aviso("Diseño de la cuenta guardado", false, { texto: "Deshacer", fn: async () => { await FB.api("/api/deshacer", {}); await FB.refrescar(); } });
    } finally { guardar.disabled = original.disabled = false; }
  };
  form.onsubmit = (e) => { e.preventDefault(); salvar({ alias: campoAlias.value, icono: form.querySelector('[name="icono"]:checked').value, color: form.querySelector('[name="color"]:checked').value }); };
  original.onclick = () => salvar({ alias: "", icono: "", color: "" });
  enlace(personal.createDiv({ cls: "fin-note" }), "Editar los datos de la cuenta →", `#editar/cuenta/${c.p.id}`);
}

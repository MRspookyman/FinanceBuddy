// Flujos con clics de verdad, en el navegador y contra el servidor (datos de ejemplo). Lo que comprueban las pruebas de
// pantallas es que cada pantalla se dibuja; esto comprueba que las cosas que hace el usuario funcionan de punta a punta.
//
// Se ejecuta con:  python pruebas\run.py --flujos      (lo carga nucleo.js cuando la dirección lleva ?flujos=1)
// Recibe FB (la API de la página) y devuelve una promesa con [{nombre, ok, detalle}].
// Cada caso devuelve el motivo del fallo (texto) o nada si va bien.
return (async () => {
  const casos = [];
  const app = () => document.getElementById("app");
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const hasta = async (fn, ms = 6000) => {
    for (const t0 = Date.now(); ;) {
      let v = null;
      try { v = fn(); } catch (_) { v = null; }
      if (v) return v;
      if (Date.now() - t0 > ms) return null;
      await dormir(40);
    }
  };
  const todos = (sel, raiz) => [...(raiz || app()).querySelectorAll(sel)];
  const porTexto = (sel, texto, raiz) => todos(sel, raiz).find((e) => (e.textContent || "").toLowerCase().includes(String(texto).toLowerCase()));
  const campo = (etiqueta) => {
    const et = todos(".et").find((e) => (e.textContent || "").trim().toLowerCase().startsWith(etiqueta.toLowerCase()));
    return et && et.nextElementSibling;
  };
  const escribir = (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
  const ir = async (ruta) => {
    FB.ir(ruta);
    return await hasta(() => app().dataset.vista === ruta.replace(/^#/, "").split("/")[0] && app().querySelector(".fin-page > *"));
  };
  const regs = (t) => (FB.DB.registros[t] || []);
  const caso = async (nombre, fn) => {
    try { const d = await fn(); casos.push({ nombre, ok: !d, detalle: d || "" }); }
    catch (e) { casos.push({ nombre, ok: false, detalle: String((e && e.stack) || e) }); }
  };

  // 1. Apuntar un gasto a mano: rellenar el formulario y guardarlo
  await caso("Apuntar a mano guarda el movimiento", async () => {
    if (!(await ir("#apuntar"))) return "no se abre la pantalla Apuntar";
    const antes = regs("movimiento").length;
    const imp = campo("Importe"), con = campo("Concepto");
    if (!imp || !con) return "no encuentro los campos Importe y Concepto";
    escribir(imp, "12.34");
    escribir(con, "Prueba de flujo");
    const b = porTexto("button", "Apuntar");
    if (!b) return "no hay botón «Apuntar»";
    b.click();
    const nuevo = await hasta(() => regs("movimiento").find((m) => m.concepto === "Prueba de flujo"));
    if (!nuevo) return "el movimiento no aparece tras guardar";
    if (nuevo.importe !== 12.34) return `importe guardado: ${nuevo.importe}`;
    if (regs("movimiento").length !== antes + 1) return `movimientos: ${antes} → ${regs("movimiento").length}`;
  });

  // 2. Por revisar: resolver una duda eligiendo una categoría propuesta
  await caso("Por revisar: elegir una categoría resuelve la duda", async () => {
    if (!(await ir("#revisar"))) return "no se abre la pantalla Por revisar";
    const antes = (FB.DB.pendientes || []).length;
    if (!antes) return "los datos de ejemplo no traen nada por revisar";
    const chip = todos(".fb-cats button").find((b) => !/descartar|otra cuenta|otra categor/i.test(b.textContent || ""));
    if (!chip) return "no hay ningún botón de categoría en la primera duda";
    chip.click();
    const bajan = await hasta(() => (FB.DB.pendientes || []).length < antes);
    if (!bajan) return `siguen ${(FB.DB.pendientes || []).length} dudas (había ${antes})`;
  });

  // 3. Deshacer: la decisión anterior se puede revertir desde el aviso
  await caso("Deshacer devuelve la duda a Por revisar", async () => {
    const antes = (FB.DB.pendientes || []).length;
    const b = porTexto("button", "Deshacer", document.getElementById("aviso"));
    if (!b) return "el aviso no ofrece «Deshacer»";
    b.click();
    const vuelve = await hasta(() => (FB.DB.pendientes || []).length > antes);
    if (!vuelve) return `pendientes ${antes} → ${(FB.DB.pendientes || []).length}`;
  });

  // 4. Buscar en la lista de movimientos filtra las filas
  await caso("La búsqueda de Movimientos filtra la lista", async () => {
    if (!(await ir("#movimientos/lista"))) return "no se abre la lista de movimientos";
    const inp = app().querySelector("input.fin-search");
    if (!inp) return "no hay caja de búsqueda";
    const filas = () => todos(".fb-lista > *").length;
    const antes = filas();
    if (!antes) return "la lista sale vacía";
    escribir(inp, "Mercadona");
    const menos = await hasta(() => filas() && filas() < antes);
    if (!menos) return `filas ${antes} → ${filas()} al buscar «Mercadona»`;
    const mal = todos(".fb-lista > *").find((tr) => !/mercadona/i.test(tr.textContent || ""));
    if (mal) return "quedan filas que no son de Mercadona: " + mal.textContent.slice(0, 60);
  });

  // 5. Borrar una cuenta que se está usando: avisa de lo que se lleva por delante y, si dices que no, no borra nada
  await caso("Borrar una cuenta en uso pide confirmación y respeta el «no»", async () => {
    const cuenta = regs("cuenta").find((c) => regs("movimiento").some((m) => m.cuenta === c.nombre));
    if (!cuenta) return "no hay ninguna cuenta con movimientos";
    if (!(await ir(`#editar/cuenta/${cuenta.id}`))) return "no se abre la ficha de la cuenta";
    const dichos = [];
    const original = window.confirm;
    window.confirm = (t) => { dichos.push(String(t)); return dichos.length === 1; };  // «sí» al primero (borrar), «no» al aviso
    try {
      const b = porTexto("button", "Borrar");
      if (!b) return "no hay botón «Borrar»";
      b.click();
      const aviso = await hasta(() => dichos.find((t) => /se está usando/i.test(t)));
      if (!aviso) return "no avisa de que la cuenta se está usando: " + JSON.stringify(dichos);
      if (!/movimientos/i.test(aviso)) return "el aviso no dice cuántos movimientos la usan: " + aviso;
      await dormir(300);
      await FB.recargar();
      if (!regs("cuenta").some((c) => c.id === cuenta.id)) return "¡la cuenta se ha borrado aunque he dicho que no!";
    } finally { window.confirm = original; }
  });

  // 6. Ajustes: guardar una segunda carpeta para las copias de seguridad
  await caso("Ajustes guarda la segunda carpeta de copias", async () => {
    if (!(await ir("#ajustes/datos"))) return "no se abre Ajustes → Tus datos";
    const res = todos("details").find((d) => /otro sitio/i.test(d.querySelector("summary").textContent || ""));
    if (!res) return "no está la sección «Guardar también las copias en otro sitio»";
    res.open = true;
    const inp = res.querySelector("input");
    const carpeta = FB.DB.info.carpeta + "\\Copias de prueba";
    escribir(inp, carpeta);
    porTexto("button", "Guardar", res).click();
    const guardada = await hasta(() => FB.DB.config.copia_extra === carpeta);
    if (!guardada) return "no se ha guardado: " + JSON.stringify(FB.DB.config.copia_extra);
    if (FB.DB.config.copia_extra_error) return "ha fallado la copia: " + JSON.stringify(FB.DB.config.copia_extra_error);
    // y se quita dejándolo vacío
    if (!(await ir("#ajustes/datos"))) return "no se vuelve a abrir Ajustes";
    const res2 = todos("details").find((d) => /otro sitio/i.test(d.querySelector("summary").textContent || ""));
    res2.open = true;
    escribir(res2.querySelector("input"), "");
    porTexto("button", "Guardar", res2).click();
    const quitada = await hasta(() => !FB.DB.config.copia_extra);
    if (!quitada) return "no se puede quitar la segunda carpeta";
  });

  // 7. Modo discreto: el botón de la barra tapa los importes y los vuelve a enseñar
  await caso("El modo discreto tapa y destapa los importes", async () => {
    if (!(await ir("#inicio"))) return "no se abre el Inicio";
    const boton = document.getElementById("discreto");
    boton.click();
    const tapado = await hasta(() => document.body.classList.contains("discreto") && app().querySelector(".blur"));
    if (!tapado) return "no se ha tapado ningún importe";
    boton.click();
    const destapado = await hasta(() => !document.body.classList.contains("discreto") && !app().querySelector(".blur"));
    if (!destapado) return "los importes se quedan tapados";
  });

  // 8. El menú lleva a cada sección (y marca la que estás viendo)
  await caso("El menú navega entre secciones", async () => {
    for (const [texto, vista] of [["Movimientos", "movimientos"], ["Inversión", "inversion"], ["Inicio", "inicio"]]) {
      const a = porTexto("a", texto, document.getElementById("menu"));
      if (!a) return `no está «${texto}» en el menú`;
      a.click();
      if (!(await hasta(() => app().dataset.vista === vista))) return `«${texto}» no abre ${vista}`;
      if (!(await hasta(() => (document.querySelector("#menu a.act") || {}).textContent.includes(texto)))) return `el menú no marca «${texto}»`;
    }
  });

  return casos;
})();

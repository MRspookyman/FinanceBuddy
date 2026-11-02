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
  // B-111: guardar saldos que son la estimación de los movimientos pide confirmar; si sale ese aviso, se confirma
  const confirmaEstimados = async () => {
    const d = await hasta(() => document.querySelector("dialog.fb-dialogo[open]"), 1500);
    if (d) porTexto("button", "Guardarlos igualmente", d).click();
    return !!d;
  };
  const caso = async (nombre, fn) => {
    try { const d = await fn(); casos.push({ nombre, ok: !d, detalle: d || "" }); }
    catch (e) { casos.push({ nombre, ok: false, detalle: String((e && e.stack) || e) }); }
  };

  // ── casos ── (hasta aquí, lo que comparte un guion suelto: run.py --guion)
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
    const dlg = () => document.querySelector("dialog.fb-dialogo[open]");
    const b = porTexto("button", "Borrar");
    if (!b) return "no hay botón «Borrar»";
    b.click();
    const primero = await hasta(dlg);
    if (!primero) return "no sale el diálogo de confirmar el borrado";
    if (document.activeElement.textContent !== "Cancelar") return "el foco no empieza en «Cancelar»: " + document.activeElement.textContent;
    porTexto("button", "Borrar", primero).click();  // «sí» al primero (borrar), «no» al aviso
    const aviso = await hasta(() => dlg() && /se está usando/i.test(dlg().textContent) && dlg().textContent);
    if (!aviso) return "no avisa de que la cuenta se está usando";
    if (!/movimientos/i.test(aviso)) return "el aviso no dice cuántos movimientos la usan: " + aviso;
    porTexto("button", "Cancelar", dlg()).click();
    await dormir(300);
    await FB.recargar();
    if (dlg()) return "el diálogo no se cierra";
    if (!regs("cuenta").some((c) => c.id === cuenta.id)) return "¡la cuenta se ha borrado aunque he dicho que no!";
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

  // 9. Ajustes se guarda solo: no hay botón «Guardar», y al cambiar un campo se guarda y el foco se queda donde estaba
  await caso("Ajustes guarda solo al cambiar un campo", async () => {
    if (!(await ir("#ajustes"))) return "no se abre Ajustes";
    const antes = Number(FB.DB.config.limite_variable) || 0;
    const iL = app().querySelector('[data-fb="limite"]'), iP = app().querySelector('[data-fb="pagina"]');
    if (!iL || !iP) return "no encuentro los campos del límite y de registros por página";
    if (porTexto("button", "Guardar", app())) return "sigue habiendo un botón «Guardar» en Ajustes";
    const nuevo = antes + 70;
    iL.value = String(nuevo);
    iP.focus();  // como al pasar al campo siguiente con el tabulador: «change» salta antes de que se redibuje
    iL.dispatchEvent(new Event("change", { bubbles: true }));
    if (!(await hasta(() => Number(FB.DB.config.limite_variable) === nuevo))) return `el límite no se ha guardado (sigue en ${FB.DB.config.limite_variable})`;
    if (!(await hasta(() => (document.activeElement || {}).dataset && document.activeElement.dataset.fb === "pagina"))) return "el foco se pierde al redibujar";
    const iL2 = await hasta(() => app().querySelector('[data-fb="limite"]'));
    if (Number(iL2.value) !== nuevo) return `el campo no enseña lo guardado: ${iL2.value}`;
    iL2.value = String(antes);
    iL2.dispatchEvent(new Event("change", { bubbles: true }));
    if (!(await hasta(() => Number(FB.DB.config.limite_variable) === antes))) return "no se puede dejar el límite como estaba";
  });

  // 10. La portada: el sufijo va pegado a la cifra, que es lo que se mira (el rótulo de arriba es pequeño y en versalitas)
  await caso("La portada dice de qué es la cifra grande", async () => {
    if (!(await ir("#inicio"))) return "no se abre el Inicio";
    const hero = () => app().querySelector(".fb-hero");
    const suf = () => { const v = app().querySelector(".fb-hero .v small"); return v ? v.textContent.trim() : ""; };
    if (!hero()) return "no hay portada";
    if (!Number(FB.DB.config.limite_variable)) return "";  // sin límite la cifra es lo gastado: no lleva sufijo
    if (hero().classList.contains("pasado") !== (suf() === "de más")) return `este mes: «${suf()}» con la clase «${hero().className}»`;
    const atras = todos(".fin-mes button")[0];
    if (!atras) return "no está el botón del mes anterior";
    atras.click();
    if (!(await hasta(() => app().querySelector(".fb-hero")))) return "el mes anterior no dibuja la portada";
    const s2 = suf();
    if (s2 !== "de más" && s2 !== "de sobra") return `el mes pasado la cifra no dice si sobró o si se pasó: «${s2}»`;
    if (hero().classList.contains("pasado") !== (s2 === "de más")) return `el mes pasado: «${s2}» con la clase «${hero().className}»`;
    todos(".fin-mes button").slice(-1)[0].click();  // «Hoy»: dejarlo como estaba
    if (!(await hasta(() => !app().querySelector(".fin-mes button:last-child").textContent.includes("Hoy")))) return "no se vuelve al mes actual";
  });

  const plano = (el) => (el.textContent || "").replace(/ /g, " ");

  // 11. Recordatorios: «Hecho» pasa al año siguiente el que se repite y cierra el que no
  await caso("Recordatorio «Hecho»: el anual pasa a su siguiente fecha y el suelto queda hecho", async () => {
    const r = await FB.api("/api/guardar", { tipo: "recordatorio", datos: { nombre: "ITV de prueba", fecha: "2026-10-05", repetir: "anual" } });
    if (!r.ok) return "no se guarda el recordatorio: " + r.mensaje;
    await FB.recargar();
    if (!(await ir("#gestionar/recordatorio"))) return "no se abre la lista de recordatorios";
    const fila = await hasta(() => porTexto("tr", "ITV de prueba"));
    if (!fila) return "el recordatorio no sale en la lista";
    if (!plano(fila).includes("cada año")) return "la lista no dice que se repite: " + plano(fila);
    porTexto("a", "Hecho", fila).click();
    if (!(await hasta(() => (regs("recordatorio").find((x) => x.id === r.id) || {}).fecha === "2027-10-05"))) return "no pasa al 05/10/2027: " + JSON.stringify(regs("recordatorio").find((x) => x.id === r.id));
    if (regs("recordatorio").find((x) => x.id === r.id).estado === "hecho") return "el que se repite no debe quedar cerrado";
    if (!(await ir("#inicio"))) return "no se abre el Inicio";
    const it = await hasta(() => porTexto(".fb-item", "Declaración de la renta"));
    if (!it) return "el recordatorio del ejemplo no sale en el Inicio";
    it.querySelector("button").click();
    if (!(await hasta(() => regs("recordatorio").find((x) => x.nombre === "Declaración de la renta").estado === "hecho"))) return "el suelto no queda hecho";
    if (!(await hasta(() => !porTexto(".fb-item", "Declaración de la renta")))) return "sigue saliendo en el Inicio después de hecho";
  });

  // 12. Para la renta: un dividendo con retención → bruto, lo ya retenido y lo que saldría a pagar
  await caso("Renta: dividendo de 81 € con 19 € retenidos = 100 € brutos, 19 € de impuesto, nada por pagar", async () => {
    const r = await FB.api("/api/guardar", { tipo: "cobro", datos: { fecha: "2026-06-01", activo: "Bitcoin", tipo: "dividendo", importe: 81, retencion: 19 } });
    if (!r.ok) return "no se guarda el dividendo: " + r.mensaje;
    await FB.recargar();
    if (!(await ir("#renta"))) return "no se abre Para la renta";
    const p = await hasta(() => porTexto(".fin-panel", "Lo que te saldría por 2026"));
    if (!p) return "no sale la estimación";
    const t = plano(app());
    for (const x of ["100,00 €", "ya retenido 19,00 €", "Te quedaría por pagar"]) if (!t.includes(x)) return `falta «${x}» en la pantalla`;
    const fila = (l) => plano(todos(".fin-rows .r", p).find((e) => plano(e).startsWith(l)) || document.createElement("i"));
    if (!fila("Impuesto").includes("19,00 €")) return "el impuesto no es 19 €: " + fila("Impuesto");
    if (!fila("Te quedaría por pagar").includes("0,00 €")) return "debería quedar 0 € por pagar: " + fila("Te quedaría por pagar");
    if (!porTexto("button", "Descargar 2026 (CSV)")) return "no está el botón de descargar";
  });

  // 13. Movimientos: el año entero, por importe y con la nota a la vista y en el buscador
  await caso("Movimientos: todo el año, de mayor a menor y buscando por la nota", async () => {
    const m = regs("movimiento").find((x) => x.concepto === "Cinesa");
    if (!m) return "no está el movimiento del ejemplo";
    const { id, ...datos } = m;
    const r = await FB.api("/api/guardar", { tipo: "movimiento", id, datos: { ...datos, nota: "con mis primos" } });
    if (!r.ok) return "no se guarda la nota: " + r.mensaje;
    await FB.recargar();
    if (!(await ir("#movimientos/lista"))) return "no se abre la lista";
    const nMes = todos(".fb-item").length;
    porTexto(".fb-seg.mini button", "Todo 2026").click();
    if (!(await hasta(() => plano(app()).includes(" en 2026 ·")))) return "no pasa a ver el año";
    const sel = app().querySelector('select[aria-label="Ordenar los movimientos"]');
    if (!sel) return "no está el orden";
    escribir(sel, "importe");
    if (!(await hasta(() => !app().querySelector(".fb-dia") && todos(".fb-item").length))) return "por importe no debería agrupar por días";
    const imp = todos(".fb-item .v").slice(0, 6).map((e) => parseFloat(plano(e).replace(/[^\d,]/g, "").replace(",", ".")));
    if (imp.some((x, i) => i && x > imp[i - 1])) return "no van de mayor a menor: " + imp.join(", ");
    if (!/^\d\d\/\d\d\/\d{4} · /.test(plano(app().querySelector(".fb-item .s")))) return "por importe, cada fila debe llevar su fecha: " + plano(app().querySelector(".fb-item .s"));
    escribir(app().querySelector(".fin-search"), "primos");
    const it = await hasta(() => todos(".fb-item").length === 1 && todos(".fb-item")[0]);
    if (!it) return `buscar por la nota no deja solo ese movimiento (hay ${todos(".fb-item").length}; el mes tenía ${nMes})`;
    if (!plano(it).includes("«con mis primos»")) return "la nota no se ve en la fila: " + plano(it);
  });

  // 14. Inicio: un aviso se quita con su × y se puede volver a poner
  await caso("Inicio: la × quita un aviso y «Volver a ponerlo» lo repone", async () => {
    if (!(await ir("#inicio"))) return "no se abre el Inicio";
    const equis = () => todos(".fb-franja .r.con-x .x");
    const n = (await hasta(() => equis().length && equis()) || []).length;
    if (!n) return "no hay ningún aviso con × en el Inicio del ejemplo";
    const texto = plano(equis()[0].parentElement.querySelector(".t"));
    equis()[0].click();
    if (!(await hasta(() => (FB.DB.config.avisos_descartados || []).some((k) => k.startsWith("inicio:")) && equis().length === n - 1))) return `sigue habiendo ${equis().length} avisos (había ${n})`;
    if (plano(app()).includes(texto)) return "el aviso quitado sigue en pantalla: " + texto;
    const volver = await hasta(() => porTexto("#aviso button", "Volver a ponerlo", document));
    if (!volver) return "no se ofrece volver a ponerlo";
    volver.click();
    if (!(await hasta(() => equis().length === n && plano(app()).includes(texto)))) return "no vuelve a salir";
  });

  // 15. Dividir un gasto en dos categorías y volver a juntarlo
  await caso("Dividir un gasto: dos partes que suman el total, marcadas en la lista, y se vuelven a juntar", async () => {
    const m = regs("movimiento").find((x) => x.concepto === "Mercadona" && x.clase === "gasto" && !x.recurrente && String(x.fecha).startsWith("2026-09"));  // del mes que se ve en la lista
    if (!m) return "no hay un Mercadona en el ejemplo";
    const total = m.importe, gastoAntes = regs("movimiento").filter((x) => x.clase === "gasto").reduce((t, x) => t + x.importe, 0);
    if (!(await ir(`#editar/movimiento/${m.id}`))) return "no se abre la ficha";
    const p = await hasta(() => porTexto(".fin-panel", "Dividir en varias categorías"));
    if (!p) return "no está el panel de dividir";
    p.querySelector("details").open = true;
    const imp = () => todos('.fb-partes input[type="number"]', p), cat = () => todos(".fb-partes select", p);
    if (imp().length !== 2) return `debería empezar con 2 partes y hay ${imp().length}`;
    const boton = porTexto("button", "Dividir", p.querySelector("details > .fb-fila:last-of-type"));
    if (!boton.disabled) return "sin importe en la segunda parte no debería dejar dividir";
    escribir(imp()[1], "20");
    if (Math.abs(parseFloat(imp()[0].value) - (total - 20)) > 0.005) return `la primera parte debería quedarse con ${total - 20} y tiene ${imp()[0].value}`;
    escribir(cat()[1], "Hogar");
    if (boton.disabled) return "con las partes bien no deja dividir";
    // una parte añadida de más se quita con su × (y con solo dos, la × no se ofrece)
    const equis = () => todos(".fb-partes .fb-quitar", p).filter((b) => !b.hidden);
    if (equis().length) return "con dos partes no debería haber × para quitar";
    porTexto("button", "+ Otra parte", p).click();
    if (imp().length !== 3 || equis().length !== 2) return `tras añadir: ${imp().length} partes y ${equis().length} ×`;
    if (!boton.disabled) return "con una parte sin importe no debería dejar dividir";
    equis()[1].click();
    if (imp().length !== 2 || equis().length || boton.disabled) return `tras quitar: ${imp().length} partes, ${equis().length} ×, botón ${boton.disabled ? "apagado" : "encendido"}`;
    if (Math.abs(parseFloat(imp()[0].value) - (total - 20)) > 0.005) return "al quitar la parte, la primera no recupera lo suyo: " + imp()[0].value;
    boton.click();
    const partes = () => regs("movimiento").filter((x) => x.parte_de === m.id);
    if (!(await hasta(() => partes().length === 2))) return "no se han creado las dos partes";
    const suma = partes().reduce((t, x) => t + x.importe, 0);
    if (Math.abs(suma - total) > 0.005) return `las partes suman ${suma} y eran ${total}`;
    if (partes().map((x) => x.categoria).sort().join() !== ["Hogar", m.categoria].sort().join()) return "categorías: " + partes().map((x) => x.categoria).join();
    const gastoDespues = regs("movimiento").filter((x) => x.clase === "gasto").reduce((t, x) => t + x.importe, 0);
    if (Math.abs(gastoDespues - gastoAntes) > 0.005) return `el gasto total ha cambiado: ${gastoAntes} → ${gastoDespues}`;
    if (!(await hasta(() => porTexto(".fin-panel", "Es parte de un movimiento dividido")))) return "la ficha no dice que está dividido";
    // una parte es un trozo del cargo del banco: no cambia de fecha, tipo, importe ni cuenta, ni se borra sola
    const fijo = (et) => { const el = campo(et); return !!el && (el.readOnly || el.disabled); };
    for (const et of ["Fecha", "Tipo", "Importe", "Cuenta"]) if (!fijo(et)) return `en una parte, «${et}» debería estar bloqueado`;
    if (fijo("Concepto") || fijo("Categoría")) return "el concepto y la categoría de una parte sí se pueden cambiar";
    if (porTexto(".fb-botones button", "Borrar")) return "una parte no debería ofrecer «Borrar»";
    const rB = await FB.api("/api/borrar", { tipo: "movimiento", id: m.id });
    if (rB.ok || !/vuelve a juntarlo/.test(rB.mensaje || "")) return "el servidor deja borrar una parte: " + JSON.stringify(rB);
    if (!(await ir("#movimientos/lista"))) return "no se abre la lista";
    if (!(await hasta(() => todos(".fb-item .s").filter((e) => plano(e).includes("parte de")).length === 2))) return "la lista no marca las dos partes";
    const otra = partes().find((x) => x.id !== m.id);
    if (!(await ir(`#editar/movimiento/${otra.id}`))) return "no se abre la ficha de la otra parte";
    const juntar = await hasta(() => porTexto("button", "Volver a juntar"));
    if (!juntar) return "no está «Volver a juntar»";
    juntar.click();
    if (!(await hasta(() => !partes().length && regs("movimiento").find((x) => x.id === m.id).importe === total))) return "no vuelve a ser un solo movimiento con su importe";
    if (regs("movimiento").some((x) => x.id === otra.id)) return "la otra parte sigue existiendo";
  });

  // 16. Previsión: un gasto de una categoría fija que no es de ningún fijo dado de alta también sale de tus cuentas
  await caso("Previsión: los gastos fijos que no están dados de alta se cuentan, y se dice cuánto", async () => {
    if (!(await ir("#inicio"))) return "no se abre el Inicio";
    const tarjeta = () => porTexto(".fin-panel", "Tus próximos meses");
    const total = () => parseFloat(plano(tarjeta().querySelector(".fb-total .v")).replace(/[^\d,−-]/g, "").replace("−", "-").replace(",", "."));
    if (!(await hasta(() => tarjeta() && isFinite(total())))) return "no está el panel «Tus próximos meses»";
    if (plano(tarjeta()).includes("otros gastos fijos")) return "en el ejemplo todo lo fijo está dado de alta: no debería hablar de otros gastos fijos";
    const antes = total();
    // 480 € de la comunidad en agosto (mes cerrado), en «Vivienda» y sin enlazar a ningún fijo: entre 4 meses con datos, 120 € al mes
    const r = await FB.api("/api/guardar", { tipo: "movimiento", datos: { fecha: "2026-08-18", clase: "gasto", categoria: "Vivienda", importe: 480, concepto: "Derrama de la comunidad", cuenta: "Cuenta nómina" } });
    if (!r.ok) return "no se guarda el gasto: " + r.mensaje;
    await FB.refrescar();
    const frase = "120,00 € al mes de otros gastos fijos que no tienes dados de alta (tu media de los últimos 4 meses)";
    if (!(await hasta(() => tarjeta() && plano(tarjeta()).includes(frase)))) return "la tarjeta no cuenta el gasto fijo suelto: " + plano(tarjeta() || app()).slice(-260);
    // el mes en curso ya acaba hoy: son 11 meses por delante a 120 €
    if (Math.abs(antes - total() - 11 * 120) > 2) return `dentro de un año debería haber 1.320 € menos y hay ${antes - total()} menos (${antes} → ${total()})`;
  });

  // 17. Actualizar saldos: con una fecha de mitad de mes se guardan, pero el mes no queda cerrado; con la de su último día, sí
  await caso("Actualizar saldos a mitad de mes no cierra el mes; con los del último día, sí", async () => {
    if (!(await ir("#cerrar"))) return "no se abre Actualizar saldos";
    const boton = () => todos("button.fb-btn").find((b) => /^(Cerrar |Guardar los saldos)/.test(plano(b)));
    if (!(await hasta(boton))) return "no está el botón de guardar";
    if (!plano(boton()).startsWith("Cerrar septiembre")) return "hoy es el último día de septiembre: debería ofrecer cerrarlo y dice «" + plano(boton()) + "»";
    if (!campo("Lo destacable del mes")) return "al cerrar un mes se pide su nota";
    escribir(campo("Fecha"), "2026-09-15");
    if (!(await hasta(() => plano(boton()) === "Guardar los saldos"))) return "con fecha del día 15 no debería ofrecer cerrar el mes: " + plano(boton());
    if (campo("Lo destacable del mes")) return "sin cierre no se pide la nota del mes";
    boton().click();
    await confirmaEstimados();
    if (!(await hasta(() => regs("patrimonio").some((x) => x.fecha === "2026-09-15")))) return "no se guardan los saldos del día 15";
    if (regs("cierre").some((x) => x.mes === "2026-09")) return "septiembre ha quedado cerrado con saldos del día 15";
    if (!(await ir("#cerrar"))) return "no se vuelve a abrir Actualizar saldos";
    if (!(await hasta(() => boton() && plano(boton()).startsWith("Cerrar septiembre")))) return "no ofrece cerrar septiembre";
    boton().click();
    await confirmaEstimados();
    if (!(await hasta(() => regs("cierre").some((x) => x.mes === "2026-09" && x.fecha === "2026-09-30")))) return "con los saldos del día 30 no se cierra septiembre";
  });

  // 17 ter. B-062: al cerrar el mes se guarda su foto; editar movimientos no la cambia y en «Meses cerrados» se ve qué ha cambiado desde entonces.
  await caso("Cerrar el mes guarda su foto; después se ve lo que ha cambiado desde entonces", async () => {
    const c = regs("cierre").find((x) => x.mes === "2026-09");
    if (!c) return "septiembre no está cerrado (lo cierra el flujo anterior)";
    if (!c.foto || !(c.foto.gastos > 0) || !c.foto.categorias || c.foto.patrimonio == null) return "el cierre no trae su foto: " + JSON.stringify(c.foto);
    const ini = JSON.stringify(c.foto);
    const r = await FB.api("/api/guardar", { tipo: "movimiento", datos: { fecha: "2026-09-12", clase: "gasto", categoria: "Ocio", importe: 55, cuenta: "Cuenta nómina", concepto: "Prueba de la foto" } });
    if (!r.ok) return "no se guarda el movimiento de prueba: " + r.mensaje;
    try {
      await FB.recargar();
      if (JSON.stringify(regs("cierre").find((x) => x.mes === "2026-09").foto) !== ini) return "la foto del cierre ha cambiado al añadir un movimiento";
      if (!(await ir("#cerrar"))) return "no se abre Actualizar saldos";
      const lista = await hasta(() => todos("details summary").find((s) => /Meses cerrados/.test(s.textContent)));
      if (!lista) return "no está «Meses cerrados»";
      lista.parentElement.open = true;
      const foto = await hasta(() => todos("details summary").find((s) => /Foto de septiembre/.test(s.textContent)));
      if (!foto) return "no sale la foto de septiembre";
      foto.parentElement.open = true;
      if (!(await hasta(() => /Desde entonces ha cambiado: salió/.test(plano(foto.parentElement))))) return "no dice lo que ha cambiado: " + plano(foto.parentElement).slice(0, 500);
      if (!/Ocio/.test(plano(foto.parentElement)) && !(await hasta(() => porTexto("summary", "Gasto por categoría que ha cambiado", foto.parentElement)))) return "no enseña la categoría que ha cambiado";
    } finally {
      await FB.api("/api/borrar", { tipo: "movimiento", id: r.id });
      await FB.recargar();
    }
  });

  // 17 bis. B-111: un saldo que es la estimación de tus movimientos (no lo que dice el banco) pide confirmar antes de guardarse.
  // «Revisarlos» no guarda nada; «Guardarlos igualmente» sí. Se usa el 22/09, que no tiene saldos: lo que se crea se borra después.
  await caso("Actualizar saldos: un saldo estimado pide confirmar antes de guardarse", async () => {
    const F = "2026-09-22";
    const dlg = () => document.querySelector("dialog.fb-dialogo[open]");
    const boton = () => todos("button.fb-btn").find((b) => /^(Cerrar |Guardar los saldos)/.test(plano(b)));
    const hayReg = () => regs("patrimonio").some((x) => x.fecha === F);
    const pieNomina = () => { const el = campo("Cuenta nómina"); return el && el.nextElementSibling ? plano(el.nextElementSibling) : ""; };
    if (hayReg()) return `ya hay saldos del ${F}: el flujo no puede comprobar nada`;
    try {
      if (!(await ir("#cerrar"))) return "no se abre Actualizar saldos";
      if (!(await hasta(boton))) return "no está el botón de guardar";
      escribir(campo("Fecha"), F);
      if (!(await hasta(() => boton() && plano(boton()) === "Guardar los saldos"))) return "con fecha del día 22 no debería ofrecer cerrar el mes: " + (boton() ? plano(boton()) : "");
      if (!(await hasta(() => pieNomina().startsWith("según los movimientos: ")))) return "«Cuenta nómina» no trae su estimación: " + pieNomina();
      boton().click();
      const aviso = await hasta(dlg);
      if (!aviso) return "con saldos estimados no pide confirmar antes de guardar";
      if (!/estimad/i.test(plano(aviso))) return "el aviso no dice que son estimaciones: " + plano(aviso);
      porTexto("button", "Revisarlos", aviso).click();
      if (!(await hasta(() => !dlg()))) return "«Revisarlos» no cierra el aviso";
      await dormir(300);
      if (hayReg()) return "«Revisarlos» guardó igualmente los saldos";
      if (!boton() || boton().disabled) return "tras «Revisarlos» el botón no vuelve a estar activo";
      boton().click();
      const otro = await hasta(dlg);
      if (!otro) return "al volver a guardar no pide confirmar";
      porTexto("button", "Guardarlos igualmente", otro).click();
      if (!(await hasta(hayReg))) return "«Guardarlos igualmente» no guarda los saldos";
    } finally {  // el 22/09 no tenía saldos al empezar: se borra lo que este caso ha guardado
      await FB.recargar();
      for (const r of regs("patrimonio").filter((x) => x.fecha === F)) await FB.api("/api/borrar", { tipo: "patrimonio", id: r.id });
      await FB.recargar();
    }
  });

  // 18. Importar: lo que no se sabe leer no se pierde en silencio. La plantilla de la app rellenada a mano, con un importe mal
  // escrito (una O por un cero) y un día que no existe: la vista previa enseña esas filas con su motivo y no cuenta el total del pie.
  await caso("Importar: la vista previa enseña las filas que no se han podido leer", async () => {
    const csv = "Fecha;Concepto;Importe;Categoría\n01/09/2026;Papelería de prueba;-7,10;Compras\n2026-09-03T10:15:00Z;Abono de prueba;25,00;\n05/09/2026;Kiosko de prueba;-3,2O;Otros\n31/02/2026;Fecha imposible;-1,00;Otros\n\nTotal;;13,70;\n";
    const antes = regs("movimiento").length;
    FB.soltados = [new File([csv], "prueba-filas.csv", { type: "text/csv" })];
    if (!(await ir("#importar"))) return "no se abre Importar";
    const tarjeta = () => porTexto(".fb-card", "prueba-filas.csv");
    if (!(await hasta(tarjeta))) return "no sale el resultado de subir el archivo";
    if (!tarjeta().classList.contains("fb-previa")) {  // la primera vez pregunta de qué cuenta es
      const boton = await hasta(() => tarjeta() && porTexto("button", "Importar", tarjeta()));
      if (!boton) return "no pregunta la cuenta ni enseña la vista previa: " + plano(tarjeta()).slice(0, 200);
      boton.click();
    }
    if (!(await hasta(() => tarjeta() && tarjeta().classList.contains("fb-previa")))) return "no llega a la vista previa: " + plano(tarjeta() || app()).slice(0, 300);
    const aviso = tarjeta().querySelector(".fb-msg.err");
    if (!aviso) return "la vista previa no avisa de las filas sin leer: " + plano(tarjeta()).slice(0, 300);
    const t = plano(aviso);
    for (const x of ["2 filas no se han podido leer y no se importarán", "fila 4: no entiendo el importe «-3,2O» (Kiosko de prueba)", "fila 5: no entiendo la fecha «31/02/2026» (Fecha imposible)"]) if (!t.includes(x)) return `falta «${x}» en el aviso: ${t}`;
    if (t.includes("Total") || t.includes("fila 3")) return "cuenta como ilegible el total del pie o la fecha con hora: " + t;
    if (regs("movimiento").length !== antes) return "la vista previa ha guardado movimientos";
    porTexto("button", "No importar", tarjeta()).click();
    if (!(await hasta(() => !tarjeta()))) return "al descartar, la tarjeta sigue ahí";
  });

  // 18 b. Un archivo subido por error se puede quitar antes de importarlo: desde su tarjeta (aquí, un formato que la app no conoce y
  // pide configurar) y, si se quedó en la carpeta Importar, desde la lista de la carpeta (con confirmación). No se importa nada.
  await caso("Importar: un archivo subido por error se quita sin importarlo", async () => {
    const nombre = (f) => (FB.DB.info.archivos || []).some((a) => a.nombre === f);
    const raro = "Col A;Col B;Col C\nuno;dos;tres\ncuatro;cinco;seis\n";
    const antes = regs("movimiento").length;
    FB.soltados = [new File([raro], "equivocado-1.csv", { type: "text/csv" })];
    if (!(await ir("#importar"))) return "no se abre Importar";
    const tarjeta = () => porTexto(".fb-card", "equivocado-1.csv");
    const no = await hasta(() => tarjeta() && porTexto("button", "No importar", tarjeta()));
    if (!no) return "la tarjeta del archivo subido no tiene «No importar»: " + plano(tarjeta() || app()).slice(0, 300);
    if (!nombre("equivocado-1.csv")) return "el archivo subido no está en la carpeta Importar";
    no.click();
    if (!(await hasta(() => !tarjeta() && !nombre("equivocado-1.csv")))) return "al descartarlo, la tarjeta o el archivo siguen ahí";
    // El que se quedó en la carpeta: se sube y se cierra su tarjeta sin descartar (como si se hubiera ido de la pantalla)
    FB.soltados = [new File([raro], "equivocado-2.csv", { type: "text/csv" })];
    if (!(await ir("#importar"))) return "no se abre Importar (2)";
    if (!(await hasta(() => nombre("equivocado-2.csv")))) return "el segundo archivo no llega a la carpeta Importar";
    FB.estado.imp = []; await FB.refrescar();
    const fila = await hasta(() => todos(".fin-rows .r").find((r) => plano(r).includes("equivocado-2.csv")));
    if (!fila) return "el archivo no sale en la lista de la carpeta Importar";
    const quitar = porTexto("button", "Quitar", fila);
    if (!quitar) return "la fila del archivo no tiene «Quitar»";
    quitar.click();
    const d = await hasta(() => document.querySelector("dialog.fb-dialogo[open]"));
    if (!d) return "no pide confirmación antes de borrar el archivo";
    porTexto("button", "Quitar el archivo", d).click();
    if (!(await hasta(() => !nombre("equivocado-2.csv") && !todos(".fin-rows .r").some((r) => plano(r).includes("equivocado-2.csv"))))) return "el archivo sigue en la carpeta o en la lista";
    if (regs("movimiento").length !== antes) return "se han guardado movimientos";
  });

  // 19. Un activo que ya no tienes: se marca como vendido desde su ficha (no hace falta borrarlo), deja de salir y se puede volver atrás
  await caso("Inversión: marcar un activo como vendido lo quita de la vista sin borrar sus operaciones", async () => {
    const a = regs("activo").find((x) => x.nombre === "Bitcoin");
    if (!a) return "no está el Bitcoin del ejemplo";
    const nOps = regs("aportacion").filter((x) => x.activo === "Bitcoin").length;
    if (!(await ir(`#activo/${a.id}`))) return "no se abre la ficha";
    const b = await hasta(() => porTexto("button", "Marcar como vendido"));
    if (!b) return "la ficha no ofrece marcarlo como vendido";
    b.click();
    if (!(await hasta(() => (regs("activo").find((x) => x.id === a.id) || {}).estado === "vendido" && app().dataset.vista === "inversion"))) return "no queda como vendido";
    if (regs("aportacion").filter((x) => x.activo === "Bitcoin").length !== nOps || !nOps) return "se han perdido sus operaciones";
    const panelActivos = await hasta(() => porTexto(".fin-panel", "Tus activos"));
    if (!panelActivos) return "no está el panel «Tus activos»";
    if (porTexto("td", "Bitcoin", panelActivos)) return "sigue saliendo en «Tus activos»";
    if (!plano(panelActivos).includes("1 activo marcado como vendido no se muestra")) return "no dice que hay un activo vendido que no se muestra: " + plano(panelActivos).slice(-220);
    if (!(await ir(`#activo/${a.id}`))) return "no se vuelve a abrir su ficha";
    const v = await hasta(() => porTexto("button", "Volver a tenerlo"));
    if (!v) return "la ficha de un vendido no ofrece volver a tenerlo";
    v.click();
    if (!(await hasta(() => (regs("activo").find((x) => x.id === a.id) || {}).estado !== "vendido"))) return "no vuelve a la cartera";
  });

  // 20. Una comisión del banco se avisa en el Inicio, con el movimiento a un clic
  await caso("Inicio: avisa de una comisión que te han cobrado", async () => {
    const r = await FB.api("/api/guardar", { tipo: "movimiento", datos: { fecha: "2026-09-28", clase: "gasto", categoria: "Comisiones", importe: 12, concepto: "Comisión de mantenimiento", cuenta: "Cuenta nómina" } });
    if (!r.ok) return "no se guarda la comisión: " + r.mensaje;
    await FB.recargar();
    if (!(await ir("#inicio"))) return "no se abre el Inicio";
    const fila = await hasta(() => todos(".fb-franja a").find((e) => plano(e).includes("Te han cobrado una comisión: Comisión de mantenimiento · 12,00 € el 28/09")));
    if (!fila) return "el Inicio no avisa de la comisión: " + plano(app().querySelector(".fb-franja") || app()).slice(0, 300);
    if (fila.getAttribute("href") !== `#editar/movimiento/${r.id}`) return "el aviso no lleva al movimiento: " + fila.getAttribute("href");
  });

  // 21. Ajustes: arrancar con Windows solo se puede activar en la app instalada con tus datos (aquí, de pruebas, sale apagado y dice por qué)
  await caso("Ajustes: «abrir al iniciar Windows» está, y en una app de pruebas no se deja tocar", async () => {
    if (!(await ir("#ajustes"))) return "no se abre Ajustes";
    const fila = await hasta(() => todos("label.fb-fila").find((e) => plano(e).includes("Abrir FinanceBuddy al iniciar Windows")));
    if (!fila) return "no está la opción";
    const c = fila.querySelector("input[type=checkbox]");
    if (!c || !c.disabled || c.checked) return "en una app de pruebas debería salir apagada y sin poder marcarse";
    if (!plano(fila.parentElement).includes("No se puede cambiar con datos de ejemplo")) return "no dice por qué no se puede: " + plano(fila.parentElement).slice(-200);
  });

  // 22. Mi año: desde Movimientos, el año con lo que salió frente a los mismos meses del anterior, y se puede ver el año pasado
  await caso("Mi año: compara con el año anterior por categoría y deja elegir el año", async () => {
    const r = await FB.api("/api/guardar", { tipo: "movimiento", datos: { fecha: "2025-06-10", clase: "gasto", categoria: "Viajes", importe: 300, concepto: "Hotel de prueba", cuenta: "Cuenta nómina" } });
    if (!r.ok) return "no se guarda el gasto del año pasado: " + r.mensaje;
    await FB.recargar();
    if (!(await ir("#movimientos"))) return "no se abre Movimientos";
    const l = await hasta(() => todos("a").find((a) => a.getAttribute("href") === "#anual"));
    if (!l) return "Movimientos no lleva a Mi año";
    l.click();
    if (!(await hasta(() => app().dataset.vista === "anual" && app().querySelector(".fb-stats")))) return "no se abre Mi año";
    const sale = porTexto(".fb-stat", "Salió");
    if (!sale || !/2025: 300(,00)?\s€/.test(plano(sale))) return "«Salió» no se compara con 2025: " + (sale ? plano(sale) : "no está");
    const fila = todos(".fin-table tr").find((tr) => plano(tr).startsWith("Viajes"));
    if (!fila || !/300(,00)?\s€/.test(plano(fila))) return "la categoría Viajes no trae lo de 2025: " + (fila ? plano(fila) : "no está");
    if (!porTexto(".fin-panel", "Tu patrimonio en 2026")) return "falta el patrimonio del año";
    const b = porTexto(".fb-chips button", "2025");
    if (!b) return "no se puede elegir 2025";
    b.click();
    if (!(await hasta(() => { const s = porTexto(".fb-stat", "Salió"); return s && /300(,00)?\s€/.test(plano(s)) && !plano(s).includes("2024:"); }))) return "al elegir 2025 no sale lo de ese año";
    if (!porTexto(".fin-note", "De 2024 no hay movimientos")) return "no dice que no hay año anterior con el que comparar";
  });

  // 23. Mi año desde el Inicio, y de sus tablas a los movimientos: una categoría abre la lista de todo ese año filtrada; un mes, ese mes
  await caso("Mi año: enlace fijo en el Inicio, y cada categoría y cada mes llevan a sus movimientos", async () => {
    if (!(await ir("#inicio"))) return "no se abre el Inicio";
    const l = await hasta(() => todos(".fb-saludo a").find((a) => a.getAttribute("href") === "#anual"));
    if (!l) return "el Inicio no lleva a Mi año";
    l.click();
    if (!(await hasta(() => app().dataset.vista === "anual" && app().querySelector(".fb-stats")))) return "no se abre Mi año";
    porTexto(".fb-chips button", "2025").click();
    const cat = await hasta(() => porTexto(".fb-chips button.act", "2025") && todos(".fin-table td a").find((a) => plano(a) === "Viajes"));
    if (!cat) return "en 2025, la categoría Viajes no se puede pulsar";
    cat.click();
    if (!(await hasta(() => app().dataset.vista === "movimientos" && porTexto(".fb-seg.mini button.act", "Todo 2025")))) return "no abre la lista de todo 2025: " + plano(app()).slice(0, 200);
    if (!porTexto(".fb-chips button.act", "Viajes")) return "la lista no está filtrada por Viajes";
    if (!(await hasta(() => porTexto(".fb-item", "Hotel de prueba")))) return "no sale el gasto de Viajes de 2025";
    if (!(await ir("#anual"))) return "no se vuelve a abrir Mi año";
    const det = await hasta(() => porTexto("details.fin-more", "Ver la tabla mes a mes"));
    if (!det) return "no está la tabla mes a mes";
    det.open = true;
    const ago = await hasta(() => todos("a.fin-link", det).find((a) => plano(a).toLowerCase() === "agosto"));
    if (!ago) return "el mes de agosto no se puede pulsar";
    ago.click();
    if (!(await hasta(() => app().dataset.vista === "movimientos" && /agosto 2026/i.test(plano(app().querySelector(".fin-mes .lbl") || app()))))) return "no abre los movimientos de agosto";
    if (porTexto(".fb-seg.mini button.act", "Todo 2026")) return "un mes no debería abrir el año entero";
    const hoyB = app().querySelector('.fin-mes button[title="Volver al mes actual"]');
    if (hoyB) hoyB.click();  // los flujos que siguen miran el mes en curso
    if (!(await hasta(() => !app().querySelector('.fin-mes button[title="Volver al mes actual"]')))) return "no vuelve al mes actual";
  });

  // 24. Atajos de teclado: G, ← →, / y R; dentro de un campo de texto no hacen nada; la ayuda cuenta las secciones que hay
  await caso("Atajos: G abre Mi año, ← → cambian el año y el mes, / lleva al buscador y R a Por revisar", async () => {
    const tecla = (key, el) => (el || document.body).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    if (!(await ir("#inicio"))) return "no se abre el Inicio";
    tecla("g");
    const añoAct = () => plano(app().querySelector('.fb-chips[aria-label="Año"] button.act') || app()).trim();
    if (!(await hasta(() => app().dataset.vista === "anual" && añoAct() === "2026"))) return "G no abre Mi año en 2026";
    tecla("ArrowLeft");
    if (!(await hasta(() => añoAct() === "2025"))) return "← no pasa a 2025: " + añoAct();
    tecla("ArrowRight");
    if (!(await hasta(() => añoAct() === "2026"))) return "→ no vuelve a 2026: " + añoAct();
    if (!(await ir("#inicio"))) return "no se vuelve al Inicio";
    const lbl = () => plano(app().querySelector(".fin-mes .lbl") || app()).toLowerCase();
    tecla("ArrowLeft");
    if (!(await hasta(() => lbl().includes("agosto 2026")))) return "← no pasa al mes anterior: " + lbl();
    tecla("ArrowRight");
    if (!(await hasta(() => lbl().includes("septiembre 2026")))) return "→ no vuelve a septiembre: " + lbl();
    tecla("/");
    const busca = await hasta(() => app().dataset.vista === "movimientos" && document.activeElement && document.activeElement.matches("input.fin-search") && document.activeElement);
    if (!busca) return "/ no lleva al buscador de Movimientos con el cursor puesto";
    tecla("g", busca);
    await dormir(300);
    if (app().dataset.vista !== "movimientos") return "escribiendo en el buscador, la G no debería cambiar de pantalla";
    busca.blur();
    tecla("r");
    if (!(await hasta(() => app().dataset.vista === "revisar"))) return "R no abre Por revisar";
    tecla("?");
    const d = await hasta(() => { const x = document.getElementById("atajos"); return x && x.open && x; });
    if (!d) return "? no abre la ayuda";
    const n = document.querySelectorAll("#menu a").length, txt = plano(d);
    tecla("?");
    if (!txt.includes(`1 … ${n}`)) return `la ayuda debería decir «1 … ${n}» (hay ${n} secciones): ${txt.slice(0, 160)}`;
    for (const k of ["← →", "/", "R", "G"]) if (!todos("kbd", d).some((e) => plano(e) === k)) return `la ayuda no lista la tecla ${k}`;
    if (d.open) return "? no cierra la ayuda";
  });

  // 25. Primeros pasos: en el Inicio de quien empieza, con lo que falta; «Ocultar» la quita para siempre
  await caso("Primeros pasos: sale al empezar, se tacha sola y «Ocultar» la quita para siempre", async () => {
    if (!(await ir("#inicio"))) return "no se abre el Inicio";
    if (porTexto(".fin-panel", "Primeros pasos")) return "con meses ya cerrados no debería salir";
    // el ejemplo ya lleva meses cerrados: sin sus cierres es el Inicio de alguien que empieza
    for (const c of regs("cierre")) { const r = await FB.api("/api/borrar", { tipo: "cierre", id: c.id }); if (!r.ok) return "no se borra un cierre: " + r.mensaje; }
    await FB.refrescar();
    const t = await hasta(() => porTexto(".fin-panel", "Primeros pasos"));
    if (!t) return "no sale la tarjeta";
    const faltan = todos("li:not(.hecho)", t);
    if (faltan.length !== 1 || !plano(faltan[0]).includes("Revisar lo que la app no ha sabido clasificar")) return "debería faltar solo revisar las dudas: " + faltan.map(plano).join(" | ");
    if (!faltan[0].querySelector('a[href="#revisar"]')) return "lo que falta no lleva a su pantalla";
    if (todos("li.hecho a", t).length) return "lo hecho no debería ser un enlace";
    if (!plano(t).includes("5 de 6 hechos")) return "no dice cuántos lleva: " + plano(t).slice(0, 120);
    porTexto("button", "Ocultar", t).click();
    if (!(await hasta(() => (FB.DB.config.avisos_descartados || []).includes("inicio:primeros-pasos") && !porTexto(".fin-panel", "Primeros pasos")))) return "«Ocultar» no la quita";
    await FB.refrescar();
    if (porTexto(".fin-panel", "Primeros pasos")) return "vuelve a salir";
  });

  // 26. Mi año: «Dónde más gastas» por comercio, y cada comercio lleva a sus movimientos de ese año
  await caso("Mi año: el ranking por comercio lleva a los movimientos de ese comercio en el año", async () => {
    if (!(await ir("#anual"))) return "no se abre Mi año";
    const p = await hasta(() => porTexto(".fin-panel", "Dónde más gastas"));
    if (!p) return "no está el panel «Dónde más gastas»";
    const filas = todos(".fin-table tbody tr", p);
    if (!filas.length || filas.length > 10) return `debería enseñar entre 1 y 10 comercios y enseña ${filas.length}`;
    const imp = filas.map((tr) => parseFloat(plano(tr.children[1]).replace(/[^\d,]/g, "").replace(",", ".")));
    if (imp.some((x, i) => i && x > imp[i - 1])) return "no van de mayor a menor: " + imp.join(", ");
    if (todos("td", p).some((td) => /alquiler/i.test(plano(td)))) return "el alquiler es un fijo: no debería salir";
    const a = filas[0].querySelector("td a");
    if (!a) return "el comercio no se puede pulsar";
    const nombre = plano(a).trim();
    a.click();
    if (!(await hasta(() => app().dataset.vista === "movimientos" && porTexto(".fb-seg.mini button.act", "Todo 2026")))) return "no abre la lista de todo 2026";
    const inp = app().querySelector("input.fin-search");
    if (!inp || inp.value !== nombre) return `el buscador debería llevar «${nombre}» y lleva «${inp && inp.value}»`;
    const items = await hasta(() => todos(".fb-item").length && todos(".fb-item"));
    if (!items) return "no sale ningún movimiento";
    const otro = items.find((e) => !plano(e).toLowerCase().includes(nombre.toLowerCase()));
    if (otro) return "sale un movimiento de otro comercio: " + plano(otro).slice(0, 80);
  });

  // 27. Proponer presupuestos: se marca lo que se quiere y solo eso se guarda
  await caso("Categorías: «Proponer presupuestos» guarda solo los marcados", async () => {
    if (!(await ir("#gestionar/categoria"))) return "no se abre Categorías";
    const det = await hasta(() => porTexto("details.fin-more", "Proponer presupuestos"));
    if (!det) return "no está «Proponer presupuestos según lo que gastas»";
    det.open = true;
    const cajas = await hasta(() => { const c = todos(".fb-propuestas input[type=checkbox]", det); return c.length && c; });
    if (!cajas) return "no propone ninguna categoría";
    const antes = new Map(regs("categoria").map((c) => [c.nombre, c.presupuesto]));
    cajas.forEach((c, i) => { c.checked = i === 0; c.dispatchEvent(new Event("change", { bubbles: true })); });
    const etiqueta = plano(cajas[0].parentElement);
    const b = todos("button.fb-btn", det).find((x) => /^Poner/.test(plano(x)));
    if (!b || b.disabled || plano(b) !== "Poner ese presupuesto") return "el botón no dice qué va a hacer: " + (b ? plano(b) : "no está");
    if (!/Los marcados suman/.test(plano(det))) return "no dice cuánto suman los marcados";
    b.click();
    const cambiadas = () => regs("categoria").filter((c) => (c.presupuesto || 0) !== (antes.get(c.nombre) || 0));
    if (!(await hasta(() => cambiadas().length === 1))) return `deberían cambiar 1 categoría y cambian ${cambiadas().length}`;
    const c = cambiadas()[0];
    if (!etiqueta.includes(c.nombre) || !etiqueta.includes(`${c.presupuesto.toLocaleString("es-ES", { minimumFractionDigits: 2 })} €`) || c.presupuesto % 10) return `se ha guardado ${c.nombre}: ${c.presupuesto} y la propuesta decía «${etiqueta}»`;
    const { id, ...datos } = c;
    await FB.api("/api/guardar", { tipo: "categoria", id, datos: { ...datos, presupuesto: antes.get(c.nombre) || 0 } });  // dejarlo como estaba
    await FB.recargar();
  });

  // 28. Rebalanceo: con un reparto objetivo del que te has alejado, el Inicio lo dice (y lleva a Inversión); sin objetivo, no
  await caso("Inicio: avisa cuando tu inversión se aleja de tu reparto objetivo", async () => {
    const aviso = () => todos(".fb-franja a").find((e) => plano(e).includes("se ha alejado de tu reparto ideal"));
    if (!(await ir("#inicio"))) return "no se abre el Inicio";
    if (aviso()) return "sin reparto objetivo no debería avisar";
    const acts = regs("activo").filter((a) => a.estado !== "vendido").sort((a, b) => (b.valor || 0) - (a.valor || 0));
    if (acts.length < 2) return "el ejemplo debería tener dos activos";
    const r = await FB.api("/api/objetivos", { objetivos: { [acts[0].id]: 1, [acts[1].id]: 99 } });  // el que más vale, casi nada
    if (!r.ok) return "no se guarda el reparto: " + r.mensaje;
    await FB.recargar();
    if (!(await ir("#inicio"))) return "no se vuelve a abrir el Inicio";
    const a = await hasta(aviso);
    if (!a) return "no avisa: " + plano(app().querySelector(".fb-franja") || app()).slice(0, 300);
    if (a.getAttribute("href") !== "#inversion") return "el aviso no lleva a Inversión: " + a.getAttribute("href");
    if (!plano(a).includes(acts[0].nombre) || !plano(a).includes(`mejor a ${acts[1].nombre}`)) return "no dice qué se ha pasado y a dónde aportar: " + plano(a);
    await FB.api("/api/objetivos", { objetivos: {} });
    await FB.recargar();
  });

  // 29. Importar en un paso: sin nada raro, la vista previa es una línea y un botón; al pulsarlo queda importado
  await caso("Importar: sin dudas ni filas raras, se resume en una línea y se importa con un clic", async () => {
    const csv = "Fecha;Concepto;Importe;Categoría\n02/09/2026;Librería de prueba;-8,40;Compras\n03/09/2026;Floristería de prueba;-15,00;Regalos\n";
    const antes = regs("movimiento").length;
    FB.soltados = [new File([csv], "prueba-limpia.csv", { type: "text/csv" })];
    if (!(await ir("#importar"))) return "no se abre Importar";
    const tarjeta = () => porTexto(".fb-card", "prueba-limpia.csv");
    if (!(await hasta(tarjeta))) return "no sale el resultado de subir el archivo";
    if (!tarjeta().classList.contains("fb-previa")) {
      const boton = await hasta(() => tarjeta() && porTexto("button", "Importar", tarjeta()));
      if (!boton) return "no pregunta la cuenta ni enseña la vista previa: " + plano(tarjeta()).slice(0, 200);
      boton.click();
    }
    if (!(await hasta(() => tarjeta() && tarjeta().classList.contains("corta")))) return "sin nada raro, la vista previa debería salir resumida: " + plano(tarjeta() || app()).slice(0, 300);
    const t = plano(tarjeta());
    if (!t.includes("2 movimientos nuevos del 02/09/2026 al 03/09/2026") || !t.includes("salen 23,40 €")) return "el resumen no dice lo que se importa: " + t.slice(0, 300);
    if (tarjeta().querySelector(".fin-tiles")) return "el detalle debería ir plegado";
    const principales = todos("button.fb-btn:not(.sec)", tarjeta());
    if (principales.length !== 1 || plano(principales[0]) !== "Importar") return "debería haber un solo botón «Importar»: " + principales.map(plano).join(" | ");
    if (regs("movimiento").length !== antes) return "la vista previa ha guardado algo";
    principales[0].click();
    if (!(await hasta(() => regs("movimiento").length === antes + 2))) return `movimientos: ${antes} → ${regs("movimiento").length}`;
    if (!(await hasta(() => !todos(".fb-previa").length && app().querySelector(".fb-card .fb-msg.ok")))) return "no dice que se ha importado: " + plano(app()).slice(0, 300);
  });

  // 30. Meta de ahorro: en Ajustes, la app calcula el límite que te la deja cumplir y lo usas con un botón
  await caso("Ajustes: con una meta de ahorro propone el límite de gasto variable y se usa con un clic", async () => {
    if (!(await ir("#ajustes"))) return "no se abre Ajustes";
    const limiteAntes = Number(FB.DB.config.limite_variable) || 0;
    const iA = app().querySelector('[data-fb="meta"]');
    if (!iA) return "no está el campo «Quiero ahorrar al mes»";
    iA.value = "300";
    iA.dispatchEvent(new Event("change", { bubbles: true }));
    if (!(await hasta(() => Number(FB.DB.config.meta_ahorro) === 300))) return "la meta no se guarda";
    const frase = await hasta(() => todos(".fb-fila span").find((e) => /^Con tu meta, tu límite sería/.test(plano(e))));
    if (!frase) return "no dice qué límite te deja la meta: " + plano(porTexto(".fin-panel", "Tu límite de gasto variable") || app()).slice(0, 300);
    if (!/− 300(,00)?\s€ de tu meta =/.test(plano(porTexto(".fin-panel", "Tu límite de gasto variable")))) return "no enseña la cuenta que hace";
    const propuesto = parseFloat(plano(frase).match(/sería ([\d.]+)/)[1].replace(/\./g, ""));
    if (Number(FB.DB.config.limite_variable) !== limiteAntes) return "el límite no debería cambiar solo";
    porTexto("button", "Usar", frase.parentElement).click();
    if (!(await hasta(() => Number(FB.DB.config.limite_variable) === propuesto))) return `el límite no pasa a ${propuesto}: ${FB.DB.config.limite_variable}`;
    await FB.api("/api/config", { meta_ahorro: 0, limite_variable: limiteAntes });  // dejarlo como estaba
    await FB.recargar();
  });

  // 31. Movimientos: la categoría se cambia en la propia fila y, con las casillas, la de varios a la vez; las dos cosas se deshacen
  await caso("Movimientos: cambiar la categoría en la fila y de varios a la vez, y deshacerlo", async () => {
    if (!(await ir("#movimientos/lista"))) return "no se abre la lista de movimientos";
    const idDe = (f) => Number(f.querySelector("a.fb-item").getAttribute("href").split("/").pop());
    const mov = (id) => regs("movimiento").find((m) => m.id === id) || {};
    const gastos = () => todos(".fb-mov").filter((f) => { const c = f.querySelector("input[type=checkbox]"); return c && !c.disabled && mov(idDe(f)).clase === "gasto"; });
    if (!(await hasta(() => gastos().length >= 3))) return "la lista no trae tres gastos con su casilla y su categoría";
    const sinNombre = todos(".fb-mov select, .fb-mov input").find((e) => !(e.getAttribute("aria-label") || "").trim());
    if (sinNombre) return "hay un control de la fila sin nombre accesible";
    // En la fila
    const f0 = gastos()[0], id0 = idDe(f0), antes0 = mov(id0).categoria;
    const s0 = f0.querySelector("select.fb-mov-cat");
    const nueva = [...s0.options].map((o) => o.value).find((v) => v && v !== antes0);
    escribir(s0, nueva);
    if (!(await hasta(() => mov(id0).categoria === nueva))) return `la fila no cambia de categoría: ${antes0} → ${mov(id0).categoria}`;
    let b = await hasta(() => porTexto("button", "Deshacer", document.getElementById("aviso")));
    if (!b) return "el aviso no ofrece «Deshacer» tras cambiar la fila";
    b.click();
    if (!(await hasta(() => mov(id0).categoria === antes0))) return "«Deshacer» no devuelve la categoría de la fila";
    // De varios a la vez
    if (!(await hasta(() => gastos().length >= 3))) return "tras deshacer, la lista no vuelve";
    const elegir = gastos().slice(0, 2), ids = elegir.map(idDe), antes = ids.map((i) => mov(i).categoria);
    for (const f of elegir) f.querySelector("input[type=checkbox]").click();
    const barra = await hasta(() => { const x = app().querySelector(".fb-bloque"); return x && x.style.display !== "none" && plano(x).includes("2 elegidos") && x; });
    if (!barra) return "al marcar dos casillas no sale «2 elegidos»";
    const sb = barra.querySelector("select");
    const otra = [...sb.options].map((o) => o.value).find((v) => v && !antes.includes(v));
    sb.value = otra;
    porTexto("button", "Cambiar la categoría", barra).click();
    if (!(await hasta(() => ids.every((i) => mov(i).categoria === otra)))) return `no pasan los dos a ${otra}: ${ids.map((i) => mov(i).categoria).join(", ")}`;
    b = await hasta(() => porTexto("button", "Deshacer", document.getElementById("aviso")));
    if (!b) return "el aviso no ofrece «Deshacer» tras cambiar varios";
    b.click();
    if (!(await hasta(() => ids.every((i, k) => mov(i).categoria === antes[k])))) return "«Deshacer» no devuelve las categorías de los dos";
  });

  // 32. Actualizar saldos propone lo mismo que luego comprueba el aviso «No cuadra»: lo que el banco ha apuntado de verdad. Con un
  // fijo y una aportación fija de septiembre que no han llegado, aceptar la propuesta tal cual no puede dejar el aviso en el Inicio.
  await caso("Actualizar saldos: aceptar lo que propone no deja «No cuadra» aunque haya fijos sin llegar", async () => {
    const cierresAntes = new Set(regs("cierre").map((c) => c.id));
    try {
      const alta = async (datos) => { const r = await FB.api("/api/guardar", { tipo: "recurrente", datos }); return r.ok ? "" : r.mensaje || "error"; };
      const e = await alta({ nombre: "Fijo que no llega", clase: "gasto", categoria: "Otros", importe: 40, dia: 20, desde: "2026-09-01", cuenta: "Cuenta nómina" })
        || await alta({ nombre: "Aportación que no llega", clase: "aportacion", importe: 50, dia: 25, desde: "2026-09-01", activo_inversion: "Bitcoin", cuenta: "Bróker" });
      if (e) return "no se dan de alta los fijos de prueba: " + e;
      await FB.recargar();
      if (!(await ir("#cerrar"))) return "no se abre Actualizar saldos";
      const boton = () => todos("button.fb-btn").find((b) => /^(Cerrar |Guardar los saldos)/.test(plano(b)));
      if (!(await hasta(boton))) return "no está el botón de guardar";
      escribir(campo("Fecha"), "2026-09-30");  // los saldos de hoy, pida el mes que pida (otro flujo ha borrado los cierres)
      const pie =(n) => plano(campo(n).nextElementSibling);
      for (const n of ["Cuenta nómina", "Bróker"]) if (!pie(n).startsWith("según los movimientos: ")) return `${n} no trae su propuesta: ${pie(n)}`;
      const propuesta = ["Cuenta nómina", "Bróker"].map((n) => `${n} ${campo(n).value}`).join(", ");
      boton().click();
      await confirmaEstimados();
      if (!(await hasta(() => app().dataset.vista === "inicio" && app().querySelector(".fin-page > *")))) return "tras guardar no vuelve al Inicio";
      const aviso = /No cuadra[^·]*/.exec(plano(app()));
      if (aviso) return `aceptando la propuesta (${propuesta}) el Inicio dice: ${aviso[0]}`;
    } finally {  // dejarlo como estaba, pase lo que pase: los dos fijos y el cierre que guarda el flujo
      await FB.recargar();
      for (const n of ["Fijo que no llega", "Aportación que no llega"]) for (const r of regs("recurrente").filter((x) => x.nombre === n)) await FB.api("/api/borrar", { tipo: "recurrente", id: r.id });
      for (const c of regs("cierre").filter((x) => !cierresAntes.has(x.id))) await FB.api("/api/borrar", { tipo: "cierre", id: c.id });
      await FB.recargar();
    }
  });

  // 33. El valor de un activo se puede anotar sin fecha: su ficha se abre igual y lo dice. Y si luego se vende del todo, ese valor
  // ya no cuenta (sin fecha no se sabe si es de después de la venta): vale 0 € y pasa a «Ya vendido».
  await caso("Inversión: un valor anotado sin fecha no rompe la ficha, y vendido del todo deja de contar", async () => {
    const nombre = "Fondo sin fecha";
    const r = await FB.api("/api/guardar", { tipo: "activo", datos: { nombre, clase: "fondo", cuenta: "Bróker", valor: 1000 } });
    if (!r.ok) return "no se da de alta el activo de prueba: " + r.mensaje;
    const ope = (fecha, importe, participaciones) => FB.api("/api/guardar", { tipo: "aportacion", datos: { fecha, activo: nombre, importe, participaciones, cuenta: "Bróker" } });
    const c = await ope("2026-08-10", 1000, 10);
    if (!c.ok) return "no se guarda la compra: " + c.mensaje;
    await FB.recargar();
    if (!(await ir(`#activo/${r.id}`))) return "no se abre la ficha";
    if (!(await hasta(() => plano(app()).includes("anotado, sin fecha")))) return "la ficha no se dibuja o no dice que el valor no tiene fecha: " + plano(app()).slice(0, 200);
    const v = await ope("2026-09-20", -1200, -10);
    if (!v.ok) return "no se guarda la venta: " + v.mensaje;
    await FB.recargar();
    if (!(await ir(`#activo/${r.id}`))) return "no se vuelve a abrir la ficha";
    if (!(await hasta(() => plano(app()).includes("vendido del todo")))) return "vendido del todo, la ficha sigue dando el valor anotado: " + plano(app()).slice(0, 200);
    if (!(await ir("#inversion"))) return "no se abre Inversión";
    const panelActivos = await hasta(() => porTexto(".fin-panel", "Tus activos"));
    if (!panelActivos) return "no está el panel «Tus activos»";
    if (porTexto("td", nombre, panelActivos)) return "sigue en la tabla de «Tus activos»";
    if (!/Ya vendido: [^·]*Fondo sin fecha \(\+200,00 €\)/.test(plano(panelActivos))) return "no sale en «Ya vendido» con sus +200 €: " + plano(panelActivos).slice(-220);
    const b = await FB.api("/api/activo/borrar", { id: r.id });  // dejarlo como estaba
    if (!b.ok) return "no se borra el activo de prueba: " + b.mensaje;
    await FB.recargar();
  });

  // 34. Los tres escenarios de «Tus próximos meses» caben en la tarjeta: cada uno con sus dos cifras a la vista, sin tener que
  // desplazar hacia un lado para llegar a ellas.
  await caso("Previsión: los tres escenarios enseñan sus dos cifras sin desplazamiento horizontal", async () => {
    if (!(await ir("#inicio"))) return "no se abre el Inicio";
    const caja = await hasta(() => app().querySelector('[role="region"][aria-label="Tres escenarios de la previsión"]'));
    if (!caja) return "no está la región «Tres escenarios de la previsión»";
    const cab = todos("thead th", caja).map(plano);
    if (cab.length !== 3 || !/^En \S+ \d{4}$/.test(cab[1]) || cab[2] !== "Lo más bajo") return "las cifras no llevan su cabecera: " + cab.join(" | ");
    const filas = todos("tbody tr", caja);
    if (filas.map((f) => plano(f.querySelector("th .t"))).join() !== "Prudente,Normal,Optimista") return "no son Prudente, Normal y Optimista: " + filas.map(plano).join(" | ");
    if (!plano(filas[0]).includes("gastas un 15 % más, te entra un 10 % menos")) return "el prudente no dice lo que supone: " + plano(filas[0]);
    const dentro = caja.getBoundingClientRect();
    for (const f of filas) {
      const cifras = todos("td.num", f);
      if (cifras.length !== 2 || !cifras.every((c) => /\d €/.test(plano(c)))) return "faltan las dos cifras en: " + plano(f);
      for (const c of cifras) { const r = c.getBoundingClientRect(); if (r.width < 1 || r.right > dentro.right + 1) return `una cifra se sale de la tarjeta en: ${plano(f)}`; }
    }
    for (let e = caja.querySelector("table"); e && e !== caja.parentElement; e = e.parentElement) if (e.scrollWidth > e.clientWidth + 1) return "la tabla no cabe: hay que desplazarla hacia un lado";
  });

  // 35. «¿Me puedo permitir un gasto?»: plegado bajo la barra de la portada; escribes 300 y contesta con el veredicto y tres cifras.
  // Es solo una cuenta: no llama al servidor, los datos quedan igual y lo último que se podía deshacer se sigue pudiendo.
  await caso("Inicio: «¿Me puedo permitir un gasto?» contesta con 300 € y no guarda nada", async () => {
    const m = regs("movimiento").find((x) => x.clase === "gasto" && !x.parte_de && x.categoria), otra = m.categoria === "Ocio" ? "Otros" : "Ocio";
    const c = await FB.api("/api/movimiento/categoria", { ids: [m.id], categoria: otra });  // algo que se pueda deshacer
    if (!c.ok) return "no se puede preparar un cambio que deshacer: " + c.mensaje;
    await FB.recargar();
    if (!FB.DB.info.deshacer) return "tras cambiar una categoría no hay nada que deshacer";
    if (!(await ir("#inicio"))) return "no se abre el Inicio";
    const caja = () => app().querySelector(".fb-hero details.fb-permitir");
    if (!(await hasta(caja))) return "no está el plegable en la portada";
    if (caja().open) return "debería salir plegado";
    const antes = JSON.stringify(FB.DB), api = FB.api;
    const llamadas = [];
    FB.api = (ruta, ...r) => { llamadas.push(ruta); return api(ruta, ...r); };
    try {
      caja().querySelector("summary").click();
      const inp = await hasta(() => caja().open && caja().querySelector("input"));
      if (!inp) return "al pulsarlo no se abre el campo";
      const et = caja().querySelector(`label[for="${inp.id}"]`);
      if (!inp.id || !et || !plano(et).trim()) return "el campo del importe no tiene su nombre";
      escribir(inp, "300");
      const v = await hasta(() => caja().querySelector(".veredicto"));
      if (!v) return "al escribir 300 no sale el veredicto";
      // Las mismas cifras que ya enseña el Inicio (la portada y la fila «Normal» de los escenarios), con 300 € menos; ±1 € por el redondeo
      const euros = (t) => { const x = /(−?)([\d.]+)(?:,(\d+))? €/.exec(t); return x ? (x[1] ? -1 : 1) * Number(x[2].replace(/\./g, "") + (x[3] ? "." + x[3] : "")) : NaN; };
      const hero = app().querySelector(".fb-hero"), pasado = hero.classList.contains("pasado"), libre = (pasado ? -1 : 1) * euros(plano(hero.querySelector(".iz > .v")));
      const normal = todos("tbody tr", app().querySelector('[role="region"][aria-label="Tres escenarios de la previsión"]')).find((f) => plano(f).startsWith("Normal"));
      const bajo = euros(plano(todos("td.num", normal)[1])), mesBajo = plano(todos("td.num", normal)[1].querySelector("small")).trim();
      const filas = todos(".r", caja()).map(plano), casi = (a, b) => Math.abs(a - b) <= 1;
      if (libre - 300 >= 0) return `el ejemplo ya no se pasa del límite (quedarían ${libre - 300}): revisa este flujo`;
      if (!/te pasarías [\d.,]+ € del límite de este mes/i.test(plano(v)) || !casi(euros(plano(v)), 300 - libre)) return `el veredicto debería decir que te pasas ${300 - libre} €: ${plano(v)}`;
      if (filas.length !== 3 || !filas[0].includes("te pasarías") || !casi(euros(filas[0]), 300 - libre)) return `la línea del límite debería dar ${300 - libre} €: ${filas.join(" | ")}`;
      if (!/tendrías −?[\d.,]+ € en tus cuentas/.test(filas[1])) return "falta lo que tendrías al acabar el mes: " + filas[1];
      if (!casi(euros(filas[2]), bajo - 300) || !filas[2].endsWith(mesBajo)) return `el mes más justo debería ser ${bajo - 300} € ${mesBajo}: ${filas[2]}`;
      if (!/movimientos hasta el \d+ de septiembre/.test(plano(caja()))) return "no dice hasta qué día hay movimientos";
      escribir(inp, "1.200,50");
      if (!(await hasta(() => casi(euros(plano(todos(".r", caja())[0])), 1200.5 - libre)))) return "«1.200,50» no se lee como mil doscientos con cincuenta: " + plano(caja());
      escribir(inp, "300");
      if (llamadas.length) return "ha llamado al servidor: " + llamadas.join(", ");
    } finally { FB.api = api; }
    await FB.refrescar();
    const inp2 = await hasta(() => caja() && caja().open && caja().querySelector("input"));
    if (!inp2 || inp2.value !== "300" || !caja().querySelector(".veredicto")) return "al refrescar se pierde lo escrito";
    if (JSON.stringify(FB.DB) !== antes) return "los datos han cambiado tras usarlo";
    if (!FB.DB.info.deshacer) return "tras usarlo ya no se puede deshacer lo anterior";
    const des = await FB.api("/api/deshacer", {});  // dejarlo como estaba
    if (!des.ok) return "«Deshacer» ya no funciona: " + des.mensaje;
    await FB.recargar();
    if ((regs("movimiento").find((x) => x.id === m.id) || {}).categoria !== m.categoria) return "deshacer no devuelve la categoría";
  });

  // Accesibilidad y nombres: B-115, B-116, B-117 (Ajustes), B-119 y B-122.
  await caso("Por revisar: cada campo, desplegable y casilla tiene nombre accesible", async () => {
    if (!(await ir("#revisar"))) return "no se abre la pantalla Por revisar";
    if (!(await hasta(() => todos(".fb-grupo").length))) return "no hay nada por revisar en los datos de ejemplo";
    if (!todos("details").length) return "ningún grupo trae «Opciones» en los datos de ejemplo";
    todos("details").forEach((d) => (d.open = true));  // «Opciones» pinta sus campos la primera vez que se abre
    await dormir(200);
    const nombre = (el) => (el.getAttribute("aria-label") || (el.id && (document.querySelector(`label[for="${el.id}"]`) || {}).textContent) || (el.closest("label") || {}).textContent || "").trim();
    const sin = todos("input:not([type=hidden]), select, textarea").filter((el) => !nombre(el));
    if (sin.length) return `${sin.length} campos sin nombre: ` + sin.map((el) => el.outerHTML.slice(0, 90)).join(" | ");
  });

  // B-107: el menú y el título de la pantalla cuentan las mismas dudas (el aviso del Inicio, en pruebas_calculos.js). Las compras del bróker que la app ya
  // reconoce (en el ejemplo, las dos de ISHARES) cuentan en la inversión: no son dudas, pero siguen a mano en su propia sección.
  await caso("Por revisar: la insignia del menú y el título cuentan las mismas dudas; las compras del bróker van aparte", async () => {
    const dudas = (FB.DB.pendientes || []).filter((q) => q.tipo_import !== "inversion").length, deBroker = (FB.DB.pendientes || []).length - dudas;
    if (!dudas || !deBroker) return `el ejemplo debería traer dudas del banco y compras del bróker (hay ${dudas} y ${deBroker})`;
    const insignia = () => ((document.querySelector('#menu a[href="#revisar"] .num') || {}).textContent || "").trim();
    if (!(await ir("#inicio"))) return "no se abre el Inicio";
    if (insignia() !== String(dudas)) return `en el Inicio la insignia del menú dice «${insignia()}» y hay ${dudas} dudas`;
    if (!(await ir("#revisar"))) return "no se abre la pantalla Por revisar";
    if (insignia() !== String(dudas)) return `en Por revisar la insignia del menú dice «${insignia()}» y hay ${dudas} dudas`;
    const sub = await hasta(() => (document.querySelector(".fin-head .sub") || {}).textContent);
    const m = /(\d+) grupos? · (\d+) movimientos?/.exec(sub || "");
    if (!m) return `el título de Por revisar no dice grupos y movimientos: «${sub}»`;
    if (Number(m[2]) !== dudas) return `el título cuenta ${m[2]} movimientos y hay ${dudas} dudas`;
    if (todos(".fb-grupo").length !== Number(m[1]) + 1) return `el título cuenta ${m[1]} grupos y en pantalla hay ${todos(".fb-grupo").length} fichas (debería haber una más: las compras del bróker)`;
  });

  await caso("Cada pantalla tiene un único título h1, con texto", async () => {
    const h1s = () => [...document.querySelectorAll("h1")];
    for (const ruta of ["#inicio", "#movimientos", "#inversion", "#revisar", "#importar", "#ajustes", "#cerrar"]) {
      if (!(await ir(ruta))) return `no se abre ${ruta}`;
      await hasta(() => h1s().length);
      if (h1s().length !== 1 || !h1s()[0].textContent.trim()) return `${ruta}: ${h1s().length} títulos h1 (debe haber uno, con texto)`;
    }
  });

  await caso("El menú marca la sección en la que estás con aria-current", async () => {
    for (const ruta of ["#movimientos", "#ajustes"]) {
      if (!(await ir(ruta))) return `no se abre ${ruta}`;
      const marcados = () => [...document.querySelectorAll("#menu a[aria-current]")];
      if (!(await hasta(() => marcados().length === 1 && marcados()[0].getAttribute("aria-current") === "page" && marcados()[0].getAttribute("href") === ruta))) return `en ${ruta} el menú marca: ${marcados().map((a) => a.getAttribute("href") + "=" + a.getAttribute("aria-current")).join(", ") || "nada"}`;
    }
  });

  await caso("La pestaña del navegador dice lo mismo que el título de la pantalla", async () => {
    const tituloH1 = () => ((document.querySelector("h1") || {}).textContent || "").trim();
    for (const ruta of ["#cerrar", "#valores"]) {
      if (!(await ir(ruta))) return `no se abre ${ruta}`;
      if (!(await hasta(() => tituloH1() && document.title === "FinanceBuddy · " + tituloH1()))) return `${ruta}: la pestaña dice «${document.title}» y el título «${tituloH1()}»`;
    }
  });

  await caso("El buscador de una lista de Ajustes tiene nombre accesible", async () => {
    if (!(await ir("#gestionar/cuenta"))) return "no se abre la lista de cuentas desde Ajustes";
    const inp = await hasta(() => app().querySelector("input.fin-search"));
    if (!inp) return "no hay buscador en la lista de cuentas";
    if (!/^Buscar en /.test(inp.getAttribute("aria-label") || "")) return "el buscador no tiene nombre accesible: «" + (inp.getAttribute("aria-label") || "") + "»";
  });

  await caso("La ayuda de «Registros por página» no usa nombres internos de la app", async () => {
    if (!(await ir("#ajustes"))) return "no se abre Ajustes";
    todos("details").forEach((d) => (d.open = true));  // por si la ayuda va dentro de un desplegable
    const ayuda = await hasta(() => todos(".fin-note").find((n) => /Cuántas filas se ven/.test(n.textContent)));
    if (!ayuda) return "no está la ayuda de «Registros por página»";
    const t = ayuda.textContent;
    if (/Gestionar|Renta/.test(t) || !/las listas de Ajustes/.test(t) || !/Para la renta/.test(t)) return "la ayuda dice: " + t;
  });

  await caso("Importar: los tipos de extracto llevan el nombre de su carpeta", async () => {
    if (!(await ir("#importar"))) return "no se abre Importar";
    const tipos = await hasta(() => todos('input[name="tipoimp"]').length && todos('input[name="tipoimp"]').map((r) => r.parentElement.textContent.trim()));
    if (!tipos) return "no salen los tipos de extracto";
    if (JSON.stringify(tipos) !== JSON.stringify(["Que lo detecte la app", "Banco", "Inversión"])) return "los tipos se llaman: " + tipos.join(" / ");
  });

  // 36. Tu dinero total (B-108): las partes suman la cifra y la inversión va a valor de mercado, sin decir «Invertido»
  await caso("Tu dinero total: las partes suman la cifra y la inversión va a valor de mercado", async () => {
    if (!(await ir("#inicio"))) return "no se abre el Inicio";
    const tarjeta = await hasta(() => porTexto(".fin-panel", "Tu dinero total"));
    if (!tarjeta) return "no sale «Tu dinero total»";
    const num = (el) => parseFloat(plano(el).replace(/[^\d,−-]/g, "").replace("−", "-").replace(",", "."));
    const cifra = num(tarjeta.querySelector(".fb-total .v"));
    const suma = todos(".fin-rows .r .v", tarjeta).reduce((s, el) => s + num(el), 0);
    if (!(Math.abs(suma - cifra) <= 0.03)) return `las partes suman ${suma.toFixed(2)} y la cifra es ${cifra}`;
    if (/Invertido|de cambio de valor/.test(plano(tarjeta))) return "sigue diciendo «Invertido» o «de cambio de valor»";
    if (!plano(tarjeta).includes("Inversión a valor de mercado")) return "falta «Inversión a valor de mercado»";
  });

  // 37. Tu dinero total de un mes pasado (B-112): a fin de ese mes, con la fecha de sus saldos; «Hoy» vuelve al mes actual
  await caso("Tu dinero total del mes pasado: a fin de ese mes, con la fecha de sus saldos", async () => {
    if (!(await ir("#inicio"))) return "no se abre el Inicio";
    const atras = todos(".fin-mes button")[0];
    if (!atras) return "no está el botón del mes anterior";
    atras.click();
    const t = await hasta(() => { const p = porTexto(".fin-panel", "Tu dinero total"); return p && /saldos del/.test(plano(p)) ? p : null; });
    const dice = t ? plano(t) : "";
    todos(".fin-mes button").slice(-1)[0].click();
    if (!(await hasta(() => { const p = porTexto(".fin-panel", "Tu dinero total"); return p && !/saldos del/.test(plano(p)); }))) return "no se vuelve al mes actual";
    if (!t) return "el mes pasado no muestra «a fin de … · saldos del …» en «Tu dinero total»";
    if (!/a fin de agosto/.test(dice)) return "no dice a fin de qué mes: " + dice.slice(0, 160);
    if (!/saldos del \d\d\/08\/2026/.test(dice)) return "no dice la fecha de sus saldos: " + dice.slice(0, 160);
  });

  // 38. La portada (B-113): el límite se dice una vez, con su importe, sin porcentaje y sin «lo normal»
  await caso("La portada dice el límite una vez y sin porcentaje", async () => {
    if (!(await ir("#inicio"))) return "no se abre el Inicio";
    if (!Number(FB.DB.config.limite_variable)) return "";  // sin límite no hay barra que mirar
    // .iz = el bloque del límite; el % del ahorro va en el resumen de abajo, fuera de él
    const h = await hasta(() => app().querySelector(".fb-hero .iz"));
    if (!h) return "no hay portada";
    const t = plano(h);
    if (/\d\s*%/.test(t)) return "la portada sigue con porcentaje: " + t.slice(0, 160);
    if (/lo normal/.test(t)) return "la portada sigue diciendo «lo normal»";
    if (t.split("de tu límite de").length !== 2) return "la portada no dice el límite una vez: " + t.slice(0, 160);
  });

  // 39. Por categoría (B-120): la nota ofrece el presupuesto y no compara con la media
  await caso("Por categoría: la nota no compara con la media y ofrece el presupuesto", async () => {
    // Desde la lista: el clic en «Por categoría» cambia de vista aunque antes hubiera una categoría elegida
    if (!(await ir("#movimientos/lista"))) return "no se abre Movimientos";
    const porCat = await hasta(() => todos(".fb-seg a").find((a) => plano(a).trim() === "Por categoría"));
    if (!porCat) return "no está el botón «Por categoría»";
    porCat.click();
    const nota = await hasta(() => todos(".fin-note").find((n) => /¿Quieres un tope para una categoría\?/.test(n.textContent)));
    if (!nota) return "no está la nota del presupuesto";
    if (/comparado con la media|▲▼/.test(nota.textContent)) return "la nota sigue comparando con la media: " + plano(nota).slice(0, 160);
  });

  // 40. Inversión (B-114): «Tu dinero sin invertir» dice si el efectivo del bróker cubre las próximas aportaciones
  await caso("Inversión: el dinero sin invertir dice si cubre las próximas aportaciones", async () => {
    if (!(await ir("#inversion"))) return "no se abre Inversión";
    const p = await hasta(() => porTexto(".fin-panel", "Tu dinero sin invertir"));
    if (!p) return "no sale «Tu dinero sin invertir»";
    if (!p.querySelector(".fin-rows")) return "";  // sin saldo del bróker no hay nada que comparar
    const dice = todos(".fin-note", p).map((n) => plano(n)).join(" | ");
    const dicePrevision = /Cubre las aportaciones hasta|Se acaba en|No cubre las aportaciones|Anota el saldo de tu bróker para saber si cubre/.test(dice);
    const hayApo = window.__fin.prevision().filas.some((f) => f.apo > 0);
    if (hayApo && !dicePrevision) return "hay aportaciones previstas y ninguna nota dice si el efectivo las cubre: " + dice.slice(0, 160);
    if (!hayApo && dicePrevision) return "no hay aportaciones previstas y la nota habla de ellas: " + dice.slice(0, 160);
  });

  // 41. Inversión (B-118): anotar valores a mano tiene un solo nombre
  await caso("Inversión: anotar valores a mano tiene un solo nombre", async () => {
    if (!(await ir("#inversion"))) return "no se abre Inversión";
    const t = await hasta(() => plano(app()).includes("Anotar valores a mano") && plano(app()));
    if (!t) return "no sale «Anotar valores a mano» en Inversión";
    if (t.includes("Actualizar valores")) return "sigue apareciendo «Actualizar valores» en Inversión";
  });

  // 42. Inversión (B-121): el «—» de la columna Anual tiene su nota
  await caso("Inversión: el «—» de la columna Anual tiene su nota", async () => {
    if (!(await ir("#inversion"))) return "no se abre Inversión";
    const p = await hasta(() => porTexto(".fin-panel", "Tus activos"));
    if (!p) return "no sale «Tus activos»";
    const tabla = p.querySelector("table");
    const col = tabla ? [...tabla.querySelectorAll("thead th")].findIndex((th) => plano(th).trim() === "Anual") : -1;
    if (col < 0) return "no hay columna Anual";
    const hayGuion = todos("tbody tr", tabla).some((tr) => tr.children[col] && plano(tr.children[col]).trim() === "—");
    if (hayGuion && !plano(p).includes("«—» en Anual")) return "hay «—» en Anual y ninguna nota lo explica";
  });

  // 43. Movimientos (B-117): el buscador de la lista tiene nombre accesible
  await caso("Movimientos: el buscador de la lista tiene nombre accesible", async () => {
    if (!(await ir("#movimientos/lista"))) return "no se abre la lista de movimientos";
    const inp = await hasta(() => app().querySelector("input.fin-search"));
    if (!inp) return "no hay buscador en la lista de movimientos";
    if (inp.getAttribute("aria-label") !== "Buscar movimientos") return "el buscador se llama «" + (inp.getAttribute("aria-label") || "") + "»";
  });

  // 43b. Movimientos (B-068): filtros guardados — guardar lo puesto, limpiarlo, aplicarlo (queda igual), renombrarlo y borrarlo
  await caso("Movimientos: guardar un filtro, limpiarlo, aplicarlo, renombrarlo y borrarlo", async () => {
    if (!(await ir("#movimientos/lista"))) return "no se abre la lista de movimientos";
    const dlg = () => document.querySelector("dialog.fb-dialogo[open]");
    const lista = () => FB.DB.config.filtros_movimientos || [];
    const total = () => { const t = todos(".fin-note").find((e) => /^\d+ movimientos?/.test(plano(e))); return t ? plano(t).split("·")[0].trim() : ""; };
    const mov = regs("movimiento").find((m) => m.clase === "gasto" && m.concepto);
    if (!mov) return "no hay un gasto con concepto";
    const palabra = String(mov.concepto).split(/\s+/)[0];
    const buscador = () => app().querySelector("input.fin-search");
    const orden = () => app().querySelector("select[aria-label='Ordenar los movimientos']");
    const desde = () => app().querySelector("input[placeholder='Sin tope']");
    const abrir = (txt) => { const s = porTexto("details > summary", txt); if (s && !s.parentElement.open) s.click(); return s; };
    if (!(await hasta(() => buscador() && orden() && desde()))) return "faltan el buscador, el orden o «Más filtros»";
    escribir(buscador(), palabra); escribir(orden(), "importe"); escribir(desde(), "0,5");
    const nGuardado = total();
    if (!nGuardado) return "no se ve el total con el filtro puesto";
    abrir("Filtros guardados");
    porTexto("button", "Guardar este filtro").click();
    if (!(await hasta(() => dlg()))) return "no pide el nombre";
    escribir(dlg().querySelector("input[type=text]"), "Mi filtro de prueba");
    porTexto("button", "Guardar", dlg()).click();
    if (!(await hasta(() => lista().length === 1 && lista()[0].nombre === "Mi filtro de prueba"))) return "no se guarda en la configuración: " + JSON.stringify(lista());
    const g = lista()[0];
    if (g.busqueda !== palabra || g.orden !== "importe" || g.desde !== "0,5") return "lo guardado no es lo puesto: " + JSON.stringify(g);
    await hasta(() => buscador() && buscador().value === palabra && porTexto("button", "Quitar filtros"));
    escribir(buscador(), ""); escribir(orden(), "fecha"); porTexto("button", "Quitar filtros").click();
    if (!(await hasta(() => total() !== nGuardado && desde().value === ""))) return "al limpiar, la lista no cambia";
    abrir("Filtros guardados");
    const fila = await hasta(() => porTexto(".fb-guardado", "Mi filtro de prueba"));
    if (!fila) return "el filtro guardado no sale en la lista";
    if (!plano(fila).includes("0,50")) return "el resumen no enseña el importe con dos decimales: " + plano(fila);
    fila.querySelector(".aplicar").click();
    if (!(await hasta(() => buscador().value === palabra && orden().value === "importe" && desde().value === "0,5" && total() === nGuardado))) return `no queda como al guardarlo: «${buscador().value}», ${orden().value}, «${desde().value}», ${total()} (era ${nGuardado})`;
    abrir("Filtros guardados");
    porTexto("button", "Renombrar").click();
    if (!(await hasta(() => dlg()))) return "no pide el nombre nuevo";
    if (dlg().querySelector("input[type=text]").value !== "Mi filtro de prueba") return "el nombre actual no sale escrito";
    escribir(dlg().querySelector("input[type=text]"), "Otro nombre");
    porTexto("button", "Renombrar", dlg()).click();
    if (!(await hasta(() => lista().length === 1 && lista()[0].nombre === "Otro nombre"))) return "no se renombra";
    abrir("Filtros guardados");
    porTexto("button", "Borrar").click();
    if (!(await hasta(() => dlg()))) return "no pide confirmar el borrado";
    porTexto("button", "Borrar", dlg()).click();
    if (!(await hasta(() => lista().length === 0))) return "no se borra";
    if (!(await hasta(() => !porTexto(".fb-guardado", "Otro nombre")))) return "sigue en la lista tras borrarlo";
  });

  // 44. Independencia (B-059): se abre desde Inversión, cambiar un supuesto se guarda y cambia el resultado; la pensión se cuenta
  await caso("Independencia: desde Inversión, cambiar un supuesto se guarda y cambia el resultado", async () => {
    if (!(await ir("#inversion"))) return "no se abre Inversión";
    const enl = await hasta(() => porTexto("a", "Calculadora de independencia"));
    if (!enl) return "Inversión no enlaza la calculadora";
    enl.click();
    const campoI = (inicio) => app().querySelector(`input[aria-label^='${inicio}']`);
    if (!(await hasta(() => app().dataset.vista === "independencia" && campoI("Gasto que quieres")))) return "no se abre la calculadora";
    if (/NaN|undefined/.test(plano(app()))) return "la pantalla enseña NaN o undefined";
    if (!plano(app()).includes("Capital que hace falta")) return "no enseña el capital que hace falta";
    // Cada cambio se guarda y la pantalla se redibuja: se espera a que el campo nuevo enseñe lo guardado antes de tocar otro
    const poner = async (inicio, v, clave) => {
      escribir(campoI(inicio), String(v));
      if (!(await hasta(() => (FB.DB.config.independencia || {})[clave] === v))) return `no se guardó «${clave}» en la configuración`;
      if (!(await hasta(() => campoI(inicio) && campoI(inicio).value === String(v)))) return `el campo «${clave}» no conserva lo escrito`;
      await dormir(150);
    };
    let e = await poner("Gasto que quieres", 24000, "gasto"); if (e) return e;
    if (!plano(app()).includes("600.000,00")) return "con 24.000 € al año y el 4 % tendría que salir 600.000,00 €";
    e = await poner("Tu edad", 40, "edad"); if (e) return e;
    e = await poner("Pensión pública", 900, "pension"); if (e) return e;
    if (!(await hasta(() => plano(app()).includes("te ahorra")))) return "con edad y pensión no se explica cuánto ahorra la pensión";
    if (/NaN|undefined/.test(plano(app()))) return "NaN o undefined con pensión";
    escribir(campoI("Gasto que quieres"), "");
    if (!(await hasta(() => (FB.DB.config.independencia || {}).gasto === undefined && campoI("Gasto que quieres").value !== "24000"))) return "vaciar el gasto no vuelve al valor de tus datos";
    if (/NaN|undefined/.test(plano(app()))) return "NaN o undefined al volver al valor de tus datos";
  });

  return casos;
})();

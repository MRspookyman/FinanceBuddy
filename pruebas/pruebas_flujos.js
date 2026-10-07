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
    const frase = "120 € al mes de otros gastos fijos que no tienes dados de alta (tu media de los últimos 4 meses)";
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
    if (!(await hasta(() => regs("patrimonio").some((x) => x.fecha === "2026-09-15")))) return "no se guardan los saldos del día 15";
    if (regs("cierre").some((x) => x.mes === "2026-09")) return "septiembre ha quedado cerrado con saldos del día 15";
    if (!(await ir("#cerrar"))) return "no se vuelve a abrir Actualizar saldos";
    if (!(await hasta(() => boton() && plano(boton()).startsWith("Cerrar septiembre")))) return "no ofrece cerrar septiembre";
    boton().click();
    if (!(await hasta(() => regs("cierre").some((x) => x.mes === "2026-09" && x.fecha === "2026-09-30")))) return "con los saldos del día 30 no se cierra septiembre";
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

  return casos;
})();

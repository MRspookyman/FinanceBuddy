// Núcleo de la página: ayudas de DOM, llamadas a la API, navegación por «#pantalla/parámetros» y montaje de los
// módulos de paneles/ (se descargan una vez, concatenados, y se ejecutan de nuevo en cada navegación).
(() => {
  const log = (s) => { document.getElementById("log").textContent += s + "\n"; };
  window.addEventListener("error", (e) => log("Error: " + ((e.error && e.error.stack) || e.message)));
  window.addEventListener("unhandledrejection", (e) => log("Error: " + ((e.reason && e.reason.stack) || e.reason)));

  // ── ayudas de DOM (createEl, createDiv…: la API que usan los paneles) ──
  function opts(el, o) {
    if (!o) return el;
    if (typeof o === "string") { el.className = o; return el; }
    if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(" ") : o.cls;
    if (o.text != null) el.textContent = o.text;
    if (o.href) el.setAttribute("href", o.href);
    if (o.attr) for (const k in o.attr) el.setAttribute(k, o.attr[k]);
    return el;
  }
  Object.assign(HTMLElement.prototype, {
    createEl(t, o) { const e = document.createElement(t); opts(e, o); this.appendChild(e); return e; },
    createDiv(o) { return this.createEl("div", o); },
    createSpan(o) { return this.createEl("span", o); },
    empty() { this.innerHTML = ""; },
    setText(t) { this.textContent = t; },
    appendText(t) { this.appendChild(document.createTextNode(t)); },
    addClass(c) { this.classList.add(c); },
  });

  // ── tema: claro (de serie), oscuro o automático (el del sistema); se guarda en este navegador ──
  const temaURL = new URLSearchParams(location.search).get("tema");  // ?tema=oscuro|claro: solo para esta carga (capturas de las pruebas)
  const leerTema = () => { if (temaURL === "oscuro" || temaURL === "claro") return temaURL; try { return localStorage.getItem("fb-tema") || "claro"; } catch (_) { return "claro"; } };  // claro de serie
  const oscuroSistema = matchMedia("(prefers-color-scheme: dark)");
  const aplicarTema = () => { const t = leerTema(); document.body.classList.toggle("theme-dark", t === "auto" ? oscuroSistema.matches : t === "oscuro"); };
  aplicarTema();
  oscuroSistema.addEventListener && oscuroSistema.addEventListener("change", () => { if (leerTema() === "auto") { aplicarTema(); montar(); } });
  document.getElementById("tema").onclick = () => {
    FB.tema(document.body.classList.contains("theme-dark") ? "claro" : "oscuro");
    montar();
  };

  // ── modo discreto: desenfoca los importes (en euros) para mirar la app con gente al lado; los porcentajes se ven ──
  // Las pantallas se dibujan con texto normal: un observador envuelve cada importe en un <span class="blur"> (o marca el
  // texto del gráfico) en cuanto aparece, también en lo que se despliega después.
  const RE_IMPORTE = /[−+\-]?\d[\d.]*(?:,\d+)?(?:[\u00a0 ]?[kKM])?[\u00a0 ]?€/g;
  const leerDiscreto = () => { try { return localStorage.getItem("fb-discreto") === "1"; } catch (_) { return false; } };
  let discreto = leerDiscreto();
  // El eje vertical de un gráfico (números a la derecha de la escala, sin «€») también delata las cifras
  const ejeDeImportes = (n) => { const p = n.parentElement; return p && p.namespaceURI === "http://www.w3.org/2000/svg" && p.getAttribute("text-anchor") === "end" && /^[−-]?\d[\d.,]*\s?[kM]?$/.test(n.nodeValue.trim()); };
  const ocultarEn = (raiz) => {
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && !n.parentElement.closest(".blur, script, style, option, textarea, #aviso") && (/€/.test(n.nodeValue) || ejeDeImportes(n)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    const nodos = []; while (w.nextNode()) nodos.push(w.currentNode);
    for (const n of nodos) {
      const padre = n.parentElement;
      if (padre.namespaceURI === "http://www.w3.org/2000/svg") { padre.classList.add("blur"); continue; }  // texto de un gráfico
      const t = n.nodeValue; RE_IMPORTE.lastIndex = 0;
      if (!RE_IMPORTE.test(t)) continue;
      const frag = document.createDocumentFragment(); let i = 0; RE_IMPORTE.lastIndex = 0; let m;
      while ((m = RE_IMPORTE.exec(t))) {
        if (m.index > i) frag.appendChild(document.createTextNode(t.slice(i, m.index)));
        const s = document.createElement("span"); s.className = "blur"; s.textContent = m[0]; frag.appendChild(s); i = m.index + m[0].length;
      }
      if (i < t.length) frag.appendChild(document.createTextNode(t.slice(i)));
      n.replaceWith(frag);
    }
  };
  const observador = new MutationObserver((muts) => {
    if (!discreto) return;
    observador.disconnect();
    for (const m of muts) for (const a of m.addedNodes) if (a.nodeType === 1) ocultarEn(a); else if (a.nodeType === 3 && a.parentElement) ocultarEn(a.parentElement);
    observador.observe(document.getElementById("app"), { childList: true, subtree: true });
  });
  const aplicarDiscreto = () => {
    document.body.classList.toggle("discreto", discreto);
    const b = document.getElementById("discreto"); if (b) b.setAttribute("aria-pressed", String(discreto));
    observador.disconnect();
    if (discreto) { ocultarEn(document.getElementById("app")); observador.observe(document.getElementById("app"), { childList: true, subtree: true }); }
    else document.querySelectorAll("#app .blur").forEach((e) => e.classList.remove("blur"));
  };
  const alternarDiscreto = () => { discreto = !discreto; try { localStorage.setItem("fb-discreto", discreto ? "1" : "0"); } catch (_) {} aplicarDiscreto(); };
  document.getElementById("discreto").onclick = alternarDiscreto;
  // Atajos de teclado (fuera de los campos de texto) y su ayuda (tecla ? o el botón de la barra)
  const ATAJOS = [["?", "Ver u ocultar esta ayuda"], ["1 … 5", "Ir a una sección del menú"], ["I", "Importar un extracto"], ["A", "Apuntar un movimiento a mano"],
    ["D", "Modo discreto: desenfocar los importes"], ["Esc", "Cerrar esta ayuda"]];
  const alternarAtajos = () => {
    let d = document.getElementById("atajos");
    if (!d) {
      d = document.body.appendChild(document.createElement("dialog")); d.id = "atajos"; d.setAttribute("aria-label", "Atajos de teclado");
      d.innerHTML = `<h3>Atajos de teclado</h3><dl>${ATAJOS.map(([k, t]) => `<div><dt><kbd>${k}</kbd></dt><dd>${t}</dd></div>`).join("")}</dl>`
        + `<p>También puedes soltar un Excel o CSV del banco en cualquier pantalla para importarlo.</p><button type="button" class="fb-btn sec">Cerrar</button>`;
      d.querySelector("button").onclick = () => d.close();
      d.addEventListener("click", (e) => { if (e.target === d) d.close(); });  // clic fuera del cuadro
    }
    if (d.open) d.close(); else d.showModal();
  };
  document.getElementById("ayuda").onclick = alternarAtajos;
  // Los menús desplegables («Más») se cierran al pulsar fuera o al elegir una opción
  document.addEventListener("click", (e) => { for (const m of document.querySelectorAll("details.fb-menu[open]")) if (!m.contains(e.target) || e.target.closest("a")) m.open = false; });
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || "") || (e.target && e.target.isContentEditable)) return;
    if (e.key === "?") { e.preventDefault(); alternarAtajos(); return; }
    if ((document.getElementById("atajos") || {}).open) return;
    if (e.key === "d" || e.key === "D") { e.preventDefault(); alternarDiscreto(); return; }
    if (e.key === "i" || e.key === "I") { e.preventDefault(); FB.ir("#importar"); return; }
    if (e.key === "a" || e.key === "A") { e.preventDefault(); FB.ir("#apuntar"); return; }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 6) { const a = document.querySelectorAll("#menu a")[n - 1]; if (a) { e.preventDefault(); FB.ir(a.getAttribute("href")); } }
  });

  // Soltar un Excel/CSV en cualquier pantalla lleva a Importar y lo sube
  document.addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
  document.addEventListener("drop", (e) => {
    if (!e.dataTransfer || !e.dataTransfer.files.length || e.target.closest(".fb-zona")) return;
    e.preventDefault(); FB.soltados = [...e.dataTransfer.files]; FB.ir("#importar");
  });

  // ── API ──
  const FB = window.FB = {
    DB: null, codigo: null, anterior: null,
    async api(ruta, cuerpo) {
      try {
        const r = await fetch(ruta, { method: cuerpo ? "POST" : "GET", headers: { "X-FB-Token": TOKEN, "Content-Type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
        const j = await r.json().catch(() => ({ ok: false, mensaje: "Respuesta no válida del servidor" }));
        if (!r.ok && !("ok" in j)) { j.ok = false; j.mensaje = j.error || "Error"; }
        if (j.traza) console.error(j.traza);
        return j;
      } catch (e) {
        return { ok: false, mensaje: "No se puede conectar con FinanceBuddy. ¿Se ha cerrado? Vuelve a abrir la app." };
      }
    },
    async recargar() {
      const d = await FB.api("/api/datos");
      if (d.registros) FB.DB = d; else FB.aviso(d.mensaje || "No se han podido cargar los datos", true);
      if (d.config) document.body.dataset.acento = d.config.acento || "salvia";
      barra();
    },
    // Recarga los datos y vuelve a dibujar la pantalla actual sin perder la posición (las pantallas leen FB.DB al montarse).
    async refrescar() {
      const y = window.scrollY;
      await FB.recargar();
      montar();
      window.scrollTo(0, y);
    },
    // Sin argumento: el tema elegido (auto | claro | oscuro). Con argumento: lo cambia.
    tema(t) {
      if (t === undefined) return leerTema();
      try { localStorage.setItem("fb-tema", t); } catch (_) {}
      aplicarTema();
    },
    estado: {},
    ir(ruta) {
      const h = ruta.startsWith("#") ? ruta : "#" + ruta;
      if (location.hash === h) montar(); else location.hash = h;
    },
    // accion: { texto, fn } añade un botón (p. ej. «Deshacer») y alarga el aviso
    aviso(texto, error, accion) {
      const el = document.getElementById("aviso");
      el.textContent = texto; el.className = "on" + (error ? " err" : "");
      if (!error) el.insertAdjacentHTML("afterbegin", '<svg class="ck" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>');
      if (accion) { const b = document.createElement("button"); b.type = "button"; b.className = "fin-link"; b.textContent = accion.texto; b.onclick = () => { el.className = ""; accion.fn(); }; el.appendChild(b); }
      clearTimeout(FB._t); FB._t = setTimeout(() => (el.className = ""), error ? 9000 : accion ? 9000 : 4500);
    },
    // Precios por internet (opcional): pide la actualización y espera a que acabe (corre en segundo plano en el servidor).
    // UN solo aviso al terminar; el detalle de lo que falló se ve en Ajustes. `silencioso`: al abrir la app, solo avisa si algo falla.
    async actualizarPrecios({ boton, silencioso, forzar = true } = {}) {
      if (FB._actualizando) return;
      FB._actualizando = true;
      const texto = boton ? boton.textContent : "";
      if (boton) { boton.disabled = true; boton.textContent = "Actualizando…"; }
      try {
        const r = await FB.api("/api/precios/actualizar", { forzar });
        if (!r.ok) { if (!silencioso) FB.aviso(r.mensaje || "No se han podido actualizar los precios", true); return; }
        for (let i = 0; i < 400; i++) {  // hasta unos 5 min; cada consulta falla en ≤ 8 s, así que normalmente acaba en segundos
          await new Promise((f) => setTimeout(f, 700));
          const e = await FB.api("/api/precios/estado", {});
          if (e.ok && e.en_marcha && boton && e.progreso) boton.textContent = `Actualizando ${Math.min(e.progreso.hechos + 1, e.progreso.total)} de ${e.progreso.total}…`;
          if (!e.ok || e.en_marcha) continue;
          const mal = !(e.resultado && e.resultado.ok) || (e.resultado.fallos || []).length > 0;
          const motivo = mal && e.resultado && (e.resultado.fallos || [])[0];  // el primer motivo, para saber qué falla sin entrar en Ajustes
          if (!silencioso || mal) FB.aviso((e.mensaje || "Precios al día") + (motivo ? ` · ${motivo.que}: ${motivo.motivo}` : ""), mal);
          await FB.refrescar();
          return;
        }
        FB.aviso("La actualización de precios sigue en marcha; vuelve a mirar en un momento.", true);
      } finally { FB._actualizando = false; if (boton && boton.isConnected) { boton.disabled = false; boton.textContent = texto; } }
    },
    log,
    discreto: () => discreto,
    // Los importes de un texto, tapados (para los tooltips de los gráficos en modo discreto)
    enmascarar: (t) => (discreto ? String(t).replace(RE_IMPORTE, "•••") : t),
  };
  aplicarDiscreto();

  // ── menú de la barra de arriba y barra de estado ──
  const ICO = {
    inicio: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
    bienvenida: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
    movimientos: '<path d="M5 7h11M5 7l3-3M5 7l3 3M19 17H8m11 0-3-3m3 3-3 3"/>',
    importar: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"/>',
    inversion: '<path d="M4 19h16M6 15l4-4 3 3 5-6"/><path d="M15 8h3v3"/>',
    revisar: '<path d="M12 3.5 3.5 19h17zM12 10v4m0 2.6v.1"/>',
    ajustes: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  };
  const SECCION = { resumen: "inicio", gastos: "movimientos", prevision: "inicio", patrimonio: "inicio", objetivos: "ajustes",
    gestionar: "ajustes", editar: "ajustes", fijos: "ajustes", revision: "ajustes", cerrar: "inicio", valores: "inversion", activo: "inversion", renta: "inversion", reparto: "inversion" };
  function barra() {
    const DB = FB.DB; if (!DB) return;
    const fechas = (DB.registros.movimiento || []).map((m) => m.fecha).sort();
    document.getElementById("datos").textContent = fechas.length ? `Movimientos hasta el ${fechas[fechas.length - 1].split("-").reverse().join("/")}` : "";
    document.getElementById("ejemplo").hidden = !(DB.info && DB.info.ejemplo);
    const n = (DB.pendientes || []).length;
    // Sin cuentas no hay nada que enseñar: todas esas pantallas acaban en la Bienvenida (pantallas.js), así que el menú
    // llevaba a sitios que no cambiaban nada. Hasta la primera cuenta, solo «Primeros pasos» y «Ajustes».
    const sinCuentas = !((DB.registros || {}).cuenta || []).length;
    // [ruta, nombre]. «Importar» no está en el menú: es el botón de la barra (y la tecla I).
    const items = sinCuentas ? [["bienvenida", "Primeros pasos"], ["ajustes", "Ajustes"]]
      : [["inicio", "Inicio"], ["movimientos", "Movimientos"], ["inversion", "Inversión"], n ? ["revisar", "Por revisar"] : null, ["ajustes", "Ajustes"]].filter(Boolean);
    const [v, t] = ruta(), PORTIPO = { movimiento: "movimientos", aportacion: "inversion", activo: "inversion" };
    let act = (v === "editar" || v === "gestionar") && PORTIPO[t] ? PORTIPO[t] : SECCION[v] || v;
    if (sinCuentas && act !== "ajustes" && act !== "importar") act = "bienvenida";  // todo eso enseña la Bienvenida
    const menu = document.getElementById("menu");
    document.querySelector("#cabecera .apuntar").classList.toggle("act", act === "importar");
    menu.innerHTML = items.map(([k, t]) => `<a href="#${k}" class="internal-link${k === act ? " act" : ""}" title="${t}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICO[k]}</svg><span>${t}</span>${k === "revisar" ? `<span class="num">${n}</span>` : ""}</a>`).join("");
    // El subrayado de la sección activa es un solo elemento (el ::after del menú) que se desliza hasta ella
    const sel = menu.querySelector("a.act");
    menu.style.setProperty("--ind-o", sel ? "1" : "0");
    if (sel) { menu.style.setProperty("--ind-x", (sel.offsetLeft + 12) + "px"); menu.style.setProperty("--ind-w", (sel.offsetWidth - 24) + "px"); }
  }

  // ── movimiento: se omite con «reducir movimiento» del sistema y en las pruebas ──
  // ?quieto=1: sin animaciones (capturas de pantalla, donde las cifras saldrían a medio contar)
  const SIN_MOVIMIENTO = () => matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(location.search).has("pruebas") || new URLSearchParams(location.search).has("quieto");
  // Los importes en euros y los porcentajes de la pantalla que se ve suben contando hasta su valor (500 ms); el texto final es siempre el original
  function contarCifras(raiz) {
    const agrupar = (n, d) => { const [e, f] = Math.abs(n).toFixed(d).split("."); return e.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (f ? "," + f : ""); };
    const RE = /([−+\-]?)(\d[\d.]*)(?:,(\d+))?(?=[  ]?[€%])/g;
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (/[€%]/.test(n.nodeValue) && n.parentElement && !n.parentElement.closest("option, textarea, script, style, svg, #aviso, .fin-tip") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    const lista = [];
    while (w.nextNode() && lista.length < 150) {
      const nodo = w.currentNode, r = nodo.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;  // lo que queda fuera de la vista no se anima
      const texto = nodo.nodeValue, partes = []; let i = 0, m; RE.lastIndex = 0;
      while ((m = RE.exec(texto))) {
        const valor = parseFloat(m[2].replace(/\./g, "") + "." + (m[3] || "0"));
        if (!(valor > 0)) continue;
        partes.push({ ini: m.index, fin: m.index + m[0].length, signo: m[1], dec: (m[3] || "").length, valor });
      }
      if (partes.length) lista.push({ nodo, texto, partes });
    }
    if (!lista.length) return;
    const t0 = performance.now(), D = 500;
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - k, 3);
      for (const { nodo, texto, partes } of lista) {
        if (!nodo.isConnected) continue;
        if (k >= 1) { nodo.nodeValue = texto; continue; }
        let sal = "", i = 0;
        for (const p of partes) { sal += texto.slice(i, p.ini) + p.signo + agrupar(p.valor * e, p.dec); i = p.fin; }
        nodo.nodeValue = sal + texto.slice(i);
      }
      if (k < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }

  // ── montaje de la pantalla actual ──
  const ruta = () => (location.hash.slice(1) || "inicio").split("/").map(decodeURIComponent);
  function montar(extra) {
    if (!FB.DB || FB.codigo == null) return;
    barra();
    const [vista, ...params] = ruta();
    const app = document.getElementById("app");
    // Solo al cambiar de pantalla (no al refrescar tras guardar): entrada en cascada, barras que crecen, cifras que cuentan
    const entra = FB._nav && !SIN_MOVIMIENTO(); FB._nav = false;
    clearTimeout(FB._tEntra); delete app.dataset.entra; app.dataset.vista = vista;
    app.innerHTML = "";
    FB.container = app.createDiv({ cls: "fin-page" });
    try { new Function("FB", "luxon", "input", FB.codigo)(FB, luxon, { vista, params, ...(extra || {}) }); }
    catch (e) { log("Error: " + (e.stack || e)); }
    if (discreto) aplicarDiscreto();
    window.scrollTo(0, 0);
    if (entra) { app.dataset.entra = ""; FB._tEntra = setTimeout(() => delete app.dataset.entra, 900); if (!discreto) contarCifras(app); }
  }
  FB.montar = montar;
  let actual = location.hash;
  window.addEventListener("hashchange", () => { FB.anterior = actual; actual = location.hash; FB.estado = {}; FB._nav = true; montar(); });
  // Enlaces internos: navegación sin recargar
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a.internal-link");
    if (!a) return;
    const h = a.getAttribute("href") || "";
    if (h.startsWith("#")) { e.preventDefault(); FB.ir(h); }
  });

  (async () => {
    const p = await fetch("/paneles.js").then((r) => r.json()).catch(() => null);
    if (!p) { log("No se han podido cargar las pantallas."); return; }
    FB.codigo = p.fuentes.join("\n");
    await FB.recargar();
    const params = new URLSearchParams(location.search);
    FB._nav = true;
    montar({ exponer: params.has("pruebas") });
    const pr = ((FB.DB || {}).config || {}).precios;  // al abrir: si los precios por internet están activados y son de hace más de 6 h, se ponen al día
    if (pr && pr.activo && pr.viejo && !pr.en_marcha && !params.has("pruebas")) FB.actualizarPrecios({ silencioso: true, forzar: false });
    const ac = ((FB.DB || {}).config || {}).actualizaciones;  // aviso de versión (opcional): como mucho una consulta al día
    if (ac && ac.activo && ac.viejo && !params.has("pruebas")) FB.api("/api/actualizaciones/comprobar", {}).then((r) => { if (r.ok && r.nueva) FB.aviso(`Hay una versión nueva de FinanceBuddy (${r.version}). Mira en Ajustes.`); });
    else if (ac && ac.activo && ac.resultado && ac.resultado.nueva && !params.has("pruebas")) FB.aviso(`Hay una versión nueva de FinanceBuddy (${ac.resultado.version}). Mira en Ajustes.`);
    if (params.has("pruebas")) {
      const src = await fetch("/pruebas.js").then((r) => (r.ok ? r.text() : null));
      if (src) {
        try {
          const casos = new Function("F", src)(window.__fin);
          const fallos = casos.filter((c) => !c.ok);
          log(`TESTS ${casos.length - fallos.length}/${casos.length}` + fallos.map((c) => `\n  ✕ ${c.nombre}: ${c.detalle}`).join(""));
        } catch (e) { log("Error en las pruebas: " + (e.stack || e)); }
      }
    }
    // Flujos con clics (pruebas/pruebas_flujos.js): hacen lo que haría el usuario y comprueban el resultado
    if (params.has("flujos")) {
      const src = await fetch("/flujos.js").then((r) => (r.ok ? r.text() : null));
      if (!src) log("Error: no se han podido cargar los flujos.");
      else {
        try {
          const casos = await new Function("FB", src)(FB);
          const fallos = casos.filter((c) => !c.ok);
          log(`FLUJOS ${casos.length - fallos.length}/${casos.length}` + fallos.map((c) => `\n  ✕ ${c.nombre}: ${c.detalle}`).join(""));
        } catch (e) { log("Error en los flujos: " + (e.stack || e)); }
      }
    }
  })();
})();

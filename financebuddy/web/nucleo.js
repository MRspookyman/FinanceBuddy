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

  // ── tema: automático (el del sistema), claro u oscuro; se guarda en este navegador ──
  const leerTema = () => { try { return localStorage.getItem("fb-tema") || "auto"; } catch (_) { return "auto"; } };
  const oscuroSistema = matchMedia("(prefers-color-scheme: dark)");
  const aplicarTema = () => { const t = leerTema(); document.body.classList.toggle("theme-dark", t === "auto" ? oscuroSistema.matches : t === "oscuro"); };
  aplicarTema();
  oscuroSistema.addEventListener && oscuroSistema.addEventListener("change", () => { if (leerTema() === "auto") { aplicarTema(); montar(); } });
  document.getElementById("tema").onclick = () => {
    FB.tema(document.body.classList.contains("theme-dark") ? "claro" : "oscuro");
    montar();
  };

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
      if (d.config) document.body.dataset.acento = d.config.acento || "violeta";
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
    aviso(texto, error) {
      const el = document.getElementById("aviso");
      el.textContent = texto; el.className = "on" + (error ? " err" : "");
      clearTimeout(FB._t); FB._t = setTimeout(() => (el.className = ""), error ? 6000 : 2600);
    },
    log,
  };

  // ── menú lateral (abajo en el móvil) y barra de estado ──
  const ICO = {
    inicio: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
    movimientos: '<path d="M5 7h11M5 7l3-3M5 7l3 3M19 17H8m11 0-3-3m3 3-3 3"/>',
    importar: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"/>',
    inversion: '<path d="M4 19h16M6 15l4-4 3 3 5-6"/><path d="M15 8h3v3"/>',
    revisar: '<path d="M12 3.5 3.5 19h17zM12 10v4m0 2.6v.1"/>',
    ajustes: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  };
  const SECCION = { resumen: "inicio", gastos: "movimientos", prevision: "inicio", patrimonio: "inicio", objetivos: "ajustes",
    gestionar: "ajustes", editar: "ajustes", fijos: "ajustes", cerrar: "ajustes", valores: "inversion" };
  function barra() {
    const DB = FB.DB; if (!DB) return;
    const fechas = (DB.registros.movimiento || []).map((m) => m.fecha).sort();
    document.getElementById("datos").textContent = fechas.length ? `Movimientos hasta el ${fechas[fechas.length - 1].split("-").reverse().join("/")}` : "";
    document.getElementById("ejemplo").hidden = !(DB.info && DB.info.ejemplo);
    const n = (DB.pendientes || []).length;
    const items = [["inicio", "Inicio"], ["movimientos", "Movimientos"], ["inversion", "Inversión"], ["importar", "Importar"], n ? ["revisar", "Por revisar"] : null, ["ajustes", "Ajustes"]].filter(Boolean);
    const v = ruta()[0], act = SECCION[v] || v;
    const menu = document.getElementById("menu");
    menu.innerHTML = items.map(([k, t]) => `<a href="#${k}" class="internal-link${k === act ? " act" : ""}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICO[k]}</svg><span>${t}</span>${k === "revisar" ? `<span class="num">${n}</span>` : ""}</a>`).join("");
  }

  // ── montaje de la pantalla actual ──
  const ruta = () => (location.hash.slice(1) || "inicio").split("/").map(decodeURIComponent);
  function montar(extra) {
    if (!FB.DB || FB.codigo == null) return;
    barra();
    const [vista, ...params] = ruta();
    const app = document.getElementById("app");
    app.innerHTML = "";
    FB.container = app.createDiv({ cls: "fin-page" });
    try { new Function("FB", "luxon", "input", FB.codigo)(FB, luxon, { vista, params, ...(extra || {}) }); }
    catch (e) { log("Error: " + (e.stack || e)); }
    window.scrollTo(0, 0);
  }
  FB.montar = montar;
  let actual = location.hash;
  window.addEventListener("hashchange", () => { FB.anterior = actual; actual = location.hash; FB.estado = {}; montar(); });
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
    montar({ exponer: params.has("pruebas") });
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
  })();
})();

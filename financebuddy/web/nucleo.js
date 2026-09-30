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

  // ── tema ──
  const temaGuardado = (() => { try { return localStorage.getItem("fb-tema"); } catch (_) { return null; } })();
  document.body.classList.toggle("theme-dark", temaGuardado ? temaGuardado === "oscuro" : matchMedia("(prefers-color-scheme: dark)").matches);
  document.getElementById("tema").onclick = () => {
    const o = !document.body.classList.contains("theme-dark");
    document.body.classList.toggle("theme-dark", o);
    try { localStorage.setItem("fb-tema", o ? "oscuro" : "claro"); } catch (_) {}
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
      barra();
    },
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

  // ── barra superior: hasta cuándo hay datos ──
  function barra() {
    const DB = FB.DB; if (!DB) return;
    const fechas = (DB.registros.movimiento || []).map((m) => m.fecha).sort();
    document.getElementById("datos").textContent = fechas.length ? `movimientos hasta el ${fechas[fechas.length - 1].split("-").reverse().join("/")}` : "";
    document.getElementById("ejemplo").hidden = !(DB.info && DB.info.ejemplo);
  }

  // ── montaje de la pantalla actual ──
  const ruta = () => (location.hash.slice(1) || "resumen").split("/").map(decodeURIComponent);
  function montar(extra) {
    if (!FB.DB || FB.codigo == null) return;
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
  window.addEventListener("hashchange", () => { FB.anterior = actual; actual = location.hash; montar(); });
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

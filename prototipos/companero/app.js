/* Prototipo «FinanceBuddy compañero» · identidad Violeta (Nubo). Inicio, cuentas y revisión navegables. */
(function () {
  'use strict';
  const CLAVES = ['proto-identidad', 'proto-animaciones', 'proto-cuentas', 'proto-revision', 'proto-escenario', 'proto-mascota', 'proto-cierre'];
  // Escenario de muestra: copia de los datos con sus cambios (cambiar de escenario recarga la página).
  const ESCENARIO = (() => { try { const e = localStorage.getItem('proto-escenario'); return window.PROTO.escenarios[e] ? e : 'normal'; } catch (e) { return 'normal'; } })();
  const P = Object.assign(structuredClone(window.PROTO), window.PROTO.escenarios[ESCENARIO].cambios);
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const POSES = { normal: 'saludando', pensando: 'pensando', preocupado: 'preocupado', celebra: 'celebrando' };
  const TITULOS = { inicio: 'Inicio', cuentas: 'Tus cuentas', revision: 'Revisión', cierre: 'Cierre del mes' };
  const NOMBRES_PASO = ['Qué ha entrado', 'Qué necesita revisión', 'Comprobar saldos'];
  const M = { ...P.mascota };

  /* ── Formato ── */
  const c2 = (n) => Math.round(n * 100) / 100;
  function eur(n, signo) {
    const [ent, dec] = Math.abs(n).toFixed(2).split('.');
    const t = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec + '\u00A0€';
    if (signo) return (n < 0 ? '\u2212' : '+') + t;
    return n < 0 ? '\u2212' + t : t;
  }
  const pct = (n) => n.toFixed(1).replace('.', ',') + '\u00A0%';
  const partes = (f) => f.split('-').map(Number);
  const ddmm = (f) => { const [, m, d] = partes(f); return String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0'); };
  const ddmmaaaa = (f) => ddmm(f) + '/' + partes(f)[0];
  const diaLargo = (f) => { const [, m, d] = partes(f); return d + ' de ' + MESES[m - 1]; };
  const mesCorto = (f) => MESES[partes(f)[1] - 1].slice(0, 3).toUpperCase();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
  const suma = (xs, f) => c2(xs.reduce((s, x) => s + f(x), 0));

  /* Acepta 1.697,06 · 1697,06 · 1697.06 · 4200. Vacío → null; algo que no es cifra → NaN. */
  function leerImporte(texto) {
    let s = String(texto || '').replace(/[\s\u00A0€]/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  }

  /* ── Estado (solo localStorage) ── */
  const leer = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } };
  const leerJSON = (k, def) => { try { return JSON.parse(leer(k, '')) || def; } catch (e) { return def; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };
  const revNueva = () => ({ paso: 1, dudas: {}, auto: {}, saldos: {} });

  let animaciones = leer('proto-animaciones', 'si') === 'si';
  let pers = leerJSON('proto-cuentas', {});
  let rev = Object.assign(revNueva(), leerJSON('proto-revision', {}));
  let avisoRetomar = true;   // «Seguir donde lo dejaste» al llegar a la revisión
  let pasoDecidido = false;  // un botón que ya lleva a un paso concreto no vuelve a ofrecerlo
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animar = () => animaciones && !sinMovimiento.matches;
  const aplicarAnim = () => document.documentElement.classList.toggle('anim', animar());
  const guardarRev = () => guardar('proto-revision', rev);
  M.nombre = (leer('proto-mascota', '') || '').trim() || P.mascota.nombre;
  // Cierre del mes: { cerrado, limite (el del mes siguiente), saldos (los del último día, tal como se guardaron) }.
  let cierre = Object.assign({ cerrado: false, limite: P.presupuesto.limite }, leerJSON('proto-cierre', {}));
  const guardarCierre = () => guardar('proto-cierre', cierre);

  /* ── Datos derivados (todo sale de datos.js + lo que elige el usuario) ── */
  const DUDAS = P.movimientos[P.extracto.cuenta]
    .filter((m) => m.revisar)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((m, idx) => ({ idx, mov: m, fecha: m.fecha, texto: m.texto, importe: Math.abs(m.importe), clase: m.importe < 0 ? 'gasto' : 'entrada' }));
  const dudaDe = (mov) => DUDAS.find((d) => d.mov === mov);

  function cuenta(id) {
    const base = P.cuentas.find((c) => c.id === id);
    const p = pers[id] || {};
    return { ...base, nombre: p.nombre || base.nombre, icono: p.icono || base.icono, color: p.color || base.color };
  }

  function estadoSaldo(id) {
    const n = leerImporte(rev.saldos[id]);
    if (n === null) return null;
    if (Number.isNaN(n)) return { tipo: 'invalido' };
    const dif = c2(n - cuenta(id).saldo);
    return dif === 0 ? { tipo: 'cuadra' } : { tipo: 'no', dif };
  }

  function calc() {
    const el = rev.dudas;
    const pendientes = DUDAS.filter((d) => !el[d.idx]);
    const cats = P.categorias.map((c) => ({ ...c }));
    DUDAS.forEach((d) => {
      const e = el[d.idx];
      if (d.clase !== 'gasto' || !e || e === 'Descartar') return;
      const c = cats.find((x) => x.nombre === e);
      if (c) c.importe = c2(c.importe + d.importe); else cats.push({ nombre: e, importe: d.importe });
    });
    const sinClasificar = suma(pendientes.filter((d) => d.clase === 'gasto'), (d) => d.importe);
    if (sinClasificar > 0) cats.push({ nombre: 'Sin clasificar', importe: sinClasificar, sin: true });
    cats.sort((a, b) => b.importe - a.importe);
    const devoluciones = suma(DUDAS.filter((d) => el[d.idx] === 'Me devuelven un gasto'), (d) => d.importe);
    const gastoVar = c2(suma(cats, (c) => c.importe) - devoluciones);
    const entradasPend = suma(pendientes.filter((d) => d.clase === 'entrada'), (d) => d.importe);
    const enCuentas = suma(P.cuentas.filter((c) => c.id !== 'broker'), (c) => c.saldo);
    const cuadran = P.cuentas.every((c) => (estadoSaldo(c.id) || {}).tipo === 'cuadra');
    const descuadradas = P.cuentas.filter((c) => (estadoSaldo(c.id) || {}).tipo === 'no');
    const estado = cierre.cerrado ? 'cerrado' : pendientes.length ? 'datos-pendientes' : P.prevision.minimo <= 0 ? 'no-llega'
      : cuadran ? 'al-dia' : 'saldos-sin-comprobar';
    // Entradas del mes: las clasificadas + las dudas de entrada que no se descartan ni son devoluciones.
    const entrado = c2(suma(P.entradas, (x) => x.importe) + suma(DUDAS.filter((d) => d.clase === 'entrada' && !['Descartar', 'Me devuelven un gasto'].includes(el[d.idx])), (d) => d.importe));
    const salido = c2(gastoVar + P.gastosFijos);
    const comprobados = P.cuentas.filter((x) => { const e = estadoSaldo(x.id); return e && e.tipo !== 'invalido'; }).length;
    return { pendientes, cats, sinClasificar, devoluciones, gastoVar, entradasPend, enCuentas, cuadran, descuadradas, estado,
      entrado, salido, ahorro: c2(entrado - salido), comprobados,
      exceso: c2(gastoVar - P.presupuesto.limite), vsMedia: c2(gastoVar - P.presupuesto.mediaAEstasAlturas) };
  }
  // Cara de Nubo en «Comprobar saldos»: preocupado si alguno no cuadra, tranquilo si cuadran todos.
  function poseSaldos() {
    const e = P.cuentas.map((x) => (estadoSaldo(x.id) || {}).tipo);
    return e.includes('no') ? 'preocupado' : e.every((t) => t === 'cuadra') ? 'normal' : 'pensando';
  }


  /* ── Mascota: una nube sencilla con dos ojos, dibujada con SVG ── */
  function mascotaSVG(pose, etiqueta) {
    const c = M.cuerpo, ojo = '#1E1A2B', ey = 58;
    const cuerpo = `<g fill="${c}"><circle cx="38" cy="74" r="25"/><circle cx="82" cy="74" r="25"/><circle cx="60" cy="56" r="32"/><circle cx="60" cy="82" r="26"/><circle cx="36" cy="54" r="16"/><circle cx="84" cy="54" r="16"/></g>`;
    const brillo = `<ellipse cx="42" cy="${ey - 14}" rx="12" ry="7" fill="#FFFFFF" opacity=".35" transform="rotate(-25 42 ${ey - 14})"/>`;
    let cara, extra = '', mover = '';
    if (pose === 'pensando') {
      cara = `<rect x="43" y="${ey + 6}" width="10" height="14" rx="5" fill="${ojo}"/><rect x="63" y="${ey + 6}" width="10" height="14" rx="5" fill="${ojo}"/>`;
      extra = `<rect x="30" y="84" width="60" height="34" rx="7" fill="#2B2A36"/><rect x="36" y="89" width="48" height="24" rx="4" fill="#FFE9B0" opacity=".9"/>` +
        `<circle cx="31" cy="99" r="7" fill="${c}"/><circle cx="89" cy="99" r="7" fill="${c}"/>`;
    } else if (pose === 'celebra') {
      const y = ey + 14;
      cara = `<g fill="none" stroke="${ojo}" stroke-width="5" stroke-linecap="round"><path d="M43 ${y} Q49 ${y - 10} 55 ${y}"/><path d="M65 ${y} Q71 ${y - 10} 77 ${y}"/></g>`;
      const estrella = (x, y, r) => `<path d="M${x} ${y - r} L${x + r * .3} ${y - r * .3} L${x + r} ${y} L${x + r * .3} ${y + r * .3} L${x} ${y + r} L${x - r * .3} ${y + r * .3} L${x - r} ${y} L${x - r * .3} ${y - r * .3}Z" style="fill:var(--acento)"/>`;
      extra = estrella(14, 26, 8) + estrella(104, 20, 9) + estrella(110, 64, 6) + estrella(10, 70, 5);
      mover = ' transform="translate(0 -6)"';
    } else if (pose === 'preocupado') {
      // Cejas con la punta de dentro levantada y ojos más pequeños: inquieto, nunca enfadado.
      cara = `<rect x="45" y="${ey + 4}" width="10" height="14" rx="5" fill="${ojo}"/><rect x="65" y="${ey + 4}" width="10" height="14" rx="5" fill="${ojo}"/>` +
        `<g fill="none" stroke="${ojo}" stroke-width="3.5" stroke-linecap="round"><path d="M41 ${ey - 2} L54 ${ey - 7}"/><path d="M79 ${ey - 2} L66 ${ey - 7}"/>` +
        `<path d="M53 ${ey + 27} Q56.5 ${ey + 24} 60 ${ey + 27} T67 ${ey + 27}"/></g>`;
    } else {
      cara = `<rect x="45" y="${ey}" width="10" height="20" rx="5" fill="${ojo}"/><rect x="65" y="${ey}" width="10" height="20" rx="5" fill="${ojo}"/>`;
    }
    const acc = etiqueta ? `role="img" aria-label="${esc(M.nombre)}, la mascota de FinanceBuddy, ${POSES[pose]}"` : 'aria-hidden="true" focusable="false"';
    return `<svg viewBox="0 0 120 124" ${acc}><g${mover}>${cuerpo}${brillo}${cara}</g>${extra}</svg>`;
  }
  const mascota = (pose, opts = {}) =>
    `<span class="mascota${opts.clase ? ' ' + opts.clase : ''}" data-pose="${pose}">${mascotaSVG(pose, opts.etiqueta)}</span>`;

  /* ── Tarjeta de cuenta ── */
  function deco() {
    let p = '';
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (x + y >= 4) p += `<circle cx="${10 + x * 20}" cy="${10 + y * 20}" r="4"/>`;
    return `<svg class="deco puntos" viewBox="0 0 120 120" aria-hidden="true" fill="currentColor">${p}</svg>`;
  }
  function tarjeta(id, actual) {
    const c = cuenta(id);
    const col = P.colores[c.color - 1];
    const oscura = col.texto === '#FFFFFF' ? ' oscura' : '';
    const nombre = `${c.nombre}, ${c.tipo.toLowerCase()}, ${eur(c.saldo)}, ${c.procedencia}`;
    return `<a href="#cuentas/${id}" class="tarjeta${oscura}" style="--fondo-t:${col.fondo};--texto-t:${col.texto}" aria-label="${esc(nombre)}"${actual ? ' aria-current="true"' : ''}>
      ${deco()}
      <span><span class="nombre" style="display:block">${esc(c.nombre)}</span>${c.tipo.toLowerCase() === c.nombre.toLowerCase() ? '' : `<span class="tipo">${esc(c.tipo)}</span>`}</span>
      <span class="icono" aria-hidden="true">${c.icono}</span>
      <span><span class="saldo" style="display:block">${eur(c.saldo)}</span><span class="fecha">${esc(c.procedencia)}</span></span>
    </a>`;
  }

  /* ── Barra del prototipo y cabecera ── */
  function pintarBarra() {
    const escenarios = Object.entries(P.escenarios).map(([id, x]) => `<option value="${id}"${id === ESCENARIO ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('');
    document.getElementById('barra-proto').innerHTML = `
      <strong>Prototipo · datos inventados</strong>
      <label class="campo-barra">Escenario <select data-escenario>${escenarios}</select></label>
      <label class="campo-barra">Nombre de la mascota <input type="text" data-nombre-mascota maxlength="16" value="${esc(M.nombre)}"></label>
      <button type="button" data-accion="anim" aria-pressed="${animaciones}">Animaciones: ${animaciones ? 'sí' : 'no'}</button>`;
  }

  function pintarCabecera(vista, c) {
    const off = 'href="#" aria-disabled="true" title="No incluido en este prototipo"';
    const act = (v) => (vista === v ? ' aria-current="page"' : '');
    const n = c.pendientes.length;
    const insignia = n ? ` <span class="insignia" aria-label="${plural(n, 'pendiente', 'pendientes')}">${n}</span>` : '';
    document.getElementById('cabecera').innerHTML = `<div class="contenedor">
      <a class="logo" href="#inicio" aria-label="FinanceBuddy, Inicio">${mascota('normal')}FinanceBuddy</a>
      <nav aria-label="Principal"><ul class="menu">
        <li><a href="#inicio"${act('inicio')}>Inicio</a></li>
        <li><a href="#cuentas"${act('cuentas')}>Cuentas</a></li>
        <li><a ${off}>Movimientos</a></li>
        <li><a ${off}>Inversión</a></li>
        <li><a href="#revision"${act('revision')}>Por revisar${insignia}</a></li>
        <li><a ${off}>Ajustes</a></li>
      </ul></nav>
      <a class="boton primario" href="#revision" title="Simula que acabas de importar un extracto">Importar</a>
    </div>`;
  }

  /* ── Inicio ── */
  function medidores(c) {
    const pr = P.prevision;
    const lim = P.presupuesto.limite;
    const ancho = c.gastoVar > lim ? (lim / c.gastoVar) * 100 : (c.gastoVar / lim) * 100;
    const presupuesto = c.exceso > 0
      ? `<p class="grande">Te has pasado <strong class="gasto">${eur(c.exceso)}</strong></p>`
      : `<p class="grande">Te quedan <strong>${eur(-c.exceso)}</strong></p>`;
    const barra = c.exceso > 0
      ? `<span class="lleno" style="width:${ancho}%"></span><span class="exceso" style="width:${100 - ancho}%"></span>`
      : `<span class="lleno" style="width:${ancho}%"></span>`;
    const aguanta = pr.minimo > 0
      ? '<p class="grande">Sin problema</p>'
      : '<p class="grande alerta">No llega</p>';
    return `<div class="medidores">
      <div class="medidor">
        <h3>Tu presupuesto</h3>
        ${presupuesto}
        <p class="suave">de tu límite de ${eur(lim)} de gasto variable</p>
        <div class="progreso" role="img" aria-label="Gastado ${eur(c.gastoVar)} de ${eur(lim)}">${barra}</div>
        <p class="nota">${c.vsMedia >= 0 ? `Vas ${eur(c.vsMedia)} por encima` : `Vas ${eur(-c.vsMedia)} por debajo`} de tu media a estas alturas</p>
      </div>
      <div class="medidor${pr.minimo > 0 ? '' : ' mal'}">
        <h3>Lo que tus cuentas aguantan</h3>
        ${aguanta}
        <p class="suave">Lo más bajo de los próximos meses: <strong class="cifra${pr.minimo > 0 ? '' : ' alerta'}">${eur(pr.minimo)}</strong> en ${pr.mesMinimo}</p>
        <p class="nota">Si gastas un 15 % más y te entra un 10 % menos: ${eur(pr.prudente)}</p>
      </div>
    </div>`;
  }

  function bloquePrincipal(c) {
    const pr = P.prevision;
    const siguiente = MESES[partes(P.hoy)[1] % 12];
    let pose, titulo, texto, accion = '';
    if (c.estado === 'cerrado') {
      pose = 'normal';
      titulo = `${mayus(P.mes)} cerrado`;
      texto = `Ahorraste ${eur(c.ahorro)} (${pct(c.ahorro / c.entrado * 100)} de lo que entró). ${mayus(siguiente)} empieza con un límite de ${eur(cierre.limite)} de gasto variable.`;
      accion = '<a class="boton" href="#cierre">Ver el cierre</a>';
    } else if (c.estado === 'datos-pendientes') {
      const n = c.pendientes.length;
      const importes = [c.sinClasificar > 0 && `${eur(c.sinClasificar)} de gasto`, c.entradasPend > 0 && `${eur(c.entradasPend)} de entradas`].filter(Boolean).join(' y ');
      pose = 'pensando';
      titulo = 'Antes de fiarte de la cifra del mes, mira esto';
      texto = `${n === 1 ? 'Hay 1 movimiento' : `Hay ${n} movimientos`} de ${P.mes} sin revisar: ${importes}. Mientras no sepamos qué ${n === 1 ? 'es' : 'son'}, tu gasto del mes puede estar mal contado.`;
      accion = `<a class="boton primario" href="#revision" data-accion="ir-revision"${rev.paso === 'hecho' ? ' data-paso="2"' : ''}>Revisar ${plural(n, 'movimiento', 'movimientos')}</a>`;
    } else if (c.estado === 'no-llega') {
      const meses = pr.mesesHastaMinimo;
      pose = 'preocupado';
      titulo = `En ${pr.mesMinimo.split(' ')[0]} tus cuentas no llegan`;
      texto = `Con lo que sueles gastar y los cargos que vienen, en ${pr.mesMinimo} te quedarías en ${eur(pr.minimo)}. Hay margen para evitarlo: si gastas ${eur(Math.ceil(-pr.minimo / meses * 100) / 100)} menos al mes durante ${plural(meses, 'mes', 'meses')}, llegas.`;
      accion = '<button type="button" class="enlace" data-accion="ver-cargos">Ver los próximos cargos</button>';
    } else if (c.estado === 'saldos-sin-comprobar') {
      if (c.descuadradas.length) {
        const x = c.descuadradas[0];
        const dif = estadoSaldo(x.id).dif;
        pose = 'preocupado';
        titulo = c.descuadradas.length === 1 ? 'Hay un saldo que no cuadra' : `Hay ${c.descuadradas.length} saldos que no cuadran`;
        texto = `${cuenta(x.id).nombre}: tu banco dice ${eur(Math.abs(dif))} ${dif > 0 ? 'más' : 'menos'} que tus movimientos. Suele ser un movimiento que aún no has importado; lo miramos cuando quieras.`;
      } else {
        pose = 'pensando';
        titulo = 'Tus saldos son de hace un mes';
        texto = `Los últimos que anotaste son del ${ddmm(P.saldosAnotados)}. Compruébalos y sabré si lo que te enseño coincide con tu banco.`;
      }
      accion = '<a class="boton primario" href="#revision" data-accion="ir-revision" data-paso="3">Comprobar saldos</a>';
      // Con los tres saldos escritos ya se puede cerrar: se guarda el del banco aunque no cuadre.
      if (c.comprobados === P.cuentas.length) accion = `<div class="acciones">${accion}<a class="boton" href="#cierre">Cerrar ${P.mes} igualmente</a></div>`;
    } else {
      pose = 'normal';
      titulo = `Todo al día: así va ${P.mes}`;
      texto = c.exceso > 0
        ? `Te has pasado ${eur(c.exceso)} de tu límite, pero tus cuentas lo aguantan sin problema. En ${siguiente}, si quieres, empezamos con ${eur(P.presupuesto.margenSiguienteMes)} menos de margen para compensar.`
        : `Vas ${eur(-c.exceso)} por debajo de tu límite y tus cuentas lo aguantan sin problema.`;
      accion = `<div class="acciones"><a class="boton primario" href="#cierre">Cerrar ${P.mes}</a>
        <button type="button" class="enlace" data-accion="ver-metas">Ver tus metas</button></div>`;
    }
    return `<section class="principal" aria-labelledby="titulo-principal" data-estado="${c.estado}">
      <button type="button" class="mascota-boton" data-accion="celebrar" aria-label="Saludar a ${esc(M.nombre)}">${mascota(pose, { clase: 'entra' })}</button>
      <div>
        <p class="voz-quien">${esc(M.nombre)} dice</p>
        <h2 id="titulo-principal">${esc(titulo)}</h2>
        <p class="texto">${esc(texto)}</p>
        ${accion}
        ${medidores(c)}
        ${c.exceso > 0 && pr.minimo > 0 ? '<p class="cierre">Pasarte del límite no te deja en números rojos: es tu propio tope, no el del banco.</p>' : ''}
      </div>
    </section>`;
  }

  function panelGasto(c) {
    const vis = c.cats.slice(0, 5), resto = c.cats.slice(5);
    const max = vis[0].importe;
    const fila = (x) => `<li class="cat${x.sin ? ' sin' : ''}">
        <div class="fila"><span>${esc(x.nombre)}${x.sin ? ' <span class="suave peq">· sin revisar</span>' : ''}${x.vsMedia ? ` <span class="suave peq">· ${eur(x.vsMedia, true)} vs tu media</span>` : ''}</span><span class="cifra">${eur(x.importe)}</span></div>
        <div class="barra" aria-hidden="true"><span style="width:${(x.importe / max) * 100}%"></span></div></li>`;
    const masCats = resto.length
      ? `<details class="mas-cats"><summary><span>${plural(resto.length, 'categoría más', 'categorías más')}</span><span class="cifra">${eur(suma(resto, (x) => x.importe))}</span></summary>
          <ul class="cats">${resto.map(fila).join('')}</ul></details>`
      : '';
    return `<section class="panel" aria-labelledby="t-gasto">
      <h2 id="t-gasto">A dónde va tu dinero</h2>
      <p class="entradilla"><strong class="cifra gasto">${eur(c.gastoVar)}</strong> de gasto variable en ${P.mes}</p>
      <ul class="cats">${vis.map(fila).join('')}</ul>
      ${masCats}
      ${c.devoluciones > 0 ? `<p class="pie-panel">Ya descontado: te devuelven <span class="cifra">${eur(c.devoluciones)}</span></p>` : ''}
      <p class="pie-panel">Además, <span class="cifra">${eur(P.gastosFijos)}</span> de gastos fijos</p>
    </section>`;
  }

  function panelCargos() {
    const total = suma(P.cargos.filter((x) => !x.aportacion), (x) => x.importe);
    const inversion = suma(P.cargos.filter((x) => x.aportacion), (x) => x.importe);
    const fila = (x) => {
      const imp = x.aportacion
        ? `<span class="cifra">${eur(x.importe)}</span><small>a tu inversión</small>`
        : `<span class="cifra${x.importe < 0 ? ' gasto' : ''}">${eur(x.importe, true)}</span>`;
      return `<li class="cargo"><span class="dia"><b>${partes(x.fecha)[2]}</b><small>${mesCorto(x.fecha)}</small></span><span>${esc(x.concepto)}</span><span class="importe">${imp}</span></li>`;
    };
    return `<section class="panel" aria-labelledby="t-cargos">
      <h2 id="t-cargos" tabindex="-1">Próximos 30 días</h2>
      <ul class="cargos">${P.cargos.map(fila).join('')}</ul>
      <p class="pie-panel"><strong class="cifra">${eur(total, true)}</strong> en los próximos 30 días · ${eur(inversion)} van a tu inversión</p>
    </section>`;
  }

  function panelMetas() {
    const fila = (o) => {
      const p = (o.actual / o.meta) * 100;
      const nota = o.fecha ? `≈ ${eur(o.alMes)} al mes hasta el ${ddmmaaaa(o.fecha)}` : `te faltan ${eur(o.meta - o.actual)}`;
      return `<li class="meta"><div class="cat"><div class="fila"><strong>${esc(o.nombre)}</strong><span class="cifra">${eur(o.actual)} de ${eur(o.meta)}</span></div></div>
        <div class="barra" role="img" aria-label="${pct(p)} conseguido"><span style="width:${p}%"></span></div>
        <p class="suave peq">${pct(p)} · ${nota}</p></li>`;
    };
    const r = P.recordatorios[0];
    return `<section class="panel" aria-labelledby="t-metas">
      <h2 id="t-metas" tabindex="-1">Tus metas</h2>
      <ul class="metas">${P.objetivos.map(fila).join('')}</ul>
      <div class="recordatorio"><span class="dia"><b>${partes(r.fecha)[2]}</b><small>${mesCorto(r.fecha)}</small></span><span>${esc(r.nombre)}</span>
        <button type="button" class="boton" aria-disabled="true" title="No incluido en este prototipo">Hecho</button></div>
      <p class="pie-panel peq">Las metas no apartan dinero de tus cuentas: miden tu avance.</p>
    </section>`;
  }

  function vistaInicio(c) {
    const d = P.dinero;
    return `
      <div class="saludo"><h1 tabindex="-1">Buenos días</h1>
        <p>Movimientos hasta el ${diaLargo(P.movimientosHasta)} · saldos anotados el ${ddmm(P.saldosAnotados)}</p></div>
      ${bloquePrincipal(c)}
      <section aria-labelledby="t-cuentas"><h2 id="t-cuentas">Tus cuentas</h2>
        <div class="tarjetas">${P.cuentas.map((x) => tarjeta(x.id)).join('')}</div>
        <p class="resumen-cuentas">En tus cuentas <span class="cifra">${eur(c.enCuentas)}</span> · Dinero total <span class="cifra">${eur(d.total)}</span> (${eur(d.desdeJunio, true)} desde junio), con tu inversión a valor de mercado (${eur(d.inversion)})</p>
      </section>
      <div class="paneles">${panelGasto(c)}${panelCargos()}${panelMetas()}</div>`;
  }

  /* ── Tus cuentas ── */
  function categoriaDe(m) {
    const d = dudaDe(m);
    if (!d) return esc(m.categoria);
    const e = rev.dudas[d.idx];
    return e ? `✓ ${esc(e)}` : '<span class="etiqueta-revisar">sin revisar</span>';
  }

  function vistaCuentas(id) {
    let detalle = '<p class="suave" style="margin-top:20px">Elige una cuenta para ver sus movimientos y personalizarla.</p>';
    if (id) {
      const c = cuenta(id);
      const movs = P.movimientos[id];
      const lista = movs.length
        ? `<table class="movs"><caption class="oculto">Movimientos de ${esc(c.nombre)}</caption>
            <thead><tr><th scope="col">Fecha</th><th scope="col">Concepto</th><th scope="col">Categoría</th><th scope="col" class="num">Importe</th></tr></thead>
            <tbody>${movs.map((m) => `<tr><td class="cifra">${ddmm(m.fecha)}</td><td>${esc(m.concepto)}</td><td>${categoriaDe(m)}</td>
              <td class="num cifra${m.importe < 0 ? ' gasto' : ''}">${eur(m.importe, true)}</td></tr>`).join('')}</tbody></table>`
        : `<p>Sin movimientos este mes · saldo anotado el ${ddmm(P.saldosAnotados)}: <span class="cifra">${eur(c.saldo)}</span></p>`;
      const p = pers[id] || {};
      const base = P.cuentas.find((x) => x.id === id);
      const iconos = P.iconos.map((x) => `<label class="opcion"><input type="radio" name="icono" value="${x.icono}" aria-label="${esc(x.nombre)}"${x.icono === c.icono ? ' checked' : ''}><span aria-hidden="true">${x.icono}</span></label>`).join('');
      const colores = P.colores.map((x, i) => `<label class="opcion color"><input type="radio" name="color" value="${i + 1}" aria-label="Color ${i + 1}"${i + 1 === c.color ? ' checked' : ''}><span aria-hidden="true" style="background:${x.fondo};color:${x.texto}">Aa</span></label>`).join('');
      detalle = `<div class="detalle">
        <section class="panel" aria-labelledby="t-movs">
          <h2 id="t-movs">Movimientos de ${P.mes} (muestra del prototipo)</h2>
          <p class="procedencia">Saldo estimado hoy: anotado el ${ddmm(P.saldosAnotados)} + los movimientos de después. No es el saldo del banco hasta que lo compruebes.
            <a href="#revision" data-accion="ir-revision" data-paso="3">Comprobar saldo</a></p>
          ${lista}
        </section>
        <section class="panel" aria-labelledby="t-pers">
          <h2 id="t-pers">Personalizar</h2>
          <form class="form" data-form="cuenta" data-id="${id}">
            <label class="campo">Nombre visible
              <input type="text" name="nombre" maxlength="24" value="${esc(p.nombre || '')}" placeholder="${esc(base.nombre)}"></label>
            <fieldset><legend>Icono</legend><div class="opciones">${iconos}</div></fieldset>
            <fieldset><legend>Color</legend><div class="opciones">${colores}</div></fieldset>
            <div class="acciones">
              <button type="submit" class="boton primario">Guardar</button>
              <button type="button" class="boton" data-accion="original-cuenta" data-id="${id}">Volver al diseño original</button>
              <span class="suave peq" role="status" id="estado-pers"></span>
            </div>
            <p class="suave peq">El saldo no se cambia aquí: sale de tus movimientos y de lo que compruebas en la revisión.</p>
          </form>
        </section>
      </div>`;
    }
    return `<h1 tabindex="-1">Tus cuentas</h1>
      <div class="tarjetas grandes" style="margin-top:20px">${P.cuentas.map((x) => tarjeta(x.id, x.id === id)).join('')}</div>
      ${detalle}`;
  }

  /* ── Revisión guiada ── */
  function indicador(paso) {
    return `<ol class="pasos" aria-label="Pasos de la revisión">${NOMBRES_PASO.map((n, i) => {
      const k = i + 1;
      const hecho = paso === 'hecho' || k < paso;
      return `<li${k === paso ? ' aria-current="step"' : ''}${hecho ? ' class="hecho"' : ''}>${k} · ${n}</li>`;
    }).join('')}</ol>`;
  }

  function paso1() {
    const movs = P.movimientos[P.extracto.cuenta];
    const c = cuenta(P.extracto.cuenta);
    const [, , d1] = partes(P.extracto.desde);
    const [, , d2] = partes(P.extracto.hasta);
    return `<div class="paso">${mascota('normal')}
      <div><h2 id="t-paso" tabindex="-1">Qué ha entrado</h2>
        <p class="globo"><b>${esc(M.nombre)}:</b> Extracto de ${esc(c.nombre)}, del ${d1} al ${d2} de ${P.mes}. Esto es lo que he leído; en el paso siguiente vemos lo que no sé clasificar.</p>
        <div class="cifras">
          <div><b>${movs.length}</b>movimientos nuevos</div>
          <div><b>${P.extracto.repetidos}</b>ya estaban (no se duplican)</div>
          <div><b>${eur(suma(movs.filter((m) => m.importe > 0), (m) => m.importe))}</b>entradas</div>
          <div><b class="gasto">${eur(suma(movs.filter((m) => m.importe < 0), (m) => -m.importe))}</b>salidas</div>
          <div><b>${movs.filter((m) => m.revisar).length}</b>sin clasificar</div>
        </div>
        <details class="lista-importada"><summary>Ver los ${movs.length} movimientos</summary>
          <table class="movs"><caption class="oculto">Movimientos del extracto</caption>
            <thead><tr><th scope="col">Fecha</th><th scope="col">Texto del banco</th><th scope="col">Categoría</th><th scope="col" class="num">Importe</th></tr></thead>
            <tbody>${movs.map((m) => `<tr><td class="cifra">${ddmm(m.fecha)}</td><td class="original">${esc(m.texto || m.concepto.toUpperCase())}</td><td>${categoriaDe(m)}</td>
              <td class="num cifra${m.importe < 0 ? ' gasto' : ''}">${eur(m.importe, true)}</td></tr>`).join('')}</tbody></table>
        </details></div></div>`;
  }

  // Sugerencia sin IA: lo que el usuario eligió la última vez para el mismo texto del banco.
  const sugerenciaDe = (d) => {
    const h = P.historial[d.texto];
    return h && P.opciones[d.clase].concat(d.clase === 'gasto' ? P.opciones.otrasGasto : []).includes(h.eleccion) ? h : null;
  };

  function tarjetaDuda(d) {
    const e = rev.dudas[d.idx];
    const importe = `<span class="cifra${d.clase === 'gasto' ? ' gasto' : ''}" style="font-weight:600">${eur(d.clase === 'gasto' ? -d.importe : d.importe, true)}</span>`;
    const sug = !e && sugerenciaDe(d);
    const opciones = sug ? [sug.eleccion, ...P.opciones[d.clase].filter((o) => o !== sug.eleccion)] : P.opciones[d.clase];
    const boton = (o) => `<button type="button" data-accion="elegir" data-idx="${d.idx}" data-op="${esc(o)}"${o === 'Descartar' ? ' class="descartar"' : sug && o === sug.eleccion ? ' class="sugerido"' : ''}>${esc(o)}${sug && o === sug.eleccion ? ' <span class="peq">· sugerido</span>' : ''}</button>`;
    const otra = d.clase === 'gasto'
      ? `<label class="oculto" for="otra-${d.idx}">Otra categoría para ${esc(d.texto)} del ${ddmm(d.fecha)}</label>
        <select id="otra-${d.idx}" data-otra="${d.idx}"><option value="">Otra categoría…</option>${P.opciones.otrasGasto.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`
      : '';
    const cuerpo = e
      ? `<div class="elegida">✓ ${esc(e)}${rev.auto[d.idx] ? ' <span class="suave peq">· igual que la otra</span>' : ''}
          <button type="button" class="enlace" data-accion="cambiar" data-idx="${d.idx}" aria-label="Cambiar ${esc(d.texto)} del ${ddmm(d.fecha)}">Cambiar</button></div>`
      : `${sug ? `<p class="motivo"><b>${esc(M.nombre)}:</b> el ${ddmm(sug.fecha)} pusiste ${esc(d.texto)} (${eur(sug.importe)}) en «${esc(sug.eleccion)}».</p>` : ''}
        <div class="botones-cat" role="group" aria-label="Qué es ${esc(d.texto)} del ${ddmm(d.fecha)}">${opciones.map(boton).join('')}${otra}</div>`;
    return `<article class="duda${e ? ' resuelta' : ''}" data-idx="${d.idx}">
      <div class="cab"><span><span class="suave cifra">${ddmm(d.fecha)}</span> · <span class="original">${esc(d.texto)}</span></span>${importe}</div>
      ${cuerpo}</article>`;
  }

  function paso2(c) {
    const n = c.pendientes.length;
    const repetidos = DUDAS.filter((d) => DUDAS.some((o) => o !== d && o.texto === d.texto));
    const sugerencia = repetidos.length
      ? `Las dos de ${esc(repetidos[0].texto)} parecen la misma tienda: si eliges una, aplico lo mismo a la otra.`
      : 'Elige qué es cada uno; si no lo sabes, déjalo para luego.';
    return `<div class="paso">${mascota(n ? 'pensando' : 'normal')}
      <div><h2 id="t-paso" tabindex="-1">Qué necesita revisión</h2>
        <p class="globo"><b>${esc(M.nombre)}:</b> ${sugerencia}</p>
        <p class="quedan" aria-live="polite">${n ? `Quedan ${n}` : 'No queda ninguno'}</p>
        <div class="dudas">${DUDAS.map(tarjetaDuda).join('')}</div></div></div>`;
  }

  function resultadoSaldo(id) {
    const e = estadoSaldo(id);
    if (!e) return '';
    if (e.tipo === 'cuadra') return '✓ Cuadra';
    if (e.tipo === 'invalido') return 'Escribe una cifra, por ejemplo 1.697,06';
    return `No cuadra por ${eur(Math.abs(e.dif))}`;
  }
  const claseSaldo = (id) => { const e = estadoSaldo(id); return !e ? '' : e.tipo === 'cuadra' ? 'cuadra' : 'no'; };
  function pistaSaldo(id) {
    const e = estadoSaldo(id);
    if (!e || e.tipo !== 'no') return '';
    return `¿Falta ${e.dif > 0 ? 'alguna entrada' : 'algún gasto'} después del ${ddmm(P.movimientosHasta)}? Si importas el extracto de hoy, lo vuelvo a mirar. No hace falta resolverlo ahora.`;
  }

  function paso3() {
    const fila = (x) => {
      const c = cuenta(x.id);
      return `<div class="saldo-cta">
        <strong>${c.icono} ${esc(c.nombre)}</strong>
        <span>Según tus movimientos: <span class="cifra" style="font-weight:600">${eur(c.saldo)}</span></span>
        <label for="saldo-${x.id}">Saldo que ves en tu banco hoy (${esc(c.nombre)})</label>
        <div class="fila"><input id="saldo-${x.id}" type="text" inputmode="decimal" autocomplete="off" data-saldo="${x.id}" value="${esc(rev.saldos[x.id] || '')}">
          <button type="button" class="boton" data-accion="comprobar" data-id="${x.id}">Comprobar</button></div>
        <span class="resultado ${claseSaldo(x.id)}" id="res-${x.id}" aria-live="polite">${resultadoSaldo(x.id)}</span>
        <span class="pista peq suave" id="pista-${x.id}">${pistaSaldo(x.id)}</span>
      </div>`;
    };
    return `<div class="paso">${mascota(poseSaldos())}
      <div><h2 id="t-paso" tabindex="-1">Comprobar saldos</h2>
        <p class="globo"><b>${esc(M.nombre)}:</b> Mira en tu banco cuánto tienes hoy y escríbelo. Si no cuadra, no pasa nada: te digo por cuánto y lo miramos con calma.</p>
        <div class="saldos">${P.cuentas.map(fila).join('')}</div></div></div>`;
  }

  function vistaFinal(c) {
    const n = c.pendientes.length;
    const texto = n
      ? `Hecho por hoy. Te quedan ${plural(n, 'movimiento', 'movimientos')} por revisar; te los recuerdo en el Inicio, sin prisa.`
      : c.cuadran ? 'Extracto revisado y saldos comprobados. Este mes ya cuadra.' : 'Movimientos revisados. Cuando quieras, comprueba los saldos.';
    const revisados = DUDAS.length - n;
    const cuadran = P.cuentas.filter((x) => (estadoSaldo(x.id) || {}).tipo === 'cuadra').length;
    const resumen = [
      `${plural(revisados, 'movimiento revisado', 'movimientos revisados')} de ${DUDAS.length}`,
      c.comprobados ? `${cuadran} de ${P.cuentas.length} saldos cuadran` : 'saldos sin comprobar',
      `Gasto variable de ${P.mes}: ${eur(c.gastoVar)}`,
    ];
    return `<div class="final">${mascota('celebra', { etiqueta: true })}
      <div><h2 id="t-paso" tabindex="-1" class="oculto">Revisión terminada</h2>
        <p class="grande">${esc(texto)}</p>
        <ul class="resumen-final">${resumen.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
        <div class="acciones"><a class="boton primario" href="#inicio">Volver al Inicio</a>
          <button type="button" class="boton" data-accion="empezar">Empezar de nuevo</button></div></div></div>`;
  }

  function vistaRevision(c) {
    const enCurso = rev.paso === 2 || rev.paso === 3;
    if (avisoRetomar && enCurso) {
      return `<h1 tabindex="-1">Revisión del extracto</h1>
        <div class="retomar" style="margin-top:16px"><p>Seguir donde lo dejaste (paso ${rev.paso} de 3)</p>
          <button type="button" class="boton primario" data-accion="seguir">Seguir</button>
          <button type="button" class="boton" data-accion="empezar">Empezar de nuevo</button></div>`;
    }
    const paso = rev.paso;
    if (paso === 'hecho') return `<h1 tabindex="-1">Revisión del extracto</h1>${indicador('hecho')}${vistaFinal(c)}`;
    const cuerpo = paso === 1 ? paso1() : paso === 2 ? paso2(c) : paso3();
    const botones = [
      paso > 1 && '<button type="button" class="boton" data-accion="atras">Atrás</button>',
      paso === 1 && '<button type="button" class="boton primario" data-accion="siguiente">Siguiente</button>',
      paso === 2 && (c.pendientes.length
        ? '<button type="button" class="boton" data-accion="siguiente">Dejarlo para luego</button>'
        : '<button type="button" class="boton primario" data-accion="siguiente">Siguiente</button>'),
      paso === 3 && '<button type="button" class="boton primario" data-accion="terminar">Terminar</button>',
      '<span class="hueco"></span>',
      '<button type="button" class="boton" data-accion="salir">Salir y seguir luego</button>',
    ].filter(Boolean).join('');
    return `<h1 tabindex="-1">Revisión del extracto</h1>${indicador(paso)}${cuerpo}<div class="navegar">${botones}</div>`;
  }

  /* ── Cierre del mes ── */
  function vistaCierre(c) {
    const mes = P.mes, siguiente = MESES[partes(P.hoy)[1] % 12];
    const lim = P.presupuesto.limite;
    const cifras = `<div class="cifras cuatro">
        <div><b>${eur(c.entrado)}</b>ha entrado</div>
        <div><b class="gasto">${eur(c.salido)}</b>ha salido</div>
        <div><b>${eur(c.ahorro, true)}</b>ahorro del mes (${pct(c.ahorro / c.entrado * 100)})</div>
        <div><b${c.exceso > 0 ? ' class="gasto"' : ''}>${eur(Math.abs(c.exceso))}</b>${c.exceso > 0 ? 'te pasaste del límite' : 'te sobraron del límite'}</div>
      </div>`;
    if (cierre.cerrado) {
      return `<h1 tabindex="-1">Cierre de ${mes}</h1>
        <div class="final" style="margin-top:20px">${mascota('celebra', { etiqueta: true })}
          <div><h2 id="t-paso" tabindex="-1" class="grande-titulo">${mayus(mes)} cerrado</h2>
            <p class="suave" style="margin-bottom:14px">Guardado cómo ha ido y los saldos del ${ddmm(P.hoy)}. ${mayus(siguiente)} empieza con un límite de ${eur(cierre.limite)}.</p>
            ${cifras}
            <div class="acciones" style="margin-top:18px"><a class="boton primario" href="#inicio">Volver al Inicio</a>
              <button type="button" class="boton" data-accion="reabrir">Reabrir ${mes}</button></div></div></div>`;
    }
    const faltan = [];
    if (c.pendientes.length) faltan.push(`<li>Revisar ${plural(c.pendientes.length, 'movimiento', 'movimientos')}: <a href="#revision" data-accion="ir-revision" data-paso="2">revisar ahora</a></li>`);
    if (c.comprobados < P.cuentas.length) faltan.push(`<li>Comprobar los saldos del ${ddmm(P.hoy)} (${c.comprobados} de ${P.cuentas.length}): <a href="#revision" data-accion="ir-revision" data-paso="3">comprobar ahora</a></li>`);
    const saldo = (x) => {
      const e = estadoSaldo(x.id);
      const estado = !e || e.tipo === 'invalido' ? '<span class="suave">sin comprobar</span>'
        : e.tipo === 'cuadra' ? '✓ Cuadra'
        : `<span class="alerta">no cuadra por ${eur(Math.abs(e.dif))}</span> · se guarda el de tu banco: <span class="cifra">${eur(leerImporte(rev.saldos[x.id]))}</span>`;
      return `<li><strong>${esc(cuenta(x.id).nombre)}</strong> <span class="cifra">${eur(cuenta(x.id).saldo)}</span> · ${estado}</li>`;
    };
    const meta = (o) => `<li>${esc(o.nombre)}: <span class="cifra">${eur(o.actual)}</span> de <span class="cifra">${eur(o.meta)}</span> (${pct(o.actual / o.meta * 100)})</li>`;
    const opcionesLimite = c.exceso > 0
      ? `<fieldset class="limite"><legend>Límite de gasto variable para ${siguiente}</legend>
          <label><input type="radio" name="limite" value="${lim}"${cierre.limite === lim ? ' checked' : ''}> Mantener <span class="cifra">${eur(lim)}</span></label>
          <label><input type="radio" name="limite" value="${lim - P.presupuesto.margenSiguienteMes}"${cierre.limite === lim - P.presupuesto.margenSiguienteMes ? ' checked' : ''}> Empezar con <span class="cifra">${eur(lim - P.presupuesto.margenSiguienteMes)}</span> para compensar lo que te pasaste</label>
        </fieldset>`
      : `<p>${mayus(siguiente)} empieza con el mismo límite: <span class="cifra">${eur(lim)}</span>.</p>`;
    const boton = faltan.length
      ? `<button type="button" class="boton primario" aria-disabled="true" aria-describedby="faltan">Cerrar ${mes}</button>`
      : `<button type="button" class="boton primario" data-accion="cerrar-mes">Cerrar ${mes}</button>`;
    return `<h1 tabindex="-1">Cerrar ${mes}</h1>
      <div class="paso" style="margin-top:20px">${mascota(faltan.length ? 'pensando' : 'normal')}
        <div>
          <p class="globo"><b>${esc(M.nombre)}:</b> Cerrar el mes guarda cómo ha ido y los saldos del último día. No bloquea nada: podrás seguir corrigiendo movimientos.</p>
          <section aria-labelledby="t-asi"><h2 id="t-asi">Así ha ido ${mes}</h2>${cifras}</section>
          <div class="cierre-dos">
            <section class="panel" aria-labelledby="t-saldos-c"><h2 id="t-saldos-c">Saldos del ${ddmm(P.hoy)}</h2><ul class="lista-simple">${P.cuentas.map(saldo).join('')}</ul></section>
            <section class="panel" aria-labelledby="t-metas-c"><h2 id="t-metas-c">Tus metas</h2><ul class="lista-simple">${P.objetivos.map(meta).join('')}</ul>
              <p class="suave peq">Las metas miden tu avance; no apartan dinero.</p></section>
          </div>
          <section class="panel" aria-labelledby="t-sig" style="margin-top:16px"><h2 id="t-sig">Para ${siguiente}</h2>${opcionesLimite}</section>
          ${faltan.length ? `<div class="faltan" id="faltan"><b>Antes de cerrar falta:</b><ul>${faltan.join('')}</ul></div>` : ''}
          <div class="navegar">${boton}<span class="hueco"></span><a class="boton" href="#inicio">Ahora no</a></div>
        </div></div>`;
  }

  /* ── Rutas ── */
  function ruta() {
    const [v, sub] = location.hash.replace(/^#/, '').split('/');
    if (v === 'cuentas') return { vista: 'cuentas', id: P.cuentas.some((x) => x.id === sub) ? sub : null };
    if (v === 'revision') return { vista: 'revision' };
    if (v === 'cierre') return { vista: 'cierre' };
    return { vista: 'inicio' };
  }

  function render(enfocar) {
    const r = ruta();
    const c = calc();
    pintarCabecera(r.vista, c);
    const vista = document.getElementById('vista');
    vista.innerHTML = r.vista === 'cuentas' ? vistaCuentas(r.id) : r.vista === 'revision' ? vistaRevision(c)
      : r.vista === 'cierre' ? vistaCierre(c) : vistaInicio(c);
    document.title = 'FinanceBuddy · ' + TITULOS[r.vista];
    if (enfocar) {
      const el = typeof enfocar === 'string' ? vista.querySelector(enfocar) : vista.querySelector('h1');
      if (el) el.focus();
    }
  }

  function irPaso(paso) {
    rev.paso = paso; avisoRetomar = false; guardarRev();
    render('#t-paso');
  }

  /* ── Acciones ── */
  let temporizador = null;
  function celebrar(boton) {
    if (!animar()) return;
    const caja = boton.querySelector('.mascota');
    const vuelta = caja.dataset.pose;
    clearTimeout(temporizador);
    caja.classList.remove('entra', 'rebota');
    caja.innerHTML = mascotaSVG('celebra');
    void caja.offsetWidth; // reinicia la animación
    caja.classList.add('rebota');
    temporizador = setTimeout(() => { caja.classList.remove('rebota'); caja.innerHTML = mascotaSVG(vuelta); }, 1200);
  }

  function comprobar(id) {
    const input = document.getElementById('saldo-' + id);
    rev.saldos[id] = input.value.trim();
    guardarRev();
    const res = document.getElementById('res-' + id);
    res.textContent = resultadoSaldo(id);
    res.className = 'resultado ' + claseSaldo(id);
    document.getElementById('pista-' + id).textContent = pistaSaldo(id);
    const m = document.querySelector('.paso .mascota');
    if (m && m.dataset.pose !== poseSaldos()) m.outerHTML = mascota(poseSaldos());
    pintarCabecera('revision', calc());
  }

  function elegir(idx, op) {
    const d = DUDAS[idx];
    rev.dudas[idx] = op;
    delete rev.auto[idx];
    if (d.clase === 'gasto' && op !== 'Descartar') {
      DUDAS.filter((o) => o !== d && o.texto === d.texto && !rev.dudas[o.idx]).forEach((o) => { rev.dudas[o.idx] = op; rev.auto[o.idx] = true; });
    }
    guardarRev();
    render(`[data-accion="cambiar"][data-idx="${idx}"]`);
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[aria-disabled="true"]')) { e.preventDefault(); return; }
    const b = t.closest('[data-accion]');
    if (!b) return;
    const acc = b.dataset.accion;
    if (acc === 'anim') {
      animaciones = !animaciones;
      guardar('proto-animaciones', animaciones ? 'si' : 'no');
      aplicarAnim(); pintarBarra();
      document.querySelector('[data-accion="anim"]').focus();
    } else if (acc === 'celebrar') celebrar(b);
    else if (acc === 'ir-revision') {
      if (b.dataset.paso) rev.paso = Number(b.dataset.paso);
      else if (rev.paso === 'hecho') rev.paso = 1;
      avisoRetomar = false; guardarRev();
      if (location.hash === '#revision') { e.preventDefault(); render(true); } else pasoDecidido = true;
    } else if (acc === 'seguir') { avisoRetomar = false; render('#t-paso'); }
    else if (acc === 'empezar') { rev = revNueva(); irPaso(1); }
    else if (acc === 'siguiente') irPaso(rev.paso + 1);
    else if (acc === 'atras') irPaso(rev.paso - 1);
    else if (acc === 'terminar') irPaso('hecho');
    else if (acc === 'salir') { guardarRev(); location.hash = '#inicio'; }
    else if (acc === 'elegir') elegir(Number(b.dataset.idx), b.dataset.op);
    else if (acc === 'cambiar') {
      const idx = Number(b.dataset.idx);
      delete rev.dudas[idx]; delete rev.auto[idx]; guardarRev();
      render(`.duda[data-idx="${idx}"] button`);
    } else if (acc === 'comprobar') comprobar(b.dataset.id);
    else if (acc === 'ver-metas' || acc === 'ver-cargos') {
      const h = document.getElementById(acc === 'ver-metas' ? 't-metas' : 't-cargos');
      h.scrollIntoView({ behavior: animar() ? 'smooth' : 'auto', block: 'center' });
      h.focus({ preventScroll: true });
    } else if (acc === 'cerrar-mes') {
      const elegido = document.querySelector('input[name="limite"]:checked');
      cierre = { cerrado: true, limite: elegido ? Number(elegido.value) : P.presupuesto.limite,
        saldos: Object.fromEntries(P.cuentas.map((x) => [x.id, leerImporte(rev.saldos[x.id])])) };
      guardarCierre();
      render('#t-paso');
    } else if (acc === 'reabrir') {
      cierre = { cerrado: false, limite: cierre.limite };
      guardarCierre();
      render(true);
    } else if (acc === 'original-cuenta') {
      delete pers[b.dataset.id];
      guardar('proto-cuentas', pers);
      render('[data-accion="original-cuenta"]');
      document.getElementById('estado-pers').textContent = 'Vuelve a su diseño original';
    } else if (acc === 'reiniciar') {
      CLAVES.forEach((k) => { try { localStorage.removeItem(k); } catch (er) { /* nada */ } });
      location.hash = '#inicio';
      location.reload();
    }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t.dataset) return;
    if (t.dataset.saldo) comprobar(t.dataset.saldo);
    else if (t.dataset.otra !== undefined && t.value) elegir(Number(t.dataset.otra), t.value);
    else if (t.dataset.escenario !== undefined) { guardar('proto-escenario', t.value); location.reload(); }
    else if (t.dataset.nombreMascota !== undefined) {
      const n = t.value.trim();
      guardar('proto-mascota', n);
      M.nombre = n || P.mascota.nombre;
      t.value = M.nombre;
      render(false);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.saldo) { e.preventDefault(); comprobar(e.target.dataset.saldo); }
  });

  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-form="cuenta"]');
    if (!f) return;
    e.preventDefault();
    const id = f.dataset.id;
    const base = P.cuentas.find((x) => x.id === id);
    const nombre = f.nombre.value.trim().slice(0, 24);
    const icono = f.icono.value;
    const color = Number(f.color.value);
    const p = {};
    if (nombre && nombre !== base.nombre) p.nombre = nombre;
    if (icono !== base.icono) p.icono = icono;
    if (color !== base.color) p.color = color;
    if (Object.keys(p).length) pers[id] = p; else delete pers[id];
    guardar('proto-cuentas', pers);
    render('form[data-form="cuenta"] button[type="submit"]');
    document.getElementById('estado-pers').textContent = 'Guardado';
  });

  window.addEventListener('hashchange', () => {
    if (ruta().vista === 'revision' && !pasoDecidido) avisoRetomar = true;
    pasoDecidido = false;
    render(true);
  });

  document.getElementById('reiniciar').dataset.accion = 'reiniciar';
  sinMovimiento.addEventListener('change', aplicarAnim);
  aplicarAnim();
  pintarBarra();
  render(false);
})();

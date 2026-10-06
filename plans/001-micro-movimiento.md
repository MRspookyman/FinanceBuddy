# 001 — Añadir micro-movimiento de feedback y estado (5 ajustes de CSS)

- **Status**: DONE
- **Commit**: 22b985c
- **Severity**: LOW
- **Category**: Missed opportunities / Easing & duration
- **Estimated scope**: 1 archivo (`financebuddy/web/estilos.css`), ~25 líneas añadidas o cambiadas

Contexto del producto: FinanceBuddy es una herramienta de datos de uso diario, sobria. El movimiento debe ser casi imperceptible. No se anima la navegación del menú, el diálogo de atajos (lo abre el teclado), la cifra del Inicio ni las barras de datos.

## Problem

Hoy la app casi no tiene movimiento (ningún `@keyframes`) y no define ninguna curva compartida. Cinco sitios se sienten bruscos o inconsistentes:

```css
/* estilos.css:351 — único botón con feedback al pulsar */
.fb-btn:hover{filter:brightness(1.1)} .fb-btn:active{transform:scale(.98)} .fb-btn[disabled]{opacity:.55;cursor:progress}

/* estilos.css:106 */
.fin .fin-mes button{all:unset;cursor:pointer;padding:4px 11px;border-radius:6px;font-size:.92em;color:var(--ink-2);line-height:1.4}
/* estilos.css:253 */
.fb-chips button{all:unset;cursor:pointer;flex:none;display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;font-size:.84em;font-weight:600;color:var(--ink-2);background:var(--surface);border:1px solid var(--line)}
/* estilos.css:391 */
.fin .fb-seg a,.fb-seg button{all:unset;cursor:pointer;padding:5px 14px;border-radius:6px;font-size:.88em;font-weight:650;color:var(--ink-2)}
/* estilos.css:430 */
.fin .fb-cats button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:8px;font-size:.86em;font-weight:620;color:var(--ink);background:var(--surface);border:1px solid var(--line);transition:background .12s,border-color .12s}
/* estilos.css:440 */
.fin .fb-cands button.fb-cand{all:unset;box-sizing:border-box;cursor:pointer;display:block;padding:9px 13px;border-radius:8px;background:var(--surface-2);border:1px solid transparent;transition:background .12s,border-color .12s}

/* estilos.css:382 — zona de soltar archivos; .sobre se pone en pantallas.js:19 y :121 al arrastrar encima */
.fb-zona{display:grid;place-items:center;gap:8px;min-height:180px;margin:10px 0;padding:24px;border-radius:var(--r);border:1.5px dashed color-mix(in srgb,var(--ink-3) 60%,var(--line));color:var(--ink-2);text-align:center;cursor:pointer;font-size:.95em;background:var(--surface)}
/* estilos.css:384 */
.fb-zona:hover,.fb-zona.sobre{border-color:var(--brand);color:var(--ink);background:var(--brand-soft)}

/* estilos.css:316-321 — desplegables: la flecha gira en .12s pero el contenido aparece de golpe */
.fin-more>summary::before{content:"›";display:inline-block;width:10px;color:var(--ink-3);font-weight:800;transition:transform .12s}
.fin-more[open]>summary::before{transform:rotate(90deg)}

/* estilos.css:81 — aviso inferior */
#aviso{position:fixed;left:50%;bottom:28px;transform:translate(-50%,20px);opacity:0;pointer-events:none;transition:all .2s;z-index:50;
```

Además, la tarjeta de vista previa de importar (`financebuddy/web/paneles/pantallas.js:159`, `card.classList.add("fb-previa")`) aparece de golpe y no existe ninguna regla CSS `.fb-previa`.

## Target

Curva compartida (la del repositorio de referencia, sin aproximar): `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`.

```css
/* 0. En el bloque de variables de body (estilos.css:8-21), añadir una variable más: */
 --ease-out:cubic-bezier(0.23,1,0.32,1);

/* 1. Feedback al pulsar (subtle: decenas de veces al día) */
.fin .fin-mes button,.fb-chips button,.fin .fb-seg a,.fb-seg button,.fin .fb-cats button,.fin .fb-cands button.fb-cand{transition:transform 120ms var(--ease-out)}
.fin .fin-mes button:active,.fb-chips button:active,.fin .fb-seg a:active,.fb-seg button:active,.fin .fb-cats button:active,.fin .fb-cands button.fb-cand:active{transform:scale(.98)}

/* 2. Vista previa: entra una vez (no se interrumpe), desde 8 px más abajo */
@keyframes fb-entra{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.fb-previa{animation:fb-entra 200ms var(--ease-out) both}

/* 3. Zona de soltar */
.fb-zona{transition:background-color 150ms var(--ease-out),border-color 150ms var(--ease-out),color 150ms var(--ease-out)}

/* 4. Desplegables (Chromium reciente; en otros navegadores se queda como hoy) */
@supports (interpolate-size:allow-keywords){
 :root{interpolate-size:allow-keywords}
 .fin-more::details-content{block-size:0;opacity:0;overflow:clip;transition:block-size 200ms var(--ease-out),opacity 200ms var(--ease-out),content-visibility 200ms allow-discrete}
 .fin-more[open]::details-content{block-size:auto;opacity:1}
}
.fin-more>summary::before{transition:transform 200ms var(--ease-out)}

/* 5. Aviso: solo transform y opacity */
#aviso{transition:transform 200ms var(--ease-out),opacity 200ms var(--ease-out)}
```

## Repo conventions to follow

- Todo el CSS está en `financebuddy/web/estilos.css`, en una línea por regla y con las variables dentro de `body{...}` (no hay `:root` con variables). Nombres en español (`fb-`, `fin-`).
- Ejemplo de transición correcta ya existente: `.fb-progreso .rel{...transition:width .6s}` (línea 166) y `.fb-grupo{...transition:opacity .2s,transform .2s}` (línea 415).
- Al final de `estilos.css` ya existe un bloque `@media (prefers-reduced-motion:reduce)` que reduce todas las duraciones a casi cero. No lo toques; cubre estos cambios.

## Steps

1. En `estilos.css`, dentro de `body{...}` (líneas 8-21), añade ` --ease-out:cubic-bezier(0.23,1,0.32,1);` junto a las demás variables (por ejemplo, tras la línea de `--r:12px;--r-s:10px;--g:14px;`).
2. **Feedback al pulsar.** Justo después de la línea 351 añade el bloque «1» del Target. Antes, comprueba en el navegador (DevTools → Computed → `display`) que `.fin-mes button` y `.fb-seg a/button` NO se ven como `inline`: `all:unset` los deja en `display:inline` y `transform` no se aplica a elementos en línea. Si alguno sale `inline` y su padre no es flex ni grid, añade `display:inline-block` a su regla de las líneas 106 o 391. Si el padre es flex o grid no hace falta.
3. **Vista previa.** Añade el bloque «2» (`@keyframes fb-entra` y `.fb-previa`) al final de la zona de reglas de importación, cerca de la línea 445. Se usa `@keyframes` y no `@starting-style` porque `pantallas.js:159` añade la clase a un nodo que puede estar ya insertado, y en ese caso `@starting-style` no se dispara.
4. **Zona de soltar.** Añade el bloque «3» justo después de la línea 384.
5. **Desplegables.** Cambia la transición de la línea 320 de `transform .12s` a `transform 200ms var(--ease-out)`, y añade el bloque `@supports` del punto «4» después de la línea 321.
6. **Aviso.** En la línea 81 sustituye `transition:all .2s;` por `transition:transform 200ms var(--ease-out),opacity 200ms var(--ease-out);`.

## Boundaries

- Solo se toca `financebuddy/web/estilos.css`. NO modificar archivos `.js`, `index.html` ni Python.
- NO animar: el menú superior y el cambio entre pantallas, el diálogo `#atajos` (lo abre el teclado), la cifra del Inicio (`.fb-hero`), las barras y gráficos, ni el cambio de tema.
- NO cambiar tamaños, colores ni márgenes; solo propiedades de movimiento (más el `display:inline-block` condicional del paso 2).
- NO añadir dependencias.
- Si alguna línea citada no coincide con el código real, PARA y informa en lugar de improvisar.

## Verification

- **Mecánica**: no hay compilación. Comprueba que las llaves siguen equilibradas: `python -c "s=open('financebuddy/web/estilos.css',encoding='utf-8').read();print(s.count('{')==s.count('}'))"` debe imprimir `True`. Después arranca con `python lanzar.py`.
- **Feel check** (en Chrome o Edge reciente):
  - Pulsa y mantén un chip, un segmento del selector, un mes de `.fin-mes` y una categoría: se encogen un 2 % de forma apenas perceptible, sin saltos de layout alrededor.
  - Importa un archivo: la tarjeta de vista previa sube 8 px mientras aparece, en unos 200 ms, una sola vez.
  - Arrastra un archivo sobre la zona de importar: el borde y el fondo cambian suavemente, sin parpadeo.
  - Abre y cierra un `.fin-more`: el contenido se despliega y se pliega, y repetir el clic rápido no deja el desplegable a medias.
  - Provoca un aviso (por ejemplo, guardar algo): sube y se desvanece; al llegar un aviso de error, el fondo cambia de color sin transición (es esperado).
  - En DevTools → Animations, baja la velocidad al 10 % y comprueba que ninguna animación tiene rebote ni se anima `height`/`width` fuera del caso 4.
  - Activa `prefers-reduced-motion` en el panel Rendering: todo queda instantáneo y la app sigue siendo usable.
- **Done when**: los 6 pasos están aplicados, la comprobación de llaves da `True` y los puntos del feel check se cumplen. Anotar aparte si el paso 2 necesitó `display:inline-block`.

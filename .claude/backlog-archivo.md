# Backlog de FinanceBuddy · archivo

Lo cerrado: lo hecho y lo descartado. **No se lee entero**: se busca con
`python .claude\herramientas\backlog.py buscar <palabras>` antes de proponer algo, para no repetirlo. Nadie borra entradas.

## Hecha

| Id | Qué | Cuándo |
|---|---|---|
| B-070 | Aviso «No cuadra»: ya no cuenta los fijos previstos como reales y usa el día en que el banco apuntó el movimiento | 12/10/2026 · origen usuario · revisor: pasa (2.ª vuelta, con B-071) · sin commit · no reproducido con los datos reales del usuario |
| B-071 | Cuadre completo: sin aportaciones automáticas con `exacto`, día del banco también en `estimacion()`, «Actualizar saldos» propone lo mismo que comprueba el aviso, y un importado con fecha futura puesta a mano no se resta dos veces | 12/10/2026 · revisor: pasa (2.ª vuelta) · sin commit · `autoCuadre`/`cuadreExtracto` solo leídos (no corren con el ejemplo) |
| B-072 | Un activo vendido del todo vale 0 € y va a «Ya vendido» aunque tuviera un valor anotado antes de la venta o sin fecha; la ficha de un activo con valor sin fecha ya no se rompe («anotado, sin fecha») | 12/10/2026 · revisor: pasa (2.ª vuelta) · sin commit · sin probar con precios por internet |
| B-073 | Un fijo pagado con fecha valor en otro mes ya no deja un automático fantasma: el pago real se enlaza al mes en que el fijo tocaba más cerca, y con dos pagos en un mes y ninguno en el vecino, uno cubre al vecino (`datos.js`, `pagosDeFijos`) | 12/10/2026 · revisor: pasa (2.ª vuelta) · sin commit · sin probar con un extracto real importado |
| B-074 | «Tus próximos meses»: los tres escenarios se leen con sus dos cifras sin desplazamiento horizontal (supuesto bajo el nombre, mes del mínimo completo) | 12/10/2026 · revisor: vuelve por un punto (media fila sombreada al pasar el ratón); corregido con una línea de CSS que el orquestador comprobó que está, sin segunda pasada del revisor · sin commit |
| B-046 | «Dónde más gastas» por comercio en Mi año | commit 8928c6a |
| B-047 | Presupuestos sugeridos con un clic | commit 8928c6a |
| B-048 | Aviso de desvío del reparto ideal en el Inicio | commit 8928c6a |
| B-049 | Importar en un paso si la vista previa no trae dudas | commit 8928c6a |
| B-050 | «Quiero ahorrar al mes» propone el límite de gasto | commit 8928c6a |
| B-065 | Cambiar la categoría en la fila y en bloque | commit 8928c6a |
| B-042 | Aviso de aportación mensual que no llega | commit 3fee2e3 |
| B-043 | Mi año: enlace fijo en el Inicio y filas que llevan a sus movimientos | commit 3fee2e3 |
| B-044 | Regla de los dos meses en «Para la renta» | commit 3fee2e3 |
| B-045 | Tarjeta «Primeros pasos» y atajos de teclado nuevos | commit 3fee2e3 |
| B-001 | Saldos con orden mixto rechazaban un extracto bueno | commit 521125c |
| B-002 | Jev recibía nombres en «Pago Bizum a…» | commit 521125c |
| B-003 | Gráficos sin nombre accesible | commit 521125c |
| B-004 | Coral y ámbar como texto bajo 4,5:1 en claro (`--coral-t`, `--amber-t`) | commit 521125c |
| B-005 | Jerga: TIR, Cuadrar, Hitos, «k€» | commit 521125c |
| B-010 | Intereses de cuentas en «Para la renta» | visto en `renta.js` |
| B-015 | Cabecera `X-Frame-Options` | visto en `servidor.py` |
| B-016 | Pantalla «Mi año» | commit 521125c |

## Descartada (no volver a proponer sin un motivo nuevo)

| Id | Qué | Motivo |
|---|---|---|
| B-023 | Ayudas «ⓘ» sin rol | Ya tienen `tabindex` y `aria-label` (`componentes.js`). Valor mínimo |
| B-024 | Quitar el verde de los ingresos del Inicio | Un ingreso es una ganancia; la regla 4 no lo prohíbe |
| B-025 | Modo discreto, patrones por categoría, menú estrecho, decimales, huecos de rejilla | Poco valor para un usuario único en escritorio (regla 9) o gusto personal |
| B-026 | `reset_dimensions` y otras hojas del xlsx | No se reprodujo. Reabrir si aparece un archivo real |
| B-027 | Trocear `servidor.py` e `importar.py` | Coste desproporcionado; no ha causado fallos |
| B-028 | Variables de entorno `FB_JEV_URL` | Exige controlar el entorno del usuario; se usan en las pruebas |
| B-029 | Foto de «Deshacer» sin fechas; memoización del front | Sin dolor medido |
| B-030 | Importar el Excel exportado, ISIN → nombre, aviso de fijos anómalos | Valor bajo o ya cubierto |
| B-031 | Aviso de subida de precio de un cobro | Ya existe: `subidasFijos` (`calculos_avisos.js`) |
| B-032 | Lista de suscripciones con coste anual | Ya lo cubre la pantalla de Fijos (`totalesFijos`) |
| B-033 | Crear regla con un clic y plantillas de regla | Ya hay «probar regla» y «recordar» |
| B-034 | Importar desde otras apps | Uso puntual y formatos ajenos |
| B-035 | «Tu lunes»: lista de pendientes | Duplica `accionesQueTocan` y los avisos |
| B-036 | Resumen mensual por escrito al cerrar | Valor bajo. Retomar si se hace B-062 |
| B-037 | Apuntar varios gastos seguidos | Se pide pocas veces |
| B-038 | Atajos de teclado en Por revisar | Cambia el flujo principal de revisar; menos urgente que lo demás |
| B-084 | Totales del mes frente a la media bajo «Entró / Salió / Ahorro» y enlace «revisar →» en «Sin clasificar» (producto 12/10 nº 4) | Poco valor: la comparación ya está por categoría, en la portada («Vas X por encima de lo normal», `inicio.js:178-183`) y en Mi año; lo que está sin revisar ya lleva a Por revisar (`inicio.js:619` y el aviso del Inicio) |
| B-085 | Para la renta: lista «Antes de usar estas cifras» (producto 12/10 nº 5) | Ya avisa de lo que falta (`renta.js:15`, `:44`) y el arreglo se ofrece en Inversión (`saludInversion`, `inversion.js:320`); tarea de una vez al año: cuesta más de lo que da ahora |
| B-086 | Mi año: quitar las columnas vacías cuando no hay año anterior (producto 12/10 nº 6 + interfaz 12/10 nº 6) | Poco valor: solo se ve sin datos del año anterior (`anual.js:60-62`) y la pantalla ya lo dice; se arregla solo al cambiar de año |
| B-087 | Reparto ideal con un clic desde el reparto actual y efecto de las aportaciones (producto 12/10 nº 7) | Función nueva sin pregunta detrás: un ideal igual a lo que ya tienes no dice dónde meter lo siguiente y deja mudo el aviso de desvío (B-048), que ya da la próxima aportación |
| B-088 | Agrupar los avisos de activos sin participaciones (producto 12/10 nº 8) | Poco valor para un usuario único: son dos filas, cada una con su botón y su ✕ (`inversion.js:320`); el caso de diez activos es supuesto |
| B-089 | Importar: «hasta qué día llega cada cuenta» y plegar las otras formas de importar (producto 12/10 nº 9) | Poco valor: el Inicio ya dice hasta cuándo hay movimientos (`inicio.js:47`, `:332`), a principio de mes se bajan todos los extractos y lo repetido no entra dos veces |
| B-090 | Por revisar: explicar o confirmar «Descartar» y «es un pago fijo» desde ahí (producto 12/10 nº 10 + interfaz 12/10 nº 5) | Ya existe: el botón dice «No registrar este movimiento» (`revisar.js:375`) y se deshace desde el aviso y desde «Lo último: … Deshacer» (`revisar.js:211-225`). Dar de alta un fijo desde ahí es una función nueva que ya cubre Fijos (detección) |
| B-091 | Lista de Movimientos: esconder el desplegable de categoría de cada fila (interfaz 12/10 nº 3) | Deshace B-065, hecha en el último commit y anunciada en la cabecera de la pantalla; un control que solo aparece con el ratón es peor para el teclado |
| B-092 | Resaltar la fila tras cambiar su categoría (interfaz 12/10 nº 4) | Sin comprobar por quien lo propone; ya sale el aviso con «Deshacer» (`inicio.js:563`) y el desplegable enseña la categoría nueva. Valor mínimo |
| B-093 | Actualizar saldos: «€» en cada campo y etiqueta más cerca (interfaz 12/10 nº 7) | La unidad ya va bajo cada campo («según los movimientos: 1.697,06 €», `cierre.js:47`, `:72`). Gusto personal |
| B-094 | Inicio, «A dónde va tu dinero»: nombres cortados (interfaz 12/10 nº 9) | Poco valor: el nombre entero está a un clic en «Ver todo» y la categoría se reconoce por su icono y color |
| B-095 | `aria-current` en «Por categoría / Lista» (interfaz 12/10 nº 10) | Valor mínimo para un usuario único, como B-023: la regla 5 pide nombre, foco y contraste, y los tres se cumplen (`inicio.js:513`) |

# Backlog de FinanceBuddy

La memoria de los agentes de revisión: **todo lo que se ha propuesto alguna vez y en qué quedó**. Se lee antes de proponer nada
(para no repetir) y se actualiza al cerrar cada ronda. Los informes con fecha de `.claude/informes/` son material de trabajo y no
se guardan en git; esto sí.

## Cómo se usa
- **Estado**: `pendiente` (aceptada, sin hacer) · `en curso` (alguien la tiene a medias: decir qué falta) · `hecha` (el revisor dio
  el visto bueno) · `descartada` (con el motivo) · `sin comprobar` (venía de antes y nadie ha mirado si está hecha).
- **Tipo**: `fallo` · `cifra` · `accesibilidad` · `mejorar` · `quitar` · `añadir`.
- **Riesgo**: `directa` o `con permiso` (cambia el formato de los datos, borra o transforma datos, internet o dependencia nueva,
  seguridad del servidor, cambia lo que significa una cifra, quita algo que existe). Lo decide `fb-filtro`.
- El filtro añade entradas (`pendiente` o `descartada`). El orquestador pasa a `en curso` al encargar y a `hecha` cuando el
  revisor dice «pasa». Nadie borra entradas: lo descartado se queda, para que no vuelva.
- Lo que el usuario comente al usar la app entra como entrada nueva con origen `usuario`, y va delante de todo.
- Identificadores correlativos (`B-001`…); no se reutilizan.

## Pendiente

| Id | Qué | Tipo | Riesgo | Esfuerzo | Origen · nota |
|---|---|---|---|---|---|
| B-075 | «¿Me puedo permitir un gasto?»: plegado bajo la barra de la portada; escribes un importe y dice cuánto te queda de límite, cuánto tendrás al acabar el mes y el mes más bajo de la previsión. No guarda nada | añadir | directa | medio | producto 12/10 nº 1 · **ronda 12/10 nº 5** · va plegado de serie; reutiliza `presupuestoSemana` y `prevision` · **EN CURSO** (implementador, 12/10) |
| B-076 | Con datos atrasados, el ritmo, los días que quedan y el mes en curso de la previsión cuentan desde hoy y no desde `fechaDatos()` (`calculos_avisos.js:198-201`, `calculos_saldos.js:143`, `:311`) | cifra | directa | medio | cifras 12/10 nº 8 · la primera de la ronda siguiente (B-075 usa esa previsión) |
| B-096 | «Actualizar saldos»: cuando lo propuesto difiere del saldo estimado del Inicio por fijos o aportaciones que aún no han llegado, decirlo en el pie del campo («sin contar 40 € de fijos que aún no han llegado») (`cierre.js:47`) | mejorar | directa | bajo | revisor 12/10 (B-071), no bloqueante |
| B-097 | El flujo 32 de `pruebas_flujos.js` deja guardado el registro del 30/09 (septiembre cerrado) y, si falla, los dos fijos: limpiar siempre al acabar | fallo | directa | bajo | revisor 12/10 (B-071) · solo pruebas; hoy inocuo por ser el último flujo |
| B-098 | Un pago de fijo con fecha valor en el mes anterior sigue contando en ese mes (agosto enseña dos alquileres y septiembre ninguno; «Tu peor mes» y la meta del fondo de emergencia se mueven). El total del año está bien; el reparto entre los dos meses, no | cifra | con permiso | medio | implementador y revisor 12/10 (B-073) · cambia en qué mes cuenta un pago que ya se ve |
| B-099 | Fijos: un solo pago adelantado sin extracto (seguro de marzo pagado el 28/02), cadenas de más de un mes y aportaciones fijas siguen sin enlazar bien; un fijo con el `dia` mal puesto (día 17-25 que se cobra a primeros) deja su automático. Avisar cuando el día del fijo no casa con sus pagos, o enlazar por cercanía también ahí | cifra | directa | medio | revisor 12/10 (B-073) · comportamiento de antes, no empeora |
| B-100 | `pruebas/run.py --guion` no aplica `--ancho` a la pasada de los clics (solo a la captura): los guiones miden a la ventana por defecto | fallo | directa | bajo | revisor 12/10 (B-074) · solo herramienta de pruebas |
| B-077 | Un traspaso «por revisar» no cuenta en los saldos, el colchón ni el cuadre (`datos.js:156`) | cifra | directa | medio | cifras 12/10 nº 4 · restarlo en su cuenta sin tocar la otra |
| B-082 | Cerrar el mes: un solo título con el mes que se cierra (hoy «Registro de saldos de hoy» + «Agosto ya está cerrado» + botón «Cerrar septiembre», `cierre.js:17-19`) y, junto a cada campo, si cuadra o cuánto falta mientras escribes, con enlace a buscar ese importe | mejorar | directa | medio | producto 12/10 nº 2 + interfaz 12/10 nº 8 (fusionadas) · antes del cierre de octubre |
| B-083 | Movimientos > Lista: la barra de «N elegidos» sale encima de la lista y fuera de la vista (`inicio.js:537`, `inicio.css:125`); que quede pegada arriba al desplazarse | mejorar | directa | bajo | interfaz 12/10 nº 2 · remata B-065 |
| B-078 | Sin límite de gasto, el colchón no cuenta el gasto variable (`calculos_saldos.js:257`): usar lo que se gasta de verdad (`F.varEst`) | cifra | directa | bajo | cifras 12/10 nº 6 · solo afecta a quien no tiene límite puesto |
| B-081 | El aviso de la aportación que no llega tarda 35 días (`calculos_avisos.js:152-154`): la referencia debe ser lo último importado del bróker | cifra | directa | bajo | cifras 12/10 nº 10 · afina B-042 |
| B-079 | Un fijo dado de alta en una categoría variable se cuenta dos veces (previsión, meta, colchón) y entra en el límite «sin contar fijos» (`calculos_saldos.js:99`) | cifra | con permiso | medio | cifras 12/10 nº 7 · cambia qué es «gasto variable» (hoy va por el grupo de la categoría) y con ello la cifra de la portada |
| B-080 | Inicio: «Invertido · lo que has metido» resta los dividendos cobrados y «Tu patrimonio» no sube al cobrar uno (`inicio.js:344-355`); además Inicio y Mi año llaman «patrimonio» a dos cifras distintas | cifra | con permiso | bajo | cifras 12/10 nº 9 · cambia lo que significa la cifra grande de la tarjeta |
| B-041 | `--mint` y `--rose` como texto sobre `--surface-2` en tema claro: 4,42 y 4,44 (piden 4,5) | accesibilidad | directa | bajo | medido con `contraste.py --vars` el 12/10/2026 |
| B-007 | Foco de los campos con `outline-offset:-1px` (`componentes.css:113`) | accesibilidad | directa | bajo | interfaz 09/10 |
| B-011 | `xirr` devuelve NaN por encima de +1000 % (`calculos.js:120`, cota `hi = 10`) y le faltan pruebas | cifra | directa | bajo | código 09/10 |
| B-009 | Coste anual de las comisiones de cada fondo: el TER se guarda y nada lo usa | añadir | directa | bajo | código 09/10 |
| B-051 | Simulador «si vendo X hoy» (comparte la función de compras y ventas con la regla de los dos meses) | añadir | directa | medio | ideas 09/10 nº 11 |
| B-052 | Hucha de pagos anuales: cuánto apartar al mes para los fijos que no son mensuales | añadir | directa | medio | ideas 09/10 nº 12 |
| B-053 | Más filtros en Movimientos (cuenta, importe, sin revisar) | mejorar | directa | medio | ideas 09/10 nº 13 |
| B-055 | Mi año: media mensual, «lo que más bajó», ritmo del año | mejorar | directa | medio | ideas 09/10 nº 15 |
| B-056 | Guardar o imprimir Mi año | añadir | directa | medio | ideas 09/10 nº 16 |
| B-057 | Ingresos pasivos: dividendos e intereses por año y rendimiento por activo | añadir | directa | medio | ideas 09/10 nº 17 |
| B-058 | Alta a mano más corta en la Bienvenida (bloques 2-4 plegados) | quitar | directa | bajo | ideas 09/10 nº 18 |
| B-054 | Estados vacíos con botón en las pantallas que aún no lo tienen (`vacio()` ya existe en algunas) | mejorar | directa | bajo | ideas 09/10 nº 14 |
| B-021 | `confirm()` nativo por un diálogo propio (`ajustes.js:178`, `fijos.js:100`, `formularios.js:288`) | mejorar | directa | medio | interfaz 09/10 · sin urgencia |
| B-012 | `numero("1.234")` leído como 1,234 y `fecha(25000)` | fallo | con permiso | alto | código 09/10 · cambia cómo se leen importes al importar |
| B-019 | Jev bloquea el servidor durante una importación grande | fallo | directa | alto | código 09/10 |
| B-020 | Rendimiento de `App.datos()` con mucho historial | mejorar | directa | alto | código 09/10 · hay que medirlo con datos reales |
| B-017 | Importar Norma 43 / OFX / QIF | añadir | directa | alto | código 09/10 |
| B-018 | Gastos en otra divisa | añadir | con permiso | alto | código 09/10 · campo nuevo |
| B-059 | Calculadora de independencia financiera, con pensión pública a mano | añadir | con permiso | alto | ideas 09/10 nº 19 · pantalla nueva; los supuestos los elige el usuario |
| B-060 | Escenarios de la previsión («qué pasaría si…») | añadir | con permiso | alto | ideas 09/10 nº 20 · cambia cómo se calcula `prevision` · filtro 12/10: parece hecha (`escenariosPrevision` en `calculos_saldos.js:339`, `tarjetaEscenarios` en `inicio.js:449`); que el orquestador lo confirme |
| B-061 | Deshacer una importación entera (lote) | añadir | con permiso | alto | ideas 09/10 nº 21 · campo nuevo y borrado en bloque |
| B-062 | Foto fija del cierre de mes | añadir | con permiso | alto | ideas 09/10 nº 22 · campos nuevos; agrupar con B-061 |
| B-063 | Gastos a medias / dinero que te deben | añadir | con permiso | alto | ideas 09/10 nº 23 · cambia el gasto neto |
| B-064 | Etiquetas libres en movimientos | añadir | con permiso | alto | ideas 09/10 nº 24 · campo nuevo; se solapa con categorías |
| B-066 | Franja «lo que cambió desde la última vez» en el Inicio | añadir | directa | medio | ideas 09/10 nº 26 · decir qué se pliega a cambio |
| B-067 | Movimientos futuros puntuales en la previsión | añadir | con permiso | alto | ideas 09/10 nº 27 · ver antes qué cubren los recurrentes con `hasta` |
| B-068 | Filtros o informes guardados | añadir | directa | alto | ideas 09/10 nº 28 · baja prioridad |

## Sin comprobar (venían de antes; mirar si están hechas antes de encargarlas)

| Id | Qué | Tipo | Origen |
|---|---|---|---|
| B-006 | Texto de ~12 px: subir tamaños | accesibilidad | interfaz 09/10 nº 6 |
| B-008 | `#log` de depuración en rojo visible | mejorar | interfaz 09/10 nº 8 |
| B-013 | Restaurar una copia sin validar (hay `integrity_check` en `almacen.py`; falta ver si cubre «esquema más nuevo» y el límite de copias) | fallo | código 09/10 nº 13 |
| B-014 | Cambiar de carpeta con una ruta errónea crea base vacía (hay `isdir` en `servidor.py:324`; falta ver si basta) | fallo | código 09/10 nº 14 |

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

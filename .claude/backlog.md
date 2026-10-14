# Backlog de FinanceBuddy

La memoria de los agentes de revisión: **lo vivo** (pendiente, en curso y sin comprobar). Lo cerrado (hecho y descartado) está en
`.claude/backlog-archivo.md`, que **no se lee entero**: se busca. Los informes con fecha de `.claude/informes/` son material de
trabajo y no se guardan en git; esto sí.

Con `python .claude\herramientas\backlog.py` (sin gastar tokens): `resumen` (lo vivo en una línea cada cosa), `buscar <palabras>`
(en los dos archivos, antes de proponer algo), `ronda` (la siguiente ronda solo con el backlog), `siguiente` (próximo id),
`en-curso B-123`, `hecha B-123 "nota"`, `descartar B-123 "motivo"` (las dos últimas la pasan al archivo) y `comprobar`.

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

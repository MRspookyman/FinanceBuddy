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
| B-107 | ISHARES PHYSICAL GOLD ETC (−48,90 € el 04/09 y −49,60 € el 25/09, cuenta Bróker, pendientes) fueron compra de un activo: restarlos del «Efectivo bróker» (400 € → 301,50 €) y que cuenten como inversión, sin cambiar el total (11.897,06 €). Si el activo no está dado de alta, el aviso debe decir que hay que darlo de alta. Que la nota de Inicio («4 movimientos») y el aviso («6 por revisar») cuenten lo mismo | cifra | con permiso | bajo-medio | usuario 20/10: fue compra · cifras 20/10 (`datos.js:227`, `datos.js:237-239`, `calculos_saldos.js:4-8`, `inicio.js:254-256`, `calculos_avisos.js:190`) · cambia «Sin invertir» y el aviso «se acaba en diciembre» (es noviembre) |
| B-108 | «Tu dinero total» (Inicio): una sola base para cifra, nota y gráfica, con la división debajo y cada parte nombrada: cuentas 5.897,06 €, sin invertir en el bróker 400 €, inversión a valor de mercado 7.176,78 € (5.600 € aportados + 1.577 € de ganancia), total 13.473,84 € | mejorar | con permiso | bajo-medio | usuario 20/10: total con la división y el nombre de cada parte. Base a valor de mercado, como Mi año (recomendada; no confirmada expresamente) · análisis 20/10 (producto #2, interfaz #1, cifras) · `inicio.js:417-443`; reabre B-080 (hecha) · cambia la cifra de portada |
| B-110 | Previsión: el resto del mes (Normal y Optimista) no baja de la parte proporcional de la media (614,35 € × días que quedan / días del mes); los escenarios quedan ordenados (Prudente ≥ Normal ≥ Optimista) | cifra | con permiso | bajo | usuario 20/10: sí · cifras 20/10 · `calculos_saldos.js:347-349`, `:356` · Normal final −20,48 € (8.437,35 → 8.416,87 €) |
| B-109 | Hero «≈ X € al día durante N días» (Inicio): contar desde hoy, no desde el último movimiento; si los datos son de antes de ayer, decirlo con su fecha (como el simulador, `inicio.js:302`) | cifra | con permiso | bajo | cifras 20/10 · `inicio.js:242`, `calculos_saldos.js:154-156` · B-076 (hecha) no lo cubre · último movimiento 31/08 y hoy 30/09: sale «20 € al día durante 30 días» y quedan 1 día |
| B-111 | Cerrar el mes: un saldo precargado con la estimación no se guarda como saldo del banco; «Cuadra ✓» solo si el usuario escribió la cifra, o pedir confirmar al guardar las que vienen de la estimación | cifra | con permiso | bajo | producto 20/10 · leído en `cierre.js:47-49`, `:59`, `:113-125` y **no ejecutado**: comprobar antes · reabre B-071 (hecha) · si hay marca de «estimado», sube `almacen.VERSION_ESQUEMA` |
| B-112 | Inicio de un mes pasado: «Tu dinero total» muestra el total a fin de ese mes con su fecha (la serie `patrimonio()` lo tiene: 13.006 € el 31/08); sin saldos ese mes, no mostrar la tarjeta | mejorar | directa | bajo-medio | producto 20/10 · `inicio.js:67`, `:414` · va con B-108 (misma tarjeta) · distinta de B-062 |
| B-113 | Hero del gasto: una sola cifra del límite (no «72 € de más» y «112 %» a la vez) y «tu media» como único nombre de la media (hoy «lo normal» en el hero y «tu media» en el resto) | mejorar | directa | bajo | interfaz 20/10 · `inicio.js:69`, `:218`, `:237-243`, `:335` · cita B-075 (hecha) · la frase de la media se mantiene |
| B-116 | Menú con `aria-current="page"` en la página activa y un `h1` con el título de cada pantalla (ninguna lo tiene) | accesibilidad | directa | bajo | interfaz 20/10 · `nucleo.js:238-250` · distinta de B-095 (descartada: `aria-current` del segmentado) |
| B-122 | Ayuda de «Registros por página» sin nombres internos («Gestionar» → «las listas de Ajustes»; «Renta» → «Para la renta») | mejorar | directa | mínimo | interfaz 20/10 · `ajustes.js:79` · resto de B-005 |
| B-106 | Una aportación fija que llega unos días antes de su fecha (29/08 para el 05/09) se cuenta como del mes anterior y deja la automática de septiembre: avisa «no ha llegado» aunque llegó; enlazar `aportaciones()`/`vinculadas` (`datos.js:322`) por cercanía con margen de 7 días, quitando también la automática | cifra | con permiso | medio | revisor B-099 14/10 · cambia lo invertido y la previsión de ese mes · aviso y enlace tienen que cambiar a la vez |
| B-020 | Rendimiento de `App.datos()` con mucho historial | mejorar | directa | alto | código 09/10 · hay que medirlo con datos reales |
| B-017 | Importar Norma 43 / OFX / QIF | añadir | directa | alto | código 09/10 |
| B-018 | Gastos en otra divisa | añadir | con permiso | alto | código 09/10 · campo nuevo |
| B-059 | Calculadora de independencia financiera, con pensión pública a mano | añadir | con permiso | alto | ideas 09/10 nº 19 · pantalla nueva; los supuestos los elige el usuario |
| B-060 | Escenarios de la previsión («qué pasaría si…») | añadir | con permiso | alto | ideas 09/10 nº 20 · cambia cómo se calcula `prevision` · filtro 12/10: parece hecha (`escenariosPrevision` en `calculos_saldos.js:339`, `tarjetaEscenarios` en `inicio.js:449`); que el orquestador lo confirme |
| B-061 | Deshacer una importación entera (lote) | añadir | con permiso | alto | ideas 09/10 nº 21 · campo nuevo y borrado en bloque |
| B-062 | Foto fija del cierre de mes | añadir | con permiso | alto | ideas 09/10 nº 22 · campos nuevos; agrupar con B-061 |
| B-063 | Gastos a medias / dinero que te deben | añadir | con permiso | alto | ideas 09/10 nº 23 · cambia el gasto neto |
| B-064 | Etiquetas libres en movimientos | añadir | con permiso | alto | ideas 09/10 nº 24 · campo nuevo; se solapa con categorías |
| B-067 | Movimientos futuros puntuales en la previsión | añadir | con permiso | alto | ideas 09/10 nº 27 · ver antes qué cubren los recurrentes con `hasta` |
| B-068 | Filtros o informes guardados | añadir | directa | alto | ideas 09/10 nº 28 · baja prioridad |

## Sin comprobar (venían de antes; mirar si están hechas antes de encargarlas)

| Id | Qué | Tipo | Origen |
|---|---|---|---|

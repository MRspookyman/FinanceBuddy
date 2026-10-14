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
| B-106 | Una aportación fija que llega unos días antes de su fecha (29/08 para el 05/09) se cuenta como del mes anterior y deja la automática de septiembre: avisa «no ha llegado» aunque llegó; enlazar `aportaciones()`/`vinculadas` (`datos.js:322`) por cercanía con margen de 7 días, quitando también la automática | cifra | con permiso | medio | revisor B-099 14/10 · cambia lo invertido y la previsión de ese mes · aviso y enlace tienen que cambiar a la vez |
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
| B-067 | Movimientos futuros puntuales en la previsión | añadir | con permiso | alto | ideas 09/10 nº 27 · ver antes qué cubren los recurrentes con `hasta` |
| B-068 | Filtros o informes guardados | añadir | directa | alto | ideas 09/10 nº 28 · baja prioridad |

## Sin comprobar (venían de antes; mirar si están hechas antes de encargarlas)

| Id | Qué | Tipo | Origen |
|---|---|---|---|

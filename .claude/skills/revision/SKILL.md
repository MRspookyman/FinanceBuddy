---
name: revision
description: Orquesta la mejora continua de FinanceBuddy con agentes especializados (producto, interfaz, cifras, código, filtro, implementador y revisor) y un backlog común. Úsalo cuando el usuario pida revisar, auditar, mejorar, buscar ideas o funciones nuevas, comparar con otras apps, revisar accesibilidad, diseño o cálculos, pulir una pantalla, explorar un área, ordenar el backlog, seguir con lo pendiente o implementar mejoras del proyecto, con o sin la palabra «revisión».
---

Eres el **orquestador**. Tú no auditas ni programas: decides qué agentes llamar y con qué encargo, mantienes el backlog y resumes. Trabajas por **rondas cortas**: descubrir → filtrar → implementar de una en una → revisar → apuntar.

**Primero lo que no gasta.** El backlog, las pruebas y el repaso de un cambio tienen script (`.claude/herramientas/`): úsalos antes de llamar a un agente, y no llames a ninguno para algo que un script contesta.

| Agente | Para qué | Modelo |
|---|---|---|
| `fb-producto` | usa la app por tareas: qué falta, qué sobra, qué paso estorba (y, si se pide, otras apps) | sonnet |
| `fb-interfaz` | diseño, usabilidad y accesibilidad con la app en marcha | sonnet |
| `fb-cifras` | que los números y los avisos digan la verdad | opus |
| `fb-codigo` | fallos, pérdida de datos, seguridad, lógica sin prueba | sonnet |
| `fb-filtro` | decide qué entra de unos informes, actualiza el backlog, propone la ronda | sonnet |
| `fb-implementador` | único que toca el código de la app; una tarea por encargo | opus, o sonnet según `fb-tarea` |
| `fb-revisor` | prueba cada cambio antes de darlo por bueno | sonnet, u opus según `chequeo_diff.py` |

| Script (`python .claude\herramientas\…`) | Para qué |
|---|---|
| `backlog.py resumen · buscar · ronda · siguiente · en-curso · hecha · descartar · comprobar` | el backlog sin leerlo entero |
| `tandas.py [--actualizar]` | las tres tandas a la vez, en 4 líneas |
| `chequeo_diff.py --archivos=…` | las trampas de `CLAUDE.md` en un cambio, y qué modelo merece el revisor |
| `contraste.py --vars` | el contraste de todos los colores, medido |

Lo vivo está en `.claude/backlog.md`; lo cerrado, en `.claude/backlog-archivo.md` (se busca, no se lee). Los informes van a `.claude/informes/AAAA-MM-DD-<tema>.md`.

## 0. Antes de nada
- `backlog.py resumen`. Si hay algo **en curso**, es lo primero: di qué es y termínalo (o pregunta si se abandona) antes de abrir nada nuevo.
- `git status --short`: si hay cambios sin commit de una ronda anterior, dilo; el revisor tendrá que separar lo suyo.

## 1. Qué hacer según lo que pida el usuario
| Pide | Qué se lanza |
|---|---|
| «Sigue», «siguiente ronda», «implementa lo pendiente» | **ningún agente de búsqueda ni filtro**: `backlog.py ronda` y al paso 2 con esa propuesta |
| «Arregla X», «añade Y», algo concreto | skill `fb-tarea` directamente (si es una cifra que le parece mal y no está claro por qué, antes `fb-cifras` con ese alcance) |
| «Qué mejorarías», «revísalo todo», «itera» | `fb-producto` + `fb-interfaz` + `fb-cifras` en paralelo (una respuesta con tres llamadas Agent); `fb-codigo` solo si hace más de un par de rondas que no pasa o se han tocado importación, servidor o datos |
| Funciones nuevas, ideas, «qué le falta», **«explora <área>»** | `fb-producto` con esa área (inversión, presupuesto, importación, cierre, renta…). Con «otras apps» o «la competencia», que compare (tope: 6 búsquedas, 4 páginas) |
| **«Pule <pantalla>»**, diseño, accesibilidad | `fb-interfaz` con esa pantalla como alcance y **como mucho 6 carencias**. Si todas vienen comprobadas (captura, guion o medida) y son `directa`, sáltate el filtro: apúntalas tú y pasa al paso 3 |
| **«Audita las cifras»** (o una cifra concreta) | `fb-cifras` con ese alcance |
| **«Audita la seguridad»**, fallos, robustez | `fb-codigo` con alcance «seguridad» o el que diga |
| **«Ordena el backlog»** | sin agentes: `backlog.py comprobar` y `backlog.py archivar`; las entradas «sin comprobar», míralas tú con Grep (¿ya está hecho?) y ciérralas con `backlog.py hecha` o `descartar` |

Dale a cada agente su ruta de salida y el alcance exacto (una pantalla, un área, una tarea o «todo»). Si la petición es ambigua, elige lo mínimo razonable y dilo. No lances agentes que la petición no necesita, y no leas tú los informes enteros: usa sus resúmenes.

## 2. Filtrar
- **Con informes nuevos**: `fb-filtro` con sus rutas. Devuelve una ronda de como mucho 5 cosas y actualiza el backlog.
- **Sin informes** («sigue»): la propuesta de `backlog.py ronda`. Léela con criterio: si una nota dice que va antes que otra («la primera de la ronda siguiente»), respétalo.

Enséñale la ronda al usuario en una tabla corta (qué, por qué ahora, riesgo) y:
- Lo **directo**: se implementa sin preguntar.
- Lo **con permiso**: una sola llamada a AskUserQuestion con todas (una pregunta por cosa, con el motivo y la opción de saltarla). Solo se hace lo que diga que sí; lo demás sigue `pendiente`.

## 3. Implementar y revisar, de una en una
Cada tarea de la ronda, por orden, con la skill **`fb-tarea`** (camino a mano o con agentes, modelos, comprobaciones automáticas, revisor y backlog). Si una tarea se queda atascada tras dos vueltas, déjala en curso y sigue con la siguiente.

Nada de commits, ramas ni PR salvo que el usuario lo pida.

## 4. Cerrar la ronda
- `backlog.py comprobar` sin errores; hechas, en curso (con lo que falta) y lo nuevo descartado, al día.
- Responde en español, directo y corto:
  - **Hecho**: cada cosa con sus archivos y **cómo comprobarlo él** en la app.
  - **Pruebas**: la salida de `tandas.py`.
  - **Descartado y por qué.**
  - **Queda**: lo que está a medias y las 2-3 cosas que irían en la siguiente ronda (`backlog.py ronda`).
  - **Gasto**: qué agentes y con qué modelo, y qué se hizo a mano o con scripts.
  - Lo que falló o no se pudo comprobar, tal cual.
- Si el usuario dijo «itera» o «sigue hasta que yo diga», empieza otra ronda desde el paso 2 con `backlog.py ronda` (y vuelve a descubrir cada tres rondas, o cuando no quede nada directo que merezca la pena). Para cuando la ronda salga vacía, cuando una tarea quede atascada dos veces o cuando haya algo «con permiso» sin contestar.

## Lo que diga el usuario al usar la app
Cualquier comentario suyo sobre algo que no entiende, le sobra o le parece mal es la mejor fuente que hay: entra en el backlog con origen `usuario` y va por delante de lo que propongan los agentes.

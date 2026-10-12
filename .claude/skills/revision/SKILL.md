---
name: revision
description: Orquesta la mejora continua de FinanceBuddy con agentes especializados (producto, interfaz, cifras, código, filtro, implementador y revisor) y un backlog común. Úsalo cuando el usuario pida revisar, auditar, mejorar, buscar ideas o funciones nuevas, comparar con otras apps, revisar accesibilidad, diseño o cálculos, seguir con lo pendiente o implementar mejoras del proyecto, con o sin la palabra «revisión».
---

Eres el **orquestador**. Tú no auditas ni programas: decides qué agentes llamar y con qué encargo, mantienes el backlog y resumes. Trabajas por **rondas cortas**: descubrir → filtrar → implementar de una en una → revisar → apuntar.

| Agente | Para qué | Modelo |
|---|---|---|
| `fb-producto` | usa la app por tareas: qué falta, qué sobra, qué paso estorba (y, si se pide, otras apps) | sonnet |
| `fb-interfaz` | diseño, usabilidad y accesibilidad con la app en marcha | sonnet |
| `fb-cifras` | que los números y los avisos digan la verdad | opus |
| `fb-codigo` | fallos, pérdida de datos, seguridad, lógica sin prueba | sonnet |
| `fb-filtro` | decide qué entra, actualiza el backlog, propone la ronda | opus |
| `fb-implementador` | único que toca el código de la app; una tarea por encargo | opus |
| `fb-revisor` | prueba cada cambio antes de darlo por bueno | opus |

La memoria es **`.claude/backlog.md`**: léela siempre al empezar. Los informes van a `.claude/informes/AAAA-MM-DD-<tema>.md`.

## 0. Antes de nada
- Lee el backlog. Si hay algo `en curso`, es lo primero: di qué es y termínalo (o pregunta si se abandona) antes de abrir nada nuevo.
- `git status --short`: si hay cambios sin commit de una ronda anterior, dilo; el revisor tendrá que separar lo suyo.

## 1. Qué descubrir (según lo que pida el usuario)
- «Sigue», «siguiente ronda», «implementa lo pendiente»: **no descubras nada**. Pasa al filtro solo con el backlog (paso 2).
- «Qué mejorarías», «revísalo todo», «itera»: `fb-producto` + `fb-interfaz` + `fb-cifras` en paralelo (una respuesta con tres llamadas Agent). `fb-codigo` solo si hace más de un par de rondas que no pasa o se han tocado importación, servidor o datos.
- Funciones nuevas, ideas, «qué le falta»: `fb-producto`. Con «otras apps» o «la competencia», dile que compare (y recuérdale su tope: 6 búsquedas, 4 páginas).
- Diseño, usabilidad, accesibilidad: `fb-interfaz`.
- «¿Está bien este número/aviso?», cálculos: `fb-cifras`.
- Fallos, seguridad, robustez: `fb-codigo`.
- **Algo concreto que dice el usuario** («arregla X», «añade Y», «esto está mal»): apúntalo en el backlog con origen `usuario` y ve directo al paso 3. Si es una cifra que le parece mal y no está claro por qué, antes `fb-cifras` con ese alcance.

Dale a cada agente su ruta de salida y el alcance exacto (una pantalla, una tarea o «todo»). Si la petición es ambigua, elige lo mínimo razonable y dilo. No lances agentes que la petición no necesita, y no leas tú los informes enteros: usa sus resúmenes.

## 2. Filtrar
Llama a `fb-filtro` con las rutas de los informes (o ninguna, si solo se sigue con el backlog). Devuelve una **ronda de como mucho 5 cosas** y actualiza el backlog.

Enséñale la ronda al usuario en una tabla corta (qué, por qué ahora, riesgo) y:
- Lo **directo**: se implementa sin preguntar.
- Lo **con permiso**: una sola llamada a AskUserQuestion con todas (una pregunta por cosa, con el motivo y la opción de saltarla). Solo se hace lo que diga que sí; lo demás sigue `pendiente`.

## 3. Implementar y revisar, de una en una
Para cada tarea de la ronda, por orden:
1. Márcala `en curso` en el backlog.
2. `fb-implementador` con **esa sola tarea**: qué hay que hacer, archivos probables, qué se pliega a cambio si añade algo a una pantalla, y cómo se va a comprobar.
3. `fb-revisor` con el encargo original y el resumen del implementador.
   - **Pasa** → márcala `hecha` (con la fecha) y sigue con la siguiente.
   - **Vuelve** → otra vez al `fb-implementador` con los puntos del revisor, y de nuevo al revisor. **Dos vueltas como mucho**: a la tercera, déjala `en curso` con lo que falta apuntado y sigue.
   - **Para** → pregunta al usuario antes de continuar.
4. Si el implementador se detiene porque la tarea resultó ser «con permiso», pregunta antes de reintentar.

Nada de commits, ramas ni PR salvo que el usuario lo pida.

## 4. Cerrar la ronda
- Deja el backlog al día: hechas, en curso (con lo que falta) y lo nuevo descartado.
- Responde en español, directo y corto:
  - **Hecho**: cada cosa con sus archivos y **cómo comprobarlo él** en la app.
  - **Pruebas**: las tres tandas con cifras (las del revisor).
  - **Descartado y por qué.**
  - **Queda**: lo que está a medias y las 2-3 cosas que irían en la siguiente ronda.
  - Lo que falló o no se pudo comprobar, tal cual.
- Si el usuario dijo «itera» o «sigue hasta que yo diga», empieza otra ronda desde el paso 2 (y vuelve a descubrir cada tres rondas, o cuando en el backlog no quede nada directo que merezca la pena). Para cuando el filtro no proponga nada, cuando una tarea quede atascada dos veces o cuando haya algo «con permiso» sin contestar.

## Lo que diga el usuario al usar la app
Cualquier comentario suyo sobre algo que no entiende, le sobra o le parece mal es la mejor fuente que hay: entra en el backlog con origen `usuario` y va por delante de lo que propongan los agentes.

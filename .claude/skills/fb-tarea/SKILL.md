---
name: fb-tarea
description: Lleva UNA tarea concreta de FinanceBuddy de principio a fin (implementar → comprobaciones automáticas → revisor → backlog) eligiendo el camino y el modelo más baratos que no empeoren el resultado. Úsalo cuando el usuario pida un cambio concreto en la app («arregla X», «añade Y», «cambia Z», «haz la B-076») y desde la skill revision para cada tarea de una ronda.
---

Eres el **orquestador de una tarea**. Lo que se puede decidir con una regla o un script no se le pregunta a un modelo.

## 0. Antes
- `python .claude\herramientas\backlog.py resumen`: si hay algo **en curso** que no es esta tarea, dilo antes de empezar otra.
- Si la tarea no está en el backlog y va a pasar por agentes, apúntala en «Pendiente» de `.claude/backlog.md` con el id de `backlog.py siguiente`, origen `usuario`, y su tipo, riesgo y esfuerzo. Si está en el backlog (o la acabas de apuntar), `backlog.py en-curso B-nnn`; al acabar bien, `backlog.py hecha B-nnn "<nota>"`, vaya por el camino que vaya.
- Si es **«con permiso»** (formato de datos, borrar o transformar datos, internet o dependencia, seguridad del servidor, cambiar lo que significa una cifra que ya se ve, quitar algo), pregunta antes con AskUserQuestion. Sin un sí, no se hace.

## 1. ¿Hace falta un agente?
**A mano, sin agentes**, si se cumple todo esto: un solo archivo de `financebuddy/`, unas 30 líneas como mucho, no es de tipo `cifra`, no toca los archivos delicados (`calculos*.js`, `datos.js`, `renta.js`, `importar.py`, `almacen.py`, `modelo.py`, `cartera.py`, `operaciones.py`, `bizums.py`, `clasificar.py`, `lectura.py`, `detectar.py`, `servidor.py`, `secreto.py`) y sabes ya qué cambiar. Entonces:
1. Haz el cambio y su prueba, siguiendo las reglas de `fb-implementador` (`.claude/agents/fb-implementador.md`, sección «Lo que la interfaz tiene que cumplir»).
2. `python .claude\herramientas\tandas.py --actualizar` y `python .claude\herramientas\chequeo_diff.py --archivos=<el archivo>`.
3. Si `chequeo_diff.py` recomienda **opus** o da algún ⛔ que no sepas resolver, pasa al camino con agentes desde el paso 3. Si no, no hace falta revisor.
4. Si toca la interfaz, una captura (skill `fb-probar`) y míratela.

Todo lo demás, **con agentes** (paso 2).

## 2. Implementar
`fb-implementador` con **esa sola tarea**: qué hay que hacer, archivos probables, qué se pliega a cambio si añade algo a una pantalla, y cómo se va a comprobar.

**Modelo** (parámetro `model` del Agent):
- `sonnet` si el tipo es `accesibilidad`, `mejorar` o `quitar`, el esfuerzo es `bajo` y los archivos probables no son delicados (lista del paso 1).
- `opus` (el de serie) en todo lo demás: `cifra`, `fallo` de datos, esfuerzo medio o alto, o archivos delicados.

## 3. Comprobaciones automáticas (sin agente)
Cuando vuelva el implementador:
```
python .claude\herramientas\chequeo_diff.py --archivos=<los que nombra>
```
- Si su resumen no trae «todo en verde» de `tandas.py`, o hay un ⛔: **de vuelta al implementador** con esas líneas, sin pasar por el revisor (cuenta como una vuelta).
- Si no, el chequeo dice qué modelo merece el revisor.

## 4. Revisar
`fb-revisor` con el encargo original, el resumen del implementador y la salida de `chequeo_diff.py`. **Modelo**: el que recomiende `chequeo_diff.py` (sonnet de serie; opus si toca cifras, datos o el servidor, o si hay ⛔).
- **Pasa** → `backlog.py hecha B-nnn "revisor: pasa · <cómo comprobarlo, en una línea> · sin commit"`.
- **Vuelve** → al implementador con los puntos del revisor, y de nuevo al revisor. Si el implementador iba con sonnet, la segunda vez va con **opus**. **Dos vueltas como mucho**: a la tercera, déjala en curso con lo que falta apuntado en su nota.
- **Para** → pregunta al usuario antes de seguir.

Nada de commits, ramas ni PR salvo que el usuario lo pida.

## 5. Contar
En español, directo y corto: qué se hizo (archivos), **cómo comprobarlo él** en la app, las cifras de `tandas.py`, el camino y los modelos usados («a mano», o «implementador sonnet → revisor sonnet»), y lo que no se pudo comprobar, tal cual.

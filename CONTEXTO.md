# FinanceBuddy · contexto del proyecto (para recuperarlo todo desde aquí)

> **Para qué sirve este archivo.** Si se pierde el hilo de una conversación con Claude (o entra una persona nueva), aquí está
> todo lo necesario para retomar el trabajo sin preguntar: qué es la app, las reglas que no se rompen, cómo está hecha, qué
> se ha hecho y por qué, qué auditorías se han pasado, qué está probado y qué no, y qué queda pendiente.
> Complementa a `README.md` (para quien usa la app) y a `.claude/skills/financebuddy-dev/SKILL.md` (referencia técnica
> detallada de cada módulo). **Si cambias algo importante, actualiza este archivo en el mismo commit.**
>
> Última actualización: 1 oct 2026 · rama `claude/intelligent-cerf-wuzuc9` · versión de la app `1.0.0` · plantilla de datos `v3`.

---

## 0. Resumen en 60 segundos

- **Qué es:** app de finanzas personales **100 % local para Windows** (un `.exe` que levanta un servidor en
  `127.0.0.1:8765` y se abre en el navegador). Importas extractos del banco y del bróker (Excel/CSV) y te dice cuánto puedes
  gastar, a dónde va tu dinero, cuánto tienes y cómo va tu inversión. Todo en **español** y en **euros**.
- **Pila:** Python (solo biblioteca estándar + `openpyxl`/`xlrd`) · SQLite · interfaz web en JavaScript sin framework ni
  compilación · tests con `unittest` y un navegador sin ventana.
- **Usuario tipo:** una persona (no técnica) con Santander (banco) y MyInvestor (bróker), que usa mucho **Bizum** (envía su
  parte de cenas/copas y recibe lo que le devuelven de lo que paga ella), invierte en un fondo indexado a S&P 500 y en
  ETC de cripto/cobre/oro, y quiere mínimo trabajo manual.
- **Estado:** PRs #1–#9 fusionadas en `main`. Trabajo posterior (**Bizums + más contexto para Jev + este documento**) está
  commiteado y subido a la rama `claude/intelligent-cerf-wuzuc9`, **sin PR todavía** (commit `e5f5272` y siguientes).
- **Último gran tema:** el asistente opcional **Jev** (TypeSafe AI) y la lógica de **Bizums**. Jev **no se ha probado nunca
  contra la API real** (el entorno de desarrollo bloquea `api.typesafe.ai`); todo se verificó con un servidor Jev falso.
- **Tests:** 75 de Python (`unittest`), 45 de cálculos y 16 pantallas sin errores en navegador. Siempre en verde al
  cerrar cada tarea.

---

## 1. Reglas que no se rompen (leer antes de tocar nada)

### Producto
1. **Todo local.** Nada de nube, cuentas ni conexión con el banco. La única salida a internet es el asistente Jev, que es
   **opcional**, lo activa el usuario con su clave y solo envía conceptos saneados (ver §7). «La idea de la app es que sea
   local en cada ordenador.»
2. **La app debe funcionar sin Claude ni Jev.** Cualquier acción tiene su pantalla; Jev solo *sugiere* y nunca guarda nada
   por su cuenta.
3. **Español claro, sin jerga**, importes en €, formato español (`1.234,56 €`). Lo esencial a la vista y lo demás en
   secciones plegables (`plegable()`), explicaciones con `ayuda()` (ⓘ).
4. **Colores con significado:** el gasto en **coral** en toda la app («Salió»), verde/rojo solo para ganancia/pérdida y
   estado, el rosa significa «algo va mal» (por eso no se usa para categorías neutras). Variables `--fin-*` y tokens de
   `estilos.css`.
5. **Accesibilidad:** cada campo con nombre, foco visible con teclado, contraste ≥ 4,5:1 en textos secundarios.

### Datos y seguridad
6. **Nunca subir datos del usuario al repositorio** (`.gitignore` excluye `*.db`, `Importar/`, `Copias/`, `*.xlsx`,
   `*.xls`, `*.csv`). Los extractos reales del usuario solo se han usado en carpetas temporales ya borradas. Las pruebas
   usan datos **inventados** con el mismo formato.
7. **La clave de Jev nunca va en el código, los tests, los commits ni el texto de una PR.** Vive solo en `config.jev` de la
   base local (o en la variable `TYPESAFE_API_KEY`). La página nunca la recibe (solo sus 4 últimas cifras). El usuario la
   pegó en el chat durante el desarrollo: se le recomendó **rotarla** en TypeSafe.
8. El servidor solo escucha en `127.0.0.1`, rechaza cualquier cabecera `Host` que no sea local y exige un token por arranque
   (`X-FB-Token`).
9. **Privacidad hacia Jev:** solo sale el concepto saneado + importe + contexto del historial (sin nombres). Ver §7.

### Cómo trabaja Claude en este repo
10. Se desarrolla en la rama **`claude/intelligent-cerf-wuzuc9`** (nombre fijo). Tras fusionar una PR, la rama se reinicia
    desde `main` (`git fetch origin main && git checkout -B claude/intelligent-cerf-wuzuc9 origin/main`) y se sube con
    `git push --force-with-lease=<rama>:<sha remoto>` (la remota solo tenía historia ya fusionada).
11. **No se abre PR salvo que el usuario lo pida.** El flujo habitual: Claude termina, sube la rama, resume y pregunta
    «¿la fusiono?»; el usuario responde «fusiona» y entonces se abre/fusiona la PR con las herramientas MCP de GitHub
    (no hay `gh` en el entorno).
12. Commits y PRs terminan con las líneas de atribución que dicte el sistema (`Co-Authored-By` y `Claude-Session`; las PR,
    `🤖 Generated with [Claude Code]…` + enlace de sesión).
13. Remoto: el repo se llama ahora `MRspookyman/FinanceBuddy` (antes `financebuddy`); el push funciona igual con la URL
    antigua, pero conviene actualizar el remoto.
14. Nota de entorno: la sesión de Claude Code arranca en otro repo (`/home/user/PideYa`, que tiene su propio `CLAUDE.md` y
    **no tiene relación** con FinanceBuddy). FinanceBuddy está en `/home/user/financebuddy`.

---

## 2. Arquitectura en una página

Detalle módulo a módulo: **`.claude/skills/financebuddy-dev/SKILL.md`**. Aquí, el mapa mental.

```
 navegador ──GET /api/datos──▶ servidor.py ──▶ almacen.py ──▶ SQLite (datos.db)
     │  ▲                         │  App.manejar(ruta, datos) = toda la escritura (POST /api/…)
     │  └── JSON: registros por tipo, pendientes (con sugerencias), config, info
     └── paneles/*.js (se concatenan y comparten ámbito): datos → calculos → componentes → graficos → inicio → inversion → formularios → pantallas
```

| Capa | Archivos | Idea clave |
|---|---|---|
| Arranque | `__main__.py`, `rutas.py`, `lanzar.py` | `--datos`, `--puerto`, `--ejemplo`, `--hoy AAAA-MM-DD`, `--pruebas`, `--sin-navegador`. Si el puerto está ocupado por otra FinanceBuddy, solo abre el navegador. |
| API | `servidor.py` | `GET /api/datos` devuelve todo; `App.manejar()` atiende cada `POST /api/…` (lista en §2.3). `App.datos()` además calcula las **sugerencias** de cada duda. |
| Datos | `almacen.py`, `modelo.py` | Tabla `registros(id, tipo, datos JSON)` + `config(clave, valor JSON)`. `modelo.CAMPOS` define y valida cada tipo; `limpiar()` descarta vacíos. Copia diaria en `Copias\` (30). |
| Importación | `importar.py`, `lectura.py`, `clasificar.py`, `operaciones.py`, `cartera.py`, `detectar.py` | Formato de archivo = registro `perfil`. Duplicados por **huella** (`ext_fecha`+`ext_importe`). Dudas → `pendiente`. |
| Bizums | `bizums.py` | Casar el Bizum recibido con el gasto que devuelve (§6). |
| IA opcional | `jev.py` | Cliente de Jev + contexto + todos los usos (§7). |
| Interfaz | `web/` | `nucleo.js` (DOM, `FB.api`, menú, rutas `#pantalla/params`), `estilos.css`, `paneles/*.js`. |
| Pruebas | `pruebas/` | §8. |

### 2.1 Tipos de registro (`modelo.CAMPOS`)
`cuenta`, `categoria`, `movimiento`, `recurrente`, `activo`, `aportacion`, `patrimonio`, `objetivo`, `recordatorio`, `regla`,
`perfil`, `cierre` y los internos `pendiente`, `ignorado`, `operacion`. Para añadir un campo: `modelo.CAMPOS` **y** `FORMS` en
`web/paneles/formularios.js`. Detalles importantes:
- `movimiento.importe` es **siempre positivo**; el signo lo da `clase` (`gasto | ingreso | reembolso | transferencia`).
- `movimiento.ext_texto/ext_importe/ext_fecha` = huella de la fila del extracto de la que sale.
- `movimiento.reembolsa` = id del gasto que devuelve un reembolso (Bizums).
- `categoria.descripcion` (texto libre) ayuda a Jev; `categoria.icono/color` los usan `catIcono`/`catColor`.
- `aportacion` = compra/venta de un activo (`importe` + si es venta, negativo; `participaciones` con 6 decimales,
  `orden`, `supuesta`, `traspaso`, `ajuste`, `nota`).
- `activo`: `clase` (fondo, etf, accion, cripto, materia, otro), `patrones` (textos del extracto que lo identifican),
  `isin`, `ter`, `valor`/`fecha_valor`, `aportado_inicial`.

### 2.2 Claves de `config`
`titulares` (nombre(s) del usuario, para reconocer traspasos propios y para **no enviarlos a Jev**), `limite_variable`,
`configurado`, `plantilla_version`, `version_esquema`, `avisos_descartados`, `saldo_extracto:<cuenta>`, `acento`, `inicio`/
`inicio_ocultos` (paneles del Inicio), y las de Jev: `jev` (clave + opciones), `jev_uso` (consultas/tokens por mes),
`jev_revision` (repaso de categorías), `jev_fijos` (caché de «¿cuota fija?»), `jev_enviado` (últimas 30 consultas).

### 2.3 Rutas de la API (`App.manejar`)
`guardar`, `borrar`, `config`, `titulares`, `recategorizar`, `parecidos`, `importar/carpeta|subir|reintentar`, `resolver`,
`detectar`, `fijos`, `bienvenida`, `cierre`, `valores`, `activo/unir|borrar|cuadrar`, `jev/config|probar|revisar|enviado|
categoria|auditar|hallazgo`, `config/descartar_aviso`, `carpeta`, `ejemplo`, `abrir_carpeta`, `copia`, `restaurar`, `vaciar`.

### 2.4 Trampas conocidas de la interfaz
- `FB.refrescar()` **vuelve a ejecutar los módulos** y por tanto reinicia las variables a nivel de módulo → el estado que
  debe sobrevivir (filtros, mensajes) va en **`FB.estado`** (se reinicia al cambiar de pantalla/`hashchange`).
- Un mensaje escrito en un elemento que se redibuja se pierde: guardarlo en `FB.estado` y repintar (pasó con «Probar» de Jev).
- Los `<select>` de formularios: valores siempre **cadena**; un id numérico hay que pasarlo a `String` en `cargar`.
- `all:unset` en botones quita el foco: hay que redefinir `:focus-visible`.
- Los avisos de nivel `info` de `avisos()` **no se muestran en ninguna parte** (solo los `warn` en el Inicio): para un
  aviso visible hay que ponerlo en la pantalla concreta.

### 2.5 Modelo de dinero (resumen)
Los saldos salen de proyectar el último registro de `patrimonio` con los movimientos posteriores, **cuenta a cuenta**. Un
traspaso mueve dinero a la otra cuenta solo si esa cuenta **no** importa extracto (`cuenta.extracto`). Los recurrentes
generan movimientos automáticos salvo que exista uno real enlazado ese mes. Un **reembolso** resta de la categoría del gasto
(el gasto neto). Detalle de inversión (TIR, precio medio, valor estimado «≈», traspasos entre fondos, ajustes): SKILL.md.

---

## 3. Importación y clasificación (cómo se decide cada movimiento)

Orden en `clasificar.clasificar_fila` (primero que casa, gana):
1. **Reglas** (`regla`): las del usuario mandan; 222 de serie (plantilla) están a un clic en Ajustes.
2. **Dinero a tu nombre** (titular) → traspaso.
3. Traspasos entre cuentas propias por el texto.
4. **Bizum enviado** → categoría por palabras del concepto (`KW_BIZUM`), o por historial (≥ 2 veces).
5. **Bizum recibido** → reembolso del gasto casado (§6) o por palabras; si no, duda.
6. Devolución de una compra.
7. **Historial** (`memoria/por_memoria`): si ya clasificaste ese comercio (≥ 75 % la misma categoría) se clasifica solo.
8. Si nada decide → `duda` → registro `pendiente` («Por revisar»).

Piezas relacionadas:
- **Cabecera del extracto:** IBAN (4 últimas cifras → elige la cuenta sola) y titular (→ `config.titulares`).
- **`emparejar_traspasos()`:** salida en una cuenta + entrada en otra (mismo importe, ±3 días) aunque vengan en extractos
  distintos → traspaso y se descarta la del bróker.
- **Apuntes a mano** se enlazan con el extracto (mismo importe, ±3 días) y no se duplican.
- **Bróker:** compras por `activo.patrones`; intereses/ignorar por `perfil.acciones`; dudas con `sugerencia_inversion()`.
- **Órdenes y operaciones** (`operaciones.py`): CSV de órdenes de fondos de MyInvestor (ISIN, importe, participaciones) y
  Excel de operaciones con títulos; traspasos entre fondos detectados por importe/fechas; nunca duplican el extracto.
- **Plantilla versionada** (`plantilla.VERSION = 3`): al subirla, las instalaciones existentes reciben las categorías y
  reglas nuevas sin tocar lo del usuario. Cambiaste categorías/reglas/perfiles → **sube `VERSION`**.
- **Formatos de serie:** Santander, cuenta de efectivo de MyInvestor, órdenes MyInvestor, operaciones del bróker (títulos).
  Cualquier otro banco: la primera vez se mapean columnas (Jev puede proponerlas).

---

## 4. Pantallas (menú) y qué hay en cada una

| Ruta | Pantalla | Notas |
|---|---|---|
| `#inicio` | Inicio minimalista | Selector de mes; «Puedes gastar» + barra + frase de estado; Ritmo del mes; A dónde va tu dinero; Patrimonio; Próximos cargos (14 días). Paneles configurables (`PANELES_INICIO`). |
| `#movimientos` (+`/categorias`) | Movimientos | Lista por día con búsqueda y filtros; «Por categoría» frente a tu media. En los gastos con Bizums enlazados: «te devolvieron X». |
| `#inversion`, `#activo/ID` | Inversión y ficha de activo | Cifras, evolución, aportaciones, reparto; «Revisa tu inversión»; ficha con operaciones editables, **Cuadrar con el bróker**, **Unir**, borrar. |
| `#importar` | Importar | Arrastrar archivos o carpeta `Importar\`; formato nuevo → mapeo de columnas. |
| `#revisar` | Por revisar | Dudas agrupadas por comercio (o por **reparto** de Bizums); filtros; aceptar sugerencias en bloque; selector de gastos candidatos para Bizums recibidos. |
| `#revision` | Revisar tus categorías (Jev) | Hallazgos del repaso: Cambiar / Está bien / Otra categoría. |
| `#apuntar` | Apuntar | Alta a mano; propone categoría al escribir el concepto. |
| `#fijos` | Fijos y de dónde viene tu dinero | Detección de recurrentes; Jev dice si una «variable» parece cuota. |
| `#cerrar`, `#valores` | Actualizar saldos / valores | Cierre mensual: comprueba que no falta nada. |
| `#ajustes` (+`/jev`, `/inicio`) | Ajustes | Tú, apariencia, Jev, Tu inicio, Tus datos (cuentas, categorías, reglas…), copias, carpeta. |
| `#gestionar/<tipo>`, `#editar/<tipo>/<id|nuevo>` | Listas y formularios genéricos | Basados en `FORMS`. En la ficha de un movimiento: paneles de reembolsos y campo «Devuelve parte de este gasto». |
| `#bienvenida` | Primer uso | Cuentas, límite, fijos, o «Probar con datos de ejemplo». |

Diseño visual: estilo **«papel»** (cálido y editorial): fondo de papel, tarjetas crema, tinta marrón, acento salvia, títulos y
cifras con serifa **Fraunces** (incluida en `web/fuentes`, OFL, la app sigue sin conexión). Tema claro/oscuro/automático (se
guarda en `localStorage`) y 7 acentos. Móvil: barra inferior con seis secciones.

---

## 5. Pruebas y cómo verificar (siempre tras un cambio)

```bat
python -m unittest pruebas.test_importar pruebas.test_servidor pruebas.test_jev   :: 75 pruebas (sin red)
python pruebas\run.py --tests                                        :: 16 pantallas sin errores + 45 pruebas de cálculos
python pruebas\run.py inicio,movimientos --shot [--tema=oscuro]      :: capturas en %TEMP%\fb-pruebas
python pruebas\evaluar_jev.py [--mostrar]                            :: precisión de Jev con TUS datos (lo ejecuta el usuario)
build.bat                                                            :: pasa pruebas y genera dist\FinanceBuddy.exe
```

- `test_importar.py` (50): importación, clasificación, traspasos, bróker, órdenes, fijos, reglas, y `TestBizums`.
- `test_servidor.py` (9): API y seguridad. `test_jev.py` (16): Jev contra un **servidor falso** (`JevFalso`) con el mismo formato
  que la API, apuntado con `FB_JEV_URL`; comprueban privacidad, errores 401/sin conexión, sugerencias, repaso, bróker,
  fijos, contexto, repartos y registro de lo enviado.
- `pruebas_calculos.js`: cálculos del navegador (recibe `F` = `window.__fin`). Al tocar un cálculo, añade un caso.
- Si cambias `ejemplo.py` (datos inventados; «hoy» = 30/09/2026), revisa las cifras esperadas.

### Para Claude en el entorno Linux de desarrollo
- Navegador: `FB_NAVEGADOR=/opt/pw-browsers/chromium-1194/chrome-linux/chrome python pruebas/run.py --tests`
  (otro puerto si está ocupado: `--puerto=8795`). Playwright para recorridos a mano:
  `require("/opt/node22/lib/node_modules/playwright")` con ese mismo `executablePath` y `args: ["--no-sandbox"]`.
- **Importar mueve el archivo** a `Importar/Procesados/…`: para repetir una prueba, importa una **copia**.
- Servidores en segundo plano: `pgrep/pkill -f` casa con su propio comando (código 144); usa
  `ps aux | grep "[p]uerto NNNN"` y mata por PID, en comandos separados.
- Un servidor con la carpeta de datos borrada hay que reiniciarlo en otro puerto.
- **Jev real no se puede llamar desde el entorno** (política de red: `api.typesafe.ai` → 403). Para probarlo habría que
  permitir ese dominio en *Network access* del entorno. Mientras tanto: servidor falso `pruebas/test_jev.py::JevFalso`.

---

## 6. Bizums (lógica local, sin IA)

**Modelo mental del usuario:** *enviado* = «debo mi parte de algo que pagó otro» → es **gasto suyo** en la categoría del
concepto. *Recibido* = «yo pagué algo y me devuelven su parte» → es un **reembolso** del gasto original (resta de su
categoría), no un ingreso.

`bizums.py`:
- `candidatos(imp, fecha, gastos, recibidos, fijas)`: gastos de los últimos 10 días (`VENTANA`) que cubren el Bizum, no
  fijos, no de `NO_COMPARTIDAS`, con categoría conocida. Marca `k` si `gasto ÷ k ≈ importe` (tolerancia `max(0,06, 2 %)`),
  probando todos los tamaños de reparto entre «Bizums iguales el mismo día» (`n0`) y «±1 día» (`n1`) + 2.
- `casar()`: reparto exacto hasta 10 días atrás; si no, el gasto del día o el anterior más grande que lo cubre.
- `propagar(filas)`: los Bizums iguales del mismo día heredan la categoría del que ya la tiene (p. ej. uno dice «comida»).
- `previos(alm, desde, hasta)`: gastos y Bizums ya guardados fuera de las fechas del archivo (otro extracto).
- `repartos(pendientes)` / `detalle_candidatos()`: agrupa dudas de un reparto y prepara los candidatos con detalle para la
  pantalla (fecha, importe, categoría, días, `k`, ya devuelto).
- `enlazar(alm)`: pone `movimiento.reembolsa` = id del gasto (misma categoría, sin devolver más de lo que costó). Se llama
  al abrir la app, tras importar y tras resolver.

Interfaz: en **Por revisar**, varios Bizums recibidos iguales el mismo día son **un solo grupo «Reparto»** (sin «recordar»
por persona, que carece de sentido); cada Bizum recibido ofrece los gastos candidatos como botones con todo el detalle
(fecha, comercio, importe, categoría, «x N = total ✓ cuadra», cuánto te han devuelto, tu parte real, texto del banco);
elegir uno guarda el reembolso con esa categoría y lo enlaza (`resolver` acepta `reembolsa`). Resultado medido con un
extracto real: de 40 Bizums recibidos clasificados, **32 quedaron enlazados** (antes 0), y las dudas de Bizum bajaron de 20 a 14
(solo 5 recibidos sin explicación posible; el resto, enviados que ayuda a clasificar Jev).

**No se hizo (y por qué):** libro de saldos por persona tipo Splitwise (con solo datos del banco no se sabe quién debía al
principio); un Bizum cuyo gasto no está en la cuenta (efectivo, otra tarjeta/banco) sigue pidiendo categoría.

---

## 7. Asistente Jev (`jev.py`)

**Qué es Jev:** modelo de TypeSafe AI que **elige entre opciones de una lista cerrada y devuelve su confianza** (no escribe
texto). 70–500 ms, 0,042 $ por millón de tokens de entrada (la salida es gratis). Solo en la nube (EE. UU.); no entrena con
los datos pero no hay plazo de borrado fijo para particulares. Inglés mejor que español (3–6 puntos menos, sin medir).

**API:** `POST https://api.typesafe.ai/v1/systemone`, cabecera `Authorization: Bearer <clave>`:
```json
{"model":"jev-latest","state":"<contexto>","questions":{"<nombre>":{"type":"choice","instructions":"…","criteria":{"<opción>":"<descripción>"}}}}
→ {"model":"jev-1.13.0","answers":{"<nombre>":{"type":"choice","choice":"…","confidence":0.93,"probabilities":{…}}},"usage":{"input_tokens":…}}
```
También `{"type":"noul"}` (sí/no con probabilidad: `{"noul":0.82}`). Reintenta una vez ante 429/5xx/red; mensajes claros para
401/402/403/429. `FB_JEV_URL` redirige a otro servidor (pruebas).

**Umbrales:** `SEGURA = 0,85` (sale marcada al aceptar en bloque), `MINIMA = 0,5` (por debajo, no propone), `MAX_GRUPOS = 80`
por importación, `HILOS = 4`. Repaso de categorías: hasta 150 comercios por vez (40 tras importar). Bizum: Jev manda sobre «como
las otras veces con esa persona» si confía ≥ 0,7.

**Qué se envía (siempre):** `saneado()` = concepto sin **nombres de personas** (Bizums y transferencias a personas; se
conservan empresas/clubs), **números de tarjeta, IBAN, correos, direcciones** («C/ Linares 4») ni el **nombre del titular**
(`config.titulares`), más sentido (entra/sale) e importe. **No** se envían saldos, cuentas ni fechas. Además, **contexto**
(`Contexto`): cómo clasificaste comercios parecidos; tus Bizums habituales por concepto; qué pasó antes con esa persona (el
nombre solo se usa localmente como clave); el hecho de que *el Bizum que envías suele ser tu parte y el que recibes la
parte que te devuelven*; y, para un Bizum recibido, tus gastos candidatos (sin fecha: «hace 3 días»). **Todo lo enviado queda en
Ajustes → Asistente Jev → «Ver lo último que se ha enviado»** (últimas 30 consultas, `config.jev_enviado`).

**Dónde se usa** (todos solo *sugieren*; lo aceptado se convierte en regla):

| Uso | Función | Pregunta |
|---|---|---|
| Por revisar (banco) | `revisar()` → `pendiente.jev` | categoría; si entra dinero: `tipo` (reembolso/ingreso) + categoría |
| Bizum recibido / reparto | `clasificar_reparto()` | `origen`: ¿de cuál de tus gastos es? (+ «ninguno») |
| Por revisar (bróker) | `revisar_broker()` + `sugerencia_broker()` | `accion` (compra/venta/intereses/dividendo/comisión/traspaso) y `clase` de activo |
| Repasar categorías | `auditar()`, `resolver_hallazgo()` | categoría por comercio; hallazgo si está en «Otros» o ≥ 85 % de otra |
| Apuntar | `sugerir_categoria()` | regla → historial → Jev |
| Fijos | `fijos()` (caché `jev_fijos`) | `noul`: ¿cuota fija o coincide? (marcado si ≥ 0,75) |
| Formato nuevo | `mapear_columnas()` | columna de cada campo + `_tipo` banco/bróker |

Las tandas pasan por `_lote()`: al primer error (red, clave, saldo) **deja de preguntar y no marca nada** (se reintenta la
próxima vez). El uso del mes (consultas, tokens, coste) se guarda en `config.jev_uso` y se ve en Ajustes.

**Descartado a propósito:** saldos, cálculos, duplicados, participaciones (aritmética exacta: un modelo solo añadiría
errores); nombres de fondos por ISIN y activos repetidos (los resuelven el catálogo `plantilla.ISIN` y «Unir»); búsqueda en
lenguaje natural (Jev no genera texto). **Alternativas locales** estudiadas y no implementadas: APUS-OpenJev-v1 4B / Tev1 con
Ollama (privacidad total, calidad en español sin probar).

**Pendiente de verificar con la API real:** medir precisión (`pruebas/evaluar_jev.py`, también compara el efecto del
contexto) y ajustar umbrales; confirmar que `choice` con ~20 opciones se comporta como en las pruebas.

---

## 8. Historial: qué se hizo, en orden (PRs y commits)

Todo el desarrollo ocurrió el **30 sep–1 oct 2026** en una sola sesión larga. PRs en `MRspookyman/FinanceBuddy`.

| PR | Contenido |
|---|---|
| (base) | `ec73b89` pantalla que se refresca sola y apuntes a mano enlazados (±3 días); `c201dd3` **la app aprende sola** (historial), Por revisar agrupado y a un clic, personalización (icono/color/presupuesto de categorías, tema, acentos, paneles del Inicio). |
| **#1** | **Fase 1** clasificar bien extractos reales (titular, IBAN, traspasos cruzados, bróker a un clic, plantilla v2); **Fase 2** pantalla de Inversión; barra inferior móvil; Fase 3 X-Ray de Morningstar (*retirada después en #7*). |
| **#2** | `build.bat` instala lo que falte y no se cierra sin enseñar el error. |
| **#3** | Diseño nuevo **«papel»** (propuesta 3 de 3 generadas con Higgsfield, con la limpieza de la 1), Fraunces, nuevo icono. |
| **#4** | `build.bat` cierra la app si está abierta y excluye numpy del `.exe`. |
| **#5** | **Inicio minimalista** con selector de mes, a partir de investigación de lo que la gente mira/le agobia en estas apps. |
| **#6** | **Auditoría de colores y gráficos:** el gasto siempre en coral; leyenda con trazos; ámbar al 85 % del límite. |
| **#7** | **Órdenes de fondos y operaciones con títulos** (`operaciones.py`, ISIN, traspasos entre fondos); **fuera el X-Ray**. |
| **#8** | **Inversión que se deja corregir** (ficha de activo, `cartera.py`, «Revisa tu inversión», valor estimado) + Por revisar con filtros y aceptar en bloque + **auditoría general** de formularios/accesibilidad/contraste/menú/móvil. |
| **#9** | **Jev** (cliente, clave local, Por revisar, formato nuevo) y **«Jev al máximo»** (bróker, repaso de categorías `#revision`, Apuntar, Fijos, uso/coste, tandas con corte). |
| *(sin PR)* | `e5f5272` **Bizums** (`bizums.py`) + **contexto para Jev** + privacidad (titulares, direcciones) + registro de lo enviado. Este archivo (`CONTEXTO.md`). |

Decisiones con «por qué» que conviene no deshacer:
- **Sin X-Ray de Morningstar:** el usuario pensó que daba más información de la que daba; solo importa los Excel/CSV que ya
  puede exportar. (Se retiró código, panel, `pypdf` y los informes guardados se borran al abrir.)
- **Traspasos entre fondos no son dinero nuevo:** dos órdenes de fondos distintos por el mismo importe (±1 %) en ≤ 6 días =
  traspaso; no cuentan en «Lo que metes cada mes» (la media bajó de 411 a 191 € con datos reales).
- **Una entrada de dinero al bróker con concepto propio («ahorro», «Inicio») es traspaso, no venta** de un activo nuevo.
- **La rentabilidad anual por activo solo con ≥ 1 año de historia** (anualizar semanas daba cifras absurdas).
- **Sin ingresos fijos no se avisa de saldo negativo** (la previsión contaba gastos sin ingresos): se propone detectar fijos.
- **Diferencias frente a la media solo si son notables** (≥ 20 € y ≥ 15 %): se acabó el «▲ 1981 %».
- **Un reparto de Bizums no se recuerda por persona.**
- **Para un Bizum, el concepto manda sobre la persona** («como las otras veces con esa persona» es pista floja).

---

## 9. Auditorías realizadas (hallazgos y resultado)

### 9.1 Auditoría con los archivos reales del usuario (antes de la Fase 1)
Entrada: Excel de Santander (226 movimientos, 3 jul–30 sep 2026), CSV de la cuenta de efectivo de MyInvestor (39 filas) y un
PDF X-Ray. Situación inicial: **92 de 226 (41 %) por revisar** en el banco; **0 compras reconocidas y 28 dudas** en el bróker.
Hallazgos, por gravedad, y su destino:

| # | Hallazgo | Resuelto en |
|---|---|---|
| 1 | «gasofa»/«gasolina» acababan en Suministros («gas» sin límite de palabra) | Fase 1 |
| 2 | Bizum recibido sin concepto asignado al gasto más grande del día (incluso una suscripción o un recibo) | Fase 1 (excluye fijos/no compartibles) y luego **bizums.py** |
| 3 | Traspasos a tu propio nombre no reconocidos | Fase 1 (titular de la cabecera) |
| 4 | Mismo traspaso en dos extractos sin cruzar | Fase 1 (`emparejar_traspasos`) |
| 5 | Aviso engañoso «saldo −3.983 € en agosto 2027» y colchón enorme sin fijos detectados | Fase 1 |
| 6 | «0 días por delante» el último día del mes | Fase 1 |
| 7 | **La inversión no aparecía** (ruta `#inversion` = Inicio) | Fase 2 |
| 8 | Faltaban reglas de serie (apuestas, pasarelas `SQ *`/`WL *`/`MGP*`, «E S», tiendas, comida) | Fase 1 (plantilla v2) |
| 9 | Dudas del bróker sin agrupar (12 Bitcoin, 3 Copper, 2 Gold) | Fase 1 (crear activo a un clic) |

Resultado de la Fase 1: dudas 92 → 69 (52 grupos), clasificados solos 134 → 156 de 226, compras del bróker todas guardadas
con un clic por activo. Estimación inicial (30–40) fue optimista: lo que queda son comercios pequeños desconocidos la
primera vez, que se aprenden después. **Propuestas de la auditoría para Ajustes** (reorganizar en secciones Tú / Cuentas y
bancos / Categorías y reglas / Inversión / Presupuesto / Apariencia y datos): **no hecho** (ver §10).

### 9.2 Estudio en profundidad de Inversión (comparando otras apps)
Motivo: el lector de ficheros puede equivocarse (p. ej. participaciones del S&P 500 mal sumadas) y hay que poder corregirlo.
Causas halladas al reproducirlo: (a) **traspasos del banco tomados por ventas** de un activo falso («Inicio», «SP500»…) con
importes negativos, (b) **«Bitcoin» (activo falso) se quedaba compras de otro producto**, (c) **participaciones redondeadas**
en el extracto (`@ 31.5` frente a 31,519 en la orden). Todo resuelto en #8. Referencias que inspiraron las funciones:
Delta/Getquin/Ghostfolio/Wealthfolio (ficha de activo con operaciones editables), Sharesight/Wealthfolio (**ajuste de
apertura** → «Cuadrar con tu bróker»), Wealthfolio Health Center (**chequeo de datos** → «Revisa tu inversión»), Portfolio
Performance (precio de la última operación como cotización), Lunch Money/Monarch/Copilot (revisión de movimientos en bloque
y con filtros), fiscalidad española de fondos (traspasos entre fondos no tributan, ETF por FIFO).

### 9.3 Auditoría de colores y gráficos (PR #6)
Gráfico de gastos en verde cuando debía ser rojo → gasto = coral en toda la app; «Límite» en gris punteado, «Tu media» a rayas
(leyenda con el trazo, comprobado para daltonismo); portada ámbar desde el 85 % del límite; barras de «Esta semana» en coral;
sectores en azul (rosa = malo). **No tocado (menores):** fila «−25 € vs tu media» más alta que las demás en «A dónde va tu
dinero»; cifras precargadas de *Actualizar saldos* con punto decimal (`1719.76`) en vez de coma.

### 9.4 Auditoría general de funcionamiento y usabilidad (PR #8)
40 pantallas en escritorio, móvil y oscuro + flujos manuales (apuntar, recategorizar, borrar, importar, teclado). Base sana.
Arreglado: desplegables de opciones fijas que arrancaban en «—»; campos sin nombre para lectores de pantalla; foco invisible
con teclado; contraste de textos secundarios de 2,7:1 a 4,6:1 (5,4:1 en oscuro); menú marcando «Ajustes» al editar un
movimiento; 222 reglas de serie desplegadas (ahora las del usuario primero); tabla de activos cortada en móvil; cifras
separadas de su `€`/`%`; textos obsoletos de la bienvenida; hueco en la rejilla de Ajustes. **Dejado a propósito:** la tabla de
operaciones de la ficha de un activo se desplaza un poco en horizontal en móvil (cuatro columnas útiles).

### 9.5 Investigación del Inicio (PR #5)
Qué mira la gente a diario: cuánto puede gastar, si va al ritmo, en qué se le va el dinero (sobre todo lo anormal), cuánto tiene.
Qué le agobia: demasiados bloques, porcentajes engañosos sobre cantidades pequeñas, mirar la inversión a menudo. Principio:
un número principal que ayude a decidir + una frase llana + detalle solo si se pide. 5 bloques; «Qué hacer con tu dinero»
fuera; «Esta semana» y «Últimos meses» ocultos de serie.

### 9.6 Auditoría de Jev y de Bizums (esta última ronda)
Preguntas del usuario: *«¿qué información se le pasa a Jev?»*, *«se usa menos de lo que se podría»*, *«lógica de Bizums»*.
Hallazgos y correcciones:
1. Jev solo recibía concepto + importe → se añadió **contexto del historial** (§7).
2. **Los Bizum pendientes nunca llegaban a Jev** porque ya tenían sugerencia por «lo de siempre con esa persona» → ahora siempre
   se preguntan.
3. **Fuga de privacidad:** el concepto libre de una transferencia podía llevar el **nombre del titular y una dirección** → se
   quitan (`titulares`, regex de direcciones).
4. Precedentes de comercios comparaban textos largos con prefijo común («TRANSFERENCIA INMEDIATA DE…») → emparejan por la
   clave de comercio de la app (`C.comercio`/`C.clave`).
5. Los Bizum recibidos solo miraban el gasto del día anterior y del mismo archivo → ventana de 10 días, otros extractos y
   aritmética de repartos (§6).
6. Hermanos de un reparto sin categoría → `propagar()`.
7. Ventana de ±1 día inflaba el nº de personas del reparto → se prueban todos los tamaños entre mismo-día y ±1 día.
Con Jev: aparte de la transparencia, se verificó que el **registro de lo enviado coincide exactamente con lo recibido** por el
servidor falso en las pruebas.

---

## 10. Pendiente y backlog (por valor aproximado)

**Inmediato**
1. **Abrir la PR** de lo subido tras #9 (Bizums + contexto Jev + este documento) cuando el usuario lo pida, y fusionarla.
2. **Probar Jev con la API real** (el usuario en su PC: Ajustes → Probar, y `python pruebas\evaluar_jev.py`; o permitir el
   dominio en el entorno) y ajustar umbrales con aciertos reales. Comparar con/sin contexto.
3. El usuario debe **rotar la clave de Jev** (se pegó en el chat).
4. Actualizar el remoto de git al nuevo nombre del repo.

**Producto**
5. **Guardar ya lo importado con la categoría sugerida** (como Copilot/Lunch Money): hoy lo dudoso no cuenta hasta revisarlo.
   Es un cambio de fondo; PR aparte.
6. **Vista «Para la renta»:** ganancias realizadas por FIFO sin contar traspasos entre fondos.
7. **Rentabilidad por periodo** (mes, año, 1 año, total) con los valores anotados.
8. **Reparto objetivo y rebalanceo:** % ideal por activo y a dónde va la próxima aportación.
9. **Dividendos** como operación propia.
10. **Fase 4 del plan original (Ajustes por secciones):** reorganizar Ajustes, **día en que empieza tu mes** (el de la
    nómina), **colchón configurable** (hoy se calcula solo), **exportar datos a Excel**, probar una regla antes de guardarla y
    aplicarla a lo ya importado, fusionar/ocultar categorías.
11. **Bitcoin:** solo 12 de 21 compras tenían títulos (las antiguas no vienen en el Excel del usuario) → sin precio medio hasta
    que añada esas fechas.
12. Menores de §9.3 y §9.4.

**Técnico**
13. Fondos desconocidos (ISIN fuera del catálogo `plantilla.ISIN`) se crean como «Fondo ‹ISIN›»: ampliar el catálogo o consultar
    una fuente.
14. Si se quiere privacidad total para el asistente: motor local (Ollama + modelo tipo Jev) como alternativa a la nube.

---

## 11. Cómo retomar (checklist para Claude o para una persona)

1. Lee este archivo, luego `README.md` (uso) y `.claude/skills/financebuddy-dev/SKILL.md` (módulos).
2. `git fetch origin && git log --oneline -15` y `git status`: ¿qué hay sin fusionar? (Estado conocido: rama
   `claude/intelligent-cerf-wuzuc9` por delante de `main` con el commit de Bizums y este documento.)
3. Instala y comprueba: `pip install -r requirements.txt -r requirements-dev.txt` y
   `python -m unittest pruebas.test_importar pruebas.test_servidor pruebas.test_jev` (deben ser **75 correctas**).
4. Arranca con datos inventados: `python -m financebuddy --ejemplo --sin-navegador --puerto 8830 --hoy 2026-09-30`.
5. Antes de cambiar nada, relee §1 (reglas): sobre todo **clave de Jev, datos reales, español sin jerga, la app funciona sin
   IA y nada de subir extractos**.
6. Para añadir cualquier cosa: modelo (`modelo.CAMPOS` + `FORMS`) → lógica (módulo de dominio) → `servidor.py` (ruta/`datos()`)
   → pantalla (`paneles/*.js`) → prueba (Python y, si hay cálculo, `pruebas_calculos.js`) → documentación (README + SKILL +
   este archivo) → `build.bat` si hay una prueba nueva que deba pasar siempre.
7. Al terminar: commit con atribución, push a la rama, resumen al usuario y «¿la fusiono?».

### Cómo suele pedir las cosas el usuario (tono y expectativas)
Habla en español, directo. Pide **auditorías** («haz una auditoría de…, mejora solo lo necesario»), **estudios en
profundidad** comparando con otras apps, y que se le diga **qué se hizo, qué se descartó y por qué**. Valora ver cifras
medidas con **sus datos reales** (en carpeta temporal) y que se le dé una forma de **comprobarlo él mismo** (scripts como
`evaluar_jev.py`). Confirma con «si», «fusiona» o «megea» (= *merge*). Le importa más la **claridad en pantalla** (nada de
jerga ni de cifras engañosas) que añadir funciones.

---

## 12. Glosario

- **Por revisar (`pendiente`)**: movimiento que la app no supo clasificar; se resuelve por grupos.
- **Huella**: `ext_fecha` + `ext_importe` de una fila del extracto; evita importarla dos veces.
- **Regla**: patrón de texto → categoría/clase (las del usuario mandan sobre las de serie); **recordar** crea una.
- **Perfil**: formato de archivo (columnas por texto de cabecera) de un banco/bróker; `acciones` = qué hacer con ciertos textos
  del bróker.
- **Traspaso (`transferencia`)**: dinero entre cuentas propias; no es gasto ni ingreso. En fondos: vender uno para comprar otro.
- **Reembolso**: dinero que te devuelven de un gasto; resta de su categoría. Con `reembolsa` apunta al gasto.
- **Reparto**: varios Bizums iguales del mismo día que devuelven un mismo gasto.
- **Candidatos**: gastos tuyos de los días anteriores que un Bizum podría estar devolviendo.
- **Sugerencia** (`✨`): propuesta de la app (`fuente`: regla/historial/jev) con su motivo y, en Jev, su confianza.
- **Hallazgo**: resultado del repaso de categorías (comercio con otra categoría según Jev).
- **Contexto**: lo que se cuenta a Jev de tu historial además del concepto.
- **Valor estimado «≈»**: valor de un activo calculado con el precio de su última operación al no haber valor anotado.
- **TIR**: rentabilidad anual del activo (solo con ≥ 1 año de historia).
- **Plantilla**: categorías, reglas y perfiles de serie, versionados (`plantilla.VERSION`).

# FinanceBuddy · contexto del proyecto (para recuperarlo todo desde aquí)

> **Para qué sirve este archivo.** Si se pierde el hilo de una conversación con Claude (o entra una persona nueva), aquí está
> todo lo necesario para retomar el trabajo sin preguntar: qué es la app, las reglas que no se rompen, cómo está hecha, qué
> se ha hecho y por qué, qué auditorías se han pasado, qué está probado y qué no, y qué queda pendiente.
>
> **Este archivo es largo (leerlo entero cuesta unos 27.000 tokens).** Para empezar una sesión basta con
> [`CLAUDE.md`](CLAUDE.md) (reglas, comandos, mapa del código y trampas); aquí se viene a buscar **una sección concreta**:
> el porqué de una decisión (§8), una auditoría (§9) o lo que queda pendiente (§10). `README.md` es para quien usa la app.
> **Si cambias algo importante, actualiza este archivo en el mismo commit.**
>
> Última actualización: 6 oct 2026 · rama `main` · versión de la app `1.1.0` · plantilla de datos `v4`.

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
- **Estado:** PRs #1–#16 fusionadas. Desde el 5 oct 2026 se trabaja **directamente en `main` en el PC del usuario** (Windows,
  Claude Code): auditoría de producto e interfaz (§9.9), interfaz «pizarra» (§9.10–9.12), Fase 4 de Ajustes, Bizums (§9.13),
  archivos grandes partidos (§9.14) y el **estudio del estado de la app con sus arreglos** (§9.15).
- **Último gran tema:** §9.15 — seguridad del servidor de archivos, arranque que explica los fallos, segunda carpeta de copias,
  aviso al borrar algo en uso, columnas de bancos nuevos reconocidas solas y flujos con clics.
- **Internet:** los precios **sí se han probado ya contra los servicios reales** desde el PC del usuario (6 oct 2026, §9.15):
  Yahoo, Morningstar, CoinGecko y Frankfurter responden. **Jev sigue sin probarse con la API real.**
- **Tests:** 175 de Python (`unittest`), 84 de cálculos, 20 pantallas sin errores y **10 flujos con clics**. Siempre en verde al
  cerrar cada tarea; `build.bat` los pasa todos.

---

## 1. Reglas que no se rompen (leer antes de tocar nada)

### Producto
1. **Todo local.** Nada de nube, cuentas ni conexión con el banco. Las **únicas salidas a internet** son tres, todas
   **opcionales y apagadas de serie**: el asistente Jev (con su clave; solo conceptos saneados, §7), los **precios por internet**
   (solo el identificador del producto: ISIN, ticker o nombre de la cripto; §9.8) y el **aviso de versión** (una consulta pública
   a GitHub al día). Sin ellas, la app no abre ninguna conexión. «La idea de la app es que sea
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
   (`X-FB-Token`). **De `/web/` solo salen archivos de la carpeta `web/`**: `servidor._dentro_de()` rechaza `..`, rutas
   absolutas y unidades (`C:\…`). Antes, una ruta absoluta servía cualquier archivo del ordenador sin token (§9.15).
9. **Privacidad hacia Jev:** solo sale el concepto saneado + importe + contexto del historial (sin nombres). Ver §7.
9b. **Privacidad en los precios:** a Yahoo/Morningstar/CoinGecko solo viaja el código del producto (la URL). Nunca importes,
    participaciones, cuentas, nombres de activos ni movimientos (hay una prueba que lo comprueba). Las series descargadas se
    guardan en `config` (`precio_serie:*`) y **no se envían a la página** (`App.datos()` las excluye).
9c. **El resumen HTML «sin importes» no contiene cantidades en euros**: se calcula en porcentajes e índice *antes* de escribir el
    archivo (taparlas con CSS no valdría). Una prueba comprueba que ninguna cifra real del ejemplo aparece en él.

### Cómo trabaja Claude en este repo
10. **Desde el 5 oct 2026 se trabaja en `main`, en el PC del usuario** (`C:\Users\…\Desktop\FinanceBuddy`, Windows, Claude
    Code). Ya no se usa la rama `claude/intelligent-cerf-wuzuc9` ni el entorno Linux de antes; las notas sobre `/home/user/…`
    y sobre los dominios bloqueados por el túnel **ya no aplican**: aquí hay internet y navegador de verdad.
11. **No se abre PR salvo que el usuario lo pida.** Lo normal ahora: commits en `main` y `git push` cuando él lo diga.
    En este entorno **no hay `gh` ni herramientas MCP de GitHub**: lo que haya que hacer en github.com lo hace él.
12. Commits y PRs terminan con las líneas de atribución que dicte el sistema.
13. Remoto: `MRspookyman/FinanceBuddy` (**público**: ver §10, es lo primero del backlog).
14. La app real del usuario suele estar abierta en el **puerto 8765**: las pruebas van en otro puerto y con carpeta de datos
    propia. Nunca pulsar «Volver a mis datos» ni «Usar otra carpeta» en un servidor de pruebas.

---

## 2. Arquitectura en una página

Mapa corto y trampas: **[`CLAUDE.md`](CLAUDE.md)**. El detalle de cada módulo está en la cabecera de su propio archivo
(la skill `.claude/skills/financebuddy-dev/SKILL.md` se borró el 5 oct 2026). Aquí, el mapa mental.

```
 navegador ──GET /api/datos──▶ servidor.py ──▶ almacen.py ──▶ SQLite (datos.db)
     │  ▲                         │  App.manejar(ruta, datos) = toda la escritura (POST /api/…)
     │  └── JSON: registros por tipo, pendientes (con sugerencias), config, info
     └── paneles/*.js (se concatenan y comparten ámbito): datos → calculos → componentes → graficos → inicio → inversion → renta → precios → exportar → formularios → pantallas
```

| Capa | Archivos | Idea clave |
|---|---|---|
| Arranque | `__main__.py`, `rutas.py`, `lanzar.py` | `--datos`, `--puerto`, `--ejemplo`, `--hoy AAAA-MM-DD`, `--pruebas`, `--sin-navegador`. Si el puerto está ocupado por otra FinanceBuddy, solo abre el navegador. |
| API | `servidor.py` | `GET /api/datos` devuelve todo; `App.manejar()` atiende cada `POST /api/…` (lista en §2.3). `App.datos()` además calcula las **sugerencias** de cada duda. |
| Datos | `almacen.py`, `modelo.py` | Tabla `registros(id, tipo, datos JSON)` + `config(clave, valor JSON)`. `modelo.CAMPOS` define y valida cada tipo; `limpiar()` descarta vacíos. Copia diaria en `Copias\` (30). |
| Importación | `importar.py`, `lectura.py`, `clasificar.py`, `operaciones.py`, `cartera.py`, `detectar.py` | Formato de archivo = registro `perfil`. Duplicados por **huella** (`ext_fecha`+`ext_importe`). Dudas → `pendiente`. |
| Bizums | `bizums.py` | Casar el Bizum recibido con el gasto que devuelve (§6). |
| Precios (opcional) | `precios.py` | Yahoo/Morningstar/CoinGecko → caché en `config`, euros, buscador, comparador (§9.8). |
| Salidas | `exportar.py`, `actualizaciones.py` | Plantilla de Excel con desplegable; aviso de versión opcional (§9.8). El resumen HTML se monta en `web/paneles/exportar.js`. |
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
- `activo`: `clase` (fondo, etf, accion, cripto, materia, pension, bono, inmueble, otro), `patrones` (textos del extracto que lo
  identifican), `isin`, `ter`, `valor`/`fecha_valor`, `aportado_inicial`, `largo_plazo` (bool, sí si falta) y, para los precios por
  internet, `fuente_precio` (morningstar/yahoo/coingecko), `codigo_precio` y `moneda` (validados en `modelo.limpiar`).
- `cobro` = dividendo o comisión de un activo (`tipo`, `importe` siempre positivo, `cuenta`): suma a su rentabilidad y a la TIR y
  entra o sale del efectivo del bróker. Se detecta en el extracto del bróker (`importar.RE_DIVIDENDO`) o se anota a mano.

### 2.2 Claves de `config`
`titulares` (nombre(s) del usuario, para reconocer traspasos propios y para **no enviarlos a Jev**), `limite_variable`,
`dia_inicio` (día en que empieza «tu mes», 1–28), `colchon` (colchón de la cuenta corriente fijado a mano; 0 = automático),
`configurado`, `plantilla_version`, `version_esquema`, `avisos_descartados`, `saldo_extracto:<cuenta>`, `acento`,
`copia_extra` (segunda carpeta donde repetir las copias) y `copia_extra_error` ({carpeta, motivo, cuando} de la última que falló), `inicio`/
`inicio_ocultos` (paneles del Inicio), y las de Jev: `jev` (clave + opciones), `jev_uso` (consultas/tokens por mes),
`jev_revision` (repaso de categorías), `jev_fijos` (caché de «¿cuota fija?»), `jev_enviado` (últimas 30 consultas). Precios:
`precios` ({activo, ultima, resultado}), `precio_serie:<fuente>:<código>` (caché {serie, moneda, actualizado}; **no sale a la página**) y
`precio_ultimos` ({activo: {precio, fecha, fuente, moneda, mensual}}). Aviso de versión: `actualizaciones` ({activo, ultima, resultado}).

### 2.3 Rutas de la API (`App.manejar`)
`guardar`, `borrar`, `config`, `titulares`, `recategorizar`, `parecidos`, `importar/carpeta|subir|reintentar|descartar` (con `previa`:
vista previa en `Almacen.simular()`), `resolver`, `plantilla` (Excel en base64), `precios/config|actualizar|estado|buscar|autoconfigurar|comparar`,
`actualizaciones/config|comprobar`,
`detectar`, `fijos`, `bienvenida`, `cierre`, `valores`, `activo/unir|borrar|cuadrar`, `jev/config|probar|revisar|enviado|
categoria|auditar|hallazgo`, `config/descartar_aviso`, `carpeta`, `copia_extra`, `ejemplo`, `abrir_carpeta`, `copia`, `restaurar`, `vaciar`.
`borrar` no borra un registro que se esté usando sin `confirmar: true`: antes devuelve `{necesita_confirmar, mensaje}` (§9.15).

### 2.4 Trampas conocidas de la interfaz
- `FB.refrescar()` **vuelve a ejecutar los módulos** y por tanto reinicia las variables a nivel de módulo → el estado que
  debe sobrevivir (filtros, mensajes) va en **`FB.estado`** (se reinicia al cambiar de pantalla/`hashchange`).
- Un mensaje escrito en un elemento que se redibuja se pierde: guardarlo en `FB.estado` y repintar (pasó con «Probar» de Jev).
- Los `<select>` de formularios: valores siempre **cadena**; un id numérico hay que pasarlo a `String` en `cargar`.
- `all:unset` en botones quita el foco: hay que redefinir `:focus-visible`.
- Los avisos de nivel `info` de `avisos()` **no se muestran en ninguna parte** (solo los `warn` en el Inicio): para un
  aviso visible hay que ponerlo en la pantalla concreta.

- **«Tu mes» no es siempre el mes natural** (`config.dia_inicio`): gastos, ingresos, límite, ritmo y previsión usan
  `keyDe()`/`iniMes()`/`diasMes()`/`diaDeMes()` (`datos.js`); del día 16 en adelante el periodo lleva el nombre del mes siguiente.
  Inversión, saldos y cierres siguen por mes natural: `keyCal()`/`hoyCal`. No usar `fecha.day` ni `daysInMonth` para el gasto del mes.

### 2.5 Modelo de dinero (resumen)
Los saldos salen de proyectar el último registro de `patrimonio` con los movimientos posteriores, **cuenta a cuenta**. Un
traspaso mueve dinero a la otra cuenta solo si esa cuenta **no** importa extracto (`cuenta.extracto`). Los recurrentes
generan movimientos automáticos salvo que exista uno real enlazado ese mes. Un **reembolso** resta de la categoría del gasto
(el gasto neto). Detalle de inversión (TIR, precio medio, valor estimado «≈», traspasos entre fondos, ajustes):
`web/paneles/calculos*.js` y `cartera.py`.

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
| `#inicio` | Inicio minimalista | Selector de mes; portada «Puedes gastar» + barra + frase de estado, con el **ritmo del mes dentro** (`graficoRitmo`) y entró/salió/ahorro a la derecha; debajo, **una sola franja de avisos** (`franjaAvisos`: lo que toca hacer, lo que no cuadra y qué hacer con lo que sobra); luego A dónde va tu dinero, Patrimonio y Próximos cargos (30 días) en rejilla de hasta tres columnas. Paneles configurables (`PANELES_INICIO`). |
| `#movimientos` (+`/lista`) | Movimientos | De primeras **por categoría**; la **lista** por día, paginada (40 por página), con búsqueda y filtros; «Por categoría» frente a tu media. En los gastos con Bizums enlazados: «te devolvieron X». |
| `#inversion`, `#activo/ID` | Inversión y ficha de activo | Un botón principal y el resto en «Más»; **periodo** de la ganancia y la rentabilidad (desde el inicio / 1 año / este mes: `rentabilidadPeriodo`); cifras, «Revisa tu inversión», evolución, aportaciones, reparto; ficha con operaciones editables, **Cuadrar con el bróker**, **Unir**, borrar. |
| `#importar` | Importar | Arrastrar archivos o carpeta `Importar\`; **vista previa** antes de guardar (`tarjetaPrevia`); plantilla de Excel; formato nuevo → mapeo de columnas. |
| `#renta` | Para la renta | Ganancias realizadas por año (FIFO, traspasos que heredan coste), dividendos y comisiones, lo que no se puede calcular. |
| `#revisar` | Por revisar | Dudas agrupadas por comercio (o por **reparto** de Bizums); filtros; aceptar sugerencias en bloque; selector de gastos candidatos para Bizums recibidos. |
| `#revision` | Revisar tus categorías (Jev) | Hallazgos del repaso: Cambiar / Está bien / Otra categoría. |
| `#apuntar` | Apuntar | Alta a mano; propone categoría al escribir el concepto. |
| `#fijos` | Fijos y de dónde viene tu dinero | Detección de recurrentes; Jev dice si una «variable» parece cuota. |
| `#cerrar`, `#valores` | Actualizar saldos / valores | Cierre mensual: comprueba que no falta nada. |
| `#ajustes` (+`/jev`, `/precios`, `/inicio`) | Ajustes | Tú, apariencia, Jev, **Precios por internet**, Tu inicio, Tus datos, **Compartir y exportar** (resumen HTML con/sin importes, plantilla), copias, carpeta, FinanceBuddy (atajos y aviso de versión). |
| `#gestionar/<tipo>`, `#editar/<tipo>/<id|nuevo>` | Listas y formularios genéricos | Basados en `FORMS`. En la ficha de un movimiento: paneles de reembolsos y campo «Devuelve parte de este gasto». |
| `#bienvenida` | Primer uso | Cuentas, límite, fijos, o «Probar con datos de ejemplo». |

Diseño visual: estilo **«pizarra»** (6 oct 2026): neutros fríos, tarjetas blancas con línea fina y sin sombras, **barra de
navegación arriba** (Inicio, Movimientos, Inversión, Por revisar, Ajustes; «Importar» es el botón de la barra), portada en
tinta, títulos y cifras con **Bahnschrift** (la DIN de Windows; sin fuentes incluidas). Tema claro/oscuro/automático (se guarda
en `localStorage`) y 7 acentos. **Solo escritorio**: no hay barra inferior ni ajustes para móvil (nadie la usa desde el móvil).
Atajos: `?` (ayuda), `I`, `A`, `D`, `1`–`5`.

---

## 5. Pruebas y cómo verificar (siempre tras un cambio)

```bat
python -m unittest discover -s pruebas -p "test_*.py" -t .           :: 175 pruebas de Python (sin red). Un test_*.py nuevo entra solo
python pruebas\run.py --tests                                        :: 20 pantallas sin errores + 84 pruebas de cálculos
python pruebas\run.py --flujos                                       :: 10 flujos con clics de verdad (pruebas_flujos.js)
python pruebas\run.py inicio,movimientos --shot [--tema=oscuro]      :: capturas en %TEMP%\fb-pruebas (sin animaciones: ?quieto=1)
python pruebas\run.py --capturas                                     :: todas las pantallas, en claro y en oscuro
python pruebas\evaluar_jev.py [--mostrar]                            :: precisión de Jev con TUS datos (lo ejecuta el usuario)
python pruebas\evaluar_precios.py [ISIN|ticker…]                     :: ¿responden HOY Yahoo/Morningstar/CoinGecko?
build.bat                                                            :: pasa las TRES tandas y genera dist\FinanceBuddy\
```

- `test_importar.py` (59): importación, clasificación, traspasos, bróker, órdenes, fijos, reglas, y `TestBizums`.
- `test_robustez.py` (21, 6 oct 2026): carpeta de datos imposible, base dañada y recuperación con una copia, borrar algo en
  uso, segunda carpeta de copias y columnas de un banco nuevo. `test_ordenar.py` (11), `test_categoria_nueva.py` (16),
  `test_bizums.py` (2).
- `pruebas_flujos.js`: lo que hace el usuario con el ratón, contra el servidor de verdad (apuntar, resolver una duda,
  deshacer, buscar, borrar una cuenta en uso, ajustes, modo discreto, menú). Al añadir una pantalla o un flujo, añade un caso.
- `test_precios.py` (22): precios contra un servidor falso (`PreciosFalso`, `FB_PRECIOS_URL`): apagado de serie, solo identificadores,
  caché, USD/GBp, fallos agrupados, buscador, autoconfigurar por ISIN y comparador. `test_actualizaciones.py` (5): aviso de versión
  contra un GitHub falso (`FB_ACTUALIZACIONES_URL`).
- `test_servidor.py` (21): API y seguridad (token, `Host`, y que de `/web/` no salga ningún archivo de fuera), vista previa,
  plantilla de Excel. `test_jev.py` (16): Jev contra un **servidor falso** (`JevFalso`) con el mismo formato
  que la API, apuntado con `FB_JEV_URL`; comprueban privacidad, errores 401/sin conexión, sugerencias, repaso, bróker,
  fijos, contexto, repartos y registro de lo enviado.
- `pruebas_calculos.js`: cálculos del navegador (recibe `F` = `window.__fin`). Al tocar un cálculo, añade un caso.
- Si cambias `ejemplo.py` (datos inventados; «hoy» = 30/09/2026), revisa las cifras esperadas.

### Al probar en el PC del usuario (Windows)
- **La app real suele estar en el puerto 8765**: usa otro (`--puerto=8796`) y una carpeta de datos propia. Nunca pulses
  «Volver a mis datos» ni «Usar otra carpeta» en un servidor de pruebas: abren o cambian sus datos de verdad.
- **Importar mueve el archivo** a `Importar\Procesados\…`: para repetir una prueba, importa una **copia**.
- Internet funciona: Yahoo, Morningstar, CoinGecko, Frankfurter y GitHub responden (comprobado el 6 oct 2026). Aun así, las
  pruebas automáticas siguen yendo contra servidores falsos (`JevFalso`, `PreciosFalso`) para no depender de la red.
- Servidor de precios falso para ver la interfaz: `from pruebas.test_precios import PreciosFalso`, servirlo en un puerto y arrancar
  la app con `FB_PRECIOS_URL=http://127.0.0.1:PUERTO`. Con `--ejemplo` los activos no traen participaciones: para ver el «precio de
  mercado» en una ficha hay que «Cuadrar con el bróker» (p. ej. 70 participaciones).
- Los cuadros de aviso de Windows del arranque no salen con `--sin-navegador` (`__main__.AUTOMATICO`): así nada se queda
  esperando a que alguien pulse un botón en una prueba.

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
| **#10** | `e5f5272` **Bizums** (`bizums.py`) + **contexto para Jev** + privacidad (titulares, direcciones) + registro de lo enviado. Este archivo (`CONTEXTO.md`). |
| *(sin PR)* | `e91e80e` **auditoría de Rumbo** (`docs/AUDITORIA-RUMBO.md`) y sus cuatro olas: `9efefe6` Ola 1, `f9877a4` Ola 2, `35da6fd` Ola 3 y la Ola 4 (§9.8). |

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

### 9.7 Auditoría de Rumbo (app parecida, `danidm98/rumbo`, MIT) — 3 oct 2026
Informe completo en [`docs/AUDITORIA-RUMBO.md`](docs/AUDITORIA-RUMBO.md). Rumbo es un seguimiento de **patrimonio e inversión**
(Flask + JSON, sin tests ni gasto diario). **Ventajas suyas:** precios automáticos (Morningstar/Yahoo/CoinGecko con caché, respaldo
y cambio de moneda), serie diaria, «El mes» (esfuerzo vs mercado), TWR por año, peor caída, hitos y objetivo, «Si sigo así…»,
comisiones, comparador «¿y si indexado?», importación con **vista previa**, exportar HTML con importes ocultos. **Nuestras
ventajas:** gasto diario completo y clasificación, 75+45+16 pruebas, token + `Host` local (Rumbo acepta `Host` falso: riesgo de
*DNS rebinding*), no sale a internet, ficha de activo corregible, `.exe`. **Mejoras propuestas por olas:** Ola 1 (sin red:
hitos/objetivo, «Si sigo así», comisiones, tamaño de aportación, modo discreto, avisos agrupados, «solo largo plazo»); Ola 2
(vista previa de importación, dividendos/FIFO, tipos de activo, esfuerzo vs mercado aproximado); Ola 3 (**precios online opt-in**
+ buscador + comparador con indexados; requiere decisión de privacidad); Ola 4 (exportar HTML, aviso de versión, plantilla).
Se ejecutó Rumbo con precios sintéticos porque Yahoo/Morningstar/CoinGecko están bloqueados en el entorno.

### 9.8 Las cuatro olas de la auditoría de Rumbo, implementadas — 3 oct 2026
**Ola 1 (sin red).** `progreso.js` + `calculos.js`: hitos (`HITOS`, `hitosPatrimonio`), proyección «Si sigo así» (`proyeccion`, interés
mensual, aportación a fin de mes), tiempo hasta el siguiente hito (`mesesHasta50`), esfuerzo vs mercado por mes (`puntosInversion`,
**aproximado**: con los valores anotados al cerrar cada mes), rentabilidad encadenada por año y peor caída (`rendimientoPuntos`),
comisiones (`comisionesInversion`, TER), tamaño de aportación (`tamañoCompras`), `activo.largo_plazo` y «Solo largo plazo»
(`resumenInversion(soloLargo)`, `evolucionInversion(solo)`), **modo discreto** (`nucleo.js`: un `MutationObserver` envuelve los importes en
`<span class="blur">`; también el texto de los gráficos y los ejes) y atajos (D, 1–6, A).
**Ola 2.** Vista previa de importación (`Almacen.simular()` ejecuta **el mismo código** de importar dentro de una transacción que se
deshace; `servidor._informe_previa`; el archivo sigue en `Importar` hasta confirmar o `descartar`); dividendos y comisiones (`cobro`,
`RE_DIVIDENDO`, entran en la TIR y en el efectivo del bróker); **«Para la renta»** (`renta.js`: `fifoVentas` con herencia de coste en
traspasos, `opsParaRenta`); tipos de activo nuevos (pensión, bono, inmueble).
**Ola 3 (precios).** `precios.py`: `FUENTES`, `serie_yahoo|morningstar|coingecko`, caché `precio_serie:*`, `a_euros` (Yahoo `USDEUR=X`;
`GBp`×0,01 → `GBPEUR=X`), `actualizar()` con hilos (una descarga por (fuente, código)), `buscar()` (ISIN → Morningstar primero con TER/riesgo;
nombre → Yahoo + CoinGecko; atajos «oro», «plata»…; solo devuelve lo que tiene precio), `autoconfigurar()` (activos con ISIN y sin fuente),
`comparar()` (mismas compras y ventas, sin traspasos, en MSCI World / S&P 500 / 60-40 / monetario; TIR por bisección). **`valorInfo()`**
devuelve `fuente: "mercado"` si `usaMercado()`: participaciones conocidas y precio igual o más nuevo que lo anotado. Se actualiza al abrir
(`FB.actualizarPrecios`, si pasaron 6 h) y con botones, en un hilo del servidor; el resultado se cuenta en **un solo aviso** y el detalle de
fallos va plegado en Ajustes (E4 de la auditoría). Formatos de las APIs (no oficiales, aislados en `precios.py`): ver su cabecera.
`FB_PRECIOS_URL` redirige todo a un servidor falso.
**Ola 4.** `exportar.js`: `generarResumen(ocultar)` → HTML autónomo (sin scripts ni enlaces); **sin importes** = porcentajes e índice 100
calculados antes de escribir. `exportar.py` + `/api/plantilla`: Excel con hojas Movimientos (desplegable de categorías y validación de
fecha e importe), Listas y Cómo se usa; el perfil `Plantilla de FinanceBuddy` (plantilla v4) lee la columna `categoria` y
`importar.categoria_del_archivo` la aplica (lista cerrada; no pisa traspasos; positivo en categoría de gasto = reembolso).
`actualizaciones.py`: aviso de versión opcional (releases/latest de GitHub, ≤ 1 consulta al día, no instala nada).
**Pendiente de las olas:** probar los precios con los servicios reales (`evaluar_precios.py`), y usar los precios mensuales para
afinar «esfuerzo vs mercado» (hoy solo usa los valores anotados). Descartado: exportar `.xlsx` de datos (ver backlog).

---

### 9.9 Auditoría de producto e interfaz (5 oct 2026) — aplicada en tres tandas
Tanda 1: proyección prudente (5 % por defecto, solo sobre lo invertido, con rango), hitos sin los que ya tenías al empezar, «Importar» como botón principal (soltar un archivo en cualquier pantalla lo importa; «Apuntar» bajó a Movimientos y la tecla A), `Deshacer` tras decidir en «Por revisar» (`/api/deshacer`, foto en memoria), contraste y letra, «Ahorro del mes» como único nombre. Tanda 2: **lo por revisar del banco cuenta como «Sin clasificar»** (`datos.js: movimientos()`), lista única con «Todo el historial» y búsqueda global, Ajustes en tres pestañas. Tanda 3: primer uso empieza por el extracto (el saldo del primer extracto es el saldo inicial: `servidor._saldo_inicial`), comprobación del saldo del banco tras importar, límite sugerido, frase «qué hacer con lo que sobra» (`planReparto`) y reparto objetivo por activo (`activo.objetivo`, `repartoObjetivo`). Después: icono en la bandeja (`__main__._bandeja`, `pystray`) y distribución como carpeta (`build.bat` en `--onedir`); **el saldo de cada cuenta con extracto se iguala solo al que dice el banco** (`pantallas.js: autoCuadre` → `/api/saldo_banco`: registro de patrimonio de ese día, sin cerrar el mes ni tocar el valor de los activos; una vez por saldo distinto); «Actualizar valores» fusionado en «Actualizar saldos»; panel «Objetivos y recordatorios» en el Inicio; fijo/variable separados en «A dónde va tu dinero»; aviso de fijos que suben de precio (`subidasFijos`) y resumen del mes al cerrar (`resumenMes`); comisiones movidas a «Tu progreso»; cambio de divisa del **BCE vía Frankfurter** con respaldo en Yahoo (`precios.serie_bce`; sale solo el código de la moneda) y clave gratuita opcional de CoinGecko (`config.precios.clave_coingecko`, nunca vuelve a la página). Regla 1/9b: a los tres servicios de precios se suma Frankfurter (solo «USD»/«GBP»).

### 9.10 Interfaz «pizarra» y segunda tanda (6 oct 2026)
Rediseño completo de `estilos.css` e `index.html` (ver §4, «Diseño visual») y, después: Inicio con la portada primero, el ritmo
dentro y una franja única de avisos; fuera las repeticiones («por revisar» junto al saludo, «Importar» como pestaña); Inversión
con un botón principal + «Más» y **selector de periodo**; **día en que empieza tu mes** y **colchón configurable** (Ajustes →
General → «Tu mes y tu colchón»); ayuda de atajos (`?`); `run.py --capturas`; icono nuevo (`web/icono.svg`, `recursos/icono.ico`)
y fuera la fuente Fraunces. Se decidió **mantener los emojis** de las categorías y dejar para después lo de guardar lo
importado con la categoría sugerida (punto 5 de abajo).

### 9.11 Fuera «Tu progreso» (6 oct 2026)
El usuario no la usaba: se eliminó la pantalla `#progreso` (`progreso.js`) con «Si sigo así…», «Tu inversión, mes a mes», rentabilidad
por año, comisiones (TER) y el panel del comparador con indexados, junto con sus cálculos (`proyeccion`, `puntosInversion`,
`rendimientoPuntos`, `comisionesInversion`) y sus pruebas. **Solo quedan los hitos**, al final de Inversión (`inversion.js: panelHitos`).
El comparador sigue en el servidor (`precios.comparar`, `/api/precios/comparar`, con sus pruebas) pero sin pantalla. Además, la
tarjeta **«Tu patrimonio»** del Inicio enseña el total **sin lo ganado con la inversión** (la inversión cuenta por lo metido) y la
ganancia aparte, en pequeño («+1.345 € de tu inversión»).

### 9.12 Interfaz con más contraste y movimiento, y tres funciones nuevas (6 oct 2026)
**Interfaz (`estilos.css`, `nucleo.js`):** colores claros más oscuros (ámbar y serie 3), texto ≥ 12 px, objetivos táctiles de 44 px
con `pointer:coarse`, `prefers-reduced-motion`, curva `--ease-out`, hover suave, feedback al pulsar, entrada del Inicio en cascada y
fundido en el resto (solo al cambiar de pantalla: `FB._nav`, `#app[data-entra]`), barras que crecen, importes y porcentajes que
cuentan (`contarCifras`; se omite en modo discreto, con «reducir movimiento» y en `?pruebas`), check en el aviso, subrayado
deslizante del menú (`#menu::after` con `--ind-x/--ind-w`) y gráficos más vivos. Fuera los nombres CSS antiguos (`--background-*`,
`--text-*`; `--hover` sustituye a `--background-modifier-hover`). El plan está en `plans/001-micro-movimiento.md`.

**Categoría sugerida al importar** (§10.5, hecho): las filas que `clasificar_fila` deja como `duda` pero que el historial resuelve con
confianza ≥ umbral se guardan ya como movimiento con la categoría y cuentan en el mes. Llevan `sugerido` (texto con el motivo; vacío
= confirmada). `clasificar.sugerir_guardable`: fracción de veces que ese comercio fue a esa categoría, limitada por la evidencia
(1 antecedente → 0,8; 2 → 0,9; 3 o más → sin límite) y, con un solo comercio parecido, por lo parecido que es. `UMBRAL_SUGERIDO = 0,8`
(`config.sugeridos_umbral`, 0,6 a 1,0; sin control en la interfaz); `config.guardar_sugeridos` (encendido; casilla en Ajustes → General →
«Importar»). Nunca se sugiere en traspasos, repartos de Bizum ni devoluciones «por el concepto». `clasificar.memoria` ignora los
`sugerido`; elegir tú la categoría (o guardar el formulario) los confirma (`recategorizar`). Rutas: `importar.guardar_sugeridos`,
`importar.confirmar_sugeridos`, `/api/confirmar_sugeridos` (con «Deshacer»). UI: panel «Guardados con categoría sugerida» en Por
revisar (Confirmar los N / Está bien / Cambiar), ficha «Con categoría sugerida» en la vista previa de Importar y «· categoría por
confirmar» en la lista de Movimientos. El contador del menú sigue contando solo pendientes.

**Reparto objetivo y rebalanceo** (§10.8, hecho): reutiliza `activo.objetivo` (% por activo). Sin objetivos, Inversión solo enseña
«Definir un reparto ideal ⓘ»; con objetivos, el panel «Tu reparto frente al ideal» (`panelObjetivo`, diferencia en puntos, >5 en
negrita) y el campo «Si aportas [300] €» (`FB.estado.aportaObj`) con «Tu aportación» y «Quedaría». Solo reparte lo nuevo, sin vender.
`calculos.js`: `repartoAportacion(filas, importe, banda=5)` (suma exacta en céntimos, por mayores restos, escala si los % no suman 100) y
`validarObjetivos`. Pantalla `#reparto` (`vistaReparto`, parte de Inversión, suma en vivo, «Repartir a partes iguales») y
`POST /api/objetivos` (valida 0–100 y suma 100; `{}` quita el reparto). Información, no asesoramiento financiero.

**Fase 4 de Ajustes** (§10.10, hecho salvo lo que se indica): botón «Todos mis datos en Excel» (`exportar.datos_excel`, `POST
/api/exportar_datos`, con `openpyxl`; hojas Léeme, Movimientos, Cuentas, Saldos, Fijos, Categorías, Reglas, Inversión, Aportaciones,
Dividendos y comisiones, Objetivos y Recordatorios; el texto nunca es fórmula; es copia para consultar, no se reimporta). Módulo nuevo
`ordenar.py`: **probar una regla** con lo ya importado (recuento, cuántas cambiarían, muestra de 8, dudas que casan; solo movimientos
con `ext_texto`; `/api/regla/probar` y `/api/regla/aplicar`, con confirmación y «Deshacer»; aplicar pisa la categoría), **fusionar
categorías** (vista previa y `config.categorias_fusionadas`; `plantilla.instalar` no la recrea y reapunta sus reglas) y **ocultar
categorías** (`categoria.oculta`; sigue contando, no sale al elegir). Sugerencias de ocultar las que no se usan. Ajustes → «Tus
datos» se divide en tres secciones. Pruebas: `pruebas/test_ordenar.py`. Pendiente: probar a mano con clics el panel «Ordenar».

### 9.13 Registros por página, categoría nueva aconsejada y auditoría de Bizums (6 oct 2026)
**Registros por página:** `config.por_pagina` (10 a 200; 40 de serie; Ajustes → General → «Tu mes y tu colchón»); `porPagina()` en
`componentes.js` es el valor por defecto de `paginacion()` y de Movimientos. Las listas de «Por revisar» (10, 20, 25) llevan su tamaño.

**Aconsejar una categoría nueva** al resolver pendientes: `clasificar.proponer_categoria_nueva` (local, por palabras del concepto, solo
gastos que no sean Bizum ni traspaso) con el catálogo `plantilla.CATALOGO` (13 entradas: Mascotas, Regalos, Formación, Viajes, Salud,
Cuidado personal, Hogar, Deporte, Donaciones, Tecnología, Ropa, Niños, Impuestos; no cambia `VERSION`). No aconseja si ya hay una
categoría visible con ese nombre, alias o «cubre», ni si está en `config.categorias_fusionadas`; si solo existe oculta, aconseja
«volver a mostrarla». El servidor lo pone en `pendiente.categoria_nueva` cuando no hay sugerencia buena. Con Jev: segunda pregunta
`nueva` (`jev.NUEVA_MINIMA = 0,7`, solo si la categoría existente falla con < 0,5; solo nombres del catálogo, sin datos del usuario),
guardada en `pendiente.jev.categoria_nueva`; el consejo local tiene prioridad. UI: botón «¿Crear la categoría «X»?» en la ficha, con
nombre, emoji y tipo editables y casilla «Recordar…» (regla + resolver los iguales). Se reutiliza `/api/resolver` con
`categoria_nueva` (`importar._categoria_nueva`, misma transacción: «Deshacer» lo revierte todo). Nunca se crea nada sin pulsar.
Pruebas: `pruebas/test_categoria_nueva.py`. Sin probar con clics el formulario desplegable ni con la API real de Jev.

**Auditoría de Bizums** (hecha en solo lectura; después se arreglaron (1) y (2), ver «Arreglado» abajo): (1) no hay marca de «este Bizum no tiene gasto»: `bizums.enlazar` se ejecuta al
abrir y podría volver a enlazar lo que se desenlazó; (2) `repartos()` agrupa por día exacto y `candidatos()` usa ±1 día; (3) `VENTANA`
fija en 10 días; (4) la tolerancia del 2 % es holgada en importes grandes; (5) gastos «Otros» o sin categoría nunca son candidatos;
(6) `enlazar` es O(Bizums × gastos); (7) pocas pruebas directas de `enlazar`/`previos`.
**Arreglado:** (1) `movimiento.sin_gasto`: al quitar a mano el gasto de un Bizum (`/api/guardar`) se marca y `bizums.enlazar` ya no lo vuelve a enlazar; elegir otro gasto lo desmarca. (2) `bizums.repartos` agrupa con ±1 día, como `candidatos`. Pruebas: `pruebas/test_bizums.py` y una en `test_servidor.py`.

### 9.14 Archivos grandes partidos (6 oct 2026)
Sin cambiar ni una línea de código: solo se cortó por los marcadores de sección. `pantallas.js` → `bienvenida`, `importar`, `revisar`, `fijos`
(fijos detectados + revisión de categorías), `cierre` (apuntar + cerrar el mes), `ajustes`, `gestionar` y `pantallas` (solo `render`);
`calculos.js` → `calculos`, `calculos_saldos` (saldos, fondo, presupuesto, ahorro, por categoría, plan, previsión) y `calculos_avisos`
(avisos, hitos, plusvalías); `estilos.css` → `estilos` (base y armazón), `inicio`, `componentes` y `pantallas` (cuatro hojas enlazadas en
ese orden desde `index.html`). **El orden importa:** los módulos JS se concatenan en el orden de `servidor.MODULOS` y comparten ámbito
(un solo `new Function`), y las hojas CSS dependen del orden de las `<link>`. Se comprobó que la unión de los trozos es idéntica al archivo
original. Al añadir un archivo, ponlo en `MODULOS` en su sitio.

### 9.15 Estudio del estado de la app y arreglos (6 oct 2026)
Estudio con medidas, no solo lectura: suite completa en verde, servicios de precios probados de verdad, rendimiento con
1, 5 y 10 años de datos inventados y repaso del historial de git en busca de secretos. **Lo medido:**
- **Rendimiento** (unos 71 movimientos al mes): con 1 año (852 movimientos) `datos()` tarda 48 ms y resolver una duda 12 ms;
  con 5 años, 129 y 129 ms; con 10 años (8.520 movimientos, 3,5 MB), 246 y 545 ms, y abrir la app 726 ms. La base real del
  usuario pesa 0,36 MB: **no hay nada que optimizar en años**. Lo que peor escala es `bizums.enlazar` (7 → 117 → 508 ms).
- **Precios:** Yahoo, CoinGecko, Frankfurter y Morningstar (con ISIN reales: `IE00BYX5MX67` → `0P0001CLDM`, 2.204 días)
  responden. `evaluar_precios.py` da 14/15 porque su fondo de ejemplo `0P0000YXQE` ya no tiene precios.
- **Historial de git:** sin claves, IBAN ni correos en el código. El repo es `MRspookyman/FinanceBuddy` y **está público**.
- **Documentación:** `CONTEXTO.md` cuesta ~27.000 tokens por sesión; se añade [`CLAUDE.md`](CLAUDE.md) corto y este archivo
  queda como historial que se consulta por secciones.

**Arreglado (todo con pruebas):**
1. **Agujero de seguridad:** `GET /web/<ruta absoluta>` servía **cualquier archivo del ordenador sin token** (se descargó la
   base de datos de una instancia de prueba). Ahora `servidor._dentro_de()` solo deja salir lo que está dentro de `web/`.
2. **Arranque que se explica** (`__main__.py`): `decir()` enseña un cuadro de Windows (el `.exe` no tiene consola) cuando la
   carpeta de datos no se puede abrir, el puerto lo ocupa otro programa o la base está dañada; antes se cerraba sin decir nada.
   `almacen.BaseDañada` + `_reparar()` ofrecen **volver a la última copia** (el archivo dañado se guarda como `datos.db.roto …`,
   no se borra). Con `--sin-navegador` no sale ningún cuadro (`AUTOMATICO`), para que las pruebas no se queden colgadas.
3. **Cambiar de carpeta ya no deja la app inservible:** `App.abrir()` monta la carpeta nueva **antes** de soltar la vieja; si
   falla, se sigue con la de antes y se dice por qué (`rutas.motivo()` traduce los errores del sistema al español).
4. **Segunda carpeta de copias** (`config.copia_extra`, `/api/copia_extra`, Ajustes → Tus datos): cada copia se guarda también
   en un USB u otro disco. Si no está disponible, la app sigue y lo cuenta (`copia_extra_error`).
   De paso se corrigió que **las copias se ordenaban mal**: `datos 2026-10-06 173000 manual.db` iba *antes* que
   `datos 2026-10-06.db` (el espacio es menor que el punto), así que «la última copia» y la limpieza de las 30 cogían la
   equivocada. Ahora `almacen.copias_de()` ordena por la fecha y hora del nombre.
5. **Borrar algo que se usa avisa antes:** `Almacen.usos()` cuenta quién apunta a ese registro (`modelo.REFERENCIAS`) y
   `/api/borrar` no borra sin `confirmar`, devolviendo ««Cuenta nómina» se está usando en 135 movimientos…» y qué pasaría.
6. **Un banco nuevo se importa en un clic:** `lectura.columnas_probables()` reconoce las columnas por el nombre de la cabecera
   (español e inglés, Debe/Haber, Cargo/Abono) **y comprobando el contenido** de las filas de ejemplo. Jev ya solo rellena lo
   que falte (antes era la única ayuda y hacía falta tener el asistente activado).
7. **`build.bat` ya no deja pruebas fuera:** `unittest discover` (cualquier `test_*.py` entra solo) + pantallas + flujos. Si no
   hay navegador, `run.py` devuelve **3** y el build avisa y sigue.
8. **Flujos con clics** (`pruebas/pruebas_flujos.js`, `run.py --flujos`, `?flujos=1`): 10 recorridos que hacen lo que haría el
   usuario y comprueban el resultado contra el servidor de verdad.
9. **Capturas sin cifras a medio contar:** `?quieto=1` apaga las animaciones y `run.py` lo usa en `--shot` y `--capturas`.
10. Versión de la app a **1.1.0** (antes 1.0.0 desde el primer día).

**No se ha tocado** (y por qué): el rendimiento (sobra), la estructura del código (densa pero coherente y con pruebas) y el
repositorio público (no hay `gh` en este entorno: lo tiene que hacer el usuario en github.com).

### 9.16 Auditoría de usabilidad (6 oct 2026)

Sobre la app en marcha con datos de ejemplo (`run.py --capturas`: 20 pantallas en claro y oscuro), no solo leyendo código.
Contrastes calculados sobre los tokens de `estilos.css`, no a ojo.

| # | Gravedad | Hallazgo | Resultado |
|---|---|---|---|
| 1 | Alta | La zona de arrastre era un `<div>` con `onclick` y el `<input type=file>` oculto: **con el teclado no había forma de importar** | Arreglado |
| 2 | Alta | El primer día el menú enseñaba Inicio, Movimientos e Inversión, y las tres acababan en la Bienvenida sin decir nada | Arreglado |
| 3 | Alta | «Deshacer» solo existía en el aviso flotante (9 s); la foto seguía en el servidor pero sin forma de llegar a ella | Arreglado |
| 4 | Media | El % de cada categoría era sobre el gasto total del mes, pero se enseñaba bajo «Gasto variable 672 €» (Supermercado 313 € salía como 21 %, que es de 1.485 €; de su panel es el 46,6 %) | Arreglado |
| 5 | Media | El verde y el coral se usaban a la vez como colores de serie y con significado: en Inversión el verde era «ganancia» **y** «Bitcoin» | Arreglado |
| 6 | Media | En Importar, el único botón relleno es «Importar la carpeta» (camino secundario); el grupo de radios no tiene rótulo y «Detectar solo» se lee como «solo detectar» | Arreglado |
| 7 | Media | «Por revisar» mezcla movimientos y grupos: subtítulo «6 movimientos», chip «Todo · 4» (grupos), insignia 6 | Arreglado |
| 8 | Media | Ajustes tiene cinco formas distintas de guardar en una pantalla (botón propio, botón compartido, al marcar, al pulsar, al reordenar) | Arreglado |
| 9 | Media | La cifra grande del Inicio cambia de significado («Te has pasado 72 €» / «Puedes gastar 72 €») y solo lo dice el rótulo pequeño | Arreglado |
| 10 | Leve | Jerga contra la regla 3: «TIR» y «25 k€» en Inversión | Pendiente |
| 11 | Leve | Blanco sobre `--amber` (#B87A00) da 3,65:1 en la insignia `.fin-ico` de aviso (regla 5 pide 4,5:1) | Pendiente |
| 12 | Leve | No hay `<h1>` (las pantallas empiezan en `h2`); los datos de los gráficos solo están en el tooltip de ratón; `accion()` crea `<a href="#">` para acciones; botones de tema y color sin `aria-pressed`; `prompt()`/`confirm()` nativos; atajos de una tecla que no se pueden apagar; «Cerrar FinanceBuddy» sin confirmar | Pendiente |

**Lo arreglado (1-9):**
1. `zonaSoltar()` en `componentes.js`: la zona es un `<button>` (Enter y Espacio salen gratis, y coge el anillo de foco global).
   La usan Importar y Bienvenida. `.fb-zona` lleva `width:100%;font:inherit` para verse igual que antes.
2. `nucleo.js barra()`: sin cuentas, el menú es solo «Primeros pasos» y «Ajustes» (el botón Importar de la barra se queda,
   porque esa pantalla sí funciona sin cuentas) y el subrayado marca «Primeros pasos» estando en `#inicio`.
3. `App.deshacer_que` junto a la foto, puesto en los cinco sitios que la guardan; sale en `info.deshacer`. Panel «Deshacer lo
   último» en Ajustes → Tus datos y copias y una línea con «Deshacer» arriba de «Por revisar». En una tanda en bloque dice
   «Varias decisiones de "Por revisar"», que es lo que de verdad se deshace.
4. `filaCategoria()` recibe la suma de **su panel** (la cifra de la cabecera), no el gasto del mes, y los fijos también
   enseñan su %, que antes decían solo «fijo» y no se podían comparar. Ahora cada panel suma 100 %.
5. `SERIES_REPARTO` (azul, magenta, ámbar, violeta, oliva, turquesa; nuevo token `--fin-s8`): los repartos (activos y
   composición del patrimonio) ya no usan el verde ni el coral. En Inversión el verde queda solo para ganancia/pérdida.
6. Importar: «Sube el extracto» va solo y a todo lo ancho; la carpeta y la plantilla, debajo y en dos columnas con botones
   de contorno. El botón de la carpeta solo va relleno **si hay archivos esperando** (entonces sí es lo que toca hacer). El
   grupo de radios lleva rótulo visible («Qué archivo es») y `role="radiogroup"`, y «Detectar solo» pasa a «Que lo detecte la app».
9. La cifra de la portada lleva el sufijo **pegado al número** (`cifraHero()`): «72 € **de más**» al pasarse del límite y
   «… **de sobra**» en un mes que ya acabó. Antes la diferencia entre lo que te queda y lo que te has pasado estaba solo en
   un rótulo pequeño en versalitas encima, y de un vistazo las dos cosas se veían igual. Flujo de pruebas nuevo (10 en
   total): comprueba el sufijo contra la clase `.pasado`, este mes y el anterior.
8. Ajustes (pestaña General) **se guarda solo**: `guardarAjuste()` manda el cambio, avisa con «Guardado ✓» y, como la
   pantalla se vuelve a dibujar, devuelve el foco a donde estuviera (si has saltado al campo siguiente con el tabulador,
   te quedas en él: `data-fb` identifica cada campo). Fuera los tres botones «Guardar», y una línea arriba lo dice. La única
   excepción es la clave de Jev, que sigue con botón: es una credencial y «Probar» necesita lo que acabas de pegar. De paso,
   los botones de tema y de color anuncian su estado con `aria-pressed` y «Tu inicio» también avisa al guardar (era mudo).
   Nuevo flujo de pruebas (9 en total): comprueba que no queda ningún «Guardar», que el cambio se guarda y que el foco aguanta.
7. «Por revisar» cuenta las dos cosas en el título: «4 grupos · 6 movimientos… (lo del mismo comercio se resuelve de una
   vez)». Los grupos se calculan antes del título (el cálculo estaba duplicado y ahora es uno). En el Inicio, «sin revisar
   (4 movimientos **de este mes**)», que es otra cuenta distinta de la insignia del menú.

**Susto durante esta ronda (y arreglado):** al pasar las pruebas, el usuario abrió la app y parecía **sin datos**. No se
había borrado nada: `test_robustez.test_cambiar_de_carpeta_bien` llama a `/api/carpeta`, que guarda la carpeta elegida en
`%APPDATA%\FinanceBuddyjustes.json` —único para toda la máquina—, así que cada tanda de pruebas dejaba la app de verdad
apuntando a una carpeta temporal. Sus datos seguían intactos en `Documentos\FinanceBuddy\datos.db` (261 movimientos de
mar 2025 a oct 2026). Se restauró el puntero y **`test_robustez.setUp` aparta ahora `rutas.AJUSTES` a la carpeta temporal
de la prueba**, con un `assertNotEqual` que lo exige; comprobado que tras una tanda completa el archivo real no cambia.
Era un fallo de siempre, no de estos cambios, pero solo se ve cuando alguien usa la app de verdad en el mismo ordenador.

**Descartado y por qué:** pantalla estrecha (regla 9); el contraste de `--ink-2`/`--ink-3` (medido: 5,35:1 y 4,82:1, pasan);
el foco visible (parecía roto en `.fin-ayuda:focus{outline:none}`, pero la regla global de `pantallas.css` lleva `!important`
y gana); los nombres de los campos de formulario (`etiquetar()` los cubre; solo quedan sueltos los `<select>` de «Otra…» de
«Por revisar»); la línea «Valor» de Evolución y las barras de aportaciones siguen en `--brand` **a propósito**: es el color de
acento de la app (configurable), no el verde semántico.

## 10. Pendiente y backlog (por valor aproximado)

**Inmediato (lo tiene que hacer el usuario: aquí no hay `gh` ni MCP de GitHub)**
1. **El repositorio `MRspookyman/FinanceBuddy` está público.** Él no quiere publicar la app para cualquiera y `CONTEXTO.md`
   cuenta su banco, su bróker y cuánto mete al mes, junto a commits con su nombre y correo. En github.com → *Settings* →
   *Danger Zone* → *Change visibility* → *Private*. (En el historial **no** hay claves, IBAN ni correos dentro de los archivos.)
2. **Probar Jev con la API real** (Ajustes → Probar, y `python pruebas\evaluar_jev.py`) y ajustar umbrales con aciertos
   reales. Comparar con/sin contexto. Es lo único que sigue sin probarse contra el servicio de verdad.
3. **Rotar la clave de Jev** (se pegó en el chat durante el desarrollo).
4. Si quiere que funcione el aviso de versión, **publicar una release** en GitHub (hoy `releases/latest` devuelve 404, así que
   el aviso nunca salta).

**Producto** (ver también las olas de `docs/AUDITORIA-RUMBO.md`: Ola 1 sin red es lo más barato y visible)
0. ~~Probar los precios por internet con los servicios reales~~ (hecho, §9.15: responden los cuatro; el fondo de ejemplo de
   `evaluar_precios.py` se cambió a `0P0001CLDM`, que sigue vivo).
5. ~~Guardar ya lo importado con la categoría sugerida~~ (hecho, §9.12; texto original: «como Copilot/Lunch Money»): hoy lo dudoso no cuenta hasta revisarlo.
   Es un cambio de fondo; PR aparte.
6. ~~Vista «Para la renta»~~ (hecho, Ola 2).
7. ~~Rentabilidad por periodo~~ (hecho: selector desde el inicio / 1 año / este mes en Inversión).
8. ~~Reparto objetivo y rebalanceo~~ (hecho, §9.12): % ideal por activo y a dónde va la próxima aportación.
9. ~~Dividendos~~ (hecho: registro `cobro`). Mejora posible: usar los precios mensuales para «esfuerzo vs mercado» sin anotar valores.
10. ~~Fase 4 del plan original (Ajustes por secciones)~~ (hecha, §9.12): Ajustes por secciones, día en que empieza tu mes,
    colchón configurable, exportar datos a Excel, probar una regla antes de guardarla y fusionar/ocultar categorías.
    Queda **probar a mano con clics el panel «Ordenar»**.
11. **Bitcoin:** solo 12 de 21 compras tenían títulos (las antiguas no vienen en el Excel del usuario) → sin precio medio hasta
    que añada esas fechas.
12. Menores de §9.3 y §9.4.
13. **Formatos de serie de más bancos:** hoy solo Santander y MyInvestor vienen de fábrica. Desde el 6 oct 2026 un banco nuevo
    se configura en un clic (§9.15), pero si alguien pasa la fila de cabecera de su banco (BBVA, CaixaBank, ING, Sabadell…)
    se puede añadir su perfil a `plantilla.PERFILES` y subir `plantilla.VERSION`.

**Técnico**
14. Fondos desconocidos (ISIN fuera del catálogo `plantilla.ISIN`) se crean como «Fondo ‹ISIN›»: ampliar el catálogo o consultar
    una fuente.
15. Si se quiere privacidad total para el asistente: motor local (Ollama + modelo tipo Jev) como alternativa a la nube.
16. `bizums.enlazar` es O(Bizums × gastos) y se ejecuta al abrir: 0,5 s con 10 años de datos (§9.15). Sin prisa, pero si el
    historial crece mucho, acotar la búsqueda por fechas.

**Usabilidad pendiente (§9.16, por orden de valor)**
17. **Jerga y contraste:** «TIR» y «k€» en Inversión; blanco sobre `--amber` (3,65:1) en la insignia de aviso.
18. **Accesibilidad menor:** `<h1>` por pantalla, `accion()` como `<button>` en vez de `<a href="#">`, datos de los gráficos alcanzables sin ratón, atajos de una tecla que se puedan apagar.

---

## 11. Cómo retomar (checklist para Claude o para una persona)

1. Lee [`CLAUDE.md`](CLAUDE.md) (reglas, comandos, mapa y trampas). De este archivo, solo la sección que necesites: §8 el
   porqué de las decisiones, §9 las auditorías, §10 lo pendiente. `README.md` es para quien usa la app.
2. `git log --oneline -15` y `git status`: se trabaja en `main`, en el PC del usuario.
3. Instala y comprueba: `pip install -r requirements.txt -r requirements-dev.txt` y
   `python -m unittest discover -s pruebas -p "test_*.py" -t .` (deben ser **175 correctas**), más
   `python pruebas\run.py --tests` y `python pruebas\run.py --flujos`.
4. Arranca con datos inventados: `python -m financebuddy --ejemplo --sin-navegador --puerto 8830 --hoy 2026-09-30`.
5. Antes de cambiar nada, relee §1 (reglas): sobre todo **clave de Jev, datos reales, español sin jerga, la app funciona sin
   IA y nada de subir extractos**.
6. Para añadir cualquier cosa: modelo (`modelo.CAMPOS` + `FORMS`) → lógica (módulo de dominio) → `servidor.py` (ruta/`datos()`)
   → pantalla (`paneles/*.js`) → prueba (Python y, si hay cálculo, `pruebas_calculos.js`; si es algo que el usuario hace con el
   ratón, `pruebas_flujos.js`) → documentación (README + CLAUDE.md + este archivo). `build.bat` ya pasa cualquier `test_*.py`.
7. Al terminar: commit con atribución, resumen al usuario y preguntarle si se sube.

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
- **Valor «de mercado»**: el valor de un activo = participaciones × precio de internet (si lo activaste); manda sobre lo anotado si es más nuevo.
- **Resumen sin importes**: HTML con porcentajes e índice 100; no contiene euros (no están tapados: no están).
- **Plantilla de Excel**: hoja con desplegable de tus categorías; el perfil «Plantilla de FinanceBuddy» la importa con la categoría elegida.
- **Cobro**: dividendo o comisión de un activo (no cambia sus participaciones).
- **Segunda carpeta de copias** (`config.copia_extra`): un USB u otro disco donde se repite cada copia de seguridad.
- **Flujo** (`pruebas_flujos.js`): recorrido con clics de verdad en el navegador, contra el servidor, de algo que hace el usuario.

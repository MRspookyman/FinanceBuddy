---
name: financebuddy-dev
description: Desarrollo de FinanceBuddy (app local de finanzas personales para Windows, Python + JS, en español). Usar al modificar, depurar, probar o compilar el código de este repositorio: servidor, base de datos, importadores de extractos (bancos/brókers), clasificación, paneles y pantallas web, pruebas o el .exe.
---

# FinanceBuddy · desarrollo

App local: un servidor Python (stdlib + openpyxl/xlrd) en `127.0.0.1:8765` que sirve una interfaz web y guarda los datos en SQLite dentro de la carpeta de datos del usuario (por defecto `Documentos\FinanceBuddy`). Se distribuye como un `.exe` (PyInstaller). Todo el texto visible va **en español**, importes en **€**. Pensada para usuarios no técnicos: nada de jerga, lo esencial a la vista y el resto en secciones plegables (`plegable()`).

## Arquitectura
| Pieza | Archivo | Notas |
|---|---|---|
| Arranque | `financebuddy/__main__.py` | `--datos`, `--puerto`, `--ejemplo`, `--hoy AAAA-MM-DD`, `--pruebas`, `--sin-navegador`. Si el puerto está ocupado por otra instancia, solo abre el navegador. |
| Servidor/API | `financebuddy/servidor.py` | `App.manejar()` = API de escritura (POST). `GET /api/datos` devuelve todo (registros por tipo, pendientes, config, info). Clave por arranque en `X-FB-Token`; se rechaza cualquier `Host` que no sea 127.0.0.1/localhost. |
| Base de datos | `financebuddy/almacen.py` | Tabla `registros(id, tipo, datos JSON)` + `config(clave, valor JSON)`. `guardar()` valida (modelo.py), exige nombres únicos y propaga renombres (`REFERENCIAS`). Copia diaria en `Copias\` (30). |
| Modelo | `financebuddy/modelo.py` | `CAMPOS` por tipo: cuenta, categoria, movimiento, recurrente, activo, aportacion, patrimonio, objetivo, recordatorio, regla, perfil, cierre (+ internos pendiente, ignorado). Añadir un campo = añadirlo aquí y en `FORMS` (web/paneles/formularios.js). |
| Importación | `financebuddy/importar.py`, `lectura.py`, `clasificar.py` | Formato de archivo = registro `perfil` (columnas por texto de cabecera). Banco: comprueba la cadena de saldos (si hay), clasifica, descarta duplicados por **huella** (`ext_fecha` + `ext_importe`, contando gemelos) y deja las dudas como `pendiente`. Inversión: compras por `activo.patrones`, intereses/ignorar por `perfil.acciones`. `resolver()` con «recordar» crea la regla y resuelve las demás dudas iguales; con `ids`, resuelve el grupo de «Por revisar» entero. **Historial** (`clasificar.memoria/por_memoria`): sin regla, si ya clasificaste ese comercio (clave = `patron_sugerido`, ≥ 75 % la misma categoría; Bizums ≥ 2 veces) se clasifica solo (`aprendidas`). `sugerir()` (mismo comercio o el más parecido con `difflib`) rellena `pendiente.sugerencia` en `/api/datos`. `recategorizar()` cambia la categoría de un movimiento, opcionalmente de los parecidos (y las dudas iguales), y crea la regla. **Cabecera** (`lectura.datos_cabecera`): IBAN (4 últimas cifras → `cuenta.iban`, elige la cuenta sola) y titular (→ `config.titulares`; `clasificar.es_titular` marca como traspaso el dinero a tu nombre). **`emparejar_traspasos()`** (tras cada importación): salida en una cuenta + entrada en otra, mismo importe, ±3 días → traspaso en el banco y se descarta la del bróker. Dudas del bróker: `sugerencia_inversion()` (crear activo con `nombre_activo`/`clase_activo`, traspaso, intereses). **Plantilla versionada** (`plantilla.VERSION`): al subirla, las instalaciones existentes reciben las categorías y reglas nuevas. |
| Fijos y orígenes | `financebuddy/detectar.py` | `fijos()`: agrupa movimientos por `origen()` (pagador/comercio/persona del Bizum + concepto) y propone recurrentes (≥2 meses seguidos, 1 al mes, importe ±25 %, día ±7; gastos variables ≥3 meses). `crear()`: recurrente + regla con `recurrente` + enlaza lo importado desde `desde`. `origenes()`: ingresos por quién los paga. Pantalla `#fijos`. |
| Interfaz | `financebuddy/web/` | `index.html` (menú lateral; abajo en el móvil) + `nucleo.js` (ayudas de DOM `createEl/createDiv…`, `FB.api`, menú, navegación `#pantalla/params`) + `estilos.css` (tokens `--bg/--surface/--ink/--brand/--aurora`). `paneles/*.js` se concatenan y comparten ámbito, en orden: datos → calculos → componentes → graficos → inicio → formularios → pantallas. Pantallas v1: Inicio (paneles de `PANELES_INICIO`; visibles y orden en `config.inicio` / `config.inicio_ocultos`) y Movimientos con la vista `#movimientos/categorias` (`inicio.js`), Importar, Por revisar, Ajustes (`pantallas.js`); rutas antiguas (`#resumen`, `#gastos`…) son alias. `render()` y la tabla de pantallas están al final de `pantallas.js`. |

Modelo de dinero (calculos.js): los saldos salen de proyectar el último registro de `patrimonio` con los movimientos posteriores, **cuenta a cuenta** (`proyectar`). Un traspaso mueve dinero a la otra cuenta solo si esa cuenta **no** importa extracto (`cuenta.extracto`); si lo importa, el traspaso ya viene en su propio extracto. Tipos de cuenta: corriente, ahorro, broker (efectivo para invertir; paga las aportaciones), otro. Los recurrentes generan movimientos automáticos salvo que exista uno real enlazado (`recurrente`) ese mes.

Personalización: `categoria.icono`/`categoria.color` (los usan `catIcono`/`catColor`); `config.acento` (lista `ACENTOS` en servidor.py y pantallas.js → `body[data-acento]` en estilos.css); el tema (auto/claro/oscuro) vive en `localStorage` (`FB.tema()`).

## Probar (siempre tras un cambio)
```bat
python -m unittest pruebas.test_importar pruebas.test_servidor      :: importación, API y seguridad
python pruebas\run.py --tests                                       :: todas las pantallas sin errores + pruebas de cálculos
python pruebas\run.py inicio,movimientos --shot [--tema=oscuro]     :: capturas en %TEMP%\fb-pruebas (mirarlas con Read)
```
- Fuera de Windows (o con otro navegador): `FB_NAVEGADOR=/ruta/a/chrome python pruebas/run.py --tests`.
- `run.py` arranca un servidor con datos de ejemplo (`ejemplo.py`, hoy = 30/09/2026) y abre cada pantalla en Chrome/Edge sin ventana; imprime los errores de la página. Si el navegador no devuelve nada, suele ser una actualización de Edge a medias: se usa Chrome si está.
- Cálculos: `pruebas/pruebas_calculos.js` (recibe `F` = funciones expuestas en `window.__fin`). Al tocar un cálculo, añade un caso. Si cambias `ejemplo.py`, revisa las cifras esperadas.
- Añadir un banco de serie: un `perfil` en `plantilla.PERFILES` (columnas = texto de la cabecera sin tildes y en minúsculas) + una prueba en `test_importar.py` con un archivo generado.

## Compilar
`build.bat` → pasa las pruebas y genera `dist\FinanceBuddy.exe` (onefile, sin consola, icono `recursos\icono.ico`, incluye `financebuddy\web`). Rutas dentro del .exe: `rutas.PAQUETE`/`rutas.WEB` (usan `sys._MEIPASS`).

## Reglas
- Nunca guardar datos de usuario en el repositorio (`.gitignore` excluye `*.db`, `Importar/`, `Copias/`, extractos).
- Textos de la interfaz: español claro, sin jerga («Entre tus cuentas», «Te lo devolvieron»); explicaciones con `ayuda()` (ⓘ).
- Colores: variables `--fin-*` de estilos.css; verde/rojo solo para ganancia/pérdida y estado.
- La app debe funcionar sin Claude: cualquier acción del usuario tiene su pantalla.

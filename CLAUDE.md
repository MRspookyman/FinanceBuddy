# FinanceBuddy · lo imprescindible para trabajar aquí

App de finanzas personales **100 % local para Windows**: un `.exe` levanta un servidor en `127.0.0.1:8765` y se abre en el
navegador. Importas extractos del banco y del bróker (Excel/CSV) y te dice cuánto puedes gastar, a dónde va tu dinero, cuánto
tienes y cómo va tu inversión. Todo en **español** y en **euros**.

Python (biblioteca estándar + `openpyxl`/`xlrd`/`pystray`) · SQLite · interfaz web en JavaScript sin framework ni compilación.

**Este archivo es el que hay que leer siempre.** [`CONTEXTO.md`](CONTEXTO.md) es el historial largo (auditorías, por qué de
cada decisión, backlog): se consulta por secciones cuando hace falta, no entero. [`README.md`](README.md) es para quien usa la app.

## Reglas que no se rompen

1. **Todo local.** Nada de nube, cuentas ni conexión con el banco. Las únicas salidas a internet son **opcionales y apagadas
   de serie**: asistente Jev, precios por internet (solo el identificador del producto) y aviso de versión. Sin ellas, la app
   no abre ninguna conexión.
2. **La app funciona sin Jev.** Él solo *sugiere*; nunca guarda nada por su cuenta. Cada acción tiene su pantalla.
3. **Español claro, sin jerga**, importes en € con formato español (`1.234,56 €`). Lo esencial a la vista, el resto plegado.
4. **Colores con significado:** gasto en coral, verde/rojo solo para ganancia/pérdida, rosa = algo va mal.
5. **Accesibilidad:** cada campo con su nombre, foco visible, contraste ≥ 4,5:1.
6. **Nunca subir datos del usuario al repositorio** (`.gitignore` excluye `*.db`, `Importar/`, `Copias/`, `*.xlsx`, `*.csv`).
   Las pruebas usan datos **inventados**.
7. **La clave de Jev nunca va en el código, los tests, los commits ni una PR.** Vive en `config.jev` de la base local.
8. El servidor solo escucha en `127.0.0.1`, exige cabecera `Host` local y un token por arranque (`X-FB-Token`), y **solo
   sirve archivos de `web/`** (`servidor._dentro_de`).
9. **Solo escritorio:** nadie usa la app desde el móvil; no hay que diseñar ni probar para pantalla estrecha.

## Comandos

```bat
python -m financebuddy --ejemplo --sin-navegador --puerto 8830 --hoy 2026-09-30   :: app con datos inventados
python -m unittest discover -s pruebas -p "test_*.py" -t .     :: 176 pruebas de Python
python pruebas\run.py --tests                                  :: 20 pantallas sin errores + 84 pruebas de cálculos
python pruebas\run.py --flujos                                 :: 10 flujos con clics de verdad
python pruebas\run.py --capturas                               :: capturas en claro y oscuro (%TEMP%\fb-pruebas)
python pruebas\evaluar_jev.py / evaluar_precios.py             :: contra los servicios reales (lo ejecuta el usuario)
build.bat                                                      :: pasa TODO lo anterior y genera dist\FinanceBuddy\
```

Las tres tandas de pruebas tienen que quedar en verde antes de cerrar una tarea. `build.bat` las ejecuta todas; si no hay
navegador instalado, `run.py` devuelve 3 y el build avisa y sigue.

**Cuidado con el puerto:** la app real del usuario suele estar abierta en el **8765**. Las pruebas van en otro puerto y con
carpeta de datos propia, y **nunca** hay que pulsar «Volver a mis datos» ni «Usar otra carpeta» en un servidor de pruebas.

**Y con la carpeta de datos:** cuál es la suya no se guarda dentro de ella, sino en `%APPDATA%\FinanceBuddyjustes.json`,
que es único para todo. Cualquier cosa que llame a `/api/carpeta` lo reescribe y la app real se queda apuntando ahí (parece
que no hay datos, aunque estén). Las pruebas lo apartan a una ruta temporal (`test_robustez.setUp`): si escribes una prueba
que toque carpetas, haz lo mismo.

## Mapa del código

```
navegador ──GET /api/datos──▶ servidor.py ──▶ almacen.py ──▶ SQLite (datos.db)
    │                         App.manejar(ruta, datos) = toda la escritura (POST /api/…)
    └── web/paneles/*.js: se concatenan en el orden de servidor.MODULOS y comparten ámbito
```

| Capa | Archivos |
|---|---|
| Arranque | `__main__.py` (cuadros de Windows si algo falla, recuperar una base dañada), `rutas.py` |
| API | `servidor.py` (`App.datos()` calcula también las sugerencias de cada duda) |
| Datos | `almacen.py` (tabla `registros(id, tipo, datos JSON)` + `config`), `modelo.py` (`CAMPOS` define y valida cada tipo) |
| Importación | `importar.py`, `lectura.py`, `clasificar.py`, `operaciones.py`, `cartera.py`, `detectar.py`, `ordenar.py` |
| Opcionales | `precios.py`, `jev.py`, `actualizaciones.py` |
| Salidas | `exportar.py` (Excel), `web/paneles/exportar.js` (resumen HTML) |

Para añadir algo: `modelo.CAMPOS` **y** `FORMS` (`web/paneles/formularios.js`) → módulo de dominio → ruta en `servidor.py`
→ pantalla (`web/paneles/*.js`) → prueba (Python y, si hay cálculo, `pruebas/pruebas_calculos.js`) → documentación.

## Trampas conocidas

- `FB.refrescar()` vuelve a ejecutar los módulos: el estado que debe sobrevivir va en **`FB.estado`**.
- Los `<select>` de formularios llevan siempre **cadenas** (un id numérico, a `String`).
- «Tu mes» **no es el mes natural** (`config.dia_inicio`): para gasto se usa `keyDe()`/`iniMes()`/`diasMes()`; inversión,
  saldos y cierres van por mes natural (`keyCal()`).
- `movimiento.importe` es **siempre positivo**; el signo lo da `clase`.
- Los avisos de nivel `info` no se enseñan en ninguna parte (solo los `warn` del Inicio).
- Las copias se ordenan por `almacen.copias_de()` (por su fecha, no alfabéticamente: el mismo día puede haber varias).
- Al cambiar categorías, reglas o perfiles de serie, **sube `plantilla.VERSION`**.

## Cómo trabaja el usuario

Habla en español, directo. Pide auditorías y estudios en profundidad, y que se le diga **qué se hizo, qué se descartó y por
qué**. Valora cifras medidas con sus datos reales y poder comprobarlo él mismo. Le importa más la claridad en pantalla que
añadir funciones. Confirma con «si», «fusiona» o «megea». **No se abre PR salvo que lo pida.**

# FinanceBuddy · lo imprescindible para trabajar aquí

App de finanzas personales **100 % local para Windows**: un `.exe` levanta un servidor en `127.0.0.1:8765` y se abre en el
navegador. Importas extractos del banco y del bróker (Excel/CSV) y te dice cuánto puedes gastar, a dónde va tu dinero, cuánto
tienes y cómo va tu inversión. Todo en **español** y en **euros**.

Python (biblioteca estándar + `openpyxl`/`xlrd`/`pystray`) · SQLite · interfaz web en JavaScript sin framework ni compilación.

**Este archivo es el que hay que leer siempre**: reglas, comandos, mapa del código y trampas conocidas.
[`README.md`](README.md) es para quien usa la app. El porqué de cada decisión está en el historial de git (`git log`).

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
7. **La clave de Jev nunca va en el código, los tests, los commits ni una PR.** Vive en `config.jev` de la base local,
   cifrada para el usuario de Windows (`secreto.py`): una clave nueva se guarda con `secreto.guardar` y se lee con `secreto.leer`.
8. El servidor solo escucha en `127.0.0.1`, exige cabecera `Host` local y un token por arranque (`X-FB-Token`), y **solo
   sirve archivos de `web/`** (`servidor._dentro_de`).
9. **Solo escritorio:** nadie usa la app desde el móvil; no hay que diseñar ni probar para pantalla estrecha.

## Comandos

```bat
python -m financebuddy --ejemplo --sin-navegador --puerto 8830 --hoy 2026-09-30   :: app con datos inventados
python -m unittest discover -s pruebas -p "test_*.py" -t .     :: 212 pruebas de Python
python pruebas\run.py --tests                                  :: 20 pantallas sin errores + 110 pruebas de cálculos
python pruebas\run.py --flujos                                 :: 21 flujos con clics de verdad
python pruebas\run.py --capturas                               :: capturas en claro y oscuro (%TEMP%\fb-pruebas)
python pruebas\evaluar_jev.py / evaluar_precios.py             :: contra los servicios reales (lo ejecuta el usuario)
build.bat                                                      :: pasa TODO lo anterior y genera dist\FinanceBuddy\
```

Las tres tandas de pruebas tienen que quedar en verde antes de cerrar una tarea. `build.bat` las ejecuta todas; si no hay
navegador instalado, `run.py` devuelve 3 y el build avisa y sigue.

**Cuidado con el puerto:** la app real del usuario suele estar abierta en el **8765**. Las pruebas van en otro puerto y con
carpeta de datos propia, y **nunca** hay que pulsar «Volver a mis datos» ni «Usar otra carpeta» en un servidor de pruebas.

**Y con la carpeta de datos:** cuál es la suya no se guarda dentro de ella, sino en `%APPDATA%\FinanceBuddy\ajustes.json`,
que es único para todo. Una app arrancada con `--datos`, `--ejemplo` o `--pruebas` (`App.fija`) ni lo escribe ni lo lee para
«Volver a mis datos». Pero una `servidor.App(...)` creada a pelo en una prueba sí: `/api/carpeta` lo reescribe y la app real
se queda apuntando ahí (parece que no hay datos, aunque estén). Las pruebas lo apartan a una ruta temporal
(`test_robustez.setUp`): si escribes una prueba que toque carpetas, haz lo mismo.

## Mapa del código

```
navegador ──GET /api/datos──▶ servidor.py ──▶ almacen.py ──▶ SQLite (datos.db)
    │                         App.manejar(ruta, datos) = toda la escritura (POST /api/…)
    └── web/paneles/*.js: se concatenan en el orden de servidor.MODULOS y comparten ámbito
```

| Capa | Archivos |
|---|---|
| Arranque | `__main__.py` (cuadros de Windows si algo falla, recuperar una base dañada), `rutas.py`, `recordar.py` (avisos de Windows desde la bandeja: opcionales, apagados de serie y sin internet), `autoarranque.py` (que Windows abra la app en la bandeja al iniciar sesión: opcional y apagado de serie) |
| API | `servidor.py` (`App.datos()` calcula también las sugerencias de cada duda) |
| Datos | `almacen.py` (tabla `registros(id, tipo, datos JSON)` + `config`), `modelo.py` (`CAMPOS` define y valida cada tipo) |
| Importación | `importar.py`, `lectura.py`, `clasificar.py`, `operaciones.py`, `cartera.py`, `detectar.py`, `ordenar.py` |
| Opcionales | `precios.py`, `jev.py`, `actualizaciones.py`, `secreto.py` (cifra sus claves con DPAPI) |
| Salidas | `exportar.py` (Excel), `web/paneles/exportar.js` (resumen HTML) |

Para añadir algo: `modelo.CAMPOS` **y** `FORMS` (`web/paneles/formularios.js`) → módulo de dominio → ruta en `servidor.py`
→ pantalla (`web/paneles/*.js`) → prueba (Python y, si hay cálculo, `pruebas/pruebas_calculos.js`) → documentación.

## Trampas conocidas

- `FB.refrescar()` vuelve a ejecutar los módulos: el estado que debe sobrevivir va en **`FB.estado`**.
- Los `<select>` de formularios llevan siempre **cadenas** (un id numérico, a `String`).
- «Tu mes» **no es el mes natural** (`config.dia_inicio`): para gasto se usa `keyDe()`/`iniMes()`/`diasMes()`; inversión,
  saldos y cierres van por mes natural (`keyCal()`).
- `movimiento.importe` es **siempre positivo**; el signo lo da `clase`.
- Un movimiento dividido son varios con el mismo `parte_de` (`importar.dividir`): comparten la huella del extracto y quedan fuera de
  «cambiar todo el comercio», de aplicar reglas, del repaso de Jev y de lo que aprende el historial. Si añades otra operación en
  bloque sobre movimientos, sáltate los que tengan `parte_de`. Una parte no cambia de importe, fecha, cuenta ni tipo, ni se borra
  sola (`importar.comprobar_parte`, `/api/borrar`): antes hay que juntarla. Los Bizums no se enlazan solos a una parte, y con uno
  enlazado a mano no se deja juntar.
- Un mes está cerrado solo si su `cierre` lleva saldos de su último día o de después (`App.cierre` en el servidor y `cierreVale`
  en `datos.js`, que además ignora los cierres de mitad de mes que guardaban versiones anteriores). Anotar saldos otro día no cierra nada.
- `lectura.filas_crudas` decide por lo que el archivo es por dentro (firma de zip o de Excel antiguo, el `<` de una página web,
  la marca UTF-16), no por su extensión. Y `lectura.fecha` también sirve para reconocer qué columna es la fecha: un formato
  nuevo tiene que casar la celda entera y no ser ambiguo (ni orden americano ni «20260930»).
- Una fila con cifras donde va la fecha y donde va el importe que no se puede leer no se salta en silencio: va a `ilegibles`
  (`importar.leer`, `operaciones.leer`) y la vista previa la enseña con su número de fila y el motivo. Otro lector de archivos, igual.
- Un activo deja de verse de dos formas: `estado: vendido` (lo marca el usuario: `activos()` ya no lo devuelve) o «vendido del
  todo» (`vendidoDelTodo`: sus participaciones suman cero). En los dos casos sus aportaciones siguen contando en la renta
  (`fifoVentas` hereda el coste por los traspasos): borrar un fondo de origen deja sin emparejar los traspasos del de destino.
- `autoarranque` escribe en el registro del usuario de Windows (`HKCU\…\Run`), y solo desde el `.exe` con los datos de siempre
  (ni desde el código fuente ni con `App.fija`). Sus pruebas cambian `autoarranque.CLAVE` por una rama que Windows no ejecuta:
  una prueba nueva que lo toque tiene que hacer lo mismo, o dejaría algo arrancando en el Windows de quien la pase.
- Los avisos de Windows apuntan en `config.avisos_windows_dichos` cuándo se dijo cada cosa (un recordatorio, una vez al día;
  «toca importar», una vez a la semana): así reiniciar no los repite. El hilo que los mira escribe en la base por su cuenta.
- «Gasto variable» deja fuera las categorías de grupo fijo. Lo que haya en ellas sin ser el pago de un fijo dado de alta es
  `gastoFijoSuelto`: la previsión y el colchón lo suman aparte. Si añades otro cálculo de «lo que sale al mes», cuenta las tres cosas.
- En el Inicio van a la vista dos avisos `warn`; el resto y los `info`, plegados en «y N avisos más» (`repartirAvisos`).
  Cada aviso lleva una `clave` con el mes o el dato que lo provoca: la × la guarda en `config.avisos_descartados` y no vuelve a salir
  hasta que eso cambia. Un aviso nuevo sin clave no se puede quitar.
- «Deshacer» repone la foto **entera** de antes, así que cualquier otra escritura la anula (`App.manejar`). Una ruta nueva
  que solo consulte va en `servidor.NO_ANULAN_DESHACER`; si no, el «Deshacer» desaparece al llamarla.
- Si cambia el formato de los datos (también un campo nuevo: una app anterior lo borraría al editar), **sube `almacen.VERSION_ESQUEMA`**:
  al abrir, la base se marca con la versión de ahora y una versión anterior de la app se negará a abrirla.
- Las copias se ordenan por `almacen.copias_de()` (por su fecha, no alfabéticamente: el mismo día puede haber varias).
- Al cambiar categorías, reglas o perfiles de serie, **sube `plantilla.VERSION`**.

## Cómo trabaja el usuario

Habla en español, directo. Pide auditorías y estudios en profundidad, y que se le diga **qué se hizo, qué se descartó y por
qué**. Valora cifras medidas con sus datos reales y poder comprobarlo él mismo. Le importa más la claridad en pantalla que
añadir funciones. Confirma con «si», «fusiona» o «megea». **No se abre PR salvo que lo pida.**

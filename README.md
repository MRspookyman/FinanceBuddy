# FinanceBuddy

Tus finanzas personales **en tu ordenador**. Importas los extractos de tu banco y de tu bróker (Excel o CSV) y la app te dice:

- **cuánto puedes gastar** lo que queda de mes y esta semana;
- **qué hacer con tu dinero**: cuánto conviene dejar en la cuenta corriente y cuánto mover al ahorro o a la inversión;
- a dónde va tu dinero (gastos por categoría) y de dónde viene;
- cuánto tienes en cada cuenta y cómo va tu **inversión**.

Pantallas: **Inicio**, **Movimientos**, **Inversión**, **Importar** y **Ajustes**.

Nada sale de tu ordenador: no hay cuentas, ni nube, ni conexión con el banco. Los datos se guardan en un archivo de tu carpeta Documentos.

Solo para **Windows**. Todo en español y en euros.

## Empezar

1. Descarga `FinanceBuddy.exe` y ábrelo (doble clic). No hace falta instalar nada.
   - Windows puede avisar de que es una aplicación desconocida: pulsa «Más información» → «Ejecutar de todas formas».
2. Se abre en tu navegador. La primera vez te pide:
   - tus cuentas y cuánto tienes hoy en cada una;
   - tu límite de gasto variable al mes;
   - tus ingresos y gastos fijos.
   Si prefieres verla antes, pulsa **«Probar con datos de ejemplo»**.
3. **Importa** el extracto de tu banco: pestaña *Importar* → arrastra el Excel o CSV.
   - La primera vez con un banco nuevo te pregunta qué columna es la fecha, el concepto y el importe. Solo esa vez.
4. **Por revisar**: lo que la app no sabe clasificar sola te lo pregunta, agrupado por comercio.
   - Un clic en la categoría (la más probable sale la primera, marcada con ✨) resuelve el grupo entero y lo recuerda.
   - **Aprende sola**: lo que ya clasificaste antes de un comercio se usa la siguiente vez, aunque no marques «recordar».
   - Si una categoría está mal, pulsa el movimiento y elige otra: puedes cambiar a la vez todos los del mismo comercio.
5. Una vez al mes, *Ajustes → Actualizar saldos*: anotas lo que tienes en cada cuenta y el valor de tu inversión.
   - Así la app comprueba que no falta ningún movimiento.
6. Con dos o más meses importados, *Ajustes → Detectar fijos*: la app encuentra tus nóminas, alquiler y recibos (lo que se repite cada mes) y te los propone; también te enseña **de dónde viene tu dinero**.

**Inversión**: lo que vale y lo que has metido en cada activo, ganancia y rentabilidad anual, evolución, cuánto
aportas cada mes (y cuántos meses seguidos), reparto por tipo (fondos, ETF, cripto, materias primas), participaciones y
precio medio (si el extracto del bróker las trae, como MyInvestor: «… @ 2»), gastos corrientes, intereses del dinero
sin invertir y posiciones ya vendidas con su resultado.
**Órdenes y operaciones**: el CSV de **órdenes de fondos** de MyInvestor (*Fondos → Órdenes*: ISIN, importe,
participaciones) añade las participaciones de cada compra y los **traspasos entre fondos** (vender uno para comprar otro:
no cuentan como dinero nuevo), que no salen en la cuenta de efectivo. Un Excel de **operaciones con títulos** (Fecha,
Tipo, Activo, Estado, Títulos) completa las participaciones de ETF y cripto. Nada se duplica con el extracto de la
cuenta, se importe antes uno u otro. Con las participaciones, en *Actualizar valores* basta con poner el precio.

**A tu gusto** (*Ajustes*): tema automático, claro u oscuro y color de acento; qué paneles ves en el Inicio y en qué orden;
icono, color y presupuesto de cada categoría (con aviso si te pasas). En *Movimientos → Por categoría* ves cada una
frente a tu media de los meses anteriores, y en el Inicio, el ritmo de gasto del mes frente a lo que sueles llevar.

Cerrar la pestaña del navegador no cierra la app: para cerrarla, *Ajustes → Cerrar FinanceBuddy*. Si la vuelves a abrir, se reutiliza la que ya estaba en marcha.

## Uso semanal

1. Descarga el extracto de tu banco: en la web o la app del banco, *Movimientos → Exportar a Excel*.
2. Arrástralo a *Importar*, o guárdalo en la carpeta `Importar\Banco` y pulsa «Importar la carpeta».
   - Los movimientos del bróker van a `Importar\Inversión`.
3. Revisa lo pendiente, si hay algo.
4. Mira el *Inicio*.

Importar dos veces el mismo periodo **no duplica nada**: cada movimiento se reconoce por su fecha e importe en el extracto.

## Bancos y brókers

- **De serie** reconoce los extractos de **Santander** y la cuenta de efectivo de **MyInvestor**.
- **Cualquier otro** banco o bróker que exporte Excel o CSV funciona:
  - la primera vez le dices qué columna es cada cosa;
  - vale el importe con signo, o columnas separadas de cargo y abono;
  - el saldo es opcional, pero recomendado.
- **Sin preguntar de qué cuenta es**: si el extracto trae el IBAN, la app lo recuerda (sus 4 últimas cifras) y la próxima vez lo importa en su cuenta sola.
- **Tus traspasos**: si el extracto trae el titular, el dinero que mueves a tu nombre se reconoce como traspaso (no como gasto o ingreso). Y si la salida de una cuenta y la entrada en otra (mismo importe, ±3 días) están en extractos distintos, se emparejan solas.
- **Inversión**: las compras se asignan a cada activo por el texto con el que aparecen en el extracto. La primera vez te propone crear el activo (con nombre y tipo) y con un clic guarda todas sus compras.

## Tus datos

Están en `Documentos\FinanceBuddy` (se puede cambiar en *Ajustes*):

| Carpeta o archivo | Qué es |
|---|---|
| `datos.db` | Todos tus datos (base de datos SQLite). |
| `Importar\Banco`, `Importar\Inversión` | Archivos pendientes de importar. |
| `Importar\Procesados` | Archivos ya importados. |
| `Copias\` | Copia de seguridad automática diaria (las 30 últimas). Se restaura desde *Ajustes*. |

Para llevarte tus datos a otro ordenador, copia la carpeta entera.

## Para desarrolladores

Requisitos: Python 3.10+ en Windows.

```bat
pip install -r requirements.txt -r requirements-dev.txt
python -m financebuddy                 :: arranca con tus datos (Documentos\FinanceBuddy)
python -m financebuddy --ejemplo       :: con datos inventados en una carpeta temporal
python -m unittest pruebas.test_importar pruebas.test_servidor
python pruebas\run.py --tests          :: todas las pantallas en Chrome/Edge sin ventana + pruebas de cálculos
                                       :: (otro navegador: variable FB_NAVEGADOR con la ruta de chrome)
build.bat                              :: genera dist\FinanceBuddy.exe
```

Estructura:

```
financebuddy/
  __main__.py      arranque (servidor local + navegador)
  servidor.py      servidor HTTP en 127.0.0.1 y la API JSON (clave por arranque en la cabecera X-FB-Token)
  almacen.py       base de datos SQLite (registros JSON por tipo) y copias de seguridad
  modelo.py        tipos de registro, campos y validación
  importar.py      importación de extractos: formatos, cadena de saldos, duplicados, dudas
  lectura.py       lectura de Excel/CSV, fechas, importes y reconocimiento del formato
  clasificar.py    clasificación automática (reglas, traspasos, Bizum, recurrentes, lo aprendido de tu historial)
  detectar.py      fijos que se repiten cada mes y de dónde viene el dinero
  operaciones.py   órdenes y operaciones del bróker con participaciones (ISIN, traspasos entre fondos)
  plantilla.py     categorías, reglas y formatos de serie
  ejemplo.py       datos de ejemplo
  web/             la interfaz: index.html, nucleo.js, estilos.css y paneles/*.js
pruebas/           pruebas (Python y cálculos en el navegador)
```

Los módulos de `web/paneles/` se concatenan y comparten ámbito, en este orden: `datos`, `calculos`, `componentes`, `graficos`, `inicio`, `inversion`, `formularios`, `pantallas`.

Con [Claude Code](https://claude.com/claude-code), la skill `.claude/skills/financebuddy-dev` explica la arquitectura y cómo probar y extender la app.

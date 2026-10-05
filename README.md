# FinanceBuddy

Tus finanzas personales **en tu ordenador**. Importas los extractos de tu banco y de tu bróker (Excel o CSV) y la app te dice:

- **cuánto puedes gastar** lo que queda de mes y esta semana;
- **qué hacer con tu dinero**: cuánto conviene dejar en la cuenta corriente y cuánto mover al ahorro o a la inversión;
- a dónde va tu dinero (gastos por categoría) y de dónde viene;
- cuánto tienes en cada cuenta y cómo va tu **inversión**.

Pantallas: **Inicio**, **Movimientos**, **Inversión** (con tus **hitos** y **Para la renta**), **Importar** y **Ajustes**.

Nada sale de tu ordenador: no hay cuentas, ni nube, ni conexión con el banco. Los datos se guardan en un archivo de tu carpeta Documentos.
Hay tres cosas **opcionales y apagadas de serie** que sí se conectan a internet si tú las activas, cada una con su explicación de
qué sale: el asistente **Jev**, los **precios por internet** y el **aviso de versión nueva** (*Ajustes*). Sin ellas, la app no sale a la red.

Solo para **Windows**. Todo en español y en euros.

## Empezar

1. Descomprime la carpeta `FinanceBuddy` y abre `FinanceBuddy.exe` (doble clic). No hace falta instalar nada. Verás su icono en la bandeja de Windows mientras esté en marcha (clic derecho → Cerrar).
   - Windows puede avisar de que es una aplicación desconocida: pulsa «Más información» → «Ejecutar de todas formas».
2. Se abre en tu navegador. La primera vez te pide:
   - tus cuentas y cuánto tienes hoy en cada una;
   - tu límite de gasto variable al mes;
   - tus ingresos y gastos fijos.
   Si prefieres verla antes, pulsa **«Probar con datos de ejemplo»**.
3. **Importa** el extracto de tu banco: pestaña *Importar* → arrastra el Excel o CSV.
   - La primera vez con un banco nuevo te pregunta qué columna es la fecha, el concepto y el importe. Solo esa vez.
   - **Vista previa**: antes de guardar nada te enseña lo que va a importar (movimientos nuevos, los que ya estaban, dudas, ingresos y
     gastos, saldo final y una muestra) para compararlo con tu banco. No se guarda hasta que lo confirmas (se puede desactivar).
   - ¿Sin extracto? *Importar → Descargar la plantilla de Excel*: fecha, concepto, importe y un desplegable con tus categorías.
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
Sin valor anotado, un activo con participaciones se estima con el precio de su última compra o venta (marcado «≈»).

**Hitos** (al final de *Inversión*): las cifras redondas de patrimonio (1 k€, 2,5 k€, 5 k€…) con la fecha en que las cruzaste, la barra
hacia la siguiente y cuánto tardarías al ritmo actual. **Solo largo plazo**: desmarca un activo («Inversión a
largo plazo») para dejar fuera un colchón o una apuesta de las cifras.

**Para la renta** (*Inversión → Para la renta*): ganancias y pérdidas realizadas por año con el método **FIFO** (se vende lo
primero que compraste); un traspaso entre fondos no es venta y el nuevo hereda el coste; **dividendos y comisiones** (se
detectan en el extracto o se anotan a mano) y lo que no se puede calcular (ventas sin participaciones). Es una ayuda para
preparar la declaración, no asesoramiento fiscal. Tipos de activo: fondo, ETF, acción, cripto, materias primas, plan de pensiones,
bono e inmueble.

**Precios por internet (opcional, apagado de serie)** (*Ajustes → Precios por internet*): en vez de anotar a mano lo que vale cada
fondo, ETF o cripto, la app lo consulta a **Yahoo Finance, Morningstar o CoinGecko**. Solo sale el identificador del producto
(ISIN, ticker o nombre de la cripto): **nunca importes, cuentas ni movimientos**. En cada activo, *Buscar el precio por internet*
encuentra el producto por ISIN, ticker o nombre (con su TER y riesgo si es un fondo) y comprueba su precio al momento; con ISIN,
un botón los configura todos de una vez. Las monedas que no son euros se pasan a euros con el cambio del día. El valor de un
activo usa el precio de mercado si conoce sus participaciones y es más nuevo que lo que anotaste. Se actualiza al abrir la app
(si hace más de 6 h) y con un botón; sin conexión, sigue con el último precio guardado y si algo falla lo cuenta **una sola vez**.
Son servicios gratuitos no oficiales: pueden fallar o cambiar;
`python pruebas\evaluar_precios.py` comprueba desde tu ordenador si funcionan hoy.

**Compartir y exportar** (*Ajustes*): un **resumen en HTML** de un solo archivo (patrimonio, ahorro, en qué gastas, inversión) que
se abre sin conexión; «**sin importes**» no tapa las cifras, **no las incluye** (solo porcentajes e índice 100), así que ni el
código fuente del archivo revela cuánto dinero es. La **plantilla de Excel** con desplegable de tus categorías (se importa con
la categoría que elijas). **Aviso de versión** (opcional): una consulta pública a GitHub como mucho al día.

**Modo discreto y atajos**: el botón *Discreto* (tecla **D**) desenfoca los importes para mirar la app con gente al lado (los
porcentajes se ven). **I** = importar; **A** = apuntar un movimiento; **1 a 5** = las secciones del menú; **?** = ver todos los atajos.

**Cuando lo importado no cuadra**: *Inversión* avisa en **Revisa tu inversión** de lo que ve raro (un traspaso desde
tu banco tomado por venta, participaciones vendidas de más, operaciones sin participaciones, compras que no se sabe si
fueron ventas, posibles duplicados, el mismo activo dos veces, valores viejos) y cada aviso lleva a la **ficha del
activo**: todas sus operaciones con su precio y de dónde vienen (extracto, órdenes, a mano), editables una a una;
**Cuadrar con tu bróker** (escribes las participaciones que ves en el bróker y se añade un ajuste sin dinero); **Unir
con otro activo**; y «Era dinero traspasado desde mi banco» o borrar el activo con sus operaciones (no reaparecen al
reimportar el mismo extracto).

**Asistente Jev (opcional)**: con tu clave de [Jev](https://typesafe.ai) (TypeSafe AI) en *Ajustes → Asistente Jev*, la
app le pregunta:
- **Por revisar (banco)**: la categoría de lo que tu historial no reconoce (y, si entra dinero, si es un ingreso o te
  devuelven algo que pagaste).
- **Por revisar (bróker)**: qué es un texto que la app no reconoce —compra, venta, intereses, comisión o traspaso— y
  qué tipo de activo es (fondo, ETF, acción, cripto…), para crearlo con su tipo.
- **Revisar tus categorías** (*Ajustes → Revisar tus categorías*): repasa lo ya clasificado, un comercio cada vez, y
  avisa de lo que está en «Otros» o de lo que cree con ≥ 85 % que es de otra categoría. «Cambiar» lo aplica a todo el
  comercio y lo recuerda como regla. Al importar el banco repasa también lo nuevo que se ha clasificado solo.
- **Apuntar**: al escribir el concepto propone la categoría (tus reglas y tu historial primero; Jev si no lo saben).
- **Bizums recibidos**: de qué gasto tuyo es la parte que te devuelven. Se le enseñan tus gastos de los días anteriores como
  opciones y elige uno (o «ninguno»).
- **Fijos**: si algo que se repite en una categoría de gasto variable parece una cuota (academia, clases…) o solo coincide.
- **Un banco nuevo**: si el archivo es del banco o del bróker y qué columna es cada cosa.

**Qué contexto recibe**, además del concepto y el importe: cómo has clasificado cosas parecidas, tus Bizums más habituales por
concepto, qué ha pasado antes con esa persona (sin su nombre) y que el Bizum que envías suele ser tu parte de algo y el que
recibes la parte que te devuelven. En *Ajustes → Asistente Jev → Ver lo último que se ha enviado* ves, consulta a consulta,
exactamente lo que ha salido de tu ordenador. Tu nombre (titulares) y las direcciones («C/ Linares 4») también se quitan.

Solo sugiere, con su confianza («Jev · 91 %»; desde el 85 % sale marcada al aceptar en bloque). Si no hay conexión o la
clave falla, deja de preguntar y no marca nada (se reintenta la próxima vez). En Ajustes ves las consultas del mes y
lo que cuestan (céntimos). Se envía solo el concepto saneado —sin
nombres de personas en Bizums y transferencias, números de tarjeta, IBAN ni correos— y el importe; la clave se guarda
solo en tu carpeta de datos. Para medir cuánto acierta con tus movimientos antes de fiarte:
`python pruebas\evaluar_jev.py` (con `--mostrar` enseña lo que se enviaría sin enviar nada). Sin clave, todo igual.

**Bizums**: tus Bizums enviados son tu parte de un gasto (categoría por el concepto). Los recibidos son lo que te devuelven de un
gasto que pagaste tú: se restan de su categoría y se enlazan con él (*Movimientos*: «te devolvieron X»; en su ficha, «Tu parte
real»). La app lo casa sola con aritmética: varios Bizums iguales que cuadran con un gasto (5 × 19,56 € = 97,84 € ÷ 5), hasta
10 días después y también si el gasto está en otro extracto; los iguales del mismo día heredan la categoría del que ya la tiene.
Lo que no cuadra aparece en *Por revisar* como un **reparto** (un solo grupo) con los gastos candidatos, con su fecha, importe,
categoría, cuánto te han devuelto ya y cuánto te costó de verdad: eliges uno y queda enlazado.

**Por revisar**: filtros (banco, bróker, con sugerencia) y **Revisar y aceptar las sugerencias** de una vez, con una
casilla por grupo (las dudosas, sin marcar). Las entradas de dinero al bróker con un concepto tuyo («ahorro», «Inicio»)
se proponen como traspaso desde tu banco, no como la venta de un activo.

**A tu gusto** (*Ajustes*): tema automático, claro u oscuro y color de acento; qué paneles ves en el Inicio y en qué orden;
icono, color y presupuesto de cada categoría (con aviso si te pasas). En *Movimientos → Por categoría* ves cada una
frente a tu media de los meses anteriores, y en el Inicio, el ritmo de gasto del mes frente a lo que sueles llevar.

Cerrar la pestaña del navegador no cierra la app: para cerrarla, clic derecho en su icono de la bandeja → *Cerrar FinanceBuddy* (o *Ajustes → General → Cerrar FinanceBuddy*). Si la vuelves a abrir, se reutiliza la que ya estaba en marcha.

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
python -m unittest pruebas.test_importar pruebas.test_servidor pruebas.test_jev pruebas.test_precios pruebas.test_actualizaciones
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
  cartera.py       arreglos a mano: unir activos, deshacer un traspaso tomado por venta, cuadrar participaciones
  precios.py       precios por internet (opcional): Yahoo, Morningstar, CoinGecko, caché, cambio de moneda, buscador y comparador
  actualizaciones.py  aviso de versión nueva (opcional)
  exportar.py      plantilla de Excel con desplegable de categorías
  bizums.py        Bizums recibidos: casar con el gasto que devuelven (aritmética de repartos) y enlazarlo
  jev.py           asistente opcional Jev (TypeSafe AI): dudas del banco y del bróker, repaso de categorías, apuntar, fijos y formatos nuevos
  plantilla.py     categorías, reglas y formatos de serie
  ejemplo.py       datos de ejemplo
  web/             la interfaz: index.html, nucleo.js, estilos.css y paneles/*.js
pruebas/           pruebas (Python y cálculos en el navegador)
```

Los módulos de `web/paneles/` se concatenan y comparten ámbito, en este orden: `datos`, `calculos`, `componentes`, `graficos`, `inicio`, `inversion`, `renta`, `precios`, `exportar`, `formularios`, `pantallas`.

Con [Claude Code](https://claude.com/claude-code), la skill `.claude/skills/financebuddy-dev` explica la arquitectura y cómo probar y extender la app.

Comparativa con otra app similar: [`docs/AUDITORIA-RUMBO.md`](docs/AUDITORIA-RUMBO.md).

**[`CONTEXTO.md`](CONTEXTO.md)** reúne todo el contexto del proyecto —reglas que no se rompen, arquitectura, historial de
cambios, auditorías realizadas con sus hallazgos, decisiones y pendientes— para poder retomar el trabajo sin la conversación
original. Si cambias algo importante, actualízalo.

# FinanceBuddy

Tus finanzas personales **en tu ordenador**. Importas los extractos de tu banco y de tu bróker (Excel o CSV) y la app te dice:

- **cuánto puedes gastar** lo que queda de mes y esta semana;
- **qué hacer con tu dinero**: cuánto conviene dejar en la cuenta corriente y cuánto mover al ahorro o a la inversión;
- a dónde va tu dinero (gastos por categoría) y de dónde viene;
- cuánto tienes en cada cuenta y cómo va tu **inversión**.

Pantallas: **Inicio**, **Cuentas**, **Movimientos** (con **Mi año**), **Inversión** (con tus **metas de patrimonio** y **Para la renta**), **Importar** y **Ajustes**.

Te acompaña **Nubo**, una nube con dos ojos que te dice cómo vas y qué conviene hacer ahora: «antes de fiarte de la cifra del
mes, revisa estos 4 movimientos», «tus saldos son de hace un mes», «todo al día». Nunca riñe y celebra lo que terminas (una
revisión, un mes cerrado), no las subidas o bajadas del mercado. Funciona sin internet; en *Ajustes → Apariencia → Tu
compañero* puedes cambiarle el nombre u ocultarlo (la app funciona igual).

Nada sale de tu ordenador: no hay cuentas, ni nube, ni conexión con el banco. Los datos se guardan en un archivo de tu carpeta Documentos.
Hay dos cosas **opcionales y apagadas de serie** que sí se conectan a internet si tú las activas, cada una con su explicación de
qué sale: los **precios por internet** y el **aviso de versión nueva** (*Ajustes*). Sin ellas, la app no sale a la red.

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
     Si no hay nada raro (ni filas que no se pueden leer, ni dudas por revisar, ni activos nuevos), se resume en una línea con
     el saldo del extracto y se confirma con un solo botón, **Importar**; el detalle queda plegado.
   - ¿Sin extracto? *Importar → Descargar la plantilla de Excel*: fecha, concepto, importe y un desplegable con tus categorías.
4. **Revisión del extracto**: al confirmar una importación, Nubo te lleva por tres pasos que puedes dejar a medias y retomar
   («Seguir donde lo dejaste»): **qué ha entrado** (nuevos, los que ya estaban, entradas y salidas, y la lista plegada),
   **qué necesita revisión** (primero las dudas **de este extracto**; lo pendiente de antes va aparte y plegado, y si el extracto
   no deja dudas puedes ir directo a saldos) y **comprobar saldos**: escribes el saldo que ves en tu banco
   (el campo empieza vacío) y te dice «✓ Cuadra» o «No cuadra por X €». «Guardar estos saldos» los anota como saldos de hoy sin
   cerrar el mes (las cuentas que no escribas se quedan con su saldo estimado). Al terminar, el resumen separa los saldos que
   cuadran, los que tienen diferencia y los **sin comprobar** (los que dejaste vacíos); terminar no guarda nada.
   **Por revisar** sigue en el menú: agrupa comercios; cada Bizum tiene su tarjeta (solo se juntan con la misma cuenta, persona y concepto).
   - El historial **solo sugiere**: seis categorías a mano y un buscador para las demás; nada se guarda por una sugerencia.
   - **La próxima vez** va encima de las categorías (al elegir una categoría se guarda): «Pregúntame» resuelve solo la selección; «Siempre» crea o actualiza tu regla; en Bizums puedes limitarla a una palabra del concepto.
     Con tres decisiones seguidas iguales, «Siempre» aparece premarcado: puedes cambiarlo antes de elegir categoría.
   - Las pistas por palabras solo miran el nombre del comercio o el concepto (no el texto técnico del banco, como «COMISION 0,00») y nunca salen marcadas para aceptar en bloque.
   - En *Movimientos*, pulsar uno sin revisar abre su tarjeta en *Por revisar*; «← Volver a Movimientos» te deja la lista con los mismos filtros.
   - Si una categoría está mal, pulsa el movimiento y elige otra: cambia **solo ese** y se puede deshacer. Si quieres, una
     casilla (sin marcar) cambia también los demás de ese comercio y lo recuerda para los próximos.
   - **Corregir se puede deshacer**: cambiar un movimiento, una cuenta o un fijo, borrar algo, anotar saldos o valores, cerrar
     el mes o crear los fijos que te propone la app. El aviso de abajo trae «Deshacer» y, hasta que guardes otra cosa, también
     está en *Ajustes → Copias y archivos*. En la ficha de un movimiento, lo menos usado va plegado: *Pago de un fijo*,
     *Compartir o devolver* y *Más datos*.
   - O sin salir de *Movimientos → Lista*: cada fila lleva su categoría en un desplegable, y con las casillas eliges varios
     y los pasas a otra de golpe (las partes de un movimiento dividido se cambian una a una). Se puede deshacer.
     En *Movimientos → Lista*, **Más filtros** (plegado) acota por cuenta, por importe (desde/hasta, sin contar el signo) o solo lo sin revisar.
5. Al acabar el mes, **Cerrar el mes** (*Inicio* o *Ajustes → Actualizar saldos*): anotas lo que tienes en cada cuenta y el valor de tu inversión.
   - Así la app comprueba que no falta ningún movimiento. Antes te enseña **así ha ido el mes** (lo que entró y salió, el ahorro
     y cuánto te pasaste o te sobró del límite), tus metas y lo que queda sin revisar (informa, no bloquea).
   - Si te pasaste, te propone **bajar tu límite 50 €**: solo si lo pulsas, y vale para los meses siguientes (se cambia en *Ajustes*).
   - Un mes queda cerrado con los saldos de su último día (o de después). Si los anotas a mitad de mes se guardan igual, pero
     ese mes se te volverá a pedir cuando acabe.
6. Con dos o más meses importados, *Ajustes → Tu dinero → Fijos → Posibles fijos en tus movimientos*: la app encuentra tus nóminas, alquiler y recibos (lo que se repite cada mes) y te los propone; también te enseña **de dónde viene tu dinero** y, si tienes fijos que no son mensuales (un seguro anual, el IBI…), **cuánto apartar al mes** para ellos.

**Inicio**: arriba, lo que dice Nubo cambia según lo que toca: si hay movimientos sin revisar, te pide revisarlos antes de fiarte
de la cifra del mes; si la previsión dice que tus cuentas no llegan, cuánto gastar menos al mes para llegar; si tus saldos son
antiguos o no cuadran, comprobarlos; al acabar el mes, cerrarlo; y si no, «Todo al día». Siempre a la vista, dos medidores
distintos: **Tu presupuesto** (tu propio límite de gasto variable, con el ritmo del mes) y **Lo que tus cuentas aguantan**
(lo más bajo que llegarán tus cuentas en los próximos meses, y en el escenario prudente). Al lado, **Qué conviene mirar**: los
avisos agrupados en *Necesita atención*, *Próximamente* y *Para cuando puedas*, cada uno con su señal en palabras y color
(rosa si algo no cuadra o no llega, coral si es gasto, ámbar si está pendiente) y «Nuevo» en los que no habías visto.
Debajo, **Tus cuentas** en tarjetas y los paneles de dos en dos: el ritmo del mes con a dónde va tu dinero, la previsión con
los próximos cargos, tu dinero total con tus metas (la sugerencia de cuánto pasar al ahorro va junto a su meta) y «¿Me puedo
permitir un gasto?». Todas las cajas miden lo mismo y van en dos columnas iguales; lo que no cabe en una se resume y lleva
«Ver todo →».

**Cuentas**: una tarjeta por cuenta con su saldo estimado hoy y de cuándo es el último saldo anotado. Al elegir una ves sus
movimientos del mes y puedes **personalizarla**: nombre visible, icono y color (el nombre de la cuenta en tus movimientos no
cambia; se puede deshacer).

Mientras empiezas, el Inicio enseña **Primeros pasos**: estos pasos en una lista que se tacha sola según los vas haciendo. Con «Ocultar» no vuelve a salir.

Cuando vuelves y hay movimientos o avisos nuevos desde la última vez, el Inicio pone bajo los avisos una línea: «Desde la última vez: 12 movimientos nuevos (del 04/09 al 29/09)» y cuánto ha cambiado tu dinero total; los avisos nuevos van marcados «Nuevo» en la lista, sin repetirse aquí. Con «Entendido» desaparece hasta el siguiente cambio. La primera vez no sale.

**Inversión**: lo que vale y lo que has metido en cada activo, ganancia y rentabilidad anual, evolución, cuánto
aportas cada mes (y cuántos meses seguidos), reparto por tipo (fondos, ETF, cripto, materias primas), participaciones y
precio medio (si el extracto del bróker las trae, como MyInvestor: «… @ 2»), gastos corrientes, intereses del dinero
sin invertir y posiciones ya vendidas con su resultado. Plegados bajo la tabla: lo que pagas al año en comisiones
(valor de cada fondo × su TER; solo los que tienen TER) y los dividendos e intereses cobrados por año, con el
rendimiento de cada activo (dividendos de los últimos 12 meses ÷ lo que vale hoy).
**Órdenes y operaciones**: el CSV de **órdenes de fondos** de MyInvestor (*Fondos → Órdenes*: ISIN, importe,
participaciones) añade las participaciones de cada compra y los **traspasos entre fondos** (vender uno para comprar otro:
no cuentan como dinero nuevo), que no salen en la cuenta de efectivo. Un Excel de **operaciones con títulos** (Fecha,
Tipo, Activo, Estado, Títulos) completa las participaciones de ETF y cripto. Nada se duplica con el extracto de la
cuenta, se importe antes uno u otro. Con las participaciones, en *Inversión → Anotar valores a mano* basta con poner el precio.
Sin valor anotado, un activo con participaciones se estima con el precio de su última compra o venta (marcado «≈»).

**Reparto ideal** (*Inversión*): dices qué porcentaje quieres en cada activo y la app te enseña en cuánto te has desviado y
**a dónde llevar la próxima aportación** para acercarte, sin vender nada. Es información, no asesoramiento financiero.
Si un activo se sale más de 5 puntos de su porcentaje, el Inicio lo dice en una nota (se quita con su ×). Sin reparto ideal, no avisa.

**Metas de patrimonio** (al final de *Inversión*): las cifras redondas de patrimonio (1.000 €, 2.500 €, 5.000 €…) con la fecha en que las cruzaste, la barra
hacia la siguiente y cuánto tardarías al ritmo actual. **Solo largo plazo**: desmarca un activo («Inversión a
largo plazo») para dejar fuera un colchón o una apuesta de las cifras.

**Para la renta** (*Inversión → Para la renta*): ganancias y pérdidas realizadas por año con el método **FIFO** (se vende lo
primero que compraste); un traspaso entre fondos no es venta y el nuevo hereda el coste; **dividendos y comisiones** (se
detectan en el extracto o se anotan a mano) y lo que no se puede calcular (ventas sin participaciones). Es una ayuda para
preparar la declaración, no asesoramiento fiscal. En cada dividendo puedes anotar la **retención**; con ella la pantalla enseña el
bruto, lo ya retenido y **lo que te saldría a pagar** (tramos del ahorro, restando las pérdidas de los cuatro años anteriores), y
«Descargar el año (CSV)» lo saca a Excel. Una venta con pérdidas en la que compraste lo mismo en los dos meses de antes o de
después (un año en fondos de inversión) se marca como «podría no contar»: Hacienda no deja restar esa pérdida hasta que vendas lo
que compraste. Se sigue restando, pero la pantalla te dice cuánto saldría si no contara. En la ficha de cada activo, «¿Qué pasa si
vendo hoy?» calcula (sin guardar nada) la ganancia o pérdida de vender cierto número de participaciones, o todas, por FIFO y con lo
que vale hoy, y avisa si cae en esa regla. Tipos de activo: fondo, ETF, acción, cripto, materias primas, plan de pensiones,
bono e inmueble.

**Mi año** (*Inicio → Mi año*, *Movimientos → Mi año* o la tecla **G**): lo que entró, salió y ahorraste en el año, mes a mes y por categoría, comparado con el
año anterior (en el año en curso, con los mismos meses del anterior), con un gráfico de rosco de tus cinco categorías de más
gasto y el resto juntas; la media al mes (solo meses ya acabados), lo que más subió y lo que más bajó, el ritmo del año (plegado, con 3 meses o más)
y **Imprimir / guardar como PDF** (sin menús ni botones, en blanco y negro; con el modo discreto activo, los importes salen tapados); tu mejor y tu peor mes, tu patrimonio de enero a diciembre
y lo que metiste y ganó tu inversión. Ingresos y gastos van por *tu mes* (el día en que empieza, en *Ajustes*); patrimonio e
inversión, por mes natural. Solo cuentan los meses con movimientos importados o apuntados. Pulsa un mes o una categoría para ver
sus movimientos. **Dónde más gastas**: los diez comercios en los que más gasto variable dejaste ese año, con cuántas compras y
lo que gastas de media en cada una (sin los fijos; un movimiento dividido cuenta como una compra y los Bizums enlazados a un gasto
se restan), y lo que suman las compras de menos de 10 €. Pulsa un comercio para ver sus movimientos de ese año.

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
porcentajes se ven). **I** = importar; **A** = apuntar un movimiento; **R** = Por revisar; **G** = Mi año; **/** = buscar; **← →** = mes anterior o
siguiente (en Mi año, el año); **1, 2, 3…** = las secciones del menú, en su orden; **?** = ver todos los atajos.

**Cuando lo importado no cuadra**: *Inversión* avisa en **Revisa tu inversión** de lo que ve raro (un traspaso desde
tu banco tomado por venta, participaciones vendidas de más, operaciones sin participaciones, compras que no se sabe si
fueron ventas, posibles duplicados, el mismo activo dos veces, valores viejos) y cada aviso lleva a la **ficha del
activo**: todas sus operaciones con su precio y de dónde vienen (extracto, órdenes, a mano), editables una a una;
**Ajustar participaciones** (escribes las participaciones que ves en el bróker y se añade un ajuste sin dinero); **Unir
con otro activo**; y «Era dinero traspasado desde mi banco» o borrar el activo con sus operaciones (lo que venía del
extracto de la cuenta no reaparece al reimportarlo; lo que venía del archivo de órdenes, sí).

**Un activo que ya no tienes** (lo vendiste o lo traspasaste entero a otro fondo): en su ficha, *Marcar como vendido*. Deja de
salir en Inversión, en los avisos y al anotar valores, pero sus operaciones se quedan guardadas: hacen falta para *Para la
renta* y para el coste de lo que pasó por traspaso al fondo nuevo. No lo borres para quitarlo de en medio; y si lo marcaste sin
querer, *Inversión → Tus activos → verlos* te lleva a ellos para volver atrás.

**Apuntar**: al escribir el concepto, la app propone una categoría según tus reglas y lo que has clasificado otras veces.
Todo se calcula en tu ordenador. Puedes cambiar la sugerencia antes de guardar.

**Bizums**: en los enviados, las palabras del concepto sugieren una categoría, pero tú decides. Los recibidos son lo que te devuelven de un
gasto que pagaste tú: se restan de su categoría y se enlazan con él (*Movimientos*: «te devolvieron X»; en su ficha, «Tu parte
real»). La app lo casa sola con aritmética: varios Bizums iguales que cuadran con un gasto (5 × 19,56 € = 97,84 € ÷ 5), hasta
10 días después y también si el gasto está en otro extracto; los iguales del mismo día heredan la categoría del que ya la tiene.
Lo que no cuadra aparece en *Por revisar* como un **reparto** (un solo grupo) con los gastos candidatos, con su fecha, importe,
categoría, cuánto te han devuelto ya y cuánto te costó de verdad: eliges uno y queda enlazado.

**Por revisar**: «Todo» y «Con sugerencia» permiten revisar y aceptar varias sugerencias juntas. Solo se crean reglas donde
marques «Siempre»; «Pregúntame» nunca recuerda la categoría. «N se clasificaron solos · Ver y corregir» muestra los movimientos
del último archivo clasificados por reglas: puedes cambiar su categoría o elegir «Pregúntame en adelante», sin tocar lo ya guardado.
Tus reglas mandan sobre las de serie; una regla de persona y concepto manda sobre la de solo persona. Si ninguna categoría encaja,
se propone crear una nueva (solo se crea si la eliges). Las entradas al bróker con un concepto tuyo se proponen como traspaso desde tu banco.

**Dividir un movimiento**: si un cargo son varias cosas (una compra que mezcla comida y cosas de casa, dinero del cajero), ábrelo
y en *Dividir en varias categorías* pon el importe y la categoría de cada parte; lo que no repartas se queda en la primera, así
que siempre suman el total. En la lista cada parte sale marcada («parte de 87,40 €») y desde cualquiera puedes **volver a
juntarlas**. Reimportar el extracto no lo duplica. No se ofrece en el pago de un fijo ni en un gasto con Bizums enlazados.
Cada parte es un trozo del cargo del banco: su categoría, su concepto y su nota se cambian, pero su importe, su fecha y su
cuenta no, ni se borra sola (para eso, vuelve a juntarlo). Un Bizum recibido no se enlaza solo con una parte.

**Poner orden en las categorías** (*Ajustes → Categorías*): **probar una regla** antes de guardarla (cuántos movimientos ya
importados casarían, con una muestra, y aplicarla a todos de golpe), **fusionar** dos categorías en una y **ocultar** las que
no usas (no se borra nada y sus movimientos siguen contando). Todo con vista previa y **Deshacer**.

**Todos tus datos en Excel** (*Ajustes → Tus datos*): un `.xlsx` con una hoja por cosa (movimientos, cuentas, saldos, fijos,
categorías, reglas, inversión, aportaciones, dividendos, objetivos y recordatorios) para consultarlo fuera de la app.

**Ajustes**, por tareas: *Tu dinero* (límite, meta de ahorro, tu mes y colchón; cuentas, fijos, metas, recordatorios e inversión),
*Clasificación* (categorías, reglas, formatos y tus nombres en el banco), *Aspecto y avisos*,
*Servicios opcionales* (precios por internet) y *Copias y archivos* (deshacer lo último, copias, exportar,
cambiar de carpeta). Todo se guarda solo al cambiarlo.

**Reglas** (*Ajustes → Clasificación → Reglas*): «si el texto contiene…, es esta categoría». *Guardar para próximas
importaciones* vale para lo que importes después; *Guardar la regla y corregir los N ya importados* también arregla lo que ya
tienes (y se puede deshacer).

**A tu gusto** (*Ajustes*): tema automático, claro u oscuro y color de acento (violeta de serie); el nombre de tu compañero o
esconderlo; qué paneles ves en el Inicio y en qué orden;
cuántos registros por página en las listas largas; el día en que empieza tu mes y tu colchón;
icono, color y presupuesto de cada categoría (con aviso si te pasas). *Ajustes → Categorías → Proponer presupuestos* te propone
para cada categoría de gasto variable lo que gastas de media (redondeado a 10 €): marcas las que quieras y solo se guardan esas.
**Quiero ahorrar al mes** (*Ajustes*, junto al límite): con una meta, la app te dice qué límite de gasto variable te la deja
cumplir (lo que te entra − tus fijos − otros gastos fijos sin dar de alta − lo que inviertes − tu meta) y lo usas con un botón;
el límite no cambia solo. En *Movimientos → Por categoría* ves cada una
frente a tu media de los meses anteriores, y en el Inicio, el ritmo de gasto del mes frente a lo que sueles llevar.

**Lo que viene** (*Inicio*): «Tus próximos meses» enseña cuánto tendrás en tus cuentas al acabar cada uno de los próximos doce
meses: cuenta tus fijos, tus aportaciones, lo que sueles gastar de verdad (tu media, no tu límite) y también los gastos fijos
que no tienes dados de alta (un seguro, un recibo que no llega cada mes), y te dice cuánto es cada cosa. En «Tu presupuesto», **¿Me puedo permitir un gasto?** (plegado): escribes un importe y te dice cuánto te quedaría de tu límite del mes (o por cuánto te pasarías), cuánto tendrías al acabar el mes y cuál sería el saldo más bajo de los próximos meses; es solo una cuenta, no apunta nada. Los avisos se quitan con su **×** (vuelven a salir cuando cambia lo que los provoca: otro mes, otra subida); cada objetivo con fecha dice cuánto apartar al mes; los recordatorios pueden **repetirse** (cada año, cada 3 meses o cada
mes) y con «Hecho» pasan solos a su siguiente fecha. En *Fijos* ves lo que suman al mes y al año.

**Avisos** (*Inicio*): además de lo de siempre, la app te dice si **te han cobrado una comisión**, si un **cobro parece repetido**
(mismo comercio e importe en dos días), si una **aportación fija no ha llegado** a tu bróker (la orden se paró o falló el cargo), si el **día de un fijo no casa con cuándo se paga** de verdad (el alquiler que
tienes en el 20 y se cobra el 3) y si tus **copias de seguridad están solo en el mismo disco** que tus datos. Cada uno se quita con su × y no vuelve.

**Avisos de Windows** (*Ajustes*, apagados de serie y sin internet): con la app en marcha, Windows te avisa de los recordatorios
(una vez al día) y de cuándo toca importar (una vez a la semana). Para que lleguen sin tener que abrirla, activa también *Abrir
FinanceBuddy al iniciar Windows*: arranca en la bandeja, sin abrir el navegador. Se quita ahí mismo o en el Administrador de
tareas de Windows (*Aplicaciones de inicio*).

Cerrar la pestaña del navegador no cierra la app: para cerrarla, clic derecho en su icono de la bandeja → *Cerrar FinanceBuddy* (o *Ajustes → General → Cerrar FinanceBuddy*). Si la vuelves a abrir, se reutiliza la que ya estaba en marcha.

## Uso semanal

1. Descarga el extracto de tu banco: en la web o la app del banco, *Movimientos → Exportar a Excel*.
2. Arrástralo a *Importar* (puedes soltar **varios a la vez**: banco, ahorro y bróker), o guárdalo en la carpeta `Importar\Banco` y pulsa «Importar la carpeta».
   - Los movimientos del bróker van a `Importar\Inversión`.
   - Cada archivo va solo a su cuenta (por el IBAN o el formato) y sale un único resumen. Si uno necesita algo (un formato nuevo, o
     no sabe de qué cuenta es), los demás se importan igual y ese queda en el resumen con su pregunta.
   - Si varios archivos traen la misma identidad de cuenta, eliges o creas la cuenta una sola vez para ese grupo; sus nombres
     quedan plegados. Números de cuenta distintos se resuelven por separado, aunque sean del mismo banco.
   - Puedes cambiar de pantalla mientras se importan: el lote y sus resultados se conservan. Al terminar aparece un aviso
     para volver a Importar, sin sacarte de donde estés. Reintentar un archivo sustituye su resultado anterior.
3. Revisa lo pendiente, si hay algo.
4. Mira el *Inicio*.

Importar dos veces el mismo periodo **no duplica nada**: cada movimiento se reconoce por su fecha e importe en el extracto. Un
archivo que ya estaba entero lo dice en el momento: «Este archivo ya está importado: no trae nada nuevo».

**No hace falta tener todos los extractos.** La app se fía del saldo que trae tu banco: el resumen dice «Santander: saldo igualado
al del banco (665,16 €)», con *Deshacer*. Si entre dos extractos faltan días, lo dice en gris («Faltan movimientos del 12/10 al 19/10
(−83,20 €). Si tienes ese extracto, impórtalo; si no, no pasa nada») y esa diferencia solo corrige el saldo: no se inventa ningún
gasto. Un extracto más antiguo que los que ya tienes solo añade historial: no cambia tus saldos de hoy. «No cuadra» solo sale
entre dos saldos que **escribiste tú** (al comprobar saldos o al cerrar el mes). Un bróker cuyo archivo no trae saldo (MyInvestor)
te pregunta una vez, si quieres, cuánto tienes sin invertir; hasta entonces sus compras no se restan de ninguna cuenta e *Inversión*
dice «Sin saldo anotado» (con un enlace para anotarlo), no 0,00 €. Si solo conoces el de algunas, dice de cuáles es la cifra.

## Bancos y brókers

- **De serie** reconoce los extractos de **Santander** y la cuenta de efectivo de **MyInvestor**.
- **Cualquier otro** banco o bróker que exporte Excel o CSV funciona:
  - la primera vez la app **reconoce sola las columnas** (fecha, concepto, importe, saldo…) por su nombre y por lo que
    hay dentro, y solo tienes que comprobarlas y dar a guardar; si algo no lo ve claro, lo eliges tú;
  - vale el importe con signo, o columnas separadas de cargo y abono (Debe/Haber);
  - el saldo es opcional, pero recomendado;
  - a partir de ahí ese banco queda guardado como un formato y se reconoce solo.
- **Nada se pierde sin avisar**: si la app no entiende la fecha o el importe de una fila (un «12,5O», un 31 de febrero), la
  vista previa te la enseña tal como viene en el archivo, con su número de fila y el motivo, y lo demás se importa. La corriges
  en el archivo y lo vuelves a importar: lo que ya estaba no se duplica.
- **Manda lo que el archivo es, no cómo se llama**: un `.xlsx` guardado como `.xls`, un texto con tabuladores o un CSV en UTF-16
  se leen igual. Si el «Excel» de tu banco es en realidad una página web, la app te lo dice y te explica qué hacer (abrirlo
  con Excel y guardarlo como `.xlsx`).
- **Fechas**: además de las habituales, entiende las que llevan hora y zona (`2026-09-30T10:15:23Z`), el año con dos cifras o
  el mes escrito («30 sep 2026»). No intenta adivinar el orden americano (mes/día/año).
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

**Copias en otro sitio** (*Ajustes → Tus datos y copias → Guardar también las copias en otro sitio*): si pones la carpeta de
un USB, de otro disco o de una carpeta sincronizada, cada copia se guarda también ahí. Las copias de `Copias\` están en el
mismo disco que tus datos: si ese disco falla, se van con él. Si el sitio no está disponible (el USB sin poner), la app sigue
funcionando y te lo avisa en esa misma pantalla.

**Si algo va mal al abrir:** la app te lo explica en un cuadro en vez de cerrarse sin más. Si el archivo de datos se ha
dañado, te ofrece volver a la última copia (el archivo dañado no se borra: se guarda al lado como `datos.db.roto …`).

**Al borrar una cuenta o una categoría que se está usando**, la app te dice antes cuántos movimientos la usan y qué pasaría
con ellos. Para juntar dos categorías sin perder nada, mejor *Ajustes → Categorías → Fusionar*.

## Para desarrolladores

Requisitos: Python 3.10+ en Windows.

```bat
pip install -r requirements.txt -r requirements-dev.txt
python -m financebuddy                 :: arranca con tus datos (Documentos\FinanceBuddy)
python -m financebuddy --ejemplo       :: con datos inventados en una carpeta temporal
python -m unittest discover -s pruebas -p "test_*.py" -t .   :: todas las pruebas de Python
python pruebas\run.py --tests          :: todas las pantallas en Chrome/Edge sin ventana + pruebas de cálculos
python pruebas\run.py --flujos         :: flujos con clics (apuntar, resolver dudas, buscar, borrar, ajustes)
                                       :: (otro navegador: variable FB_NAVEGADOR con la ruta de chrome)
build.bat                              :: pasa todo lo anterior y genera dist\FinanceBuddy.exe
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
  clasificar.py    reglas, traspasos, Bizum, recurrentes y sugerencias locales del historial
  detectar.py      fijos que se repiten cada mes y de dónde viene el dinero
  operaciones.py   órdenes y operaciones del bróker con participaciones (ISIN, traspasos entre fondos)
  cartera.py       arreglos a mano: unir activos, deshacer un traspaso tomado por venta, cuadrar participaciones
  precios.py       precios por internet (opcional): Yahoo, Morningstar, CoinGecko, caché, cambio de moneda, buscador y comparador
  actualizaciones.py  aviso de versión nueva (opcional)
  exportar.py      plantilla de Excel con desplegable de categorías y exportación de todos tus datos a Excel
  ordenar.py       poner orden en las categorías: probar una regla antes de guardarla, fusionar y ocultar categorías
  bizums.py        Bizums recibidos: casar con el gasto que devuelven (aritmética de repartos) y enlazarlo
  secreto.py       cifra la clave de CoinGecko con la protección de datos de Windows
  recordar.py      avisos de Windows desde el icono de la bandeja (opcional): recordatorios y días sin importar
  autoarranque.py  que Windows abra la app en la bandeja al iniciar sesión (opcional)
  plantilla.py     categorías, reglas y formatos de serie
  ejemplo.py       datos de ejemplo
  web/             la interfaz: index.html, nucleo.js, estilos.css y paneles/*.js
pruebas/           pruebas (Python y cálculos en el navegador)
```

Los módulos de `web/paneles/` se concatenan y comparten ámbito **en el orden de `servidor.MODULOS`**: `datos`, `calculos`,
`calculos_saldos`, `calculos_avisos`, `componentes`, `graficos`, `inicio`, `inversion`, `renta`, `anual`, `precios`, `exportar`,
`formularios`, `bienvenida`, `importar`, `revisar`, `fijos`, `cierre`, `ajustes`, `gestionar`, `pantallas`. Si añades uno,
ponlo en esa lista en su sitio.

Con [Claude Code](https://claude.com/claude-code), [`CLAUDE.md`](CLAUDE.md) tiene lo imprescindible para trabajar en el repo
(reglas, comandos y trampas conocidas).

# Auditoría de Rumbo (danidm98/rumbo) y qué aplicar a FinanceBuddy

> Fecha: 3 oct 2026 · Repo auditado: <https://github.com/danidm98/rumbo> (público, licencia MIT, v1.1.1, un solo commit visible
> `a024a09`). Auditoría de solo lectura: no se ha modificado nada de Rumbo. Para el contexto general de FinanceBuddy, ver
> [`CONTEXTO.md`](../CONTEXTO.md).

## 0. Cómo se hizo (y sus límites)

- Lectura de todo el código (`app/motor.py`, `buscar.py`, `importar.py`, `almacen.py`, `exportar.py`, `servidor.py`, `web/*`),
  del README y de la cartera de ejemplo.
- Ejecución de la app con su cartera de demostración y recorrido de las 6 pestañas en escritorio (1300 px) y móvil (390 px).
- Pruebas puntuales (cabeceras `Host`, búsqueda de tests, desbordes horizontales).
- **Límite:** desde el entorno de desarrollo no se puede llegar a Yahoo, Morningstar ni CoinGecko (política de red). Para ver la
  pantalla se fabricaron **precios sintéticos** en su caché: las cifras que salen en las capturas (p. ej. «−99,9 %» en el
  monetario) son artefactos de eso y **no** una crítica a Rumbo. **No se ha podido comprobar que sus fuentes de precios
  funcionen hoy**: eso lo dice su autor, no lo hemos verificado.

## 1. Qué es Rumbo

«Tu patrimonio neto en un panel bonito, claro y privado, que funciona en tu propio ordenador.» Es de **Dani Dominguez Quant**
(canal de YouTube; la cartera de ejemplo es su cartera real). Python + **Flask** en `127.0.0.1`, un único `cartera.json` como
base de datos y un panel web sin librerías (gráficos SVG propios). Se arranca con `Iniciar.bat`/`Iniciar.command` (usa `uv` o un
Python instalado; no hay `.exe`). ~8.400 líneas.

**Es un seguimiento de patrimonio e inversión, no de gasto diario.** No tiene categorías, presupuestos, importación de
extractos del banco ni clasificación de movimientos. Eso es justo lo que FinanceBuddy tiene de sobra; en inversión es al revés.

| | **Rumbo** | **FinanceBuddy** |
|---|---|---|
| Foco | Patrimonio neto e inversión | Gasto diario + patrimonio + inversión |
| Precios | **Automáticos** (Morningstar, Yahoo, CoinGecko) con caché y cambio de moneda | Manuales (valor anotado o estimado con la última operación) |
| Datos de entrada | Movimientos de inversión + saldos anotados; MyInvestor, plantilla Excel/CSV, texto de una IA | Extractos del banco y del bróker (Excel/CSV), reconocidos y clasificados solos |
| Cuentas bancarias / gasto | Solo saldo anotado a mano | Movimientos, categorías, presupuestos, Bizums, fijos, previsión |
| Rentabilidad | TIR, rentabilidad por año natural, ventanas 1m–1a, peor caída, comparación con indexados | TIR por activo (≥ 1 año), plusvalía, precio medio |
| Datos | `cartera.json` + 20 copias automáticas | SQLite + copia diaria (30) |
| Tests | **Ninguno** en el repo | 75 (Python) + 45 (cálculos) + 16 pantallas |
| Seguridad local | Sin token ni validación de `Host` | Token por arranque + `Host` local obligatorio |
| Instalación | ZIP + `uv`/Python; Windows y Mac (sin probar) | `.exe` único; solo Windows |
| Dependencias | Flask, openpyxl | Solo biblioteca estándar (+ openpyxl, xlrd) |
| IA | Solo un «prompt» para pegar en ChatGPT/Gemini | Jev integrado (opcional) |
| Compartir | Exporta el panel a un HTML estático, con opción de **ocultar importes** | No |

## 2. Lo que Rumbo hace mejor (y se puede aprender)

### 2.1 Precios automáticos (la gran diferencia)
- `buscar.py`: **buscador por ISIN, ticker o nombre** que consulta Morningstar/Yahoo/CoinGecko y solo propone candidatos
  **con precio comprobado**; rellena nombre, tipo, moneda, fuente, TER, riesgo y categoría. Atajos para «oro», «plata», «cobre»,
  «petróleo» (futuros de Yahoo).
- `motor.py`: serie **diaria** de precios con **caché en disco**, que se completa solo con lo que falta; **conversión a euros**
  con el cambio del propio día (incluye peniques/GBp); modo «sin red» que recalcula con lo guardado.
- **Robustez de datos** que merece copiarse en ideas:
  - une Morningstar y Yahoo (Yahoo se salta días; Morningstar redondea a 3 decimales) y marca las discrepancias;
  - **línea de respaldo**: contrasta cada cierre con otra cotización y sustituye los «históricos basura» (ejemplo real que
    cita su código: un ETP de bitcoin con el precio congelado durante dos años);
  - descarta saltos > 15 % de un solo día cuando solo hay una fuente;
  - lleva al viernes los datos fechados en fin de semana (el monetario sale con el VL del viernes fechado en domingo);
  - avisa cuando el último precio tiene más de 7 días.
- Al abrir actualiza solo si los precios tienen > 6 h; botón «↻ Actualizar precios»; en cada ficha se ve **de dónde sale el
  precio y de qué día es**.

### 2.2 Métricas de patrimonio que nos faltan
- **Serie diaria** del patrimonio (por producto, total, «tu dinero vs mercado», «reparto») con zoom 1M/3M/6M/YTD/1A/Todo.
- **«El mes»:** cuánto cambió el patrimonio *este mes* y de eso, **cuánto lo pusiste tú y cuánto el mercado**, por componente, y
  un gráfico mes a mes de «tu esfuerzo y el del mercado». Muy buena idea para quien aporta cada mes.
- **Rentabilidad por año natural** (limpia del efecto de cuándo metiste el dinero), por producto y total.
- **Peor caída** del patrimonio (con fecha), **racha** de meses aportando, **ritmo mensual** (media de 12 meses).
- **Hitos** («la primera vez que el patrimonio cruzó 10 k, 25 k, 50 k…») y **barra hacia un objetivo**.
- **«Si sigo así…»**: proyección con 3 deslizadores (años, rentabilidad, aportación mensual) y el desglose «tendrías X, habrías
  aportado Y, el mercado pondría Z». Simple y motivador.
- **Tamaño de cada aportación medido con tu propio historial** (pequeña / habitual / extraordinaria): detalle muy bonito en la
  ficha del producto.
- **Lo que pagas en comisiones:** TER × saldo → € al año y al mes, por producto y total.
- **Ventanas del valor liquidativo del fondo** (1m, 3m, 6m, YTD, 1a), «lo tuvieras o no».
- Metodología: **TWR** para índices de comparación y **XIRR** para tu TIR; Sharpe y volatilidad en «Ver más detalles».

### 2.3 Comparador «¿y si lo hubieras metido en un indexado?»
Repite **tus mismas compras y ventas en las mismas fechas** en otra cartera (MSCI World, S&P 500, 60/40, monetario) y dice cuánto
tendrías hoy, con veredicto en una frase («con el MSCI World tendrías 2.461 € más»). Además deja definir **carteras de
comparación propias** (con pesos) en los datos. Es la función estrella de su vídeo.

### 2.4 Importación con vista previa
`importar.py`: el plan se **aplica sobre una copia** y se enseña el informe (productos nuevos, movimientos, errores fila a fila
y **totales para comparar con el banco**) antes de guardar nada; el resultado es exactamente lo que se guardará. Reimportar un
fondo de MyInvestor *sustituye* lo anterior de ese fondo (idempotente). Incluye **plantilla Excel con desplegables, hoja
«Ejemplo» y hoja «Instrucciones»**, y un **prompt para IA** con la advertencia de borrar datos personales antes de pegar un
extracto.

### 2.5 Otras ideas pequeñas
- **Exportar el panel a un solo HTML** de solo lectura; con «ocultar importes» los euros se **multiplican por un factor secreto
  antes de entrar en el archivo** (no basta con esconderlos en pantalla) y se quitan hitos y objetivo.
- **Modo vídeo** (tecla `V`): oculta controles y agranda cifras; atajos `1`–`6` para las pestañas.
- **Aviso de versión nueva** (consulta un `VERSION` en GitHub como mucho 1 vez al día).
- **Paleta de 12 colores validada para daltonismo**, con color asignado por producto y botón «Repartir colores».
- **«Solo largo plazo»:** interruptor que excluye colchón y cuentas y recalcula todas las cifras.
- Tipos de producto más amplios: **plan de pensiones, bonos, inmuebles, deudas**; ventas por **FIFO** (como Hacienda) con
  plusvalía realizada; dividendos y comisiones como movimientos propios.
- Ficha con «**Qué hay dentro**» (país, sector, 10 mayores posiciones) **escrito a mano en la cartera** (no se calcula solo).

## 3. Lo que hacemos mejor (no copiar sus carencias)

1. **Gasto diario completo:** importación de extractos, clasificación automática (reglas, historial, Bizums, traspasos,
   Jev), «Por revisar», presupuestos, fijos y previsión. Rumbo no tiene nada de esto.
2. **Pruebas y calidad:** 75 + 45 + 16 comprobaciones frente a **ninguna** en Rumbo. Rumbo, además, mantiene estado global en
   `motor.py` (`CACHE`, `SIN_RED`, `_COTIZACIONES`, `AVISOS` se modifican como variables globales), lo que hace difícil probarlo y
   frágil si hay dos peticiones a la vez (lo protege con un `cerrojo`).
3. **Seguridad local:** token por arranque y `Host` obligatoriamente local. En Rumbo se comprobó que **responde 200 a una
   petición con `Host: evil.example.com`** y no hay token ni `Origin`: es el escenario de *DNS rebinding* (una web maliciosa
   abierta en tu navegador podría leer tu patrimonio o, con cartera propia, modificar datos). No es grave si se usa con cuidado,
   pero FinanceBuddy está mejor. **Merece avisar al autor** (es un repo público).
4. **Privacidad real:** FinanceBuddy no sale a internet salvo Jev (opcional, saneado y auditable en Ajustes). Rumbo dice que
   «no va ningún dato tuyo» en sus consultas, pero **pregunta por tus ISIN/tickers a Morningstar/Yahoo/CoinGecko**, y eso revela
   qué tienes; además consulta GitHub para la versión.
5. **Inversión más corregible:** ficha con operaciones editables, «Cuadrar con tu bróker», «Unir activos», «Revisa tu inversión»,
   traspasos entre fondos, órdenes por ISIN y ajustes; Rumbo solo tiene formularios y una vista previa.
6. **Datos con integridad:** SQLite con validación y copia diaria frente a un JSON reescrito completo en cada cambio (aunque lo
   hace de forma atómica y con 20 copias).
7. **Distribución:** un `.exe` sin instalar nada frente a ZIP + `uv`/Python (y en Mac sin probar).
8. **Móvil:** Rumbo **se desborda en horizontal** en 390 px en *Patrimonio* (≈105 px) y *Mis datos* (≈120 px); FinanceBuddy no.
9. **Mensajes técnicos:** Rumbo apila al pie **una tarjeta de aviso por cada fallo de cada fuente** («…sin conexion (URLError),
   uso la cache guardada»), lo que llega a 16 cajas amarillas seguidas sin agrupar ni priorizar.
10. **Límites conocidos de Rumbo** (reconocidos en su README): del CSV de MyInvestor solo conoce la **plusvalía de lo vendido**, no
    su fecha; **no calcula impuestos**; precios de servicios **gratuitos y no oficiales** que pueden fallar o cambiar sin aviso
    (usa claves de API públicas de Morningstar embebidas en el código: riesgo de que dejen de funcionar o de incumplir sus términos).

## 4. Qué añadir o mejorar en FinanceBuddy

Escala de esfuerzo: **S** (≤ 1 día) · **M** (2–4 días) · **L** (> 4 días). «Red» = necesita internet.

| # | Mejora | De dónde sale | Esfuerzo | Red | Notas / decisión |
|---|---|---|---|---|---|
| **A1** | **Precios automáticos opcionales** para activos con ISIN/ticker (Morningstar/Yahoo/CoinGecko), con caché y «de dónde y de qué día es el precio» | Rumbo 2.1 | **L** | Sí | Choca con «todo local»: debe ser **opt-in** en Ajustes, enviando solo ISIN/ticker (sin importes), y explicado. No se puede probar con la API real desde el entorno (servidor falso, como con Jev). Convierte *Actualizar valores* en un botón. |
| A2 | **Buscador de producto** por ISIN/ticker/nombre al crear un activo (rellena nombre, tipo, TER, moneda) | Rumbo 2.1 | M | Sí | Va con A1; también valdría ampliar el catálogo local `plantilla.ISIN`. |
| A3 | **Robustez de precios**: fuente de respaldo, descartar saltos absurdos, fin de semana → viernes, aviso de precio viejo | Rumbo 2.1 | M | — | Solo si se hace A1. |
| A4 | **Multimoneda** (USD, GBp) con cambio del día | Rumbo 2.1 | M | Sí | Necesario si el usuario tiene activos en USD; hoy solo EUR. |
| **B1** | **Hitos y objetivo de patrimonio** («primera vez que cruzaste 10 k…») | Rumbo 2.2 | **S** | No | Ya existe el registro `objetivo`; faltan hitos y la barra en el Inicio/Inversión. |
| **B2** | **«Si sigo así…»** proyección con deslizadores (años, rentabilidad, aportación mensual) | Rumbo 2.2 | **S** | No | Con TIR real del usuario como valor inicial. Aviso «orientativo, sin impuestos ni inflación». |
| **B3** | **Panel «Lo que pagas en comisiones»** (TER × valor → €/año y €/mes) | Rumbo 2.2 | **S** | No | Ya tenemos `activo.ter` y valor. |
| **B4** | **«Tu esfuerzo y el del mercado, mes a mes»** (lo que aportaste vs lo que subió/bajó) | Rumbo 2.2 | **M** | No* | Con valores anotados mensuales ya sale una versión aproximada; con A1 sale exacto. |
| B5 | **Peor caída** del patrimonio (con fecha) y **rentabilidad por año natural** | Rumbo 2.2 | M | No* | Mejor con serie diaria (A1); aproximado con los registros de patrimonio. |
| B6 | **Tamaño de cada aportación** frente a tu historial (pequeña/habitual/extraordinaria) en la ficha del activo | Rumbo 2.2 | S | No | Detalle visual barato. |
| **C1** | **Comparador «¿y si indexado?»** (mismas aportaciones en MSCI World / S&P 500 / 60/40) con veredicto | Rumbo 2.3 | **L** | Sí | Requiere series de precios de ETF de referencia (A1). Es el mayor gancho visual. |
| **D1** | **Vista previa antes de importar** (informe con totales para comparar con el banco y dudas, sin guardar) | Rumbo 2.4 | **M** | No | Hoy se importa y se revisa después. Encaja con aplicar el plan sobre una copia de la BD. Complementa la cadena de saldos. |
| D2 | **Plantilla Excel/CSV** con desplegables, ejemplo e instrucciones para movimientos de inversión (dividendos, comisiones, ventas) de cualquier bróker | Rumbo 2.4 | M | No | Útil para brókers sin formato de serie; hoy hay que mapear columnas. |
| D3 | **Dividendos y comisiones** como tipos de operación + **plusvalía realizada por FIFO** («Para la renta») | Rumbo 2.5 | M–L | No | Ya estaba en el backlog; su `aplicar_movimientos` es una buena referencia de FIFO. |
| E1 | **Modo discreto**: botón/atajo que desenfoca todos los importes en pantalla | Rumbo 2.5 (variante) | **S** | No | Útil en público. Rumbo solo lo hace al exportar. |
| E2 | **Exportar el panel a un HTML estático** con «ocultar importes» (escalado secreto *antes* de exportar) | Rumbo 2.5 | M | No | Para compartir rentabilidad sin cifras. Prioridad baja. |
| E3 | **Aviso de versión nueva** (opcional) | Rumbo 2.5 | S | Sí | Prioridad baja; consulta GitHub. |
| E4 | **Avisos agrupados y priorizados** (un solo aviso «3 precios no se han podido actualizar», con detalle plegado) | Crítica a Rumbo | S | — | Para que A1 no repita su problema. |
| E5 | Atajos de teclado entre pantallas | Rumbo 2.5 | S | No | Opcional. |
| F1 | **Paleta de color por activo** validada para daltonismo + «Repartir colores» | Rumbo 2.5 | S | No | Ya validamos contraste; falta color estable por activo. |
| F2 | Interruptor **«Solo largo plazo»** (excluye colchón/cuentas) en Inversión | Rumbo 2.5 | S | No | |
| G1 | Ampliar tipos de activo: **plan de pensiones, bono, inmueble, deuda** | Rumbo 2.5 | M | No | Hoy: fondo, ETF, acción, cripto, materia, otro. |
| G2 | **Cartera de ejemplo con historia real** (y botón «Empezar con mis datos») | Rumbo | S | No | Ya tenemos datos de ejemplo; se puede enriquecer la parte de inversión. |

\* «No» = funciona con lo que ya hay (con menos precisión); mejora con A1.

### 4.1 Propuesta por olas

1. **Ola 1 — rápida y sin red (≈ 1 semana):** B1 hitos/objetivo · B2 «Si sigo así» · B3 comisiones · B6 tamaño de aportación · E1
   modo discreto · E4 avisos agrupados · F2 «solo largo plazo». Todo local, bajo riesgo, mucho efecto visual.
2. **Ola 2 — flujo de importación y datos:** D1 vista previa · D3 dividendos/comisiones + FIFO («Para la renta») · G1 tipos de
   activo · B4/B5 esfuerzo vs mercado y caída máxima (versión aproximada).
3. **Ola 3 — precios online (decisión de privacidad):** A1+A2+A3 (+A4 si hay activos en USD) y después C1 comparador con
   indexados y la versión exacta de B4/B5. Requiere que el usuario acepte salir a internet (opt-in).
4. **Ola 4 — extras:** E2 exportar HTML con importes ocultos · E3 aviso de versión · D2 plantilla · E5 atajos.

### 4.2 Decisiones que necesito del usuario
1. **¿Aceptas precios por internet (opt-in)?** Es lo que más valor aporta, pero rompe la regla «nada sale del ordenador» salvo
   que se explique y se active a propósito; solo viajarían ISIN/tickers.
2. ¿Qué activos tienes **en moneda no euro** (para decidir si hace falta A4)?
3. ¿Quieres compartir tu panel con otras personas (E2) o es solo para ti?
4. ¿Empezamos por la **Ola 1**?

## 5. Licencia y buenas prácticas al reutilizar

Rumbo es **MIT**: se puede reutilizar código y diseño con atribución (conservar el aviso de copyright y la licencia en lo
copiado). Recomendación: **implementar las ideas con código propio** (nuestra arquitectura es distinta: SQLite, sin Flask,
módulos web concatenados) y citar a Rumbo en `CONTEXTO.md`/README como inspiración, sin copiar ficheros. Las claves de API de
Morningstar que usa son públicas pero no oficiales: **no se deben copiar** a un producto propio sin comprobar sus términos.

## 6. Hallazgos para comunicar al autor de Rumbo (opcional)

- Validar `Host` (solo `127.0.0.1`/`localhost`) y, si se quiere, un token por arranque, para evitar *DNS rebinding*.
- Agrupar los avisos de conexión del pie en una sola tarjeta.
- Desbordes horizontales en móvil (390 px) en *Patrimonio* y *Mis datos*.
- Añadir pruebas automáticas del motor (TIR, FIFO, series) y aislarlo de variables globales.

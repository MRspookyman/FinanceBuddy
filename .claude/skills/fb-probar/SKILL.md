---
name: fb-probar
description: Cómo arrancar FinanceBuddy con datos inventados y mirarlo de verdad (pantallas, clics, capturas, contraste) sin tocar la app real del usuario. Úsalo antes de opinar sobre cómo se ve o se usa algo, y para comprobar que un cambio funciona en la app y no solo en las pruebas.
---

Todo va contra un servidor de pruebas con **datos de ejemplo** (`financebuddy/ejemplo.py`, hoy = 30/09/2026) en el puerto **8799**. Lo arranca y lo cierra `pruebas/run.py`; no hace falta levantar nada a mano.

## Nunca
- El puerto **8765** es la app real del usuario: un hook corta cualquier comando que lo use.
- No pulses «Volver a mis datos» ni «Usar otra carpeta», y no pases `--datos` con una carpeta del usuario salvo que él lo pida en ese encargo.

## Ver una pantalla
```
python pruebas\run.py inicio,anual --shot                 :: captura de esas pantallas (tema claro)
python pruebas\run.py inversion --shot --tema=oscuro      :: en oscuro
python pruebas\run.py --capturas                          :: todas, en claro y oscuro
```
Las capturas quedan en `%TEMP%\fb-pruebas\<pantalla>[-tema].png`: ábrelas con Read. Los nombres de pantalla son los de `PANTALLAS` en `run.py` (`inicio`, `movimientos`, `inversion`, `importar`, `revisar`, `apuntar`, `cerrar`, `ajustes`, `fijos`, `renta`, `anual`, `gestionar/categoria`…). Cada línea de salida dice además si la pantalla dio error.

## Hacer clics (un guion suelto)
Escribe un `.js` **en tu carpeta temporal, no en el proyecto**, con uno o varios casos, y pásalo con `--guion`:
```js
  await caso("Cambiar la categoría desde la fila", async () => {
    if (!(await ir("#movimientos"))) return "no se abre Movimientos";
    const sel = await hasta(() => app().querySelector("select"));
    if (!sel) return "no hay desplegable en la fila";
    escribir(sel, "Ocio");
    if (!(await hasta(() => regs("movimiento").some((m) => m.categoria === "Ocio")))) return "no se guardó";
  });
```
```
python pruebas\run.py movimientos --guion=%TEMP%\mi_guion.js --shot
```
Un caso devuelve un texto si falla y nada si va bien. Tienes las ayudas de `pruebas/pruebas_flujos.js`: `ir(ruta)`, `hasta(fn)`, `app()`, `todos(sel)`, `porTexto(sel, texto)`, `campo(etiqueta)`, `escribir(el, valor)`, `regs(tipo)`, `dormir(ms)`, y `FB` (`FB.DB`, `FB.api`). Con `--shot` se captura la pantalla indicada **después** de los clics. Mira en ese archivo cómo se hacen los flujos que ya existen antes de inventar selectores.

Para apuntar algo en el informe sin que cuente como fallo: `casos.push({ nombre: "dato: " + valor, ok: true, detalle: "" })` no se imprime; devuelve el dato como texto de fallo si necesitas leerlo.

## Recalcular una cifra
```
python -m financebuddy --ejemplo --sin-navegador --puerto 8830 --hoy 2026-09-30 --datos %TEMP%\fb-cifras
```
deja `datos.db` en esa carpeta (tabla `registros(id, tipo, datos JSON)`); ciérralo al acabar. Las funciones de cálculo de la página están en `window.__fin` (las expone `pantallas.js`) y se pueden llamar desde un guion.

## Contraste
```
python .claude\herramientas\contraste.py --vars              :: cada color de texto sobre cada fondo, claro y oscuro
python .claude\herramientas\contraste.py "#B4461F" "#F0F2F5" :: dos colores sueltos
```
No estimes un contraste a ojo: mídelo.

## Las tres tandas (lo que tiene que quedar en verde)
```
python -m unittest discover -s pruebas -p "test_*.py" -t .
python pruebas\run.py --tests
python pruebas\run.py --flujos
```

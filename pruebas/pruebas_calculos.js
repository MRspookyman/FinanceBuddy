// Pruebas de los cálculos con los datos de ejemplo (financebuddy/ejemplo.py, hoy = 30/09/2026).
// Se ejecutan en la página con ?pruebas=1 (F = funciones expuestas por pantallas.js). Devuelven [{ nombre, ok, detalle }].
const casos = [];
const cerca = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const caso = (nombre, ok, detalle) => casos.push({ nombre, ok: !!ok, detalle });
const suma = (a) => a.reduce((s, x) => s + x, 0);

// 1. Cuadre: cada cierre del ejemplo sale de aplicar los movimientos, así que todas las cuentas cuadran.
const K = F.conciliacion();
caso("Hay dos registros de saldos para comparar", !!K, K);
if (K) for (const f of K.filas) caso(`Cuadra ${f.nombre}`, Math.abs(f.dif) <= 0.01, f.dif);
// Y también cada par de registros consecutivos (proyectar el anterior hasta el siguiente)
const P = F.patrimonio();
for (let i = 1; i < P.length; i++) {
  const pr = F.proyectar(P[i - 1], P[i].fecha.endOf("day"));
  const dif = Object.keys(P[i].cuentas.saldos).map((c) => Math.abs(P[i].cuentas.saldos[c] - (pr.cuentas.saldos[c] || 0)));
  caso(`Registro ${P[i].fecha.toISODate()} = anterior + movimientos`, Math.max(...dif) <= 0.01, dif);
}

// 2. Recurrentes sin duplicar: en septiembre cada uno aparece una vez y es el real (no el automático).
const S = F.finMes("2026-09");
for (const n of ["Nómina", "Alquiler", "Internet y móvil", "Luz", "Gimnasio"]) {
  const ms = S.ms.filter((m) => m.recurrente === n);
  caso(`«${n}» una sola vez en septiembre`, ms.length === 1 && !ms[0].auto, ms.length);
}
caso("El seguro anual (marzo) no aparece en septiembre", !S.ms.some((m) => m.recurrente === "Seguro del coche"));

// 3. «Te lo devolvieron» resta del gasto: cena de 84 € − 42 € de la parte del amigo = 42 € netos.
const cena = suma(S.real.filter((m) => /El Puerto|Parte de Marta/.test(m.concepto)).map((m) => m.gasto));
caso("Reembolso: la cena queda en 42 € netos", cerca(cena, 42), cena);
caso("Septiembre: ingresos = nómina 1.850 € + 50 € sin clasificar", cerca(S.ingresos, 1900), S.ingresos);
caso("Lo por revisar cuenta como gasto sin clasificar (72,70 €)", cerca(F.finMes("2026-09").real.filter((m) => m.pendiente && m.clase === "gasto").reduce((t, m) => t + m.importe, 0), 72.7), null);

// 4. Destino del ahorro: lo que «se queda en la corriente» en agosto = variación del saldo de la corriente en agosto.
const P31_07 = P.find((x) => x.fecha.toISODate() === "2026-07-31"), P31_08 = P.find((x) => x.fecha.toISODate() === "2026-08-31");
const varCorr = P31_08.cuentas.saldos["Cuenta nómina"] - P31_07.cuentas.saldos["Cuenta nómina"];
caso("Destino del ahorro de agosto cuadra con la corriente", cerca(F.repartoAhorro("2026-08").liquido, varCorr), [F.repartoAhorro("2026-08").liquido, varCorr]);
caso("Destino del ahorro: 200 € al ahorro y 200 € al bróker", cerca(F.repartoAhorro("2026-08").emergencia, 200) && cerca(F.repartoAhorro("2026-08").aBroker, 200));

// 5. Estimación de hoy: coherente por dentro.
const E = F.estimacion();
caso("Patrimonio neto = componentes − deudas", cerca(E.neto, suma(Object.values(E.c)) - E.deudas), E.neto);
caso("Liquidez = corriente + ahorro", cerca(E.c.Liquidez, E.cuentas.corriente + E.cuentas.ahorro), E.c.Liquidez);
caso("El ahorro (sin extracto) sube con los traspasos: 4.200 €", cerca(E.cuentas.saldos["Ahorro"], 4200), E.cuentas.saldos["Ahorro"]);
// Bróker: 400 + 200/mes − 200/mes de aportaciones = 400
caso("Efectivo del bróker = 400 €", cerca(E.cuentas.saldos["Bróker"], 400), E.cuentas.saldos["Bróker"]);

// 6. Inversión
const apo = (a) => suma(F.aportaciones().filter((x) => x.activo === a && !x.previsto).map((x) => x.importe));
caso("Bitcoin: 5 aportaciones de 50 €", cerca(apo("Bitcoin"), 250), apo("Bitcoin"));
const I = F.resumenInversion();
caso("Aportado = inicial + aportaciones", cerca(I.aportado, 4000 + 600 + 750 + 250), I.aportado);
caso("TIR calculada", isFinite(I.tir), I.tir);

// 7. Previsión: usa el límite de 600 €, el mínimo es de un mes futuro, el seguro anual cae en marzo.
const PV = F.prevision();
caso("Previsión: variable = límite de 600 €", cerca(PV.varEst, 600), PV.varEst);
caso("Previsión: mínimo en un mes futuro", PV.minimo.key !== F.hoyKey, PV.minimo.key);
const mar = PV.filas.find((f) => f.key === "2027-03");
caso("Previsión: en marzo se paga el seguro (310 €)", mar && cerca(mar.fijos, 700 + 35 + 48 + 29.9 + 310), mar && mar.fijos);
caso("Previsión: el efectivo del bróker se acaba en diciembre", PV.agota && PV.agota.key === "2026-12", PV.agota && PV.agota.key);

// 8. Cuánto puedo gastar y plan de reparto
const PS = F.presupuestoSemana();
caso("Movimientos hasta el 29/09", PS.fechaDatos && PS.fechaDatos.toISODate() === "2026-09-29", PS.fechaDatos && PS.fechaDatos.toISODate());
caso("Disponible = límite − gasto variable", cerca(PS.disponible, 600 - F.gastoVariable(S)), PS.disponible);
const PR = F.planReparto();
caso("Plan: colchón base = fijos mensuales + límite (1.400 €)", PR && PR.base === 1400, PR && PR.base);
caso("Plan: primero al fondo de emergencia (le faltan 100 €)", PR && PR.acciones[0] && PR.acciones[0].tipo === "fondo" && PR.acciones[0].importe === 100, PR && JSON.stringify(PR.acciones));

// 9. Avisos: el recordatorio de la renta sale; nada de «no cuadra».
const AV = F.avisos();
caso("Aviso del recordatorio de la renta", AV.some((a) => /renta/i.test(a.texto)), AV.map((a) => a.texto));
caso("Sin avisos de «no cuadra»", !AV.some((a) => /No cuadra/.test(a.texto)), AV.map((a) => a.texto));

// 10. Por categoría y ritmo del mes
const RC = F.resumenCategorias("2026-09");
caso("Categorías: la suma es el gasto del mes", cerca(suma(RC.map((c) => c.valor)), F.finMes("2026-09").gastos), suma(RC.map((c) => c.valor)));
caso("Categorías: Vivienda 700 € (fijo, media 700 €)", RC.some((c) => c.nombre === "Vivienda" && cerca(c.valor, 700) && c.grupo === "fijo" && cerca(c.media, 700)), JSON.stringify(RC[0]));
const RM = F.ritmoMes();
caso("Ritmo: acumulado hasta el día 29 = gasto variable", RM.dia === 29 && cerca(RM.hoyV, F.gastoVariable(F.finMes("2026-09"))) && RM.actual[29] === null, [RM.dia, RM.hoyV]);
caso("Ritmo: media de 3 meses, creciente", RM.nMeses === 3 && RM.media.every((v, i) => !i || v >= RM.media[i - 1] - 1e-9), RM.nMeses);

// 11. Inversión
const RI = F.resumenInversion(), EVI = F.evolucionInversion();
caso("Evolución: el último valor es el de hoy", EVI && cerca(EVI.valor[EVI.valor.length - 1], RI.total), EVI && [EVI.valor[EVI.valor.length - 1], RI.total]);
caso("Evolución: lo metido crece mes a mes", EVI && EVI.aportado.every((v, i) => !i || v >= EVI.aportado[i - 1] - 1e-9), EVI && EVI.aportado);
const AM = F.aportacionesMes(12);
caso("Aportaciones de septiembre: 150 + 50 €", cerca(AM[AM.length - 1].compras, 200), AM[AM.length - 1]);
caso("Constancia: 5 meses seguidos aportando", F.constancia() === 5, F.constancia());
const SA = F.saludInversion();
caso("Revisa tu inversión: sin errores con los datos de ejemplo", !SA.some((x) => x.nivel === "error"), SA.map((x) => x.texto));
caso("Valor: los activos de ejemplo tienen su valor anotado (no estimado)", RI.filas.every((f) => f.fuente === "anotado"), RI.filas.map((f) => f.fuente));

// 12. Progreso: hitos, proyección, esfuerzo y mercado, comisiones (con números sencillos)
const DT = luxon.DateTime, d = (iso) => DT.fromISO(iso);
const HT = F.hitosPatrimonio([{ fecha: d("2026-01-31"), neto: 8000 }, { fecha: d("2026-03-31"), neto: 12000 }], 26000, d("2026-09-30"));
caso("Hitos: 1 k, 2,5 k y 5 k cruzados con el primer registro", HT.logrados.slice(0, 3).every((h) => h.fecha.toISODate() === "2026-01-31"), HT.logrados.map((h) => [h.valor, h.fecha.toISODate()]));
caso("Hitos: 10 k en marzo y 25 k «hoy» (solo lo cruza la estimación)", HT.logrados[3].fecha.toISODate() === "2026-03-31" && HT.logrados[4].valor === 25000 && HT.logrados[4].hoy, HT.logrados);
caso("Hitos: los siguientes son 50 k (faltan 24.000 €) y 100 k", HT.proximos[0].valor === 50000 && HT.proximos[0].falta === 24000 && HT.proximos[1].valor === 100000 && HT.siguiente === 50000, HT.proximos);
const PY0 = F.proyeccion(1000, 100, 0, 1);
caso("Proyección sin rentabilidad: 1.000 + 12 × 100 = 2.200 €, el mercado pone 0", cerca(PY0.final, 2200) && cerca(PY0.mercado, 0) && PY0.valor.length === 2, PY0);
const rm = Math.pow(1.06, 1 / 12) - 1, ann = 5000 * Math.pow(1 + rm, 120) + 200 * (Math.pow(1 + rm, 120) - 1) / rm;
const PY1 = F.proyeccion(5000, 200, 0.06, 10);
caso("Proyección al 6 % durante 10 años = fórmula de la anualidad", cerca(PY1.final, ann, 0.01) && cerca(PY1.aportadoFinal, 5000 + 200 * 120) && cerca(PY1.mercado, ann - 29000, 0.01), [PY1.final, ann]);
caso("Meses hasta una meta: 10 meses de 100 € para llegar a 1.000 €", F.mesesHasta50(0, 100, 0, 1000) === 10 && F.mesesHasta50(2000, 0, 0, 1000) === 0 && F.mesesHasta50(0, 0, 0, 1000) === null, F.mesesHasta50(0, 100, 0, 1000));
const PI = F.puntosInversion([{ fecha: d("2026-01-15"), valores: { A: 1000 } }, { fecha: d("2026-02-20"), valores: { A: 1100, B: 60 } }], [{ fecha: d("2026-02-05"), importe: 100 }], 0, d("2026-02-25"));
caso("Esfuerzo y mercado: febrero 1.160 € = 1.000 + 100 aportados + 60 del mercado", PI.length === 2 && cerca(PI[1].aport, 100) && cerca(PI[1].mercado, 60) && cerca(PI[1].r, 0.06, 1e-9), PI);
const RP = F.rendimientoPuntos([{ key: "2025-11", valor: 1 }, { key: "2025-12", valor: 1, r: 0.10 }, { key: "2026-01", valor: 1, r: -0.20 }, { key: "2026-02", valor: 1, r: 0.05 }]);
caso("Rentabilidad encadenada: 1,10 × 0,80 × 1,05 y peor caída −20 %", cerca(RP.indice, 100 * 1.1 * 0.8 * 1.05, 1e-9) && cerca(RP.peor.caida, -0.2, 1e-9) && RP.peor.desde === "2025-12" && RP.peor.hasta === "2026-01", RP);
caso("Rentabilidad por año: 2025 +10 % (1 mes) y 2026 −16 % (2 meses)", cerca(RP.años[0].r, 0.10, 1e-9) && cerca(RP.años[1].r, 0.8 * 1.05 - 1, 1e-9) && RP.años[1].meses === 2, RP.años);
const CM = F.comisionesInversion([{ nombre: "A", ter: 0.2, valor: 10000, clase: "fondo", p: {} }, { nombre: "B", ter: null, valor: 500, clase: "fondo", p: {} }]);
caso("Comisiones: 0,2 % de 10.000 € = 20 € al año, 1,67 al mes; B sin TER", cerca(CM.año, 20) && cerca(CM.mes, 20 / 12, 1e-9) && CM.sinTer.length === 1 && CM.lista.length === 1, CM);
const TC = F.tamañoCompras([100, 100, 200, 200, 300, 300]);
caso("Tamaño de compras: 100 pequeña, 200 habitual, 400 grande; con menos de 6, nada", TC.de(100) === "pequeña" && TC.de(200) === "habitual" && TC.de(400) === "grande" && F.tamañoCompras([1, 2, 3]) === null, TC && [TC.p33, TC.p67]);
const RIs = F.resumenInversion(true);
caso("«Solo largo plazo»: sin activos marcados como corto, es lo mismo que todo", cerca(RIs.total, RI.total) && RIs.filas.length === RI.filas.length, [RIs.total, RI.total]);

// 13. Plusvalías por FIFO y traspasos entre fondos
const op = (id, f, activo, importe, part, extra = {}) => ({ id, fecha: d(f), activo, importe, part, traspaso: false, ajuste: false, ...extra });
const FX = F.fifoVentas([
  op(1, "2026-01-10", "A", 100, 10), op(2, "2026-02-10", "A", 150, 10), op(3, "2026-06-01", "A", -300, -15),
  op(4, "2026-07-01", "A", -100, -5, { traspaso: true }), op(5, "2026-07-02", "B", 100, 4, { traspaso: true }), op(6, "2026-09-01", "B", -120, -4),
  op(7, "2026-03-01", "C", 50, null), op(8, "2026-08-01", "C", -60, -1),
  op(9, "2026-04-01", "A", 0, 1, { ajuste: true }),
]);
caso("FIFO: vender 15 de A (10 a 100 € + 5 de los 10 a 150 €) cuesta 175 € y da +125 €", FX.ventas.length === 2 && cerca(FX.ventas[0].coste, 175) && cerca(FX.ventas[0].resultado, 125) && FX.ventas[0].activo === "A", FX.ventas[0]);
caso("Traspaso A→B: no es venta; B hereda el coste (75 €) y vender 4 por 120 € da +45 €", cerca(FX.ventas[1].coste, 75) && cerca(FX.ventas[1].resultado, 45) && FX.ventas[1].activo === "B" && FX.traspasos === 1, FX.ventas[1]);
caso("Sin participaciones no se calcula: C queda aparte y los ajustes no cuentan", FX.sinDatos.length === 1 && FX.sinDatos[0] === "C" && !FX.ventas.some((v) => v.activo === "C"), FX.sinDatos);
const FY = F.fifoVentas([op(1, "2026-01-10", "A", 100, 10), op(2, "2026-02-10", "A", -300, -15)]);
caso("Vender más de lo comprado: se avisa de lo que falta (5 participaciones)", cerca(FY.ventas[0].faltan, 5) && cerca(FY.ventas[0].unidades, 10) && cerca(FY.ventas[0].valor, 200), FY.ventas[0]);
caso("Dividendos: sin cobros en los datos de ejemplo, la ganancia no cambia", F.cobros().length === 0 && RI.filas.every((f) => f.cobrado === 0), F.cobros().length);

// 14. Precio de mercado de internet: manda si se conocen las participaciones y es más nuevo que lo anotado
const Pn = { conPart: true, part: 10, vendido: false }, Mx = { precio: 5, fecha: d("2026-09-29") };
caso("Mercado: sin valor anotado, manda el precio de internet", F.usaMercado(Pn, Mx, { conValor: false, fechaValor: null }), null);
caso("Mercado: con fuente configurada, el precio reciente (29/09) gana aunque anotaras hoy (30/09)", F.usaMercado(Pn, Mx, { conValor: true, fechaValor: d("2026-09-30") }), null);
caso("Mercado: un precio de hace más de 7 días no pisa un valor anotado más nuevo", !F.usaMercado(Pn, { precio: 5, fecha: d("2026-09-10") }, { conValor: true, fechaValor: d("2026-09-30") }), null);
caso("Mercado: con lo anotado el mismo día del precio o antes, gana el precio", F.usaMercado(Pn, Mx, { conValor: true, fechaValor: d("2026-09-29") }) && F.usaMercado(Pn, Mx, { conValor: true, fechaValor: d("2026-08-31") }), null);
caso("Mercado: sin participaciones, vendido o sin precio, no se usa", !F.usaMercado({ ...Pn, conPart: false }, Mx, { conValor: false }) && !F.usaMercado({ ...Pn, vendido: true }, Mx, { conValor: false }) && !F.usaMercado(Pn, null, { conValor: false }), null);

// 15. Resumen en HTML: «sin importes» no lleva ninguna cantidad en euros (ni oculta: ausente)
const HTc = F.generarResumen(false), HTs = F.generarResumen(true);
const E15 = F.estimacion(), RI15 = F.resumenInversion();
const cifras = [E15.neto, RI15.total, RI15.aportadoTodo, ...F.patrimonio().map((x) => x.neto)].filter((v) => Math.abs(v) >= 1000).flatMap((v) => [String(Math.round(v)), v.toLocaleString("es-ES", { maximumFractionDigits: 0 }), String(Math.round(v / 1000))].slice(0, 2));
caso("Resumen con importes: lleva euros y es un documento completo", /€/.test(HTc) && HTc.startsWith("<!doctype html>") && !/<script|src=|href=/i.test(HTc), HTc.length);
caso("Resumen sin importes: ni un euro en el archivo", !/€|EUR/.test(HTs), (HTs.match(/.{20}€.{10}/) || [])[0]);
caso("Resumen sin importes: ninguna cifra real del patrimonio ni de la inversión", cifras.length > 0 && cifras.every((c) => !HTs.includes(c)), cifras.filter((c) => HTs.includes(c)));
caso("Resumen sin importes: sí lleva porcentajes y el índice (100)", /\d %/.test(HTs) && /Índice/.test(HTs), null);

const HI = F.hitosPatrimonio([{ fecha: d("2026-01-31"), neto: 8000 }, { fecha: d("2026-03-31"), neto: 12000 }], 26000, d("2026-09-30"));
caso("Hitos: lo que ya tenías en el primer registro se marca como inicial", HI.logrados.filter((h) => h.inicial).map((h) => h.valor).join() === "1000,2500,5000" && !HI.logrados.find((h) => h.valor === 10000).inicial, JSON.stringify(HI.logrados));

return casos;

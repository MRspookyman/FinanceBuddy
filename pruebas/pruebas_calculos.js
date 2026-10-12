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

// El cuadre solo cuenta movimientos de verdad: un fijo previsto que el banco aún no trajo no puede explicar (ni crear) una diferencia.
{
  const u = P[P.length - 1], h = u.fecha.plus({ months: 2 }).endOf("day");
  const autos = F.movimientos().filter((m) => m.auto && m.fecha > u.fecha.endOf("day") && m.fecha <= h);
  const finHoy = F.DateTime.fromISO("2026-09-30").endOf("day");
  const [a, b, c] = [F.proyectar(u, h), F.proyectar(u, h, true), F.proyectar(u, finHoy, true)].map((x) => x.cuentas.saldos);
  const dif = (x, y) => Object.keys(x).filter((n) => Math.abs(x[n] - y[n]) > 0.005);
  // Después de hoy no hay nada de verdad: con `exacto`, dos meses más allá sale lo mismo que hoy en todas las cuentas.
  caso("El cuadre no cuenta los fijos previstos (solo movimientos de verdad)", autos.length > 0 && dif(a, b).length > 0 && dif(b, c).length === 0, [autos.length, dif(a, b), dif(b, c)]);
}
// Las aportaciones automáticas tampoco: las dos del 10/08 (150 + 50 €) no llegaron y en el Bróker hay de verdad 600 € el 31/08
// (400 + 200 del traspaso). Antes salía «No cuadra: Bróker +200 €».
{
  const u = P[P.length - 1], antes = u.cuentas.saldos["Bróker"];
  const apos = F.aportaciones().filter((x) => x.fecha.toISODate() === "2026-08-10");
  apos.forEach((x) => (x.auto = true)); u.cuentas.saldos["Bróker"] = 600;
  const fila = F.conciliacion().filas.find((f) => f.nombre === "Bróker");
  const sinExacto = F.proyectar(P[P.length - 2], u.fecha.endOf("day")).cuentas.saldos["Bróker"];
  apos.forEach((x) => (x.auto = false)); u.cuentas.saldos["Bróker"] = antes;
  caso("El cuadre no cuenta las aportaciones automáticas: el Bróker con 600 € cuadra", u.fecha.toISODate() === "2026-08-31" && apos.length === 2 && cerca(fila.esperado, 600) && cerca(fila.dif, 0) && cerca(sinExacto, 400), [apos.length, fila, sinExacto]);
}
// Cada movimiento cuenta desde el día en que el banco lo apuntó: un gasto de 100 € con valor 30/08 y operación 02/09 no estaba
// en el saldo anotado el 31/08, así que se resta después. Igual en la estimación de hoy que en el cuadre.
{
  const u = P[P.length - 1], ms = F.movimientos(), cta = "Cuenta nómina";
  const hasta = F.DateTime.fromISO("2026-09-30").endOf("day");
  const saldo = (exacto) => F.proyectar(u, hasta, exacto).cuentas.saldos[cta];
  const sin = saldo(false);
  ms.push({ p: { ext_fecha: "2026-09-02" }, fecha: F.DateTime.fromISO("2026-08-30"), importe: 100, clase: "gasto", categoria: "Otros", concepto: "Prueba", recurrente: "", destino: "", origen: "", cuenta: cta, auto: false, previsto: false, gasto: 100 });
  const [est, exa] = [saldo(false), saldo(true)];
  ms[ms.length - 1].p.ext_fecha = "2026-08-30";
  const yaEstaba = saldo(false);
  ms.pop();
  caso("El saldo estimado fecha por el día del banco: valor 30/08 y operación 02/09 → 1.597,06 €", cerca(sin, 1697.06) && cerca(est, 1597.06) && cerca(exa, 1597.06) && cerca(yaEstaba, sin), [sin, est, exa, yaEstaba]);
}
// Pero si has movido la fecha a mano más allá del día del banco (importado el 20/09, lo pasas al 05/10), manda tu fecha: es un
// previsto de octubre y la previsión ya lo resta allí. Restarlo también hoy sería contarlo dos veces.
{
  const u = P[P.length - 1], ms = F.movimientos(), cta = "Cuenta nómina";
  const hasta = F.DateTime.fromISO("2026-09-30").endOf("day");
  const saldo = (exacto) => F.proyectar(u, hasta, exacto).cuentas.saldos[cta];
  const fijos = () => suma(F.prevision().filas.map((f) => f.fijos)), fin = () => F.prevision().filas[11].saldo;
  const [sin, fijosSin, finSin] = [saldo(false), fijos(), fin()];
  ms.push({ p: { ext_fecha: "2026-09-20" }, fecha: F.DateTime.fromISO("2026-10-05"), importe: 100, clase: "gasto", categoria: "Otros", concepto: "Prueba", recurrente: "", destino: "", origen: "", cuenta: cta, auto: false, previsto: true, gasto: 100 });
  const [est, exa, fijosCon, finCon] = [saldo(false), saldo(true), fijos(), fin()];
  ms.pop();
  caso("Un movimiento importado al que le pones una fecha futura se resta una sola vez (en su mes, no hoy)", cerca(est, sin) && cerca(exa, sin) && cerca(fijosCon, fijosSin + 100) && cerca(finCon, finSin - 100), [sin, est, exa, fijosCon - fijosSin, finCon - finSin]);
}

// 2. Recurrentes sin duplicar: en septiembre cada uno aparece una vez y es el real (no el automático).
const S = F.finMes("2026-09");
for (const n of ["Nómina", "Alquiler", "Internet y móvil", "Luz", "Gimnasio"]) {
  const ms = S.ms.filter((m) => m.recurrente === n);
  caso(`«${n}» una sola vez en septiembre`, ms.length === 1 && !ms[0].auto, ms.length);
}
caso("El seguro anual (marzo) no aparece en septiembre", !S.ms.some((m) => m.recurrente === "Seguro del coche"));
// Un fijo pagado con fecha valor del mes anterior no se cuenta dos veces: el pago real sigue en su fecha, pero paga el mes en que
// el banco lo apuntó, así que ese mes ya no lleva el automático.
{
  const d = (s) => F.DateTime.fromISO(s), finHoy = d("2026-09-30").endOf("day");
  const reales = F.movimientos().filter((m) => !m.auto);
  const mover = (nombre, mesKey, fecha, ext) => reales.map((m) => (m.recurrente === nombre && m.fecha.toFormat("yyyy-MM") === mesKey ? { ...m, fecha: d(fecha), p: { ...m.p, ext_fecha: ext } } : m));
  const autosDe = (ms, nombre) => F.fijosAutomaticos(ms).filter((m) => m.recurrente === nombre).map((m) => m.fecha.toFormat("yyyy-MM"));
  const año = (ms) => F.resumenAño(2026, [...ms, ...F.fijosAutomaticos(ms).map((m) => ({ ...m, previsto: m.fecha > finHoy, gasto: m.clase === "gasto" ? m.importe : 0 }))]);
  // Alquiler de septiembre: operación 01/09, fecha valor 31/08 (así lo guarda la importación).
  const A = mover("Alquiler", "2026-09", "2026-08-31", "2026-09-01"), autosA = autosDe(A, "Alquiler"), RA = año(A);
  caso("Alquiler con valor 31/08 y operación 01/09: septiembre no lleva Alquiler automático y el año sigue en 7.252,94 €",
    !autosA.includes("2026-09") && !autosA.includes("2026-08") && autosA[0] === "2026-10" && cerca(RA.gastos, 7252.94) && cerca(año(reales).gastos, 7252.94)
    && cerca(RA.filas.find((f) => f.key === "2026-08").gastos - año(reales).filas.find((f) => f.key === "2026-08").gastos, 700), [autosA.slice(0, 3), RA.gastos]);
  // Apuntado a mano el 31/08 (sin extracto): agosto tiene dos y septiembre ninguno → el del 31/08 paga septiembre.
  const B = mover("Alquiler", "2026-09", "2026-08-31", ""), autosB = autosDe(B, "Alquiler");
  caso("Dos alquileres en agosto (01/08 y 31/08) y ninguno en septiembre: el segundo paga septiembre", !autosB.includes("2026-09") && autosB[0] === "2026-10" && cerca(año(B).gastos, 7252.94), autosB.slice(0, 3));
  // Una nómina del día 1 cobrada el último día del mes anterior.
  const nomina = F.recurrentes().find((r) => r.nombre === "Nómina"), dia = nomina.dia;
  nomina.dia = 1;
  const N = mover("Nómina", "2026-09", "2026-08-31", "2026-08-31"), autosN = autosDe(N, "Nómina"), RN = año(N);
  nomina.dia = dia;
  caso("Nómina de septiembre cobrada el 31/08: septiembre no lleva nómina automática y en el año entra lo mismo", !autosN.includes("2026-09") && autosN[0] === "2026-10" && cerca(RN.ingresos, año(reales).ingresos), [autosN.slice(0, 3), RN.ingresos]);
  // Un cobro repetido (dos cargos de la luz con dos días de diferencia) no paga el mes siguiente: octubre sigue previsto.
  const luz = reales.find((m) => m.recurrente === "Luz" && m.fecha.toFormat("yyyy-MM") === "2026-09");
  const autosL = autosDe([...reales, { ...luz, fecha: luz.fecha.plus({ days: 2 }) }], "Luz");
  caso("Dos cargos seguidos de la luz en septiembre no quitan el previsto de octubre", !!luz && autosL[0] === "2026-10", autosL.slice(0, 3));
  // Al revés: un fijo de fin de mes que el banco apunta el día 1 del mes siguiente paga el mes de su fecha, que es el que le toca.
  const gim = F.recurrentes().find((r) => r.nombre === "Gimnasio"), diaG = gim.dia;
  const finDeMes = (ms, dia, ext) => ms.map((m) => (m.recurrente === "Gimnasio" ? { ...m, fecha: m.fecha.set({ day: Math.min(dia, m.fecha.daysInMonth) }), p: { ...m.p, ext_fecha: m.fecha.startOf("month").plus({ months: 1, days: ext - 1 }).toISODate() } } : m));
  const sinSeptiembre = reales.filter((m) => !(m.recurrente === "Gimnasio" && m.fecha.toFormat("yyyy-MM") === "2026-09"));
  gim.dia = 31;
  const G = finDeMes(reales, 31, 1), autosG = autosDe(G, "Gimnasio"), RG = año(G);
  const autosH = autosDe(finDeMes(sinSeptiembre, 31, 1), "Gimnasio");
  gim.dia = 28;
  const autosI = autosDe(finDeMes(sinSeptiembre, 31, 2), "Gimnasio");
  gim.dia = diaG;
  caso("Gimnasio de fin de mes apuntado el día 1 del mes siguiente: ningún automático pasado, octubre sigue previsto y el año sigue en 7.252,94 €",
    G.filter((m) => m.recurrente === "Gimnasio").length === 5 && autosG[0] === "2026-10" && cerca(RG.gastos, 7252.94), [autosG.slice(0, 3), RG.gastos]);
  caso("Gimnasio de agosto con fecha 31/08 apuntado el 01/09 y el de septiembre sin llegar: agosto no lleva automático y septiembre sí",
    autosH[0] === "2026-09" && autosH[1] === "2026-10", autosH.slice(0, 3));
  caso("Lo mismo con el día 28 y apuntado el 02/09", autosI[0] === "2026-09" && autosI[1] === "2026-10", autosI.slice(0, 3));
}

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
caso("Previsión: el gasto variable es tu media real de los meses cerrados, no el límite de 600 €", PV.nMesesReal > 0 && PV.varReal > 0 && cerca(PV.varEst, PV.varReal) && !cerca(PV.varEst, 600), [PV.varEst, PV.varReal, PV.nMesesReal]);
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

// 12. Hitos del patrimonio y tamaño de las compras (con números sencillos)
const DT = luxon.DateTime, d = (iso) => DT.fromISO(iso);
const HT = F.hitosPatrimonio([{ fecha: d("2026-01-31"), neto: 8000 }, { fecha: d("2026-03-31"), neto: 12000 }], 26000, d("2026-09-30"));
caso("Hitos: 1 k, 2,5 k y 5 k cruzados con el primer registro", HT.logrados.slice(0, 3).every((h) => h.fecha.toISODate() === "2026-01-31"), HT.logrados.map((h) => [h.valor, h.fecha.toISODate()]));
caso("Hitos: 10 k en marzo y 25 k «hoy» (solo lo cruza la estimación)", HT.logrados[3].fecha.toISODate() === "2026-03-31" && HT.logrados[4].valor === 25000 && HT.logrados[4].hoy, HT.logrados);
caso("Hitos: los siguientes son 50 k (faltan 24.000 €) y 100 k", HT.proximos[0].valor === 50000 && HT.proximos[0].falta === 24000 && HT.proximos[1].valor === 100000 && HT.siguiente === 50000, HT.proximos);
caso("Meses hasta una meta: 10 meses de 100 € para llegar a 1.000 €", F.mesesHasta50(0, 100, 0, 1000) === 10 && F.mesesHasta50(2000, 0, 0, 1000) === 0 && F.mesesHasta50(0, 0, 0, 1000) === null, F.mesesHasta50(0, 100, 0, 1000));
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

const RO = F.repartoObjetivo([{ valor: 6000, p: { nombre: "A", objetivo: 70 } }, { valor: 1000, p: { nombre: "B", objetivo: 30 } }]);
caso("Reparto objetivo: la próxima aportación va al activo más por debajo", RO && RO.proxima && RO.proxima.f.p.nombre === "B" && !RO.dentro, JSON.stringify(RO && RO.proxima && RO.proxima.dif));
const RO2 = F.repartoObjetivo([{ valor: 650, p: { objetivo: 70 } }, { valor: 350, p: { objetivo: 30 } }]);
caso("Reparto objetivo: dentro de la banda de 5 puntos no hay que hacer nada", RO2 && !RO2.proxima && RO2.dentro, null);

const RA = F.repartoAportacion([{ valor: 6000, p: { nombre: "A", objetivo: 70 } }, { valor: 1000, p: { nombre: "B", objetivo: 30 } }], 300);
caso("Aportación: se reparte entera y solo a lo que está por debajo del objetivo (sin vender)", RA && RA.lineas[0].aporta === 0 && RA.lineas[1].aporta === 300 && RA.lineas.every((l) => l.aporta >= 0), JSON.stringify(RA && RA.lineas.map((l) => l.aporta)));
const RA2 = F.repartoAportacion([{ valor: 1000, p: { objetivo: 50 } }, { valor: 500, p: { objetivo: 30 } }, { valor: 0, p: { objetivo: 20 } }], 1000);
caso("Aportación: suma exactamente el importe, en céntimos, y se acerca al objetivo", RA2 && Math.round(RA2.lineas.reduce((a, l) => a + l.aporta, 0) * 100) === 100000 && Math.abs(RA2.lineas[0].despues - 50) < 1e-6, JSON.stringify(RA2 && RA2.lineas.map((l) => [l.aporta, l.despues])));
const RA3 = F.repartoAportacion([{ valor: 100, p: { objetivo: 1 } }, { valor: 100, p: { objetivo: 1 } }, { valor: 100, p: { objetivo: 1 } }], 100);
caso("Aportación: los céntimos que sobran se reparten (100 € entre 3 = 33,34 + 33,33 + 33,33)", RA3 && RA3.normalizado && RA3.lineas.map((l) => l.aporta).sort().join() === "33.33,33.33,33.34", JSON.stringify(RA3 && RA3.lineas.map((l) => l.aporta)));
caso("Aportación: sin importe solo muestra la desviación; sin objetivos, nada", F.repartoAportacion([{ valor: 5, p: { objetivo: 100 } }], 0).lineas[0].aporta === 0 && F.repartoAportacion([{ valor: 5, p: {} }], 50) === null, null);
caso("Validar objetivos: suma 100 válida; 90 faltan 10; 120 sobran; fuera de rango; vacío = quitar",
  F.validarObjetivos(["70", "30,0"]).ok && F.validarObjetivos(["60", "30"]).falta === 10 && !F.validarObjetivos(["80", "40"]).ok && F.validarObjetivos(["80", "40"]).falta === -20 && !F.validarObjetivos(["101", ""]).ok && F.validarObjetivos(["", ""]).vacio, JSON.stringify(F.validarObjetivos(["60", "30"])));

const RESMES = F.resumenMes("2026-08");
caso("Resumen del mes: frases de entradas y salidas, lo que más pesó y la inversión", RESMES.length >= 3 && /Entraron 1\.850/.test(RESMES[0]) && /Metiste/.test(RESMES[RESMES.length - 1]), JSON.stringify(RESMES));
caso("Fijos que suben de precio: sin subidas en los datos de ejemplo", F.subidasFijos().length === 0, JSON.stringify(F.subidasFijos()));

// Día en que empieza tu mes: a qué «mes» pertenece una fecha y cuándo empieza cada uno.
const dt = (s) => F.DateTime.fromISO(s);
caso("Mes natural (día 1): la fecha cae en su mes", F.periodoKey(dt("2026-09-28"), 1) === "2026-09" && F.periodoInicio("2026-09", 1).toISODate() === "2026-09-01");
caso("Cobro el 28: del 28 de septiembre en adelante ya es octubre", F.periodoKey(dt("2026-09-28"), 28) === "2026-10" && F.periodoKey(dt("2026-09-27"), 28) === "2026-09" && F.periodoKey(dt("2026-10-27"), 28) === "2026-10");
caso("Cobro el 28: octubre empieza el 28 de septiembre y enero, el 28 de diciembre", F.periodoInicio("2026-10", 28).toISODate() === "2026-09-28" && F.periodoKey(dt("2026-12-30"), 28) === "2027-01" && F.periodoInicio("2027-01", 28).toISODate() === "2026-12-28");
caso("Cobro el 5: hasta el 4 sigue siendo el mes anterior", F.periodoKey(dt("2026-10-04"), 5) === "2026-09" && F.periodoKey(dt("2026-10-05"), 5) === "2026-10" && F.periodoInicio("2026-10", 5).toISODate() === "2026-10-05" && F.periodoKey(dt("2027-01-03"), 5) === "2026-12");
// Rentabilidad de un periodo: ganancia = cambio de valor − lo metido; sin valor de partida no se calcula.
const EVP = { keys: ["2026-06", "2026-07", "2026-08", "2026-09"], aportado: [1000, 1200, 1400, 1600], valor: [1100, null, 1500, 1750] };
const RP1 = F.rentabilidadPeriodo(EVP, 1), RP3 = F.rentabilidadPeriodo(EVP, 3);
caso("Rentabilidad del mes: 1.750 − 1.500 − 200 metidos = 50 € sobre 1.600 €", RP1.ok && cerca(RP1.gan, 50) && cerca(RP1.r, 50 / 1600, 1e-9), JSON.stringify(RP1));
caso("Rentabilidad de 3 meses: 1.750 − 1.100 − 600 = 50 €", RP3.ok && cerca(RP3.gan, 50) && RP3.desde === "2026-06", JSON.stringify(RP3));
caso("Rentabilidad: sin valor de partida o sin tanto historial, no se calcula", !F.rentabilidadPeriodo(EVP, 2).ok && !F.rentabilidadPeriodo(EVP, 12).ok && !F.rentabilidadPeriodo(null, 1).ok);
// Colchón: sin fijarlo a mano es el calculado.
const PLANC = F.planReparto();
caso("Colchón automático si no se fija a mano", !PLANC || (!PLANC.manual && PLANC.colchon === PLANC.colchonAuto), JSON.stringify(PLANC && [PLANC.colchon, PLANC.colchonAuto]));

// ── Inicio: avisos plegados, objetivos con fecha, recordatorios que se repiten, fijos y renta ──
const d0 = (iso) => F.DateTime.fromISO(iso);
const AVx = [{ nivel: "warn", ruta: "#revisar" }, { nivel: "warn", ruta: "#a" }, { nivel: "info", ruta: "#importar" }, { nivel: "warn", ruta: "#b" }, { nivel: "warn", ruta: "#c" }, { nivel: "info", ruta: "#d" }];
const RAx = F.repartirAvisos(AVx, ["#importar"]);
caso("Avisos: dos a la vista; el resto y las notas, plegados; nada de «Por revisar» ni lo que ya sale arriba",
  RAx.arriba.map((a) => a.ruta).join() === "#a,#b" && RAx.resto.map((a) => a.ruta).join() === "#c,#d", JSON.stringify(RAx));
caso("Avisos: los del ejemplo no se pierden (a la vista + plegados = todos menos «Por revisar»)",
  (() => { const t = F.avisos(), r = F.repartirAvisos(t); return r.arriba.length + r.resto.length === t.filter((a) => a.ruta !== "#revisar").length; })());
const JP = F.objetivos().find((o) => o.nombre === "Viaje a Japón");
caso("Objetivo con fecha: faltan 1.600 € en 10 meses = 160 € al mes", JP && cerca(F.ritmoObjetivo(JP, F.hoy), 160), JP && F.ritmoObjetivo(JP, F.hoy));
caso("Objetivo sin fecha, vencido o conseguido: no pide nada al mes",
  F.ritmoObjetivo({ meta: 100, ahorrado: 10 }, F.hoy) === 0 && F.ritmoObjetivo({ meta: 100, ahorrado: 10, limite: d0("2026-01-01") }, F.hoy) === 0 && F.ritmoObjetivo({ meta: 100, ahorrado: 100, limite: d0("2027-01-01") }, F.hoy) === 0);
caso("Recordatorio anual hecho antes de tiempo: pasa al año siguiente", F.siguienteFecha(d0("2026-10-10"), "anual", d0("2026-09-30")).toISODate() === "2027-10-10");
caso("Recordatorio mensual atrasado: la primera fecha que aún no ha pasado", F.siguienteFecha(d0("2026-05-31"), "mensual", d0("2026-09-30")).toISODate() === "2026-10-31");
caso("Recordatorio que no se repite: no hay siguiente fecha", F.siguienteFecha(d0("2026-10-10"), "no", d0("2026-09-30")) === null && F.siguienteFecha(d0("2026-10-10"), "", d0("2026-09-30")) === null);
caso("Cuánto falta: hoy, mañana, en 10 días, hace 3 días",
  [0, 1, 10, -3].map((n) => F.cuantoFalta(F.hoy.plus({ days: n }), F.hoy)).join("|") === "hoy|mañana|en 10 días|hace 3 días");
const TF = F.totalesFijos([{ clase: "gasto", importe: 700 }, { clase: "gasto", importe: 240, meses: [3] }, { clase: "gasto", importe: 50, activo: false }, { clase: "gasto", importe: 30, hasta: "2026-01-31" },
  { clase: "ingreso", importe: 1850 }, { clase: "aportacion", importe: 200 }], "2026-09-30");
caso("Fijos: 700 € × 12 + un seguro anual de 240 € = 8.640 € al año (720 € al mes de media); los parados no cuentan",
  cerca(TF.gasto.año, 8640) && cerca(TF.gasto.mes, 720) && TF.gasto.n === 2 && TF.gasto.noMensual && !TF.ingreso.noMensual && cerca(TF.ingreso.mes, 1850) && cerca(TF.aportacion.año, 2400), JSON.stringify(TF));
caso("Fijos del ejemplo: todos se han cobrado hace poco, ninguno sale como «ya no aparece»", F.fijosSinCobrar().length === 0, JSON.stringify(F.fijosSinCobrar()));
caso("Tramos del ahorro: 5.000 € → 950 €; 10.000 € → 1.140 + 840 = 1.980 €; 0 → 0", cerca(F.cuotaAhorro(5000), 950) && cerca(F.cuotaAhorro(10000), 1980) && F.cuotaAhorro(0) === 0 && F.cuotaAhorro(-5) === 0);
// 2024: pierdes 1.000 € y cobras 400 € brutos → 100 € (el 25 %) se restan de los dividendos y quedan 900 € pendientes.
// 2025: ganas 600 € → se compensan enteros; quedan 300 €. 2026: ganas 2.000 € y cobras 1.000 € brutos con 190 € retenidos.
const RN = F.rentaPorAño([{ año: 2026, ventas: 2000, dividendos: 1000, retenido: 190 }, { año: 2024, ventas: -1000, dividendos: 400, retenido: 76 }, { año: 2025, ventas: 600, dividendos: 0, retenido: 0 }]);
caso("Renta 2024: la pérdida resta el 25 % de los dividendos y el resto queda pendiente", cerca(RN.get(2024).base, 300) && cerca(RN.get(2024).cuota, 57) && cerca(RN.get(2024).pendDespues, 900), JSON.stringify(RN.get(2024)));
caso("Renta 2025: la ganancia se compensa entera con lo pendiente", cerca(RN.get(2025).base, 0) && cerca(RN.get(2025).usado, 600) && cerca(RN.get(2025).pendDespues, 300), JSON.stringify(RN.get(2025)));
caso("Renta 2026: 2.000 − 300 pendientes + 1.000 de dividendos = 2.700 € → 513 €, menos 190 € retenidos = 323 €",
  cerca(RN.get(2026).base, 2700) && cerca(RN.get(2026).cuota, 513) && cerca(RN.get(2026).diferencia, 323) && cerca(RN.get(2026).pendDespues, 0), JSON.stringify(RN.get(2026)));
const RCx = F.rentaPorAño([{ año: 2020, ventas: -500, dividendos: 0 }, { año: 2025, ventas: 500, dividendos: 0 }]);
caso("Renta: una pérdida de hace más de 4 años ya no compensa", cerca(RCx.get(2025).base, 500) && cerca(RCx.get(2025).pendAntes, 0), JSON.stringify(RCx.get(2025)));
const CSV = F.csvRenta(2026, [{ fecha: d0("2026-03-05"), activo: "Fondo; raro", unidades: 1.5, valor: 1234.5, coste: 1000, resultado: 234.5 }], [{ fecha: d0("2026-06-01"), activo: "ETF", tipo: "dividendo", importe: 81, retencion: 19 }]);
caso("Renta en CSV: coma decimal, punto y coma, y el bruto del dividendo (81 + 19 = 100)",
  CSV.includes('05/03/2026;"Fondo; raro";1,500000;1234,50;1000,00;234,50') && CSV.includes("01/06/2026;ETF;Dividendo;81,00;19,00;100,00"), CSV);
caso("Recordatorios: el del ejemplo no se repite", F.recordatorios().every((r) => !r.repetir || r.repetir === "no"));

// Gastos fijos sin dar de alta: lo que hay en una categoría fija sin enlazar a un fijo, menos lo que se atribuye a los fijos
// de esa categoría que ese mes tocaban y no tienen su pago. Un agosto de mentira: 120 € de comunidad (− 20 € que devuelven)
// con el alquiler pagado; 60 € de suministros con la luz pagada pero no «Internet y móvil» (35 €: se le atribuyen); 15 € de
// suscripciones con el gimnasio (29,90 €) solo previsto (se le atribuyen todos) y un seguro de 310 € que en agosto no es el anual.
const sueltos = (key) => F.gastoFijoSuelto({ key, real: [
  { gasto: 700, categoria: "Vivienda", recurrente: "Alquiler" }, { gasto: 120, categoria: "Vivienda", recurrente: "" }, { gasto: -20, categoria: "Vivienda", recurrente: "" },
  { gasto: 48, categoria: "Suministros", recurrente: "Luz" }, { gasto: 60, categoria: "Suministros", recurrente: "" },
  { gasto: 29.9, categoria: "Suscripciones", recurrente: "Gimnasio", auto: true }, { gasto: 15, categoria: "Suscripciones", recurrente: "" },
  { gasto: 310, categoria: "Seguros", recurrente: "" }, { gasto: 50, categoria: "Supermercado", recurrente: "" }] });
caso("Gastos fijos sin dar de alta: 100 € de comunidad + 25 € de suministros + 310 € de un seguro = 435 €", cerca(sueltos("2026-08"), 435), sueltos("2026-08"));
caso("…y en marzo ese seguro es el anual que ya está como fijo: no se cuenta dos veces (125 €)", cerca(sueltos("2027-03"), 125), sueltos("2027-03"));
caso("Previsión del ejemplo: todo lo fijo está dado de alta, así que no añade gastos fijos sueltos",
  PV.sueltoEst === 0 && PV.nMesesSuelto === 4 && PV.filas.every((f) => f.suelto === 0 && cerca(f.salidas, f.fijos + f.suelto + f.variable + f.tr + f.apoBanco)), [PV.sueltoEst, PV.nMesesSuelto]);
caso("Un cierre vale si sus saldos son del último día de su mes o de después; con saldos de mitad de mes, no",
  F.cierreVale({ mes: "2026-10", fecha: "2026-10-31" }) && F.cierreVale({ mes: "2026-10", fecha: "2026-11-03" }) && F.cierreVale({ mes: "2026-10" }) && !F.cierreVale({ mes: "2026-10", fecha: "2026-10-06" }));
caso("Los cuatro cierres del ejemplo (de fin de mes) cuentan", F.cierres().length === 4, F.cierres().length);

// Lo que conviene mirar en lo que llega del banco: comisiones y cobros que parecen repetidos (movimientos de mentira).
const mv = (id, fecha, concepto, importe, mas = {}) => ({ p: { id, ext_texto: `COMPRA ${concepto.toUpperCase()}, MADRID, TARJ. :*1234`, ...(mas.p || {}) }, fecha: d0(fecha), clase: "gasto",
  categoria: mas.categoria || "Compras", importe, concepto, cuenta: "Cuenta nómina", recurrente: mas.recurrente || "" });
const REP = F.cobrosRepetidos([mv(1, "2026-09-20", "Tienda Sol", 39.9), mv(2, "2026-09-21", "Tienda Sol", 39.9), mv(3, "2026-09-21", "Tienda Sol", 12), mv(4, "2026-09-25", "Tienda Sol", 39.9),
  mv(5, "2026-09-10", "Café", 2.5), mv(6, "2026-09-10", "Café", 2.5), mv(7, "2026-09-12", "Luz", 48, { recurrente: "Luz" }), mv(8, "2026-09-12", "Luz", 48, { recurrente: "Luz" }),
  mv(9, "2026-09-15", "Bizum a Ana", 20), mv(10, "2026-09-15", "Bizum a Ana", 20), mv(11, "2026-09-18", "Súper", 30, { p: { parte_de: 11 } }), mv(12, "2026-09-18", "Súper", 30, { p: { parte_de: 11 } }),
  mv(13, "2026-05-01", "Viejo", 50), mv(14, "2026-05-01", "Viejo", 50), mv(15, "2026-07-10", "Del trimestre", 25), mv(16, "2026-07-11", "Del trimestre", 25)], d0("2026-09-30"));
caso("Cobro repetido: mismo comercio, importe y cuenta en dos días, también el de hace casi tres meses; no los cafés, los fijos, los Bizums, lo dividido ni lo de hace cinco meses",
  JSON.stringify(REP.map((x) => [x.a.p.id, x.b.p.id])) === "[[15,16],[1,2]]", JSON.stringify(REP.map((x) => [x.a.p.id, x.b.p.id])));
const COM = F.comisionesRecientes([mv(20, "2026-09-25", "Comisión mantenimiento", 12, { categoria: "Comisiones" }), mv(21, "2026-05-01", "Comisión vieja", 12, { categoria: "Comisiones" }),
  mv(22, "2026-09-26", "Cuota tarjeta", 30, { categoria: "Comisiones", recurrente: "Cuota tarjeta" }), mv(23, "2026-09-27", "Tienda", 12), mv(24, "2026-07-18", "Comisión del trimestre", 6, { categoria: "Comisiones" })], d0("2026-09-30"));
caso("Comisiones: avisa de las del último trimestre; no de la de hace cinco meses ni de la que ya tienes como fijo", JSON.stringify(COM.map((m) => m.p.id)) === "[20,24]", JSON.stringify(COM.map((m) => m.p.id)));
caso("Copias en un solo disco: avisa con datos de verdad y sin segunda carpeta; no en el ejemplo, ni sin datos, ni si ya la hay",
  F.faltaSegundaCopia({}, { ejemplo: false }, 10) && !F.faltaSegundaCopia({ copia_extra: "E:\\Copias" }, {}, 10) && !F.faltaSegundaCopia({}, { ejemplo: true }, 10) && !F.faltaSegundaCopia({}, {}, 0));
caso("El ejemplo no tiene comisiones, cobros repetidos ni aviso de copias", !F.avisos().some((a) => /^comision:|^repetido:|^copias:/.test(String(a.clave).replace("inicio:", ""))),
  JSON.stringify(F.avisos().map((a) => a.clave)));

// Mi año: el año del ejemplo (mayo a septiembre de 2026) suma lo mismo que sus meses, y solo cuentan meses con movimientos propios.
const R26 = F.resumenAño(2026);
const K26 = R26.keys.filter((k) => F.finMes(k).real.some((m) => !m.auto));
caso("Mi año 2026 del ejemplo: 5 meses, y lo que entró y salió es la suma de esos meses",
  R26.meses === 5 && K26.length === 5 && cerca(R26.ingresos, suma(K26.map((k) => F.finMes(k).ingresos))) && cerca(R26.gastos, suma(K26.map((k) => F.finMes(k).gastos))),
  [R26.meses, R26.ingresos, R26.gastos]);
caso("Mi año: lo gastado por categoría suma el total, y el mejor y el peor mes son meses ya acabados",
  cerca(suma([...R26.gastoCat.values()]), R26.gastos) && R26.mejor && R26.peor && R26.mejor.key < F.hoyKey && R26.peor.key < F.hoyKey && R26.mejor.ahorro >= R26.peor.ahorro,
  [R26.mejor && R26.mejor.key, R26.peor && R26.peor.key]);
const mA = (fecha, clase, importe, categoria, mas = {}) => ({ fecha: d0(fecha), clase, importe, categoria, auto: false, previsto: false,
  gasto: clase === "gasto" ? importe : clase === "reembolso" ? -importe : 0, ...mas });
const MOV25 = [mA("2025-01-10", "ingreso", 1000, "Nómina"), mA("2025-01-15", "gasto", 400, "Supermercado"), mA("2025-02-05", "gasto", 900, "Viajes"),
  mA("2025-02-20", "ingreso", 1000, "Nómina"), mA("2025-02-21", "reembolso", 100, "Viajes"), mA("2025-03-01", "ingreso", 1850, "Nómina", { auto: true }),
  mA("2025-04-02", "gasto", 50, "Ocio", { previsto: true }), mA("2024-12-31", "gasto", 999, "Ocio")];
const R25 = F.resumenAño(2025, MOV25);
caso("Mi año: sin el mes con solo fijos automáticos, lo previsto ni lo de otro año; el reembolso resta (2.000 € entran, 1.200 € salen)",
  R25.meses === 2 && cerca(R25.ingresos, 2000) && cerca(R25.gastos, 1200) && cerca(R25.ahorro, 800) && cerca(R25.gastoCat.get("Viajes"), 800) && !R25.gastoCat.has("Ocio"),
  [R25.meses, R25.ingresos, R25.gastos, JSON.stringify([...R25.gastoCat])]);
caso("Mi año: mejor mes enero (600 €), peor febrero (200 €); hasta enero solo cuenta enero",
  R25.mejor.key === "2025-01" && cerca(R25.mejor.ahorro, 600) && R25.peor.key === "2025-02" && cerca(R25.peor.ahorro, 200) && F.resumenAño(2025, MOV25, "2025-01").meses === 1 && cerca(F.resumenAño(2025, MOV25, "2025-01").gastos, 400),
  [R25.mejor && R25.mejor.key, R25.peor && R25.peor.key]);
const EVA = { keys: ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03"], aportado: [1000, 1000, 1100, 1200, 1200], valor: [1000, 1050, null, 1300, 1320] };
const RAÑ = F.rentabilidadAño(EVA, 2026);
caso("Rentabilidad del año: de fin de diciembre (1.050 €) a marzo (1.320 €) metiendo 200 € → gana 70 € (6,1 %)",
  RAÑ.ok && RAÑ.desde === "2025-12" && RAÑ.hasta === "2026-03" && cerca(RAÑ.metido, 200) && cerca(RAÑ.gan, 70) && cerca(RAÑ.r, 70 / 1150, 1e-9), JSON.stringify(RAÑ));
caso("Rentabilidad del año: sin valores de ese año no se calcula", !F.rentabilidadAño(EVA, 2024).ok && !F.rentabilidadAño(null, 2026).ok);
const PSA = [{ fecha: d0("2025-12-31"), neto: 10000 }, { fecha: d0("2026-01-15"), neto: 10200 }, { fecha: d0("2026-01-31"), neto: 10500 }, { fecha: d0("2026-03-31"), neto: 11000 }];
const PA = F.patrimonioAño(2026, PSA, 12000), PA2 = F.patrimonioAño(2026, PSA), PA25 = F.patrimonioAño(2025, PSA);
caso("Patrimonio del año: el último registro de cada mes, hoy (septiembre) el estimado y nada después; cambia 2.000 € desde el 31/12 (sin saldos del año anterior, desde el primero del año)",
  PA.valores[0] === 10500 && PA.valores[1] === null && PA.valores[2] === 11000 && PA.valores[8] === 12000 && PA.valores[9] === null && PA.inicio === 10000 && PA.cambio === 2000 && PA.mesFin === "2026-09"
  && PA2.fin === 11000 && PA2.mesFin === "2026-03" && PA25.dentro && PA25.cambio === null && F.patrimonioAño(2026, PSA.slice(1), 12000).cambio === 1800 && PA25.fin === 10000, JSON.stringify([PA.valores, PA.cambio, PA2.fin, PA25.cambio]));

// Aportación fija que no llega (fijosSinCobrar deja fuera las aportaciones a propósito). Fijos y aportaciones de mentira.
const rA = (id, nombre, dia, desde, mas = {}) => ({ p: { id }, nombre, clase: "aportacion", dia, desde: d0(desde), hasta: null, meses: null, activoInv: "Fondo " + id, ...mas });
const apA = (fecha, recurrente, auto = false) => ({ fecha: d0(fecha), recurrente, auto });
const meses8 = (n, dia) => ["01", "02", "03", "04", "05", "06", "07", "08"].map((m) => apA(`2026-${m}-${dia}`, n));
const SL = F.aportacionesSinLlegar([rA(1, "Plan A", 5, "2026-01-05"), rA(2, "Plan B", 5, "2026-01-05"), rA(3, "Plan C", 5, "2026-01-05"), rA(4, "Plan D", 28, "2026-01-28"),
  rA(5, "Plan E", 5, "2026-01-05", { hasta: d0("2026-08-31") }), { ...rA(6, "Gasto", 5, "2026-01-05"), clase: "gasto" }],
  [...meses8("Plan A", "05"), apA("2026-09-05", "Plan A", true), ...meses8("Plan B", "05"), apA("2026-09-06", "Plan B"), apA("2026-09-05", "Plan C", true),
    ...meses8("Plan D", "28"), ...meses8("Plan E", "05"), ...meses8("Gasto", "05")], d0("2026-09-30"));
caso("Aportación que no llega: avisa de la de septiembre de A (solo hay la automática); no de B (llegó un día tarde), C (nunca casó con una real), D (aún no toca: el 28 + 5 días de margen), E (terminada) ni de un gasto",
  SL.length === 1 && SL[0].id === 1 && SL[0].mes === "2026-09" && SL[0].fecha.toISODate() === "2026-09-05" && SL[0].activo === "Fondo 1", JSON.stringify(SL.map((x) => [x.id, x.mes])));
caso("Aportación que no llega: hasta el 9 de septiembre todavía no toca avisar (5 días de margen)", F.aportacionesSinLlegar([rA(1, "Plan A", 5, "2026-01-05")], meses8("Plan A", "05"), d0("2026-09-09")).length === 0
  && F.aportacionesSinLlegar([rA(1, "Plan A", 5, "2026-01-05")], meses8("Plan A", "05"), d0("2026-09-10")).length === 1);
caso("Aportaciones del ejemplo: todas han llegado, ningún aviso", !F.avisos().some((a) => /^inicio:aporta:/.test(a.clave)) && F.aportacionesSinLlegar(F.recurrentes(), F.aportaciones(), F.hoy).length === 0,
  JSON.stringify(F.avisos().map((a) => a.clave)));

// Regla de los dos meses en «Para la renta»: se marca la venta con pérdidas, sin cambiar su resultado.
const CL = { F: "fondo", E: "etf", A: "accion", B: "accion", C: "cripto", G: "accion" };
const OPS2 = [
  op(1, "2026-01-10", "F", 1000, 10), op(2, "2026-03-01", "F", -800, -10), op(3, "2026-09-01", "F", 100, 1),       // fondo: recompra a los 6 meses (plazo de un año)
  op(4, "2026-01-10", "E", 1000, 10), op(5, "2026-03-01", "E", -800, -10), op(6, "2026-06-01", "E", 100, 1),       // ETF: recompra a los 3 meses (fuera de los dos)
  op(7, "2026-01-10", "A", 1000, 10), op(8, "2026-02-15", "A", 400, 5), op(9, "2026-03-01", "A", -700, -10),      // acción: compró 15 días antes y le quedan 5
  op(10, "2026-02-15", "B", 1000, 10), op(11, "2026-03-01", "B", -900, -10),                                       // acción: compró antes pero lo vendió todo
  op(12, "2026-01-10", "C", 1000, 1), op(13, "2026-03-01", "C", -500, -1), op(14, "2026-03-10", "C", 500, 1),      // cripto: no entra
  op(15, "2026-01-10", "G", 1000, 10), op(16, "2026-03-01", "G", -1500, -10), op(17, "2026-03-10", "G", 100, 1),   // con ganancia: no entra
];
const FV2 = F.fifoVentas(OPS2), D2 = F.reglaDosMeses(OPS2, FV2.ventas, (n) => CL[n]);
caso("Dos meses: marca el fondo (recompra en un año) y la acción con compra reciente que sigues teniendo; no el ETF de 3 meses después, la acción vendida entera, la cripto ni una ganancia",
  D2.map((x) => x.activo).sort().join() === "A,F" && cerca(D2.find((x) => x.activo === "F").perdida, 200) && D2.find((x) => x.activo === "F").meses === 12 && cerca(D2.find((x) => x.activo === "A").perdida, 300)
  && D2.find((x) => x.activo === "A").compra.toISODate() === "2026-02-15", JSON.stringify(D2.map((x) => [x.activo, x.perdida, x.compra.toISODate(), x.meses])));
caso("Dos meses: el resultado de las ventas no cambia (solo se marca)", cerca(FV2.ventas.find((v) => v.activo === "F").resultado, -200) && cerca(FV2.ventas.find((v) => v.activo === "A").resultado, -300));

// Primeros pasos: cada casilla se tacha sola según lo que ya hay
const PP0 = F.primerosPasos({ cuentas: 1, movimientos: 0, pendientes: 0, fijos: 0, limite: 0, saldos: 0 });
const PP1 = F.primerosPasos({ cuentas: 2, movimientos: 80, pendientes: 3, fijos: 4, limite: 600, saldos: 1 });
caso("Primeros pasos: con solo las cuentas, lo demás por hacer (y sin importar, revisar no cuenta como hecho)",
  PP0.filter((x) => x.hecho).map((x) => x.id).join() === "cuentas" && PP0.length === 6, JSON.stringify(PP0.map((x) => [x.id, x.hecho])));
caso("Primeros pasos: con dudas por revisar, solo falta eso y dice cuántas quedan",
  PP1.filter((x) => !x.hecho).map((x) => x.id).join() === "revisar" && /quedan 3/.test(PP1.find((x) => x.id === "revisar").s), JSON.stringify(PP1.map((x) => [x.id, x.hecho])));

// Dónde más gastas: por comercio (movimientos de mentira). Mercadona en mayúsculas es el mismo; las dos partes de Ikea son una
// compra; el Bizum enlazado resta de la cena; fuera el alquiler (fijo), lo automático, lo previsto, lo por revisar y lo de otro año.
const mC = (id, fecha, concepto, importe, mas = {}) => ({ p: { id, ...(mas.p || {}) }, fecha: d0(fecha), clase: mas.clase || "gasto", categoria: mas.categoria || "Compras",
  importe, concepto, auto: !!mas.auto, previsto: !!mas.previsto, pendiente: !!mas.pendiente });
const PCx = F.porComercio([mC(1, "2026-03-02", "Mercadona", 45), mC(2, "2026-04-02", "Mercadona", 30), mC(3, "2026-05-02", "MERCADONA", 10),
  mC(4, "2026-05-10", "Ikea", 50), mC(5, "2026-05-10", "Ikea", 20, { p: { parte_de: 4 } }), mC(6, "2026-06-01", "Restaurante Sol", 80),
  mC(7, "2026-06-03", "Parte de Ana", 30, { clase: "reembolso", p: { reembolsa: 6 } }), mC(8, "2026-06-05", "Café Luna", 2.5), mC(9, "2026-06-06", "Café Luna", 2.5),
  mC(10, "2026-06-01", "Alquiler", 700, { categoria: "Vivienda" }), mC(11, "2026-07-01", "Gimnasio", 30, { auto: true }), mC(12, "2026-12-01", "Ikea", 99, { previsto: true }),
  mC(13, "2026-07-01", "Tienda rara", 60, { pendiente: true }), mC(14, "2025-07-01", "Mercadona", 500)], (m) => m.fecha.year === 2026, (c) => c === "Vivienda");
caso("Por comercio: Mercadona 85 € en 3 compras, Ikea 70 € en una (sus dos partes), la cena 50 € (le restan el Bizum) y el café 5 €; sin fijos, automáticos, previstos, por revisar ni otro año",
  JSON.stringify(PCx.lista.map((c) => [c.nombre, Math.round(c.total * 100) / 100, c.n])) === '[["Mercadona",85,3],["Ikea",70,1],["Restaurante Sol",50,1],["Café Luna",5,2]]'
  && cerca(PCx.lista[0].medio, 85 / 3), JSON.stringify(PCx.lista));
caso("Por comercio: compras de menos de 10 € (los dos cafés, 5 €)", PCx.pequeñas.n === 2 && cerca(PCx.pequeñas.total, 5), JSON.stringify(PCx.pequeñas));

// Presupuestos sugeridos: la media de los meses de referencia redondeada a 10 €; solo categorías variables y visibles.
const PSx = F.presupuestosSugeridos([{ nombre: "Super", grupo: "variable" }, { nombre: "Ocio", grupo: "variable", presupuesto: 100 }, { nombre: "Vivienda", grupo: "fijo" },
  { nombre: "Viejo", grupo: "variable", oculta: true }, { nombre: "Poco", grupo: "variable" }],
  [new Map([["Super", 300], ["Ocio", 80], ["Vivienda", 700], ["Viejo", 50], ["Poco", 6]]), new Map([["Super", 320], ["Ocio", 100]]), new Map([["Super", 334], ["Ocio", 75], ["Poco", -3]])]);
caso("Presupuestos sugeridos: Supermercado 318 € de media → 320 €, Ocio 85 € → 90 € (y dice que ahora tiene 100 €); fuera lo fijo, lo oculto y lo que no llega a 10 €",
  JSON.stringify(PSx.map((x) => [x.nombre, x.propuesta, x.actual])) === '[["Super",320,0],["Ocio",90,100]]', JSON.stringify(PSx));
caso("Presupuestos sugeridos: sin meses de referencia, nada", F.presupuestosSugeridos([{ nombre: "Super", grupo: "variable" }], []).length === 0);

// Aviso de rebalanceo: el activo que más se aleja de tu objetivo y a cuál llevar la próxima aportación; sin objetivo o dentro de la banda, nada.
const AVR = F.avisoReparto([{ nombre: "A", valor: 7000, p: { objetivo: 50 } }, { nombre: "B", valor: 2000, p: { objetivo: 25 } }, { nombre: "C", valor: 1000, p: { objetivo: 25 } }]);
caso("Rebalanceo: A pesa 20 puntos más (70 % frente a 50 %) y la próxima aportación, a C (15 puntos por debajo; B, a 5, está dentro)",
  AVR && AVR.activo === "A" && cerca(AVR.dif, 20) && cerca(AVR.actual, 70) && cerca(AVR.objetivo, 50) && AVR.proxima === "C", JSON.stringify(AVR));
caso("Rebalanceo: dentro de la banda de 5 puntos o sin objetivo, no avisa",
  F.avisoReparto([{ nombre: "A", valor: 680, p: { objetivo: 70 } }, { nombre: "B", valor: 320, p: { objetivo: 30 } }]) === null && F.avisoReparto([{ nombre: "A", valor: 5, p: {} }]) === null);
caso("Rebalanceo: el ejemplo no tiene reparto objetivo, así que no hay aviso", !F.avisos().some((a) => /^inicio:reparto:/.test(a.clave)), JSON.stringify(F.avisos().map((a) => a.clave)));

// Meta de ahorro → límite de gasto variable: entra − fijos − gastos fijos sin dar de alta − aportaciones − meta, a 10 € hacia abajo.
const LM = F.limitePorMeta(400, { ingresos: 1850, fijos: 812.9, suelto: 50, aportaciones: 200 }), LM2 = F.limitePorMeta(900, { ingresos: 1850, fijos: 812.9, suelto: 50, aportaciones: 200 });
caso("Meta de ahorro: 1.850 − 812,90 − 50 − 200 − 400 = 387,10 € → límite de 380 €", LM.llega && cerca(LM.sobra, 387.1) && LM.limite === 380, JSON.stringify(LM));
caso("Meta de ahorro: si no llega (faltan 112,90 €), no propone límite", !LM2.llega && LM2.limite === 0 && cerca(LM2.sobra, -112.9), JSON.stringify(LM2));

// Un activo vendido del todo después de anotar su valor vale 0 €: antes seguía valiendo «anotado + operaciones posteriores»
// (1.000 − 1.200 = −200 €) para siempre, porque a un vendido ya nadie le pide el valor. Anotado después de la venta, manda lo anotado.
{
  const A = F.activos(), AP = F.aportaciones(), n0 = F.estimacion().neto, R0 = F.resumenInversion(), ev0 = F.evolucionInversion();
  const a = { p: { id: -72 }, nombre: "ETF Prueba", clase: "etf", cuenta: "", valor: 1000, conValor: true, ter: null, fechaValor: d("2026-08-31"), aportadoIni: null, fechaIni: null, largo: true };
  const ope = (f, importe, part) => ({ p: { participaciones: part }, fecha: d(f), activo: "ETF Prueba", importe, recurrente: "", cuenta: "", auto: false, previsto: false });
  A.push(a); AP.push(ope("2026-08-10", 1000, 10), ope("2026-09-20", -1200, -10));
  const V = F.valorInfo(a), R = F.resumenInversion(), n1 = F.estimacion().neto, ev = F.evolucionInversion();
  a.fechaValor = d("2026-09-25"); a.valor = 30;
  const Vd = F.valorInfo(a);
  a.fechaValor = null; a.valor = 1000;
  const Vs = F.valorInfo(a), Rs = F.resumenInversion(), ns = F.estimacion().neto;
  A.pop(); AP.splice(-2);
  caso("Vendido del todo tras anotar su valor: vale 0 € (no −200 €) y el patrimonio sube los 1.200 € de la venta",
    F.posicion(a).vendido && V.valor === 0 && V.fuente === "vendido" && cerca(n1, n0 + 1200) && cerca(R.total, R0.total) && cerca(R.aportadoTodo, R0.aportadoTodo)
    && !R.filas.some((f) => f.nombre === "ETF Prueba") && R.cerradas.length === 1 && cerca(R.cerradas[0].resultado, 200) && cerca(ev.valor[ev.valor.length - 1], ev0.valor[ev0.valor.length - 1]),
    [V, n1 - n0, R.total - R0.total, R.aportadoTodo - R0.aportadoTodo, R.cerradas]);
  caso("Vendido del todo con el valor anotado después de la venta: manda lo anotado (30 €)", Vd.fuente === "anotado" && cerca(Vd.valor, 30), Vd);
  caso("Vendido del todo con el valor anotado sin fecha: vale 0 € (no 1.000 €) y va a «Ya vendido», porque sin fecha no se sabe si es de después de la venta",
    Vs.valor === 0 && Vs.fuente === "vendido" && cerca(Rs.total, R0.total) && cerca(ns, n0 + 1200) && !Rs.filas.some((f) => f.nombre === "ETF Prueba") && Rs.cerradas.length === 1,
    [Vs, Rs.total - R0.total, ns - n0, Rs.cerradas]);
}

// «¿Me puedo permitir un gasto?»: el importe como se escribe en España y las tres cifras con el gasto restado.
caso("Importe escrito: «300», «300,50», «1.200», «1.200,50 €» y «300.50» se leen bien; «abc», «1.2.3», «-5» y vacío, no",
  F.leerImporte("300") === 300 && F.leerImporte("300,50") === 300.5 && F.leerImporte("1.200") === 1200 && F.leerImporte(" 1.200,50 € ") === 1200.5 && F.leerImporte("300.50") === 300.5
  && ["abc", "1.2.3", "-5", "", "12,3,4"].every((t) => isNaN(F.leerImporte(t))), ["300", "300,50", "1.200", "1.200,50 €", "300.50", "abc", "1.2.3"].map(F.leerImporte));
{
  const D = { limite: 600, disponible: 500, finMes: 3000, minimo: { key: "2027-01", saldo: 2500 }, colchon: { sobra: 800 } };
  const pp = (imp, d) => { const r = F.puedoPermitirme(imp, d); return { ...r, texto: r.texto.replace(/ /g, " ") }; };  // el espacio duro de «300 €»
  const P = pp(300, D), P2 = pp(650, D), P3 = pp(900, D), P4 = pp(2600, D);
  caso("Permitir: 300 € con 500 € de límite libre → te quedan 200 €, fin de mes 2.700 € y el mes más bajo 2.200 € en enero; cabe",
    P.nivel === "bien" && cerca(P.limite, 200) && cerca(P.finMes, 2700) && cerca(P.minimo.saldo, 2200) && P.minimo.key === "2027-01" && P.bajoColchon === null && /^Sí, te cabe: te quedarían 200 €/.test(P.texto), JSON.stringify(P));
  caso("Permitir: 650 € se pasa 150 € del límite pero las cuentas lo aguantan", P2.nivel === "ojo" && cerca(P2.limite, -150) && /^Tus cuentas lo aguantan, pero te pasarías 150 € del límite de este mes\.$/.test(P2.texto), JSON.stringify(P2));
  caso("Permitir: 900 € se pasa 400 € del límite y deja la cuenta del día a día 100 € bajo el colchón",
    P3.nivel === "ojo" && cerca(P3.bajoColchon, 100) && P3.texto === "Te pasarías 400 € del límite de este mes y dejaría tu cuenta del día a día 100 € por debajo de tu colchón.", JSON.stringify(P3));
  caso("Permitir: 2.600 € dejaría las cuentas en −100 € en enero de 2027: no llega", P4.nivel === "mal" && cerca(P4.minimo.saldo, -100) && P4.texto === "No te llega: tus cuentas se quedarían en −100 € en enero 2027.", JSON.stringify(P4));
  const S = pp(300, { ...D, limite: 0, disponible: 0 }), N = pp(300, { limite: 0, disponible: 0, finMes: null, minimo: null, colchon: null }),
    L = pp(300, { limite: 600, disponible: 500, finMes: null, minimo: null, colchon: null });
  caso("Permitir: sin límite puesto no da cifra de límite (ni «te pasas»), y sin límite ni saldos dice lo que falta",
    S.limite === null && S.nivel === "bien" && /^Tus cuentas lo aguantan: acabarías el mes con 2\.700 €/.test(S.texto) && N.nivel === "falta" && N.limite === null && N.finMes === null && N.minimo === null
    && L.nivel === "bien" && L.finMes === null && /^Te cabe en tu límite de este mes: te quedarían 200 €/.test(L.texto), JSON.stringify([S, N, L]));
  // Con el ejemplo: lo mismo que ya dicen la portada y «Tus próximos meses», con 300 € menos.
  const DE = F.datosPermitir(), PE = pp(300, DE), FE = F.prevision();
  caso("Permitir (ejemplo): 300 € → el límite, el fin de mes y el mes más bajo de prevision(), cada uno con 300 € menos",
    cerca(PE.limite, F.presupuestoSemana().disponible - 300) && cerca(PE.finMes, FE.filas[0].saldo - 300) && cerca(PE.minimo.saldo, FE.minimo.saldo - 300) && PE.minimo.key === FE.minimo.key,
    JSON.stringify([PE, FE.filas[0].saldo, FE.minimo]));
  caso("Permitir (ejemplo): con 72 € ya pasados del límite, 300 € más son 372 € de más", cerca(PE.limite, -372, 0.5) && PE.texto.startsWith("Te pasarías 372 € del límite de este mes"), JSON.stringify(PE));
}

return casos;

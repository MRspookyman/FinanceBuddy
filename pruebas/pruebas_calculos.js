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

return casos;

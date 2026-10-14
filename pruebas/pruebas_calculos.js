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
// Un traspaso «por revisar» (no se sabe aún a qué cuenta va) ya ha salido de la suya: resta ahí, sin tocar la otra. Clasificado,
// pasa a restar en la suya y sumar en la otra, una sola vez. Con las dos patas por revisar, cada una mueve solo su cuenta.
{
  const u = P[P.length - 1], ms = F.movimientos(), pend = FB.DB.pendientes, n0 = pend.length;
  const [nom, aho, bro] = ["Cuenta nómina", "Ahorro", "Bróker"], hasta = F.DateTime.fromISO("2026-09-30").endOf("day");
  const saldos = (exacto) => { const s = F.proyectar(u, hasta, exacto).cuentas.saldos; return [s[nom], s[aho], s[bro]]; };
  const fila = (cuenta, importe, tipo = "banco") => ({ tipo_import: tipo, cuenta, fila: { op: "2026-09-15", texto: "Traspaso inventado", importe, clase: "transferencia", concepto: "Traspaso" } });
  const base = saldos(false);
  pend.push(fila(bro, 80, "inversion"));
  const conBroker = saldos(false);
  pend.push(fila(nom, -300));
  const [rev, revExa] = [saldos(false), saldos(true)];
  pend.push(fila(aho, 300));
  const dosPatas = saldos(false);
  pend.length = n0;
  ms.push({ p: {}, fecha: F.DateTime.fromISO("2026-09-15"), importe: 300, clase: "transferencia", categoria: "", concepto: "A Ahorro", recurrente: "", destino: aho, origen: "", cuenta: nom, auto: false, previsto: false, gasto: 0 });
  const clasif = saldos(false);
  ms.pop();
  const igual = (a, b) => a.every((x, i) => cerca(x, b[i]));
  caso("Sin traspasos por revisar los saldos no cambian (y uno del bróker no cuenta)", cerca(base[0], 1697.06) && igual(conBroker, base), [base, conBroker]);
  caso("Un traspaso por revisar de 300 € resta en su cuenta y no toca la otra (también en el cuadre)", igual(rev, [base[0] - 300, base[1], base[2]]) && igual(revExa, rev), [base, rev, revExa]);
  caso("Con las dos patas por revisar, cada una mueve solo su cuenta (no se cuenta dos veces)", igual(dosPatas, [base[0] - 300, base[1] + 300, base[2]]), dosPatas);
  caso("Clasificado hacia Ahorro: −300 en la nómina y +300 en Ahorro, una sola vez", igual(clasif, [base[0] - 300, base[1] + 300, base[2]]), clasif);
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
    && cerca(RA.filas.find((f) => f.key === "2026-08").gastos - año(reales).filas.find((f) => f.key === "2026-08").gastos, 0), [autosA.slice(0, 3), RA.gastos]);
  // El reparto por mes sigue al mes que paga: el alquiler con valor 31/08 cuenta en septiembre (agosto ya no enseña dos y septiembre ninguno).
  const filaDe = (R, k) => R.filas.find((f) => f.key === k).gastos, base = año(reales);
  caso("Alquiler con valor 31/08 y operación 01/09: cada mes lleva un alquiler (agosto y septiembre como sin desfase), el movimiento conserva su fecha",
    ["2026-07", "2026-08", "2026-09"].every((k) => cerca(filaDe(RA, k), filaDe(base, k))) && A.some((m) => m.recurrente === "Alquiler" && m.mesPago === "2026-09" && m.fecha.toISODate() === "2026-08-31"),
    [filaDe(RA, "2026-08"), filaDe(base, "2026-08"), filaDe(RA, "2026-09"), filaDe(base, "2026-09")]);
  // Fecha y banco en el mismo mes: no se mueve nada.
  const mismo = mover("Alquiler", "2026-09", "2026-09-03", "2026-09-03"); año(mismo);
  caso("Alquiler con fecha y banco en el mismo mes (03/09): no cambia de mes", mismo.every((m) => !m.mesPago) && cerca(filaDe(año(mismo), "2026-09"), filaDe(base, "2026-09")), null);
  // «Tu mes» desde el 25: fecha 24/05 y banco 25/05 caen en el mismo mes natural, no se mueve nada; 31/08→01/09 sí pasa a septiembre.
  {
    const g = (f) => ({ clase: "gasto", auto: false, fecha: d(f) });
    caso("Con tu mes desde el 25: 24/05 apuntado el 25/05 no cambia de mes; con el día 1, 31/08 apuntado el 01/09 pasa a septiembre",
      F.mesPagoDe(g("2026-05-24"), d("2026-05-25"), 25) === undefined && F.mesPagoDe(g("2026-08-31"), d("2026-09-01"), 1) === "2026-09"
      && F.mesPagoDe(g("2026-08-31"), d("2026-09-01"), 25) === undefined && F.mesPagoDe(g("2026-12-31"), d("2027-01-01"), 1) === undefined
      && F.mesPagoDe(g("2026-06-30"), d("2026-07-01"), 1) === "2026-07", null);
  }
  // Apuntado a mano el 31/08 (sin extracto): agosto tiene dos y septiembre ninguno → el del 31/08 paga septiembre.
  const B = mover("Alquiler", "2026-09", "2026-08-31", ""), autosB = autosDe(B, "Alquiler");
  caso("Dos alquileres en agosto (01/08 y 31/08) y ninguno en septiembre: el segundo paga septiembre y cuenta en septiembre", !autosB.includes("2026-09") && autosB[0] === "2026-10" && cerca(año(B).gastos, 7252.94)
    && cerca(filaDe(año(B), "2026-08"), filaDe(base, "2026-08")) && cerca(filaDe(año(B), "2026-09"), filaDe(base, "2026-09")), autosB.slice(0, 3));
  // Pago solo (sin otro en agosto) con valor 31/08 y banco 01/09: septiembre lo lleva.
  const Cs = mover("Alquiler", "2026-09", "2026-08-31", "2026-09-01").filter((m) => !(m.recurrente === "Alquiler" && m.fecha.toFormat("yyyy-MM") === "2026-08" && m.fecha.day === 1));
  año(Cs);
  caso("Un solo pago con valor 31/08 y banco 01/09: cuenta en septiembre", Cs.find((m) => m.recurrente === "Alquiler" && m.fecha.toISODate() === "2026-08-31").mesPago === "2026-09", null);
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
  // Fijo de pocos meses (seguro de marzo, día 1) pagado de una vez el 28/02, sin extracto: paga marzo, no queda su automático y el año no cambia.
  const seg = F.recurrentes().find((r) => r.nombre === "Seguro del coche"), diaS = seg.dia, desdeS = seg.desde;
  seg.dia = 1; seg.desde = d("2026-01-01");
  const pagoSeg = (fecha) => ({ ...reales.find((m) => m.recurrente === "Luz"), recurrente: "Seguro del coche", concepto: "Seguro del coche", categoria: "Seguros", importe: 310, gasto: 310, fecha: d(fecha), p: { ext_fecha: "" } });
  const segEn = (...fechas) => [...reales, ...fechas.map(pagoSeg)];
  const S1 = segEn("2026-02-28"), autosS = autosDe(S1, "Seguro del coche"), RS = año(S1), base0 = año(reales).gastos;
  const S2 = segEn("2026-01-05"), autosS2 = autosDe(S2, "Seguro del coche");
  const S3 = segEn("2026-02-28", "2026-03-02"), autosS3 = autosDe(S3, "Seguro del coche");
  const autosS4 = autosDe(segEn("2026-02-09"), "Seguro del coche"), autosS5 = autosDe(segEn("2026-02-10"), "Seguro del coche");
  seg.dia = diaS; seg.desde = desdeS;
  caso("Seguro de marzo pagado el 28/02: marzo no lleva automático, el pago cuenta en marzo y el año suma un solo seguro (310 €)",
    !autosS.includes("2026-03") && autosS.includes("2027-03") && S1.find((m) => m.recurrente === "Seguro del coche").mesPago === "2026-03" && cerca(RS.gastos, base0 + 310), [autosS, RS.gastos, base0]);
  caso("Seguro de marzo (día 1): pagado el 10/02 (19 días antes) se enlaza; el 09/02 (20 justos) no", !autosS5.includes("2026-03") && autosS4.includes("2026-03"), [autosS4, autosS5]);
  caso("Seguro de marzo pagado el 05/01 (lejos): marzo sigue llevando su automático", autosS2.includes("2026-03"), autosS2);
  caso("Seguro de marzo con un pago el 28/02 y otro el 02/03: el de marzo paga marzo (no se toca)", !autosS3.includes("2026-03") && S3.filter((m) => m.recurrente === "Seguro del coche").every((m) => !m.mesPago), autosS3);
}
// Fijo con el día mal puesto: avisa cuando casi todos sus pagos caen en otro día. Fijos y pagos de mentira.
{
  const d = (s) => F.DateTime.fromISO(s), hoyT = d("2026-09-30");
  const rF = (id, nombre, dia, clase = "gasto") => ({ p: { id }, nombre, clase, dia, desde: d("2025-01-01"), hasta: null });
  const pagosEn = (nombre, dias, meses = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]) => meses.map((k, i) => ({ fecha: d(`${k}-${String(dias[i % dias.length]).padStart(2, "0")}`), recurrente: nombre }));
  const av = (rs, ps) => F.fijosDiaDistinto(rs, ps, hoyT);
  const mal = av([rF(1, "Alquiler", 20)], pagosEn("Alquiler", [2, 3, 2, 3, 3])), cerrado = av([rF(2, "Gimnasio", 3)], pagosEn("Gimnasio", [1, 2, 5, 3, 4]));
  caso("Fijo con el día mal puesto: el alquiler del 20 que se paga el 2-3 avisa (con el día de siempre), el del 3 que se paga entre el 1 y el 5 no",
    mal.length === 1 && mal[0].id === 1 && mal[0].dia === 20 && [2, 3].includes(mal[0].tipico) && cerrado.length === 0, JSON.stringify([mal, cerrado]));
  const cambioMes = av([rF(3, "Recibo", 1)], pagosEn("Recibo", [28]));
  caso("Fijo del día 1 que se paga el 28 del mes anterior avisa (cae al otro lado del cambio de mes); el del día 3 pagado el 31, no",
    cambioMes.length === 1 && cambioMes[0].tipico === 28 && av([rF(4, "Recibo", 3)], pagosEn("Recibo", [31])).length === 0, JSON.stringify(cambioMes));
  caso("Fijo del 31 pagado el 31 y el 01 alternando: no avisa; pagos que cambian cada mes (3, 12, 25, 18, 8): no avisa; solo 2 pagos: no avisa; pagos de hace más de un año: no avisa",
    av([rF(5, "Gim", 31)], pagosEn("Gim", [31, 1])).length === 0 && av([rF(6, "Luz", 20)], pagosEn("Luz", [3, 12, 25, 18, 8])).length === 0
    && av([rF(7, "Poco", 20)], pagosEn("Poco", [2], ["2026-07", "2026-08"])).length === 0 && av([rF(8, "Viejo", 20)], pagosEn("Viejo", [2], ["2025-01", "2025-02", "2025-03", "2025-04"])).length === 0, null);
  caso("Aviso de día del fijo: ingreso y aportación también, y un fijo terminado no", av([rF(9, "Nómina", 20, "ingreso"), rF(10, "Plan", 20, "aportacion"), { ...rF(11, "Antiguo", 20), hasta: d("2026-01-01") }],
    [...pagosEn("Nómina", [2]), ...pagosEn("Plan", [2]), ...pagosEn("Antiguo", [2])]).map((x) => x.id).join() === "9,10", null);
  const alq = F.recurrentes().find((r) => r.nombre === "Alquiler"), diaA = alq.dia;
  const claves = () => F.avisos().filter((a) => /^inicio:fijo-dia:/.test(a.clave));
  const sinMal = claves().length;
  alq.dia = 20; const conMal = claves(); alq.dia = diaA;
  caso("Con los datos de ejemplo ningún fijo tiene el día mal; si se pone el alquiler en el 20, sale un aviso warn con clave y enlace a editarlo",
    sinMal === 0 && conMal.length === 1 && conMal[0].nivel === "warn" && /^Alquiler suele pagarse sobre el día \d+, pero lo tienes en el 20/.test(conMal[0].texto) && /^#editar\/recurrente\/\d+$/.test(conMal[0].ruta) && conMal[0].clave.startsWith("inicio:fijo-dia:"), JSON.stringify(conMal));
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

// Comisiones de fondos (TER × valor) e ingresos pasivos: funciones puras, con datos inventados.
{
  const C = F.comisionesFondos([{ nombre: "A", valor: 10000, ter: 0.2 }, { nombre: "B", valor: 5000, ter: 1 }, { nombre: "C", valor: 3000, ter: null }, { nombre: "D", valor: 0, ter: 0.5 }]);
  caso("Comisiones: 10.000 € al 0,20 % + 5.000 € al 1 % = 70 €/año; sin TER no cuenta (ni se inventa un 0)", C.filas.length === 2 && cerca(C.total, 70) && C.sinTer === 1 && cerca(C.filas[0].coste, 20), C);
  const C0 = F.comisionesFondos([{ nombre: "C", valor: 3000, ter: null }]);
  caso("Comisiones: sin ningún TER no hay filas ni total", C0.filas.length === 0 && C0.total === 0, C0);
  const d = (s) => F.DateTime.fromISO(s), hoyT = d("2026-09-30");
  const G = F.ingresosPasivos([
    { fecha: d("2026-03-10"), activo: "A", tipo: "dividendo", importe: 30 }, { fecha: d("2025-12-10"), activo: "A", tipo: "dividendo", importe: 20 },
    { fecha: d("2025-06-10"), activo: "A", tipo: "dividendo", importe: 99 }, { fecha: d("2026-05-01"), activo: "A", tipo: "comision", importe: 5 },
    { fecha: d("2026-07-01"), activo: "B", tipo: "dividendo", importe: 10 }],
    [{ fecha: d("2026-02-01"), importe: 4 }, { fecha: d("2025-02-01"), importe: 6 }], [{ nombre: "A", valor: 1000 }, { nombre: "B", valor: 0 }], hoyT);
  caso("Ingresos pasivos por año: 2026 = 40 € + 4 € y 2025 = 119 € + 6 €; las comisiones no cuentan",
    G.años.length === 2 && G.años[0].año === 2026 && cerca(G.años[0].dividendos, 40) && cerca(G.años[0].intereses, 4) && cerca(G.años[1].total, 125), G.años);
  caso("Rendimiento: A cobró 50 € en 12 meses sobre 1.000 € = 5 % (lo de junio de 2025 ya no entra); B sin valor sale sin porcentaje",
    G.activos.length === 2 && G.activos[0].nombre === "A" && cerca(G.activos[0].rend, 0.05, 1e-9) && Number.isNaN(G.activos[1].rend), G.activos);
  const G0 = F.ingresosPasivos([], [], [{ nombre: "A", valor: 1000 }], hoyT);
  caso("Ingresos pasivos: sin cobros ni intereses no hay nada que enseñar", !G0.hay && G0.años.length === 0 && G0.activos.length === 0, G0);
}

// Un dividendo cobrado es dinero en tus cuentas: sube el total de Inicio y no entra en «lo que has metido» (ganValor = solo el cambio de valor).
{
  const CO = F.cobros(), f0 = RI.filas.find((f) => f.conValorReal && f.conocido && f.aportado > 0);
  const ult = F.patrimonio()[F.patrimonio().length - 1];
  const R0 = F.resumenInversion(), n0 = F.estimacion().neto;
  CO.push({ p: { id: -81 }, fecha: ult.fecha.plus({ days: 1 }), activo: f0.nombre, tipo: "dividendo", importe: 50, retencion: 0, cuenta: "" });
  const R1 = F.resumenInversion(), n1 = F.estimacion().neto;
  CO.push({ p: { id: -82 }, fecha: ult.fecha.plus({ days: 1 }), activo: f0.nombre, tipo: "comision", importe: 5, retencion: 0, cuenta: "" });
  const R2 = F.resumenInversion(), n2 = F.estimacion().neto;
  CO.splice(-2);
  caso("Dividendo de 50 €: la ganancia total sube 50 €, el cambio de valor y lo aportado no se mueven y el patrimonio sube 50 €",
    cerca(R1.gan - R0.gan, 50) && cerca(R1.ganValor, R0.ganValor) && cerca(R1.aportado, R0.aportado) && cerca(n1 - n0, 50), [R1.gan - R0.gan, R1.ganValor - R0.ganValor, n1 - n0]);
  caso("Con y sin dividendo, «Invertido» de Inicio (valor − cambio de valor) es lo aportado; la comisión de 5 € baja el patrimonio y no toca el cambio de valor",
    cerca(R0.total - R0.ganValor, R0.aportado) && cerca(R1.total - R1.ganValor, R1.aportado) && cerca(R2.ganValor, R0.ganValor) && cerca(n2 - n1, -5), [R0.total - R0.ganValor, R0.aportado, n2 - n1]);
}

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
// TIR anual (xirr) con flujos inventados: negativo = lo que metes, positivo = lo que vale o te da.
const flx = (...xs) => xs.map(([f, i]) => ({ fecha: dt(f), importe: i }));
const X = (...xs) => F.xirr(flx(...xs));
caso("TIR: 1.000 € que en un año valen 1.100 € = +10 %", cerca(X(["2025-01-01", -1000], ["2026-01-01", 1100]), 0.10, 1e-6));
caso("TIR: dos aportaciones (1.000 € y 500 € a mitad) que valen 1.700 € al año = entre 10 % y 20 %",
  (() => { const r = X(["2025-01-01", -1000], ["2025-07-02", -500], ["2026-01-01", 1700]); return r > 0.10 && r < 0.20; })());
caso("TIR: 100 € que en un año valen 2.100 € = +2.000 % (antes salía NaN)", cerca(X(["2025-01-01", -100], ["2026-01-01", 2100]), 20, 1e-4));
caso("TIR: pérdida casi total, 1.000 € que en un año valen 10 € = −99 %", cerca(X(["2025-01-01", -1000], ["2026-01-01", 10]), -0.99, 1e-4));
caso("TIR: 1.000 € que en un año valen 5 € = −99,5 %", cerca(X(["2025-01-01", -1000], ["2026-01-01", 5]), -0.995, 1e-4));
caso("TIR: un solo flujo, todo positivo o todo negativo: no hay cifra",
  isNaN(X(["2025-01-01", -1000])) && isNaN(X(["2025-01-01", 1000], ["2026-01-01", 1100])) && isNaN(X(["2025-01-01", -1000], ["2026-01-01", -100])));
caso("TIR: todo el mismo día no se anualiza", isNaN(X(["2026-01-01", -100], ["2026-01-01", 150])) && isNaN(X(["2026-01-01", -100], ["2026-01-01", 100])));
caso("TIR: el doble en 10 días (miles de millones % al año) no es una cifra razonable", isNaN(X(["2026-01-01", -100], ["2026-01-11", 200])));
// Colchón: sin fijarlo a mano es el calculado.
const PLANC = F.planReparto();
caso("Colchón automático si no se fija a mano", !PLANC || (!PLANC.manual && PLANC.colchon === PLANC.colchonAuto), JSON.stringify(PLANC && [PLANC.colchon, PLANC.colchonAuto]));
// Sin límite puesto, el colchón cuenta el gasto variable real (varEst); con límite, el límite, como siempre.
{
  const PV = F.prevision(), fijosM = suma(F.recurrentes().filter((r) => r.clase === "gasto" && !(r.meses && r.meses.length < 12)).map((r) => r.importe));
  const base = (v) => Math.round((fijosM + PV.sueltoEst + v) / 50) * 50;
  const sinL = F.planReparto(0), conL = F.planReparto(777);
  caso("Colchón sin límite: cuenta el gasto variable real, no 0 €", PV.varEst > 0 && sinL && sinL.base === base(PV.varEst) && sinL.base > base(0), JSON.stringify([PV.varEst, sinL && sinL.base, base(0)]));
  caso("Colchón con límite: cuenta el límite, igual que antes", conL && conL.base === base(777), JSON.stringify([conL && conL.base, base(777)]));
}
// Un fijo dado de alta (el Gimnasio, 29,90 €) cuya categoría es variable: se cuenta una sola vez, como fijo. Antes sus pagos
// entraban también en el gasto variable (varEst, «sin contar fijos», colchón) y la previsión sumaba además el fijo.
{
  const cat = F.categorias().find((c) => c.nombre === "Suscripciones"), grupo0 = cat.grupo;
  const meses = F.mesesHasta(F.mesAnterior(F.hoyKey), 3).map(F.finMes), mH = F.finMes(F.hoyKey);
  const pagosGim = (M) => suma(M.real.filter((m) => m.recurrente === "Gimnasio" && m.gasto).map((m) => m.gasto));
  const sueltoDeCat = (M) => suma(M.real.filter((m) => m.categoria === "Suscripciones" && m.gasto && !m.recurrente).map((m) => m.gasto));
  const antes = [...meses, mH].map((M) => F.gastoVariable(M)), pv0 = F.prevision(), limite0 = F.limiteVar;
  cat.grupo = "variable";
  try {
    const despues = [...meses, mH].map((M) => F.gastoVariable(M)), pv1 = F.prevision(), pg = pagosGim(meses[0]);
    caso("Fijo en categoría variable: sus pagos no cuentan como gasto variable (solo lo que no es el fijo)",
      pg > 0 && [...meses, mH].every((M, i) => cerca(despues[i], antes[i] + sueltoDeCat(M))), JSON.stringify([pg, antes, despues]));
    caso("…y la media variable de la previsión es la de antes más solo lo suelto de esa categoría (no el Gimnasio)",
      cerca(pv1.varEst, pv0.varEst + F.mesesHasta(F.mesAnterior(F.hoyKey), 3).map(F.finMes).reduce((s, M) => s + sueltoDeCat(M), 0) / pv0.nMesesReal), JSON.stringify([pv0.varEst, pv1.varEst]));
    const fijosM = suma(F.recurrentes().filter((r) => r.clase === "gasto" && !(r.meses && r.meses.length < 12)).map((r) => r.importe));
    const base = (v) => Math.round((fijosM + pv1.sueltoEst + v) / 50) * 50, sinL = F.planReparto(0), conL = F.planReparto(777);
    caso("Colchón con el fijo en categoría variable: sin límite cuenta varEst sin el fijo, con límite el límite (y el fijo una vez)",
      sinL.base === base(pv1.varEst) && conL.base === base(777), JSON.stringify([sinL.base, base(pv1.varEst), conL.base, base(777)]));
    caso("Un fijo en categoría variable no cambia el límite «sin contar fijos»: el presupuesto de la semana no incluye sus pagos",
      cerca(F.presupuestoSemana().vari, despues[3]) && despues[3] <= antes[3] + sueltoDeCat(mH) + 0.01);
  } finally { cat.grupo = grupo0; }
  caso("Sin fijos en categorías variables, el gasto variable es el de siempre (el del ejemplo no cambia)",
    F.limiteVar === limite0 && antes.every((v, i) => cerca(v, suma([...meses, mH][i].real.filter((m) => m.gasto && F.grupoDe(m.categoria) !== "fijo" && !m.recurrente).map((m) => m.gasto)))));
}

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
// Mi año: media al mes (solo meses acabados con datos), categorías que bajan y ritmo del año
const MM25 = F.mediaMensualAño(R25, "2026-10"), MM25c = F.mediaMensualAño(R25, "2025-02");
caso("Mi año: media al mes sobre los 2 meses con datos (1.000 entran, 600 salen); con febrero en curso, solo enero; sin meses acabados, nada",
  MM25.meses === 2 && cerca(MM25.ingresos, 1000) && cerca(MM25.gastos, 600) && !MM25.enCurso && MM25c.meses === 1 && cerca(MM25c.gastos, 400) && MM25c.enCurso && F.mediaMensualAño(R25, "2025-01") === null,
  [MM25, MM25c]);
const filaI = (key, i, g) => ({ key, ingresos: i, gastos: g, ahorro: i - g, datos: true });
const MMi = F.mediaMensualAño({ filas: [filaI("2026-01", 2000, 1500), filaI("2026-02", 0.3, 0), filaI("2026-03", 0.3, 0), filaI("2026-04", 2000, 1700)] }, "2026-06");
caso("Mi año: un mes con solo 0,30 € de intereses no cuenta para la media; los de gasto real sí",
  MMi.meses === 2 && cerca(MMi.ingresos, 2000) && cerca(MMi.gastos, 1600), JSON.stringify(MMi));
const BAJ = F.categoriasQueBajan(new Map([["Ocio", 100], ["Viajes", 900], ["Ropa", 20]]), new Map([["Ocio", 400], ["Viajes", 1000], ["Ropa", 30], ["Coche", 250]]), true);
caso("Lo que más bajó: ≥ 50 € menos que el año anterior, de más a menos (también lo que ya no gastas); nada sin año anterior",
  JSON.stringify(BAJ.map((x) => [x.nombre, x.dif])) === '[["Ocio",-300],["Coche",-250],["Viajes",-100]]' && F.categoriasQueBajan(new Map(), new Map([["Ocio", 400]]), false).length === 0,
  JSON.stringify(BAJ));
const filaR = (key, i, g, datos = true) => ({ key, ingresos: datos ? i : 0, gastos: datos ? g : 0, ahorro: datos ? i - g : 0, datos });
const filasR = [filaR("2026-01", 2000, 1500), filaR("2026-02", 2000, 1700), filaR("2026-03", 2000, 1600), filaR("2026-04", 0, 0, false), filaR("2026-05", 2000, 1900)];
const RIT = F.ritmoAño({ año: 2026, ahorro: 1300, filas: filasR }, "2026-05");
caso("Ritmo del año: ahorrado hasta hoy (1.300 €) + media de 3 meses acabados (400 €) × 7 meses que quedan = 4.100 €; con 2 meses o en un año cerrado, nada",
  RIT && RIT.meses === 3 && cerca(RIT.mensual, 400) && RIT.quedan === 7 && cerca(RIT.año, 4100) && F.ritmoAño({ año: 2026, ahorro: 800, filas: filasR.slice(0, 2) }, "2026-03") === null
  && F.ritmoAño({ año: 2025, ahorro: 1300, filas: filasR }, "2026-05") === null, JSON.stringify(RIT));
const RD8 = F.repartoDonut([["A", 500], ["B", 100], ["C", 300], ["D", 50], ["E", 40], ["F", 30], ["G", 20], ["H", -10], ["I", 0.2]]);
const RD6 = F.repartoDonut([["A", 600], ["B", 200], ["C", 100], ["D", 50], ["E", 30], ["F", 20]]);
caso("Donut de Mi año: las 5 mayores y «Otras 2» con el resto (sin negativos ni céntimos); con 6 categorías, todas y sin «Otras»",
  JSON.stringify(RD8.partes.map((p) => p.nombre)) === '["A","C","B","D","E","Otras 2"]' && RD8.partes[5].otras && RD8.partes[5].valor === 50 && RD8.total === 1040
  && cerca(suma(RD8.partes.map((p) => p.frac)), 1, 1e-9) && RD6.partes.length === 6 && !RD6.partes.some((p) => p.otras) && F.repartoDonut([]).partes.length === 0,
  JSON.stringify([RD8, RD6.partes.length]));
caso("Mi año: si el año anterior no tiene ingresos, «sin datos de 2025» y no «0 € (+2.159.034,6 %)»",
  F.frenteAño(10795, 0.3, 2025, true) === "sin datos de 2025" && F.frenteAño(10795, 0, 2025, true) === "sin datos de 2025" && F.frenteAño(1100, 1000, 2025, true) === "2025: 1.000 € (+10,0 %)"
  && F.frenteAño(1100, 0, 2025, false) === "", [F.frenteAño(10795, 0.3, 2025, true), F.frenteAño(1100, 1000, 2025, true)]);
caso("Mi año: un año con solo 0,30 € de intereses dice «sin ingresos ni gastos este año», no «100,0 % de lo que entró»",
  F.tasaAñoTexto({ ingresos: 0.3, gastos: 0, ahorro: 0.3, tasa: 1 }) === "sin ingresos ni gastos este año"
  && F.tasaAñoTexto({ ingresos: 0, gastos: 120, ahorro: -120, tasa: NaN }) === "sin ingresos este año"
  && F.tasaAñoTexto({ ingresos: 2000, gastos: 1500, ahorro: 500, tasa: 0.25 }) === "25,0 % de lo que entró"
  && F.tasaAñoTexto({ ingresos: 2000, gastos: 2500, ahorro: -500, tasa: -0.25 }) === "",
  [F.tasaAñoTexto({ ingresos: 0.3, gastos: 0, ahorro: 0.3, tasa: 1 }), F.tasaAñoTexto({ ingresos: 2000, gastos: 1500, ahorro: 500, tasa: 0.25 })]);
const EVA = { keys:["2025-11", "2025-12", "2026-01", "2026-02", "2026-03"], aportado: [1000, 1000, 1100, 1200, 1200], valor: [1000, 1050, null, 1300, 1320] };
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
// La referencia es lo último importado del bróker: con su extracto de octubre sin la aportación del 5, avisa ya; sin importarlo, no.
const PLA = [rA(1, "Plan A", 5, "2026-01-05")], REALES_A = meses8("Plan A", "05").concat([apA("2026-09-05", "Plan A")]);
const refBr = (fs) => F.ultimoDatoBroker(fs.map(d0), d0("2026-10-20"));
const sinImportar = F.aportacionesSinLlegar(PLA, REALES_A, refBr(REALES_A.map((a) => a.fecha.toISODate())));
const conExtracto = F.aportacionesSinLlegar(PLA, REALES_A, refBr([...REALES_A.map((a) => a.fecha.toISODate()), "2026-10-12"]));
const llegada = F.aportacionesSinLlegar(PLA, [...REALES_A, apA("2026-10-05", "Plan A")], refBr([...REALES_A.map((a) => a.fecha.toISODate()), "2026-10-12"]));
caso("Aportación que no llega: con el extracto del bróker importado hasta el 12/10 y sin la del 5/10, avisa; sin importarlo (lo último, 5/09), no; si llegó, no; sin nada del bróker, no",
  conExtracto.length === 1 && conExtracto[0].mes === "2026-10" && sinImportar.length === 0 && llegada.length === 0 && refBr([]) === null && F.aportacionesSinLlegar(PLA, REALES_A, refBr([])).length === 0
  && refBr(["2026-09-05", "2026-11-01"]).toISODate() === "2026-09-05", JSON.stringify([conExtracto.map((x) => x.mes), sinImportar.length, llegada.length]));
caso("Aportaciones del ejemplo: todas han llegado, ningún aviso", !F.avisos().some((a) => /^inicio:aporta:/.test(a.clave)) && F.aportacionesSinLlegar(F.recurrentes(), F.aportaciones(), F.hoy).length === 0,
  JSON.stringify(F.avisos().map((a) => a.clave)));
const A8 = (extra) => F.aportacionesSinLlegar([rA(1, "Plan A", 5, "2026-01-05")], [...meses8("Plan A", "05"), apA(extra, "Plan A")], d0("2026-09-30"));
caso("Aportación llegada el 29/08 para la del 05/09: sigue avisando (el enlace es por mes natural y septiembre mantiene su automática)", A8("2026-08-29").length === 1 && A8("2026-08-20").length === 1, null);

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

// «¿Qué pasa si vendo hoy?»: venta inventada sobre una copia, sin tocar las operaciones.
{
  const hoyS = d("2026-09-30"), clS = (n) => (n === "F" ? "fondo" : "accion");
  const base = [op(1, "2026-01-10", "A", 1000, 10), op(2, "2026-08-20", "A", 600, 5), op(3, "2026-01-10", "F", 1000, 10), op(4, "2026-03-10", "F", 500, 5)];
  const copiaAntes = JSON.stringify(base);
  const S1 = F.simularVenta(base, "A", 4, 90, hoyS, clS);
  caso("Simular venta parcial: 4 de 15 a 90 € salen del lote más antiguo (coste 400 €) y dan −40 €; la pérdida cae en la regla por la compra reciente que te queda",
    cerca(S1.valor, 360) && cerca(S1.coste, 400) && cerca(S1.resultado, -40) && S1.dudosa && S1.dudosa.compra.toISODate() === "2026-08-20" && cerca(S1.dudosa.perdida, 40), S1);
  const S2 = F.simularVenta(base, "A", null, 120, hoyS, clS);
  caso("Simular venta total («todas»): 15 a 120 € = 1.800 € menos 1.600 € de coste, +200 €, sin aviso", S2.unidades === 15 && cerca(S2.resultado, 200) && S2.dudosa === null && !S2.excede, S2);
  const S3 = F.simularVenta(base, "A", 15, 80, hoyS, clS);
  caso("Simular venta total con pérdida: vendiéndolo todo, la compra reciente ya no queda y no salta la regla", cerca(S3.resultado, -400) && S3.dudosa === null, S3);
  const S4 = F.simularVenta(base, "F", 2, 80, hoyS, clS);
  caso("Simular un fondo: la regla es de un año (la compra de marzo la activa si pierdes); con ganancia no hay aviso",
    cerca(S4.resultado, -40) && S4.dudosa && S4.dudosa.meses === 12 && F.simularVenta(base, "F", 2, 120, hoyS, clS).dudosa === null, S4);
  const S5 = F.simularVenta([op(1, "2025-01-10", "A", 1000, 10)], "A", 5, 80, hoyS, clS);
  caso("Simular venta de una acción sin compras en los dos meses: pierde pero no hay aviso", cerca(S5.resultado, -100) && S5.dudosa === null, S5);
  const S6 = F.simularVenta(base, "A", 99, 100, hoyS, clS);
  caso("Simular más participaciones de las que hay: se limita a las 15 y se avisa", S6.excede && S6.unidades === 15 && S6.disponibles === 15, S6);
  caso("Simular: sin participaciones anotadas no se calcula; no toca los datos de entrada",
    F.simularVenta([op(1, "2026-01-10", "Z", 100, null)], "Z", 1, 10, hoyS, clS).sinDatos === true && JSON.stringify(base) === copiaAntes);
}

// Primeros pasos: cada casilla se tacha sola según lo que ya hay
const PP0 = F.primerosPasos({ cuentas: 1, movimientos: 0, pendientes: 0, fijos: 0, limite: 0, saldos: 0 });
const PP1 = F.primerosPasos({ cuentas: 2, movimientos: 80, pendientes: 3, fijos: 4, limite: 600, saldos: 1 });
caso("Primeros pasos: con solo las cuentas, lo demás por hacer (y sin importar, revisar no cuenta como hecho)",
  PP0.filter((x) => x.hecho).map((x) => x.id).join() === "cuentas" && PP0.length === 6, JSON.stringify(PP0.map((x) => [x.id, x.hecho])));
caso("Primeros pasos: con dudas por revisar, solo falta eso y dice cuántas quedan",
  PP1.filter((x) => !x.hecho).map((x) => x.id).join() === "revisar" && /quedan 3/.test(PP1.find((x) => x.id === "revisar").s), JSON.stringify(PP1.map((x) => [x.id, x.hecho])));

// «Lo que cambió desde la última vez»: primera vez (solo anota), sin cambios (nada), con importación nueva y con un aviso nuevo
const mV = (id, fecha, mas = {}) => ({ id, fecha, ...mas });
const ahoraV = { movs: [mV(1, "2026-09-01"), mV(2, "2026-09-02"), mV(5, "2026-10-03"), mV(6, "2026-10-09"), mV(7, "2026-10-09", { parte_de: 6 })], neto: 5300, avisos: [{ clave: "inicio:a", texto: "A" }, { clave: "inicio:b", texto: "B" }, { clave: "", texto: "sin clave" }] };
const CV0 = F.cambiosDesdeVista(null, ahoraV);
caso("Lo que cambió: la primera vez no sale nada y la foto lleva el último movimiento, el saldo y los avisos con clave",
  CV0.primera && !CV0.hay && CV0.snap.max_id === 7 && CV0.snap.neto === 5300 && CV0.snap.avisos.join() === "inicio:a,inicio:b", JSON.stringify(CV0));
const CV1 = F.cambiosDesdeVista({ max_id: 7, neto: 5300.4, avisos: ["inicio:a", "inicio:b"] }, ahoraV);
caso("Lo que cambió: sin movimientos ni avisos nuevos no hay franja (un saldo que se mueve menos de 1 € no cuenta)", !CV1.primera && !CV1.hay && CV1.dif === null, JSON.stringify(CV1));
const CV2 = F.cambiosDesdeVista({ max_id: 2, neto: 5000, avisos: ["inicio:a", "inicio:b"], fecha: "2026-09-20" }, ahoraV);
caso("Lo que cambió: con una importación nueva dice cuántos (sin contar las partes de un dividido), de qué fechas y cuánto cambió el saldo",
  CV2.hay && CV2.nuevos === 2 && CV2.desde === "2026-10-03" && CV2.hasta === "2026-10-09" && CV2.dif === 300 && CV2.avisosNuevos.length === 0 && CV2.fecha === "2026-09-20", JSON.stringify(CV2));
const CV3 = F.cambiosDesdeVista({ max_id: 7, neto: 5300, avisos: ["inicio:a"] }, ahoraV);
caso("Lo que cambió: un aviso con clave que no estaba basta para la franja (el que no tiene clave, no)", CV3.hay && CV3.nuevos === 0 && CV3.avisosNuevos.map((a) => a.clave).join() === "inicio:b", JSON.stringify(CV3));

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

// Hucha de pagos anuales (datos de mentira): seguro anual en marzo, IBI semestral (abril y octubre), comunidad trimestral, un fijo mensual y un ingreso.
{
  const dd = (s) => F.DateTime.fromISO(s);
  const fijo = (nombre, importe, dia, meses, extra) => ({ nombre, importe, clase: "gasto", dia, meses, desde: dd("2025-01-01"), hasta: null, ...extra });
  const rs = [fijo("Seguro", 240, 15, [3]), fijo("IBI", 300, 20, [4, 10]), fijo("Comunidad", 90, 5, [1, 4, 7, 10]), fijo("Alquiler", 700, 1, null),
    { ...fijo("Paga extra", 1000, 15, [6, 12]), clase: "ingreso" }];
  const H = F.huchaAnual(rs, dd("2026-10-14"));
  caso("Hucha: seguro anual 240 € → 20 € al mes; IBI 2 × 300 € → 50 €; comunidad 4 × 90 € → 30 €; total 100 € (ni el alquiler ni el ingreso)",
    H.filas.length === 3 && cerca(H.total, 100) && cerca(H.filas.find((f) => f.nombre === "Seguro").alMes, 20) && cerca(H.filas.find((f) => f.nombre === "IBI").alMes, 50), JSON.stringify(H.filas.map((f) => [f.nombre, f.alMes])));
  caso("Hucha: el próximo pago y los meses que faltan (IBI 20/10 en 6 días, comunidad 05/01/2027, seguro 15/03/2027), por orden",
    H.filas.map((f) => f.proximo.toISODate() + ":" + f.enMeses).join(" ") === "2026-10-20:0 2027-01-05:3 2027-03-15:5", H.filas.map((f) => f.proximo.toISODate() + ":" + f.enMeses).join(" "));
  caso("Hucha: un pago de hoy mismo cuenta como próximo; uno de ayer, no",
    F.huchaAnual([fijo("A", 120, 14, [10])], dd("2026-10-14")).filas[0].enMeses === 0 && F.huchaAnual([fijo("A", 120, 13, [10])], dd("2026-10-14")).filas[0].proximo.toISODate() === "2027-10-13");
  caso("Hucha: un fijo que ya terminó no cuenta", F.huchaAnual([fijo("A", 120, 14, [10], { hasta: dd("2026-06-30") })], dd("2026-10-14")).filas.length === 0);
  const V = F.huchaAnual([fijo("Alquiler", 700, 1, null), fijo("Todo el año", 10, 1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])], dd("2026-10-14"));
  caso("Hucha: sin fijos que no sean mensuales, no hay nada que apartar", V.filas.length === 0 && V.total === 0);
}

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

// «Más filtros» de Movimientos: cuenta, importe (absoluto, desde/hasta) y solo sin revisar; un tope vacío o inválido no filtra.
{
  const ms = [
    { concepto: "a", cuenta: "Cuenta A", importe: 10, clase: "gasto" }, { concepto: "b", cuenta: "Cuenta A", importe: 250.5, clase: "ingreso" },
    { concepto: "c", cuenta: "Cuenta B", importe: 1200, clase: "gasto", pendiente: true }, { concepto: "d", cuenta: "Cuenta B", importe: 99.99, clase: "gasto", pendiente: true }];
  const n = (f) => F.filtrarMas(ms, f).map((m) => m.concepto).join("");
  caso("Más filtros: sin nada puesto no filtra y cuenta 0 filtros", n({}) === "abcd" && n({ desde: "", hasta: "abc", cuenta: "", sinRevisar: false }) === "abcd" && F.filtrosMasActivos({ desde: "", hasta: "x" }) === 0, n({}));
  caso("Más filtros: por cuenta", n({ cuenta: "Cuenta B" }) === "cd" && n({ cuenta: "Otra" }) === "", n({ cuenta: "Cuenta B" }));
  caso("Más filtros: importe desde/hasta (con coma española y miles), un solo tope vale", n({ desde: "100" }) === "bc" && n({ hasta: "99,99" }) === "ad" && n({ desde: "10", hasta: "250,50" }) === "abd" && n({ desde: "1.000" }) === "c", [n({ desde: "100" }), n({ hasta: "99,99" })]);
  caso("Más filtros: solo sin revisar y combinados; cuenta los activos (rango = 1)", n({ sinRevisar: true }) === "cd" && n({ sinRevisar: true, cuenta: "Cuenta B", hasta: "100" }) === "d"
    && F.filtrosMasActivos({ sinRevisar: true, cuenta: "Cuenta B", desde: "1", hasta: "2" }) === 3 && F.filtrosMasActivos({ desde: "1", hasta: "2" }) === 1, n({ sinRevisar: true }));
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

// Datos atrasados: hoy es 30/09 pero los movimientos llegan hasta el 15/09. El mes en curso de la previsión reserva gasto para
// los 15 días sin datos (antes, para los 0 que quedan hasta fin de mes desde hoy) y el ritmo reparte lo gastado en 15 días, no en 30.
{
  const corte = F.DateTime.fromISO("2026-09-15").endOf("day"), M = F.finMes(F.hoyKey), real0 = M.real;
  const tapados = F.movimientos().filter((m) => !m.auto && !m.previsto && m.fecha > corte && m.fecha <= F.hoy.endOf("day"));
  tapados.forEach((m) => (m.previsto = true));
  M.real = real0.filter((m) => m.fecha <= corte);
  const fd = F.fechaDatos(), PV = F.prevision(), f0 = PV.filas[0], vari = F.gastoVariable(M), suelto = F.gastoFijoSuelto(M);
  const dia = fd ? fd.day : 30, esperado = (est, llevas) => Math.min(Math.max(0, est - llevas), (est * (30 - dia)) / 30);
  const extra = Math.max(0, 400 - vari);  // gasto inventado del 10/09 para llevar al menos 400 €: a ese ritmo (×2) se pasa de 600 €
  M.real = [...M.real, { fecha: F.DateTime.fromISO("2026-09-10"), importe: extra, clase: "gasto", categoria: "Ocio", concepto: "Prueba", gasto: extra, auto: false, previsto: false }];
  const variR = F.gastoVariable(M), ritmo = F.avisos().find((a) => a.clave === `inicio:ritmo:${F.hoyKey}`);
  M.real = real0; tapados.forEach((m) => (m.previsto = false));
  const proy = ritmo && Number((ritmo.texto.match(/con ([\d.]+)\s€/) || [, ""])[1].replace(/\./g, ""));
  caso("Datos hasta el 15/09 con hoy 30/09: el mes en curso de la previsión cuenta los días sin datos, no los 0 que quedan desde hoy",
    fd && fd.toISODate() <= "2026-09-15" && fd.toISODate() >= "2026-09-10" && esperado(PV.varEst, vari) > 0 && cerca(f0.variable, esperado(PV.varEst, vari)) && cerca(f0.suelto, esperado(PV.sueltoEst, suelto)),
    [fd && fd.toISODate(), f0.variable, esperado(PV.varEst, vari), f0.suelto, esperado(PV.sueltoEst, suelto)]);
  caso("Datos hasta el 15/09 con hoy 30/09: el aviso de ritmo reparte lo gastado en los días con datos, no en los 30 hasta hoy",
    variR <= 600 && !!ritmo && cerca(proy, (variR / dia) * 30, 0.5), [dia, variR, ritmo && ritmo.texto]);
}

return casos;

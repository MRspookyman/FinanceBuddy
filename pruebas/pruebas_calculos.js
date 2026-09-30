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
caso("Septiembre: ingresos = nómina 1.850 €", cerca(S.ingresos, 1850), S.ingresos);

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

return casos;

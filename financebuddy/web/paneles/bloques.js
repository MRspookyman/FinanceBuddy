// ═════════════ bloques (piezas que se repiten entre paneles) ═════════════
function bloqueLimite(padre, M) {
  if (!(limiteVar > 0)) return;
  const v = gastoVariable(M), ratio = v / limiteVar;
  const estado = ratio > 1 ? "over" : ratio >= 0.85 ? "warn" : "ok";
  const diasRest = mes === hoyKey ? mesDT(mes).daysInMonth - DateTime.now().day + 1 : 0;
  meter(padre, {
    nombre: "Gasto variable del mes", valor: v, total: ratio > 1 ? v : limiteVar, lg: true,
    color: estado === "over" ? BAD : estado === "warn" ? WARN : GOOD, marca: ratio > 1 ? limiteVar / v : null,
    fuerte: eur(v, 0), resto: `/ ${eur(limiteVar, 0)}`, ico: estado,
    sub: ratio > 1 ? `Te has pasado ${eur(v - limiteVar, 0)} del límite` : `Te quedan ${eur(limiteVar - v, 0)}` + (diasRest ? ` · ${eur((limiteVar - v) / diasRest, 0)}/día hasta fin de mes` : ""),
  });
}
// onCat(nombre): al pulsar una categoría (filtra los movimientos). Solo cuenta lo ya pagado.
function bloquePresupuesto(padre, M, { limite, onCat } = {}) {
  const cats = categorias();
  const gastoCat = new Map();
  for (const m of M.real.filter((m) => m.gasto)) gastoCat.set(m.categoria, (gastoCat.get(m.categoria) || 0) + m.gasto);
  const nombres = new Set([...cats.filter((c) => c.grupo !== "ingreso").map((c) => c.nombre), ...gastoCat.keys()]);
  let filas = [...nombres].map((n) => ({ nombre: n, valor: gastoCat.get(n) || 0, pres: (cats.find((c) => c.nombre === n) || {}).presupuesto || 0 }))
    .filter((r) => r.valor > 0 || r.pres > 0)
    .sort((a, b) => b.valor - a.valor || b.pres - a.pres);
  if (limite) filas = filas.filter((r) => r.valor > 0).slice(0, limite);
  if (!filas.length) { vacio(padre, "Sin gastos este mes", "Importa el extracto de tu banco o apunta un gasto con «+ Apuntar»."); return; }
  const escala = Math.max(...filas.map((r) => r.valor));
  for (const r of filas) {
    const click = onCat ? { onclick: () => onCat(r.nombre), title: "Ver los movimientos de esta categoría" } : { ruta: "#gastos" };
    if (r.pres > 0) {
      const ratio = r.valor / r.pres;
      const estado = ratio > 1 ? "over" : ratio >= 0.85 ? "warn" : "ok";
      meter(padre, {
        nombre: r.nombre, ...click, act: filtroCat === r.nombre, valor: r.valor, total: ratio > 1 ? r.valor : r.pres,
        color: estado === "over" ? BAD : estado === "warn" ? WARN : GOOD, marca: ratio > 1 ? r.pres / r.valor : null,
        fuerte: eur(r.valor, 0), resto: `/ ${eur(r.pres, 0)}`, ico: estado,
        sub: ratio > 1 ? `Te has pasado ${eur(r.valor - r.pres, 0)}` : `Quedan ${eur(r.pres - r.valor, 0)} · ${pct(ratio)} usado`,
      });
    } else {
      meter(padre, {
        nombre: r.nombre, ...click, act: filtroCat === r.nombre, valor: r.valor, total: escala, color: "var(--fin-s1)",
        fuerte: eur(r.valor, 0), resto: M.gastos > 0 ? `· ${pct(r.valor / M.gastos)}` : "",
      });
    }
  }
}
function metaObjetivo(o) {
  const ratio = o.meta > 0 ? o.ahorrado / o.meta : 0;
  const falta = Math.max(0, o.meta - o.ahorrado);
  const meses = o.limite ? Math.max(1, Math.ceil(o.limite.diff(DateTime.now().startOf("day"), "months").months)) : null;
  return { ratio, falta, meses, mensual: meses ? falta / meses : null };
}
function bloqueObjetivos(padre, max) {
  const orden = { alta: 0, media: 1, baja: 2 };
  const act = objetivos().filter((o) => o.estado !== "conseguido").sort((a, b) => (orden[a.prioridad] ?? 1) - (orden[b.prioridad] ?? 1)).slice(0, max || 99);
  if (!act.length) { vacio(padre, "Sin objetivos activos", "Ej.: «quiero ahorrar 6.000 € de fondo de emergencia antes de junio de 2027»."); return; }
  for (const o of act) {
    const m = metaObjetivo(o);
    meter(padre, {
      nombre: o.nombre, ruta: o.p.file.path, valor: o.ahorrado, total: o.meta, color: m.ratio >= 1 ? GOOD : "var(--fin-s1)",
      fuerte: pct(m.ratio), resto: `· ${eur(o.ahorrado, 0)} / ${eur(o.meta, 0)}`, ico: m.ratio >= 1 ? "ok" : null,
      sub: m.ratio >= 1 ? "Objetivo alcanzado" : `Faltan ${eur(m.falta, 0)}` + (m.mensual != null ? ` · ${eur(m.mensual, 0)}/mes hasta ${o.limite.setLocale("es").toFormat("LLL yyyy")}` : ""),
    });
  }
}
function bloqueFondo(padre) {
  const F = fondoEmergencia();
  if (!F) { vacio(padre, "Faltan los saldos de tus cuentas", "Hacen falta para saber cuántos meses cubre tu ahorro."); return; }
  if (F.sinRegistro) { vacio(padre, "Sin saldos registrados en ese mes", "El primer registro es posterior al mes que estás viendo."); return; }
  if (!(F.media > 0)) { vacio(padre, `${eur(F.liq, 0)} de liquidez`, "Registra gastos para saber cuántos meses cubre."); return; }
  const estado = F.meses >= 6 ? "ok" : F.meses >= 3 ? "warn" : "over";
  kv(padre, [{ l: "Cubre", v: `${nf(F.meses, 1, 1)} meses` }, { l: `Liquidez (${F.fuente})`, v: eur(F.liq, 0) }, { l: "Gasto medio", v: `${eur(F.media, 0)}/mes` }]);
  meter(padre, {
    nombre: "Meses cubiertos", valor: Math.min(F.meses, 12), total: 12, lg: true,
    color: estado === "ok" ? GOOD : estado === "warn" ? WARN : BAD, marca: 0.5, fuerte: `${nf(F.meses, 1, 1)} meses`, resto: "· recomendado ≥ 6", ico: estado,
    sub: estado === "ok" ? "Colchón sano (≥ 6 meses)" : estado === "warn" ? `Te faltan ${eur((6 - F.meses) * F.media, 0)} para 6 meses` : `Por debajo de 3 meses · faltan ${eur((3 - F.meses) * F.media, 0)} para llegar a 3`,
  });
}
function bloqueInversionMini(padre) {
  const I = resumenInversion();
  if (!I.filas.length) { vacio(padre, "Sin activos", "Registra tus posiciones de inversión."); return; }
  kv(padre, [
    { l: "Valor", v: eur(I.total, 0) },
    { l: "Rentabilidad", v: I.aportado ? pct(I.gan / I.aportado, true) : "—", t: I.aportado ? tone(I.gan) : "" },
    { l: "TIR anual", v: pct(I.tir, true), t: tone(I.tir) },
  ]);
  const fil = [...I.filas].sort((a, b) => b.valor - a.valor);
  stack(padre, fil.map((f) => ({ nombre: f.nombre, valor: f.valor, color: colorActivo(f.nombre) })));
  leyenda(padre, fil.map((f) => [`${f.nombre} ${pct(I.total ? f.valor / I.total : 0)}`, colorActivo(f.nombre)]));
  if (I.sinAport) padre.createDiv({ cls: "fin-note", text: `Falta el aportado inicial de ${I.sinAport} activo(s) para calcular la rentabilidad.` });
}
function bloqueAvisos(padre, A = avisos()) {
  const box = padre.createDiv({ cls: "fin-avisos" });
  if (!A.length) { const r = box.createDiv({ cls: "ok" }); ico(r, "ok"); r.appendText("Todo al día"); return; }
  for (const a of A.sort((x, y) => (x.nivel === "warn" ? 0 : 1) - (y.nivel === "warn" ? 0 : 1))) {
    const r = box.createDiv({ cls: a.nivel });
    ico(r, a.nivel);
    if (a.ruta) enlace(r, a.texto, a.ruta); else r.appendText(a.texto);
  }
}
// A dónde ha ido el ahorro del mes, por cuenta: al bróker, al ahorro, a otras cuentas y lo que queda en la cuenta
// corriente (= variación real de su saldo). Las compras de inversión van en una nota aparte.
function bloqueAhorro(padre, key) {
  const R = repartoAhorro(key);
  if (!R.ahorro && !R.aBroker && !R.emergencia && !R.compras) { vacio(padre, "Sin ahorro registrado este mes"); return; }
  const nAhorro = cuentasTipo("ahorro").join(", ") || "Ahorro";
  kv(padre, [
    { l: "Ahorro", v: eurS(R.ahorro, 0), t: tone(R.ahorro) },
    Math.abs(R.aBroker) >= 1 ? { l: `A ${nombresBroker()}`, v: eurS(R.aBroker, 0) } : null,
    Math.abs(R.emergencia) >= 1 ? { l: `A ${nAhorro}`, v: eurS(R.emergencia, 0), t: tone(R.emergencia) } : null,
    Math.abs(R.otras) >= 1 ? { l: "A otras cuentas", v: eurS(R.otras, 0) } : null,
    { l: "Cuenta corriente", v: eurS(R.liquido, 0), t: tone(R.liquido) },
  ]);
  const partes = [{ nombre: nombresBroker(), valor: R.aBroker, color: "var(--fin-s2)" }, { nombre: nAhorro, valor: R.emergencia, color: "var(--fin-s3)" },
    { nombre: "Otras cuentas", valor: R.otras, color: "var(--fin-s6)" }, { nombre: "Cuenta corriente", valor: R.liquido, color: "var(--fin-s1)" }]
    .filter((p) => p.valor >= 1); // sin restos de céntimos (p. ej. intereses)
  if (partes.length) {
    stack(padre, partes);
    leyenda(padre, partes.map((p) => [p.nombre, p.color]));
  }
  if (R.liquido < 0) padre.createDiv({ cls: "fin-note", text: `La cuenta corriente baja ${eur(-R.liquido, 0)}: has movido más de lo que has ahorrado este mes.` });
  if (R.compras) padre.createDiv({ cls: "fin-note", text: `Compras de inversión este mes: ${eur(R.compras, 0)} (se pagan con el efectivo de ${nombresBroker()}).` });
  // Solo meses con movimientos registrados (si no, las aportaciones de meses sin datos de ingresos inflan el %).
  const conDatos = mesesHasta(key, 12).filter((k) => finMes(k).real.some((m) => !m.auto));
  const s = conDatos.map(repartoAhorro);
  const inv = sum(s.map((x) => x.compras)), ah = sum(s.map((x) => x.ahorro));
  if (ah > 0 && conDatos.length > 1) padre.createDiv({ cls: "fin-note", text: `Últimos ${conDatos.length} meses con datos: inviertes el ${pct(inv / ah)} de lo que ahorras (${eur(inv, 0)} de ${eur(ah, 0)}).` });
}
// «Cuánto puedes gastar»: lo que queda del límite de gasto variable hasta fin de mes, por semana, y cómo va esta semana.
function bloqueSemana(padre) {
  const S = presupuestoSemana();
  if (!(limiteVar > 0)) { vacio(padre, "Sin límite de gasto variable", "Ponlo en Ajustes para ver cuánto te queda cada semana."); return; }
  const H_LIMITE = `Tu límite de gasto variable es ${eur(limiteVar, 0)} al mes: todo lo que no es fijo (comer fuera, compras, ocio…). Los gastos fijos (alquiler, recibos) no cuentan.`;
  if (S.disponible >= 0) {
    cifra(padre, "Te quedan este mes", eur(S.disponible, 0),
      S.restantes > 0 ? `unos ${eur(S.porSemana, 0)} por semana · ${eur(S.porDia, 0)} al día` : "el mes ya ha terminado", H_LIMITE);
  } else {
    const c = cifra(padre, "Te has pasado este mes", eur(-S.disponible, 0), `del límite de ${eur(limiteVar, 0)} · intenta no gastar más en variable hasta fin de mes`, H_LIMITE);
    c.querySelector(".v").classList.add("neg");
  }
  const ratio = S.metaSemana > 0 ? S.semana / S.metaSemana : 0;
  meter(padre, {
    nombre: `Semana del ${S.lunes.toFormat("dd/MM")}`, valor: S.semana, total: Math.max(S.semana, S.metaSemana),
    color: ratio > 1 ? BAD : ratio >= 0.85 ? WARN : GOOD, marca: ratio > 1 ? S.metaSemana / S.semana : null,
    fuerte: eur(S.semana, 0), resto: `de ${eur(S.metaSemana, 0)} por semana`,
  });
  const fd = S.fechaDatos;
  const nota = padre.createDiv({ cls: "fin-note" });
  if (!fd) nota.setText("Aún no hay movimientos: importa el extracto de tu banco.");
  else if (S.diasSinDatos > 8) { nota.addClass("fin-aviso-datos"); nota.appendText(`Movimientos hasta el ${fd.toFormat("dd/MM")}: `); enlace(nota, "importa el extracto de tu banco", "#importar"); nota.appendText(" para ver cómo vas."); }
  else nota.setText(`Movimientos hasta el ${fd.toFormat("dd/MM")}.`);
}
// «Qué hacer con tu dinero»: 1-3 acciones concretas a partir del colchón de la cuenta corriente.
function bloquePlan(padre) {
  const R = planReparto();
  if (!R) { vacio(padre, "Faltan los saldos de tus cuentas", "Se anotan al empezar y al cerrar cada mes."); return; }
  if (!R.acciones.length) {
    cifra(padre, "Este mes, no muevas nada", eur(R.corriente, 0), `en la cuenta corriente: por debajo de tu colchón de ${eur(R.colchon, 0)}`,
      `El colchón es lo que conviene dejar en la cuenta del día a día: un mes de gasto (fijos + tu límite de ${eur(limiteVar, 0)}${R.deficit > 0 ? ` + ${eur(R.deficit, 0)} para los meses flojos que vienen` : ""}). Lo que pase de ahí se puede mover.`);
  } else {
    cifra(padre, "Puedes mover", eur(R.acciones.reduce((s, a) => s + a.importe, 0), 0), `tienes ${eur(R.corriente, 0)} en la corriente y tu colchón es de ${eur(R.colchon, 0)}`,
      `El colchón es lo que conviene dejar en la cuenta del día a día: un mes de gasto (fijos + tu límite de ${eur(limiteVar, 0)}). Lo que pase de ahí se puede mover.`);
    filasDato(padre, R.acciones.map((a) => ({ l: a.texto, s: a.sub, v: eur(a.importe, 0), t: a.tipo === "libre" ? "" : "pos" })));
  }
  if (R.futuro) padre.createDiv({ cls: "fin-note", text: `Para ${mesLbl(R.futuro.mes).toLowerCase()}: pasa unos ${eur(R.futuro.importe, 0)} a ${nombresBroker()} (para entonces se habrá acabado su dinero sin invertir).` });
}
// «Tu dinero»: patrimonio neto y dónde está (cuentas, inversión…), con el objetivo vinculado a una cuenta.
function bloqueDinero(padre) {
  const E = estimacion();
  if (!E) { vacio(padre, "Aún no hay saldos registrados", "Anota los saldos de tus cuentas en «Cerrar el mes»."); return; }
  cifra(padre, "Patrimonio neto" + (E.dias > 0 ? " · estimado hoy" : ""), eur(E.neto, 0), "",
    "Todo lo que tienes (cuentas, inversión…) menos lo que debes. Entre dos cierres se estima con los movimientos.");
  const I = resumenInversion(), F = fondoEmergencia();
  const filas = cuentas().filter((c) => c.tipo !== "broker").map((c) => {
    const v = E.cuentas.saldos[c.nombre] || 0;
    const sub = c.tipo === "ahorro" ? (F && isFinite(F.meses) ? `ahorro · cubre ${nf(F.meses, 1, 1)} meses de gasto` : "ahorro") : c.tipo === "corriente" ? "día a día" : "";
    return Math.abs(v) >= 1 || c.tipo === "corriente" ? { l: c.nombre, s: sub, v: eur(v, 0), t: v < 0 ? "neg" : "",
      h: c.tipo === "ahorro" ? "Dinero para imprevistos (fondo de emergencia). Lo recomendable es tener de 3 a 6 meses de gasto." : null } : null;
  });
  filasDato(padre, [
    ...filas,
    I.filas.length ? { l: "Inversión", ruta: "#inversion", s: I.aportado ? `${eurS(I.gan, 0)} (${pct(I.gan / I.aportado, true)}) sobre lo aportado` : "", v: eur(I.total, 0),
      h: "Lo que valen hoy tus activos y cuánto has ganado sobre lo que metiste." } : null,
    E.c["Efectivo bróker"] >= 1 ? { l: `${nombresBroker()} sin invertir`, s: "para las aportaciones", v: eur(E.c["Efectivo bróker"], 0),
      h: "Dinero que tienes en el bróker sin comprar nada todavía: de ahí salen las compras de fondos." } : null,
    num(E.base.otros) >= 1 ? { l: "Otros bienes", v: eur(num(E.base.otros), 0) } : null,
    E.deudas ? { l: "Deudas", v: eur(-E.deudas, 0), t: "neg" } : null,
  ]);
  const o = objetivos().find((x) => x.vinculado && x.estado !== "conseguido");
  if (o) meter(padre, {
    nombre: o.nombre, ruta: o.p.file.path, valor: o.ahorrado, total: o.meta, color: o.ahorrado >= o.meta ? GOOD : "var(--fin-s3)",
    fuerte: `${eur(o.ahorrado, 0)} / ${eur(o.meta, 0)}`,
    sub: (o.ahorrado >= o.meta ? "Objetivo alcanzado" : `Faltan ${eur(o.meta - o.ahorrado, 0)}`) + (o.metaMeses ? ` · meta = ${o.metaMeses} meses de tu gasto` : ""),
  });
}
function bloquePrevisionMini(padre) {
  const F = prevision();
  if (!F.conRegistro) { vacio(padre, "Faltan los saldos de tus cuentas", "La previsión parte de tu dinero actual."); return; }
  const f3 = F.filas[Math.min(3, F.filas.length - 1)];
  kv(padre, [
    { l: "Liquidez hoy", v: eur(F.inicio, 0) },
    { l: `Fin de ${mesCorto(f3.key).toLowerCase()}`, v: eur(f3.saldo, 0), t: tone(f3.saldo - F.inicio) },
    { l: `Mínimo · ${mesCorto(F.minimo.key).toLowerCase()}`, v: eur(F.minimo.saldo, 0), t: F.minimo.saldo < 0 ? "neg" : "" },
  ]);
  columnas(padre, {
    alto: 130, etiquetas: F.filas.map((f) => mesCorto(f.key)), titulos: F.filas.map((f) => `${mesLbl(f.key)} · saldo ${eur(f.saldo, 0)}`),
    series: [{ nombre: "Flujo neto", color: polar, valores: F.filas.map((f) => f.neto) }],
  });
  const neg = F.filas.filter((f) => f.neto < 0);
  if (neg.length) padre.createDiv({ cls: "fin-note", text: `Meses con más salidas que entradas: ${neg.map((f) => mesCorto(f.key).toLowerCase()).join(", ")} (${eur(sum(neg.map((f) => f.neto)), 0)}).` });
}

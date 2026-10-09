// ───────────── render ─────────────
const TODAS = { ...VISTAS, bienvenida: vistaBienvenida, importar: vistaImportar, revisar: vistaRevisar, apuntar: vistaApuntar, cerrar: vistaCerrar,
  valores: vistaCerrar, ajustes: vistaAjustes, gestionar: vistaGestionar, editar: vistaEditar, fijos: vistaFijos, activo: vistaActivo, revision: vistaRevision, renta: vistaRenta, reparto: vistaReparto, anual: vistaAnual };
const TITULOS = { inicio: "Inicio", movimientos: "Movimientos", inversion: "Inversión",
  bienvenida: "Bienvenida", importar: "Importar", revisar: "Por revisar", apuntar: "Apuntar", cerrar: "Cerrar el mes", valores: "Valores", ajustes: "Ajustes", gestionar: "Ajustes", editar: "Editar", fijos: "Fijos", activo: "Inversión", revision: "Revisar categorías", renta: "Para la renta", reparto: "Reparto objetivo", anual: "Mi año" };
function render() {
  _movs = _movsMes = _aports = _objs = _pat = _cuentas = _recs = _activos = _cats = _cobros = undefined; _finMes = new Map(); _pos = new Map();
  root.empty();
  const sinConfigurar = !cuentas().length && !["bienvenida", "ajustes", "gestionar", "editar", "importar"].includes(vista);
  (sinConfigurar ? vistaBienvenida : TODAS[vista] || vistaInicio)();
  etiquetar(root);
  document.title = "FinanceBuddy · " + (TITULOS[sinConfigurar ? "bienvenida" : vista] || "Inicio");
}
render();
if (!(input && input.exponer)) autoCuadre();
// Para las pruebas automáticas.
if (input && input.exponer) {
  window.__fin = { periodoKey, periodoInicio, rentabilidadPeriodo, planReparto, DateTime, finMes, repartoAhorro, estimacion, conciliacion, prevision, resumenInversion, fondoEmergencia, gastoVariable, tasa12, repartoObjetivo, repartoAportacion, validarObjetivos, resumenMes, subidasFijos,
    movimientos, aportaciones, objetivos, patrimonio, avisos, categorias, grupoDe, limiteVar, mesesHasta, mesAnterior, hoyKey,
    fechaDatos, presupuestoSemana, planReparto, cuentas, proyectar, resumenCategorias, ritmoMes, evolucionInversion, aportacionesMes, constancia, interesesBroker, saludInversion, posicion, valorInfo,
    hitosPatrimonio, mesesHasta50, tamañoCompras, fifoVentas, cobros, usaMercado, generarResumen,
    repartirAvisos, ritmoObjetivo, siguienteFecha, cuantoFalta, totalesFijos, fijosSinCobrar, cuotaAhorro, rentaPorAño, csvRenta, recordatorios, hoy,
    gastoFijoSuelto, cierreVale, cierres, comisionesRecientes, cobrosRepetidos, faltaSegundaCopia, resumenAño, rentabilidadAño, patrimonioAño };
}

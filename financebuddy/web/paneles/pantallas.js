// ───────────── render ─────────────
const TODAS = { ...VISTAS, bienvenida: vistaBienvenida, importar: vistaImportar, revisar: vistaRevisar, apuntar: vistaApuntar, cerrar: vistaCerrar,
  valores: vistaCerrar, ajustes: vistaAjustes, gestionar: vistaGestionar, editar: vistaEditar, fijos: vistaFijos, activo: vistaActivo, revision: vistaRevision, renta: vistaRenta, reparto: vistaReparto, anual: vistaAnual, independencia: vistaIndependencia };
function render() {
  reiniciarCachesCalculo();
  FB.nPorRevisar = porRevisar().length;  // la insignia del menú cuenta lo mismo que el aviso del Inicio (nucleo.js la pinta tras montar la pantalla)
  root.empty();
  const sinConfigurar = !cuentas().length && !["bienvenida", "ajustes", "gestionar", "editar", "importar"].includes(vista);
  (sinConfigurar ? vistaBienvenida : TODAS[vista] || vistaInicio)();
  etiquetar(root);
  // La pestaña copia el título de la pantalla (su único h1): un solo nombre por pantalla
  const titular = root.querySelector("h1");
  document.title = "FinanceBuddy" + (titular ? " · " + (titular.dataset.titulo || titular.textContent.trim()) : "");
}
render();
if (!(input && input.exponer)) autoCuadre();
// Para las pruebas automáticas.
if (input && input.exponer) {
  window.__fin = { periodoKey, periodoInicio, rentabilidadPeriodo, planReparto, DateTime, finMes, repartoAhorro, estimacion, conciliacion, prevision, resumenInversion, fondoEmergencia, gastoVariable, tasa12, repartoObjetivo, repartoAportacion, validarObjetivos, resumenMes, subidasFijos, xirr, mesPagoDe,
    movimientos, aportaciones, objetivos, patrimonio, avisos, categorias, grupoDe, limiteVar, mesesHasta, mesAnterior, hoyKey,
    fechaDatos, presupuestoSemana, planReparto, cuentas, proyectar, resumenCategorias, ritmoMes, evolucionInversion, aportacionesMes, constancia, interesesBroker, comisionesFondos, ingresosPasivos, saludInversion, posicion, valorInfo,
    hitosPatrimonio, mesesHasta50, independencia, tamañoCompras, fifoVentas, cobros, usaMercado, generarResumen,
    repartirAvisos, ritmoObjetivo, siguienteFecha, cuantoFalta, totalesFijos, fijosSinCobrar, cuotaAhorro, rentaPorAño, csvRenta, recordatorios, hoy,
    gastoFijoSuelto, cierreVale, cierres, comisionesRecientes, cobrosRepetidos, faltaSegundaCopia, resumenAño, mediaMensualAño, categoriasQueBajan, ritmoAño, repartoDonut, frenteAño, tasaAñoTexto, rentabilidadAño, patrimonioAño,
    reiniciarCachesCalculo, diasConDatos, fotoCierre, fotoHoy, cambiosFoto,
    aportacionesSinLlegar, fijosDiaDistinto, ultimoDatoBroker, reglaDosMeses, simularVenta, primerosPasos, cambiosDesdeVista, recurrentes, activos, porComercio, presupuestosSugeridos, huchaAnual, avisoReparto, limitePorMeta, escenariosPrevision, fijosAutomaticos, leerImporte, puedoPermitirme, datosPermitir, filtrarMas, filtrosMasActivos,
    filtroDeVista, vistaDeFiltro, resumenFiltro, filtrosConGuardado, filtrosConNombre, filtrosSin, cobrosMedias, etiquetasUsadas };
}

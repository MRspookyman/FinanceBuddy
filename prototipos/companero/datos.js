/* Datos inventados del prototipo (los mismos que la app con --ejemplo --hoy 2026-09-30).
   Única fuente de cifras: index.html y app.js no escriben importes a mano. */
window.PROTO = {
  hoy: '2026-09-30',
  movimientosHasta: '2026-09-29',
  saldosAnotados: '2026-08-31',
  mes: 'septiembre',

  presupuesto: {
    limite: 600,
    mediaAEstasAlturas: 597.30,   // lo que sueles llevar gastado de variable a día 30 (media de 3 meses)
    mediaTresMeses: 614.35,
    margenSiguienteMes: 50,   // lo que el Inicio propone recortar el mes que viene si te has pasado
  },

  // Entradas del mes ya clasificadas (las de «sin revisar» salen de los movimientos).
  entradas: [{ concepto: 'Nómina', importe: 1850 }],
  gastosFijos: 812.90,

  // Gasto variable ya clasificado. «Sin clasificar» sale de los movimientos por revisar.
  categorias: [
    { nombre: 'Supermercado', importe: 313.37 },
    { nombre: 'Comer fuera', importe: 122.64, vsMedia: -25.44 },
    { nombre: 'Coche', importe: 107.60 },
    { nombre: 'Salud', importe: 24.86 },
    { nombre: 'Ocio', importe: 18.42 },
    { nombre: 'Ropa', importe: 12.85 },
  ],

  cuentas: [
    { id: 'nomina', nombre: 'Cuenta nómina', tipo: 'Cuenta corriente', icono: '🏦', color: 1, saldo: 1697.06,
      procedencia: 'estimado hoy · anotado el 31/08' },
    { id: 'ahorro', nombre: 'Ahorro', tipo: 'Ahorro', icono: '🌱', color: 2, saldo: 4200.00,
      procedencia: 'anotado el 31/08' },
    { id: 'broker', nombre: 'Bróker', tipo: 'Bróker · sin invertir', icono: '📈', color: 3, saldo: 301.50,
      procedencia: 'estimado hoy: saldo anotado + traspasos − compras' },
  ],

  /* Movimientos de septiembre por cuenta (muestra del prototipo). Importe con signo: − sale, + entra.
     Los que llevan «revisar» son las dudas del mes. */
  movimientos: {
    nomina: [
      { fecha: '2026-09-28', concepto: 'Nómina', categoria: 'Nómina', importe: 1850.00 },
      { fecha: '2026-09-27', concepto: 'Transferencia de Juan Perez', texto: 'TRANSFERENCIA DE JUAN PEREZ', revisar: true, importe: 50.00 },
      { fecha: '2026-09-26', concepto: 'Kiosko Ana', texto: 'KIOSKO ANA', revisar: true, importe: -4.20 },
      { fecha: '2026-09-24', concepto: 'Academia Oxford', texto: 'ACADEMIA OXFORD', revisar: true, importe: -65.00 },
      { fecha: '2026-09-22', concepto: 'Kiosko Ana', texto: 'KIOSKO ANA', revisar: true, importe: -3.50 },
      { fecha: '2026-09-12', concepto: 'Luz', categoria: 'Suministros', importe: -48.00 },
      { fecha: '2026-09-05', concepto: 'Internet y móvil', categoria: 'Suministros', importe: -35.00 },
      { fecha: '2026-09-03', concepto: 'Gimnasio', categoria: 'Suscripciones', importe: -29.90 },
      { fecha: '2026-09-01', concepto: 'Alquiler', categoria: 'Vivienda', importe: -700.00 },
    ],
    ahorro: [],
    broker: [
      { fecha: '2026-09-25', concepto: 'ISHARES PHYSICAL GOLD ETC', categoria: 'compra por confirmar', importe: -49.60 },
      { fecha: '2026-09-10', concepto: 'Aportación Fondo indexado MSCI World', categoria: 'Inversión', importe: -150.00 },
      { fecha: '2026-09-10', concepto: 'Aportación Bitcoin', categoria: 'Inversión', importe: -50.00 },
      { fecha: '2026-09-04', concepto: 'ISHARES PHYSICAL GOLD ETC', categoria: 'compra por confirmar', importe: -48.90 },
    ],
  },

  // El extracto que «acaba de importarse» en la revisión: el de la Cuenta nómina.
  extracto: { cuenta: 'nomina', desde: '2026-09-01', hasta: '2026-09-29', repetidos: 2 },

  // Opciones de la revisión. «Me devuelven un gasto» resta del gasto variable.
  opciones: {
    gasto: ['Supermercado', 'Comer fuera', 'Formación', 'Ocio', 'Otros', 'Descartar'],
    entrada: ['Otros ingresos', 'Me devuelven un gasto', 'Descartar'],
    // «Otra categoría…»: el resto de categorías de gasto variable.
    otrasGasto: ['Coche', 'Salud', 'Ropa', 'Regalos', 'Hogar', 'Transporte', 'Mascotas', 'Suscripciones'],
  },

  // Lo que el historial sabe de un texto del banco (sin Jev): de aquí salen las sugerencias de la revisión.
  historial: {
    'KIOSKO ANA': { eleccion: 'Ocio', fecha: '2026-08-18', importe: 3.80 },
    'TRANSFERENCIA DE JUAN PEREZ': { eleccion: 'Me devuelven un gasto', fecha: '2026-07-14', importe: 35.00 },
  },

  /* Escenarios de muestra para ver el diseño con otras noticias. Solo cambian el gasto y la previsión;
     saldos, cargos y metas son los de septiembre. */
  escenarios: {
    normal: { nombre: 'Septiembre (te pasas del límite)', cambios: {} },
    'sin-pasarte': {
      nombre: 'Un mes sin pasarte',
      cambios: {
        categorias: [
          { nombre: 'Supermercado', importe: 268.10 },
          { nombre: 'Comer fuera', importe: 84.20, vsMedia: -63.88 },
          { nombre: 'Coche', importe: 62.40 },
          { nombre: 'Salud', importe: 24.86 },
          { nombre: 'Ocio', importe: 18.42 },
          { nombre: 'Ropa', importe: 12.85 },
        ],
      },
    },
    'no-llega': {
      nombre: 'La previsión no llega',
      cambios: {
        prevision: { minimo: -312.40, mesMinimo: 'enero 2027', mesesHastaMinimo: 4, final: -905.10, mesFinal: 'agosto 2027', prudente: -1180.75 },
      },
    },
  },

  dinero: {
    total: 13473.84,
    desdeJunio: 1479.43,
    inversion: 7275.28,
  },

  prevision: {
    minimo: 6299.34, mesMinimo: 'octubre 2026',
    final: 8318.37, mesFinal: 'agosto 2027',
    prudente: 5256.12,
  },

  cargos: [
    { fecha: '2026-10-01', concepto: 'Alquiler', importe: -700.00 },
    { fecha: '2026-10-03', concepto: 'Gimnasio', importe: -29.90 },
    { fecha: '2026-10-05', concepto: 'Internet y móvil', importe: -35.00 },
    { fecha: '2026-10-10', concepto: 'Aportación Fondo indexado MSCI World', importe: 150.00, aportacion: true },
    { fecha: '2026-10-10', concepto: 'Aportación Bitcoin', importe: 50.00, aportacion: true },
    { fecha: '2026-10-12', concepto: 'Luz', importe: -48.00 },
    { fecha: '2026-10-28', concepto: 'Nómina', importe: 1850.00 },
  ],

  objetivos: [
    { nombre: 'Fondo de emergencia', actual: 4200, meta: 4300 },
    { nombre: 'Viaje a Japón', actual: 900, meta: 2500, fecha: '2027-07-27', alMes: 160 },
  ],
  recordatorios: [{ nombre: 'Declaración de la renta', fecha: '2026-10-10' }],

  /* El compañero se dibuja con código (app.js · mascotaSVG): una nube con dos ojos. */
  mascota: { nombre: 'Nubo', cuerpo: '#8B6CF2' },

  // Personalización de tarjetas: fondo y texto con contraste medido (≥ 6,8:1).
  colores: [
    { fondo: '#5B3FD1', texto: '#FFFFFF' },
    { fondo: '#FFC83D', texto: '#1B1440' },
    { fondo: '#1B1440', texto: '#FFFFFF' },
    { fondo: '#1D4E89', texto: '#FFFFFF' },
    { fondo: '#F2A541', texto: '#1B1440' },
    { fondo: '#3F4A56', texto: '#FFFFFF' },
  ],
  iconos: [
    { icono: '🏦', nombre: 'Banco' }, { icono: '🌱', nombre: 'Planta' }, { icono: '📈', nombre: 'Gráfico' },
    { icono: '💼', nombre: 'Maletín' }, { icono: '🏠', nombre: 'Casa' }, { icono: '✈️', nombre: 'Avión' },
    { icono: '🎯', nombre: 'Diana' }, { icono: '💶', nombre: 'Billete' },
  ],
};

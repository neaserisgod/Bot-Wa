// Carga inicial (idempotente) de empleados y tabla de turnos.
const logger = require('../utils/logger');
const empleadosQueries = require('./queries/empleados');
const turnosQueries = require('./queries/turnos');

const FRANJA_APERTURA = 'apertura';
const FRANJA_CIERRE = 'cierre';

// dia_semana: 0=domingo, 1=lunes, ..., 6=sábado
const TABLA_TURNOS = [
  { dia: 1, abre: 'admin', cierra: 'empleado_x' }, // lunes
  { dia: 2, abre: 'admin', cierra: 'empleado_x' }, // martes
  { dia: 3, abre: 'admin', cierra: 'empleado_x' }, // miércoles
  { dia: 4, abre: 'empleado_y', cierra: 'admin' }, // jueves
  { dia: 5, abre: 'empleado_y', cierra: 'admin' }, // viernes
  { dia: 6, abre: 'empleado_y', cierra: 'empleado_x' }, // sábado
  { dia: 0, abre: 'empleado_y', cierra: 'empleado_x' }, // domingo
];

function esFinDeSemana(diaSemana) {
  return diaSemana === 0 || diaSemana === 6;
}

function sembrarEmpleados() {
  const empleados = [
    {
      nombre: process.env.ADMIN_NOMBRE,
      telefono: process.env.ADMIN_NUMBER,
      rol: 'admin',
    },
    {
      nombre: process.env.EMPLEADO_X_NOMBRE,
      telefono: process.env.EMPLEADO_X_NUMBER,
      rol: 'empleado',
    },
    {
      nombre: process.env.EMPLEADO_Y_NOMBRE,
      telefono: process.env.EMPLEADO_Y_NUMBER,
      rol: 'empleado',
    },
  ];

  for (const empleado of empleados) {
    const existente = empleadosQueries.buscarPorTelefono(empleado.telefono);
    if (!existente) {
      empleadosQueries.crear(empleado);
      logger.info(`Empleado creado: ${empleado.nombre} (${empleado.telefono})`);
    }
  }
}

function sembrarTurnos() {
  if (turnosQueries.existeAlguno()) {
    logger.info('Turnos ya cargados, se omite el seed de turnos');
    return;
  }

  const horaApertura = Number(process.env.HORA_APERTURA);
  const horaCierreSemana = Number(process.env.HORA_CIERRE_SEMANA);
  const horaCierreFinde = Number(process.env.HORA_CIERRE_FINDE);

  for (const fila of TABLA_TURNOS) {
    const horaCierre = esFinDeSemana(fila.dia) ? horaCierreFinde : horaCierreSemana;

    turnosQueries.crear({
      diaSemana: fila.dia,
      franja: FRANJA_APERTURA,
      persona: fila.abre,
      hora: horaApertura,
    });

    turnosQueries.crear({
      diaSemana: fila.dia,
      franja: FRANJA_CIERRE,
      persona: fila.cierra,
      hora: horaCierre,
    });
  }

  logger.info('Tabla de turnos cargada (7 días × 2 franjas)');
}

function sembrarDatosIniciales() {
  sembrarEmpleados();
  sembrarTurnos();
}

module.exports = { sembrarDatosIniciales };

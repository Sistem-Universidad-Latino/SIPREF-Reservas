import ExcelJS from 'exceljs';
import type { ReservacionResumenDto } from './reservaciones.js';

function escaparCeldaCsv(valor: string): string {
  const limpio = valor.replace(/\r?\n/g, ' ');
  if (/[",;]/.test(limpio)) {
    return `"${limpio.replace(/"/g, '""')}"`;
  }
  return limpio;
}

/**
 * Genera contenido CSV en UTF-8 con BOM (\uFEFF) para apertura correcta en Excel.
 */
export function generarCsvReservaciones(
  reservaciones: ReservacionResumenDto[],
): string {
  const encabezados = [
    'Folio',
    'Tipo de evento',
    'Nombre del evento',
    'ID Espacio',
    'Espacio',
    'Inicio',
    'Fin',
    'Responsable',
    'Estado',
    'Recursos',
  ];

  const lineas: string[] = [encabezados.map(escaparCeldaCsv).join(',')];

  for (const r of reservaciones) {
    const fila = [
      r.codigo,
      r.tipoEvento,
      r.nombreEvento,
      r.espacioId,
      r.espacioNombre,
      r.inicio,
      r.fin,
      r.responsable,
      r.estado,
      r.resumenRecursos,
    ];
    lineas.push(fila.map(escaparCeldaCsv).join(','));
  }

  return '\uFEFF' + lineas.join('\r\n') + '\r\n';
}

/**
 * Genera un libro de Excel (.xlsx) con las reservaciones filtradas.
 */
export async function generarXlsxReservaciones(
  reservaciones: ReservacionResumenDto[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIPREF Reservas · Universidad Latino';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Reservaciones');
  sheet.columns = [
    { header: 'Folio', key: 'codigo', width: 18 },
    { header: 'Tipo de evento', key: 'tipoEvento', width: 16 },
    { header: 'Nombre del evento', key: 'nombreEvento', width: 32 },
    { header: 'ID Espacio', key: 'espacioId', width: 12 },
    { header: 'Espacio', key: 'espacioNombre', width: 26 },
    { header: 'Inicio', key: 'inicio', width: 24 },
    { header: 'Fin', key: 'fin', width: 24 },
    { header: 'Responsable', key: 'responsable', width: 26 },
    { header: 'Estado', key: 'estado', width: 14 },
    { header: 'Recursos', key: 'resumenRecursos', width: 34 },
  ];

  sheet.getRow(1).font = { bold: true };

  for (const r of reservaciones) {
    sheet.addRow({
      codigo: r.codigo,
      tipoEvento: r.tipoEvento,
      nombreEvento: r.nombreEvento,
      espacioId: r.espacioId,
      espacioNombre: r.espacioNombre,
      inicio: r.inicio,
      fin: r.fin,
      responsable: r.responsable,
      estado: r.estado,
      resumenRecursos: r.resumenRecursos,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

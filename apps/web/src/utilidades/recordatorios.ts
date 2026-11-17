import type { RecordatorioEntrada, UnidadAnticipacion } from '../api/tipos';

export interface FilaRecordatorio {
  id: string;
  sipref: boolean;
  correo: boolean;
  anticipacion: number;
  unidad: UnidadAnticipacion;
}

export const MAX_RECORDATORIOS = 5;

export function crearFilaRecordatorioPorDefecto(id = 'fila-1'): FilaRecordatorio {
  return {
    id,
    sipref: true,
    correo: true,
    anticipacion: 1,
    unidad: 'DIAS',
  };
}

/**
 * Convierte las filas de la interfaz de usuario en el arreglo `RecordatorioEntrada[]`
 * que espera `POST /api/reservaciones`.
 * Cada canal marcado (SIPREF y/o CORREO) en una misma fila genera una entrada independiente.
 */
export function convertirFilasRecordatorios(filas: FilaRecordatorio[]): RecordatorioEntrada[] {
  const resultado: RecordatorioEntrada[] = [];

  for (const fila of filas) {
    const anticipacion = Math.floor(Number(fila.anticipacion));
    if (!Number.isFinite(anticipacion) || anticipacion <= 0) {
      continue;
    }

    if (fila.sipref) {
      resultado.push({
        canal: 'SIPREF',
        anticipacion,
        unidad: fila.unidad,
      });
    }

    if (fila.correo) {
      resultado.push({
        canal: 'CORREO',
        anticipacion,
        unidad: fila.unidad,
      });
    }
  }

  return resultado;
}

export function formatearAnticipacionRecordatorio(anticipacion: number, unidad: UnidadAnticipacion): string {
  const mapaSingular: Record<UnidadAnticipacion, string> = {
    MINUTOS: 'minuto',
    HORAS: 'hora',
    DIAS: 'día',
  };
  const mapaPlural: Record<UnidadAnticipacion, string> = {
    MINUTOS: 'minutos',
    HORAS: 'horas',
    DIAS: 'días',
  };
  const etiqueta = anticipacion === 1 ? mapaSingular[unidad] : mapaPlural[unidad];
  return `${anticipacion} ${etiqueta} antes`;
}

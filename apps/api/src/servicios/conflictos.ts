import type { ClienteBd } from '../bd/pool.js';
import { listarOcupacionPrincipal } from '../principal/adaptador.js';

export type EstadoReservacionAlmacenado = 'PROGRAMADA' | 'CANCELADA';
export type EstadoReservacionMostrado = 'PENDIENTE' | 'REALIZADA' | 'CANCELADA';
export type OrigenConflicto = 'RESERVAS' | 'SIPREF';

export interface ConflictoHorario {
  origen: OrigenConflicto;
  nombreEvento: string;
  inicio: string;
  fin: string;
}

/**
 * Deriva el estado visible al usuario a partir del estado en BD y la fecha de fin.
 * - CANCELADA -> CANCELADA
 * - PROGRAMADA y fin < ahora -> REALIZADA
 * - PROGRAMADA y fin >= ahora -> PENDIENTE
 */
export function derivarEstadoReservacion(
  estadoAlmacenado: EstadoReservacionAlmacenado | string,
  fin: Date,
  ahora: Date = new Date(),
): EstadoReservacionMostrado {
  if (estadoAlmacenado === 'CANCELADA') {
    return 'CANCELADA';
  }
  if (fin.getTime() < ahora.getTime()) {
    return 'REALIZADA';
  }
  return 'PENDIENTE';
}

/**
 * Determina si dos intervalos [inicioA, finA) y [inicioB, finB) se traslapan
 * considerando un buffer obligatorio en minutos entre ambos:
 *   inicioA < finB + buffer  AND  finA + buffer > inicioB
 */
export function hayTraslapeConBuffer(
  inicioA: Date,
  finA: Date,
  inicioB: Date,
  finB: Date,
  bufferMinutos: number,
): boolean {
  const bufferMs = bufferMinutos * 60 * 1000;
  return (
    inicioA.getTime() < finB.getTime() + bufferMs &&
    finA.getTime() + bufferMs > inicioB.getTime()
  );
}

/**
 * Calcula el instante en que debe enviarse un recordatorio antes del inicio del evento.
 */
export function calcularEnviarEn(
  inicio: Date,
  anticipacion: number,
  unidad: 'MINUTOS' | 'HORAS' | 'DIAS',
): Date {
  const multiplicadorMs =
    unidad === 'MINUTOS'
      ? 60_000
      : unidad === 'HORAS'
        ? 3_600_000
        : 86_400_000;
  return new Date(inicio.getTime() - anticipacion * multiplicadorMs);
}

/**
 * Adquiere el candado transaccional (advisory lock) por espacio para serializar
 * validaciones de disponibilidad e inserciones/reagendados concurrentes.
 */
export async function adquirirCandadoEspacio(
  bd: ClienteBd,
  espacioId: string,
): Promise<void> {
  await bd.query(
    `SELECT pg_advisory_xact_lock(hashtext('reservas:espacio:' || $1))`,
    [espacioId],
  );
}

/**
 * Busca conflictos de horario para un espacio y rango [inicio, fin) considerando
 * tanto `reservas_reservaciones` (PROGRAMADA) como la ocupación de SIPREF principal
 * a través del adaptador, aplicando `bufferMinutos`.
 */
export async function buscarConflictosHorario(
  bd: ClienteBd,
  params: {
    espacioId: string;
    inicio: Date;
    fin: Date;
    bufferMinutos: number;
    excluirReservacionId?: string;
  },
): Promise<ConflictoHorario[]> {
  const { espacioId, inicio, fin, bufferMinutos, excluirReservacionId } = params;
  const conflictos: ConflictoHorario[] = [];

  // 1) Traslapes con buffer en reservas_reservaciones (estado = 'PROGRAMADA')
  // Condición del contrato: inicio < :fin + buffer AND fin + buffer > :inicio
  const valoresReservas: unknown[] = [
    espacioId,
    inicio.toISOString(),
    fin.toISOString(),
    `${bufferMinutos} minutes`,
  ];
  let clausulaExcluir = '';
  if (excluirReservacionId) {
    valoresReservas.push(excluirReservacionId);
    clausulaExcluir = `AND id <> $5::uuid`;
  }

  const { rows: filasPropias } = await bd.query(
    `
    SELECT nombre_evento, inicio, fin
    FROM reservas_reservaciones
    WHERE espacio_id = $1
      AND estado = 'PROGRAMADA'
      AND inicio < ($3::timestamptz + $4::interval)
      AND (fin + $4::interval) > $2::timestamptz
      ${clausulaExcluir}
    ORDER BY inicio ASC
    `,
    valoresReservas,
  );

  for (const r of filasPropias) {
    conflictos.push({
      origen: 'RESERVAS',
      nombreEvento: String(r.nombre_evento),
      inicio: new Date(r.inicio).toISOString(),
      fin: new Date(r.fin).toISOString(),
    });
  }

  // 2) Traslapes con buffer en SIPREF principal (vía adaptador de solo lectura)
  const bufferMs = bufferMinutos * 60 * 1000;
  const desdeConBuffer = new Date(inicio.getTime() - bufferMs);
  const hastaConBuffer = new Date(fin.getTime() + bufferMs);

  const eventosPrincipal = await listarOcupacionPrincipal(
    {
      desde: desdeConBuffer,
      hasta: hastaConBuffer,
      espacioId,
    },
    bd,
  );

  for (const ev of eventosPrincipal) {
    if (hayTraslapeConBuffer(inicio, fin, ev.inicio, ev.fin, bufferMinutos)) {
      conflictos.push({
        origen: 'SIPREF',
        nombreEvento: ev.nombreEvento,
        inicio: ev.inicio.toISOString(),
        fin: ev.fin.toISOString(),
      });
    }
  }

  conflictos.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  return conflictos;
}

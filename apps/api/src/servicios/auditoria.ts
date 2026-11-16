import crypto from 'node:crypto';
import type { ClienteBd } from '../bd/pool.js';
import { obtenerConfig } from '../config.js';
import { encolarNotificacionSalida } from './outbox.js';

export type TipoActorAuditoria =
  | 'USUARIO_RESERVAS'
  | 'ADMIN_PRINCIPAL'
  | 'SISTEMA';

export interface EntradaAuditoria {
  actorTipo: TipoActorAuditoria;
  actorId?: string | null;
  actorNombre?: string | null;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  datosAntes?: unknown;
  datosDespues?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export async function registrarAuditoria(
  bd: ClienteBd,
  entrada: EntradaAuditoria,
): Promise<number> {
  const { rows } = await bd.query(
    `
    INSERT INTO reservas_auditoria (
      actor_tipo,
      actor_id,
      actor_nombre,
      accion,
      entidad,
      entidad_id,
      datos_antes,
      datos_despues,
      ip,
      user_agent
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, ocurrido_en
    `,
    [
      entrada.actorTipo,
      entrada.actorId ?? null,
      entrada.actorNombre ?? null,
      entrada.accion,
      entrada.entidad,
      entrada.entidadId ?? null,
      entrada.datosAntes !== undefined && entrada.datosAntes !== null
        ? JSON.stringify(entrada.datosAntes)
        : null,
      entrada.datosDespues !== undefined && entrada.datosDespues !== null
        ? JSON.stringify(entrada.datosDespues)
        : null,
      entrada.ip ?? null,
      entrada.userAgent ?? null,
    ],
  );

  const fila = rows[0];
  const auditoriaId = Number(fila.id);
  const ocurridoEn = new Date(fila.ocurrido_en).toISOString();

  const cfg = obtenerConfig();
  if (cfg.PRINCIPAL_BITACORA_URL) {
    const claveIdempotencia = `bitacora:${auditoriaId}:${crypto.randomUUID()}`;
    await encolarNotificacionSalida(bd, {
      tipo: 'bitacora.registrar',
      claveIdempotencia,
      payload: {
        evento: 'bitacora.registrar',
        idEvento: claveIdempotencia,
        ocurridoEn,
        datos: {
          auditoriaId,
          actorTipo: entrada.actorTipo,
          actorId: entrada.actorId ?? null,
          actorNombre: entrada.actorNombre ?? null,
          accion: entrada.accion,
          entidad: entrada.entidad,
          entidadId: entrada.entidadId ?? null,
          datosAntes: entrada.datosAntes ?? null,
          datosDespues: entrada.datosDespues ?? null,
          ip: entrada.ip ?? null,
        },
      },
    });
  }

  return auditoriaId;
}

export function describirAccionHistorial(
  accion: string,
  datosAntes: Record<string, unknown> | null,
  datosDespues: Record<string, unknown> | null,
): string {
  switch (accion) {
    case 'reservacion.crear':
      return 'Creó la reservación';
    case 'reservacion.reagendar': {
      const espAntes = datosAntes?.espacioId;
      const espDespues = datosDespues?.espacioId;
      if (espAntes && espDespues && espAntes !== espDespues) {
        return `Reagendó la reservación y cambió el espacio de ${espAntes} a ${espDespues}`;
      }
      return 'Reagendó el horario de la reservación';
    }
    case 'reservacion.cancelar': {
      const motivo = datosDespues?.motivoCancelacion || datosDespues?.motivo;
      return motivo
        ? `Canceló la reservación (motivo: ${String(motivo)})`
        : 'Canceló la reservación';
    }
    default:
      return `Acción registrada: ${accion}`;
  }
}

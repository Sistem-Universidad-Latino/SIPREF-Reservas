import type pg from 'pg';
import { enTransaccion, obtenerPool } from '../bd/pool.js';
import { registrarAuditoria } from './auditoria.js';
import { enviarCorreoRecordatorio } from './correo.js';
import { encolarNotificacionSalida, procesarOutbox } from './outbox.js';

export interface ResultadoTareas {
  ejecutado: boolean;
  motivoOmitido?: string;
  solicitudesExpiradas: number;
  recordatoriosEnviados: number;
  outbox: { enviados: number; fallidos: number; omitidos: number };
  sesionesPurgadas: number;
}

export async function ejecutarTareasProgramadas(
  pool: pg.Pool = obtenerPool(),
): Promise<ResultadoTareas> {
  const clienteLock = await pool.connect();
  try {
    const { rows: lockRows } = await clienteLock.query(
      `SELECT pg_try_advisory_lock(hashtext('reservas:tareas_programadas')) AS adquirido`,
    );
    const adquirido = Boolean(lockRows[0]?.adquirido);
    if (!adquirido) {
      return {
        ejecutado: false,
        motivoOmitido: 'Otra ejecución de tareas programadas ya está en curso.',
        solicitudesExpiradas: 0,
        recordatoriosEnviados: 0,
        outbox: { enviados: 0, fallidos: 0, omitidos: 0 },
        sesionesPurgadas: 0,
      };
    }

    try {
      // 1) Expirar solicitudes PENDIENTE con expira_en < now()
      const solicitudesExpiradas = await enTransaccion(async (tx) => {
        const { rows: vencidas } = await tx.query(
          `
          UPDATE reservas_solicitudes_acceso
          SET estado = 'EXPIRADA'
          WHERE estado = 'PENDIENTE'
            AND expira_en < now()
          RETURNING id, google_sub, correo, nombre, foto_url, intentado_en
          `,
        );

        for (const sol of vencidas) {
          await tx.query(
            `
            UPDATE reservas_usuarios
            SET estado = 'EXPIRADA', actualizado_en = now()
            WHERE google_sub = $1 AND estado = 'PENDIENTE'
            `,
            [sol.google_sub],
          );

          const claveIdem = `solicitud_acceso.expirada:${sol.id}`;
          await encolarNotificacionSalida(tx, {
            tipo: 'solicitud_acceso.expirada',
            claveIdempotencia: claveIdem,
            payload: {
              evento: 'solicitud_acceso.expirada',
              idEvento: claveIdem,
              ocurridoEn: new Date().toISOString(),
              datos: {
                solicitudId: String(sol.id),
                nombre: String(sol.nombre),
                correo: String(sol.correo),
                fotoUrl: sol.foto_url ? String(sol.foto_url) : null,
                intentadoEn: new Date(sol.intentado_en).toISOString(),
              },
            },
          });

          await registrarAuditoria(tx, {
            actorTipo: 'SISTEMA',
            actorId: 'cron',
            actorNombre: 'Tareas programadas',
            accion: 'solicitud.expirar',
            entidad: 'reservas_solicitudes_acceso',
            entidadId: String(sol.id),
            datosAntes: { estado: 'PENDIENTE' },
            datosDespues: { estado: 'EXPIRADA' },
          });
        }

        return vencidas.length;
      }, pool);

      // 2) Enviar recordatorios con enviar_en <= now() que no se han enviado
      let recordatoriosEnviados = 0;
      const { rows: pendientesRec } = await pool.query(
        `
        SELECT
          rec.id,
          rec.canal,
          r.codigo,
          r.nombre_evento,
          r.espacio_nombre,
          r.inicio,
          r.fin,
          r.estado AS estado_reservacion,
          COALESCE(NULLIF(r.correo_responsable, ''), u.correo) AS correo_destino
        FROM reservas_recordatorios rec
        JOIN reservas_reservaciones r ON r.id = rec.reservacion_id
        JOIN reservas_usuarios u ON u.google_sub = r.creado_por
        WHERE rec.enviado_en IS NULL
          AND rec.enviar_en <= now()
          AND rec.intentos < 5
        ORDER BY rec.enviar_en ASC
        LIMIT 50
        `,
      );

      for (const rec of pendientesRec) {
        const recId = Number(rec.id);
        if (rec.estado_reservacion !== 'PROGRAMADA') {
          await pool.query(
            `UPDATE reservas_recordatorios SET enviado_en = now(), ultimo_error = 'Reservación cancelada' WHERE id = $1`,
            [recId],
          );
          continue;
        }

        try {
          if (rec.canal === 'CORREO' && rec.correo_destino) {
            await enviarCorreoRecordatorio({
              para: String(rec.correo_destino),
              codigo: String(rec.codigo),
              nombreEvento: String(rec.nombre_evento),
              espacioNombre: String(rec.espacio_nombre),
              inicioIso: new Date(rec.inicio).toISOString(),
              finIso: new Date(rec.fin).toISOString(),
            });
          }
          await pool.query(
            `
            UPDATE reservas_recordatorios
            SET enviado_en = now(),
                intentos = intentos + 1,
                ultimo_error = NULL
            WHERE id = $1
            `,
            [recId],
          );
          recordatoriosEnviados += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message.slice(0, 400) : 'Error al enviar';
          await pool.query(
            `
            UPDATE reservas_recordatorios
            SET intentos = intentos + 1,
                ultimo_error = $2
            WHERE id = $1
            `,
            [recId, msg],
          );
        }
      }

      // 3) Procesar outbox
      const outbox = await procesarOutbox(pool);

      // 4) Purgar sesiones expiradas o revocadas antiguas
      const { rowCount: sesionesPurgadas } = await pool.query(
        `
        DELETE FROM reservas_sesiones
        WHERE expira_en < now()
           OR (revocada_en IS NOT NULL AND revocada_en < now() - INTERVAL '1 day')
        `,
      );

      return {
        ejecutado: true,
        solicitudesExpiradas,
        recordatoriosEnviados,
        outbox,
        sesionesPurgadas: sesionesPurgadas ?? 0,
      };
    } finally {
      await clienteLock.query(
        `SELECT pg_advisory_unlock(hashtext('reservas:tareas_programadas'))`,
      );
    }
  } finally {
    clienteLock.release();
  }
}

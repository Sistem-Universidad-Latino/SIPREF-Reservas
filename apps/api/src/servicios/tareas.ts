import type { ClienteBd } from '../bd/pool.js';
import { obtenerPool } from '../bd/pool.js';
import { enviarCorreoRecordatorio } from './correo.js';
import { procesarOutbox } from './outbox.js';

export interface ResultadoTareas {
  ejecutado: boolean;
  motivoOmitido?: string;
  solicitudesExpiradas: number;
  recordatoriosEnviados: number;
  outbox: { enviados: number; fallidos: number; omitidos: number };
  sesionesPurgadas: number;
}

export async function ejecutarTareasProgramadas(
  pool: ClienteBd = obtenerPool(),
): Promise<ResultadoTareas> {
  try {
    // 1) Las solicitudes de acceso no expiran automáticamente; solo cambian si el usuario elimina su cuenta o SIPREF las resuelve.
    const solicitudesExpiradas = 0;

      // 2) Enviar recordatorios con enviar_en <= now() que no se han enviado
      let recordatoriosEnviados = 0;
      const { rows: pendientesRec } = await pool.query(
        `
        SELECT
          rec.id,
          rec.canal,
          r.codigo,
          r.nombre_evento,
          r.tipo_evento,
          r.espacio_nombre,
          r.inicio,
          r.fin,
          r.responsable,
          r.acomodo_mobiliario,
          r.sillas_mesa_panel,
          r.descripcion,
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
              tipoEvento: rec.tipo_evento ? String(rec.tipo_evento) : undefined,
              espacioNombre: String(rec.espacio_nombre),
              inicioIso: new Date(rec.inicio).toISOString(),
              finIso: new Date(rec.fin).toISOString(),
              responsable: rec.responsable ? String(rec.responsable) : undefined,
              acomodoMobiliario: rec.acomodo_mobiliario ? String(rec.acomodo_mobiliario) : null,
              sillasMesaPanel: Number(rec.sillas_mesa_panel ?? 0),
              descripcion: rec.descripcion ? String(rec.descripcion) : null,
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
        WHERE expira_en < NOW()
           OR (revocada_en IS NOT NULL AND revocada_en < DATE_SUB(NOW(), INTERVAL 1 DAY))
        `,
      );

      return {
        ejecutado: true,
        solicitudesExpiradas,
        recordatoriosEnviados,
        outbox,
        sesionesPurgadas: sesionesPurgadas ?? 0,
      };
  } catch (err) {
    throw err;
  }
}

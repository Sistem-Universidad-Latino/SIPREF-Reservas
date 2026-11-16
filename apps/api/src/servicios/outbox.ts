import type { ClienteBd } from '../bd/pool.js';
import { obtenerConfig } from '../config.js';
import { calcularFirmaHmac } from '../seguridad/hmac.js';

export const MAX_INTENTOS_OUTBOX = 10;

const ESCALONES_BACKOFF_MINUTOS = [1, 5, 15, 60, 120, 240, 480, 720, 1440, 1440];

export function calcularEsperaMinutosOutbox(intentosFallidos: number): number {
  const idx = Math.max(0, Math.min(intentosFallidos - 1, ESCALONES_BACKOFF_MINUTOS.length - 1));
  return ESCALONES_BACKOFF_MINUTOS[idx];
}

export interface NuevaNotificacionSalida {
  tipo: 'solicitud_acceso.creada' | 'solicitud_acceso.expirada' | 'bitacora.registrar';
  claveIdempotencia: string;
  payload: Record<string, unknown>;
}

export async function encolarNotificacionSalida(
  bd: ClienteBd,
  notificacion: NuevaNotificacionSalida,
): Promise<void> {
  await bd.query(
    `
    INSERT INTO reservas_notificaciones_salida (tipo, clave_idempotencia, payload)
    VALUES ($1, $2, $3::jsonb)
    ON CONFLICT (clave_idempotencia) DO NOTHING
    `,
    [
      notificacion.tipo,
      notificacion.claveIdempotencia,
      JSON.stringify(notificacion.payload),
    ],
  );
}

export async function procesarOutbox(
  bd: ClienteBd,
): Promise<{ enviados: number; fallidos: number; omitidos: number }> {
  const cfg = obtenerConfig();
  let enviados = 0;
  let fallidos = 0;
  let omitidos = 0;

  const { rows } = await bd.query(
    `
    SELECT id, tipo, clave_idempotencia, payload, intentos
    FROM reservas_notificaciones_salida
    WHERE entregado_en IS NULL
      AND proximo_intento_en <= now()
      AND intentos < $1
    ORDER BY proximo_intento_en ASC
    LIMIT 50
    `,
    [MAX_INTENTOS_OUTBOX],
  );

  for (const fila of rows) {
    const id = Number(fila.id);
    const tipo = String(fila.tipo);
    const intentosActuales = Number(fila.intentos);

    const urlDestino =
      tipo === 'bitacora.registrar'
        ? cfg.PRINCIPAL_BITACORA_URL
        : cfg.PRINCIPAL_WEBHOOK_URL;

    if (!urlDestino) {
      omitidos += 1;
      continue;
    }

    const secreto = cfg.PRINCIPAL_WEBHOOK_SECRET ?? cfg.INTEGRACION_SECRET;
    const cuerpoTexto = JSON.stringify(fila.payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const urlObj = new URL(urlDestino);
    const pathConQuery = `${urlObj.pathname}${urlObj.search}`;
    const firma = calcularFirmaHmac(
      secreto,
      timestamp,
      'POST',
      pathConQuery,
      cuerpoTexto,
    );

    try {
      const respuesta = await fetch(urlDestino, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-SIPREF-Key-Id': cfg.INTEGRACION_KEY_ID,
          'X-SIPREF-Timestamp': timestamp,
          'X-SIPREF-Signature': firma,
          'X-SIPREF-Evento': tipo,
        },
        body: cuerpoTexto,
        signal: AbortSignal.timeout(10_000),
      });

      if (respuesta.status >= 200 && respuesta.status < 300) {
        await bd.query(
          `
          UPDATE reservas_notificaciones_salida
          SET entregado_en = now(),
              intentos = intentos + 1,
              ultimo_error = NULL
          WHERE id = $1
          `,
          [id],
        );
        enviados += 1;
      } else {
        throw new Error(`HTTP ${respuesta.status}`);
      }
    } catch (err) {
      const nuevoIntento = intentosActuales + 1;
      const esperaMin = calcularEsperaMinutosOutbox(nuevoIntento);
      const mensajeError =
        err instanceof Error ? err.message.slice(0, 500) : 'Error de red desconocido';

      await bd.query(
        `
        UPDATE reservas_notificaciones_salida
        SET intentos = $2,
            proximo_intento_en = now() + ($3 || ' minutes')::interval,
            ultimo_error = $4
        WHERE id = $1
        `,
        [id, nuevoIntento, String(esperaMin), mensajeError],
      );
      fallidos += 1;
    }
  }

  return { enviados, fallidos, omitidos };
}

import type { FastifyInstance } from 'fastify';
import { obtenerConfig } from '../config.js';
import { ErrorApi } from '../errores.js';
import { comparacionTiempoConstante } from '../seguridad/hmac.js';
import { ejecutarTareasProgramadas } from '../servicios/tareas.js';

export async function rutasTareas(app: FastifyInstance): Promise<void> {
  app.post('/api/tareas/ejecutar', async (request) => {
    const cfg = obtenerConfig();
    const secretoHeader = request.headers['x-cron-secret'];
    const secretoRecibido = Array.isArray(secretoHeader)
      ? secretoHeader[0]
      : secretoHeader;

    if (
      !secretoRecibido ||
      !comparacionTiempoConstante(secretoRecibido, cfg.CRON_SECRET)
    ) {
      throw new ErrorApi(
        403,
        'PROHIBIDO',
        'No autorizado para ejecutar tareas programadas.',
      );
    }

    return ejecutarTareasProgramadas();
  });
}

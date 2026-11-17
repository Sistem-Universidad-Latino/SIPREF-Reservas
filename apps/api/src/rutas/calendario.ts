import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { obtenerPool } from '../bd/pool.js';
import { ErrorApi } from '../errores.js';
import { listarOcupacionPrincipal } from '../principal/adaptador.js';
import { requerirSesionAprobada } from '../seguridad/guardias.js';
import { derivarEstadoReservacion } from '../servicios/conflictos.js';

const MAX_RANGO_DIAS = 62;

const esquemaQueryCalendario = z.object({
  desde: z.string().min(1, 'El parámetro desde es obligatorio'),
  hasta: z.string().min(1, 'El parámetro hasta es obligatorio'),
  espacioId: z.string().optional(),
});

export async function rutasCalendario(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/calendario',
    { preHandler: [requerirSesionAprobada] },
    async (request) => {
      const query = esquemaQueryCalendario.parse(request.query);
      const desde = new Date(query.desde);
      const hasta = new Date(query.hasta);

      if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
        throw new ErrorApi(
          400,
          'VALIDACION',
          'Las fechas desde y hasta deben estar en formato ISO 8601 válido.',
          { campos: { desde: 'Fecha inválida', hasta: 'Fecha inválida' } },
        );
      }

      if (hasta.getTime() <= desde.getTime()) {
        throw new ErrorApi(
          400,
          'VALIDACION',
          'La fecha final (hasta) debe ser posterior a la fecha inicial (desde).',
          { campos: { hasta: 'Debe ser mayor que desde' } },
        );
      }

      const diasRango =
        (hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24);
      if (diasRango > MAX_RANGO_DIAS) {
        throw new ErrorApi(
          400,
          'VALIDACION',
          `El rango de consulta del calendario no puede exceder ${MAX_RANGO_DIAS} días.`,
          { campos: { hasta: `Rango máximo de ${MAX_RANGO_DIAS} días` } },
        );
      }

      const pool = obtenerPool();
      const usuario = request.usuario!;
      const espacioId =
        query.espacioId && query.espacioId.trim() !== ''
          ? query.espacioId.trim()
          : undefined;

      const params: unknown[] = [desde, hasta];
      let filtroEspacioSql = '';
      if (espacioId) {
        params.push(espacioId);
        filtroEspacioSql = `AND r.espacio_id = $3`;
      }

      const [resPropias, eventosPrincipal] = await Promise.all([
        pool.query(
          `
          SELECT
            r.id,
            r.tipo_evento,
            r.nombre_evento,
            r.espacio_id,
            r.espacio_nombre,
            r.inicio,
            r.fin,
            r.responsable,
            r.estado,
            r.creado_por,
            COALESCE(
              (
                SELECT GROUP_CONCAT(CONCAT(c.nombre, ' ×', re.cantidad) ORDER BY c.nombre ASC SEPARATOR ', ')
                FROM reservas_recursos_evento re
                JOIN reservas_recursos_catalogo c ON c.id = re.recurso_id
                WHERE re.reservacion_id = r.id
              ),
              ''
            ) AS resumen_recursos
          FROM reservas_reservaciones r
          WHERE r.estado = 'PROGRAMADA'
            AND r.inicio < $2
            AND r.fin > $1
            ${filtroEspacioSql}
          ORDER BY r.inicio ASC
          `,
          params,
        ),
        listarOcupacionPrincipal({ desde, hasta, espacioId }, pool),
      ]);

      const ahora = new Date();

      const eventosReservas = resPropias.rows.map((r) => {
        const finDate = new Date(r.fin);
        const esMioOAdmin =
          usuario.rol === 'ADMIN_ESPACIOS' ||
          String(r.creado_por) === usuario.sub;
        return {
          id: String(r.id),
          origen: 'RESERVAS' as const,
          tipoEvento: String(r.tipo_evento),
          nombreEvento: String(r.nombre_evento),
          espacioId: String(r.espacio_id),
          espacioNombre: String(r.espacio_nombre),
          inicio: new Date(r.inicio).toISOString(),
          fin: finDate.toISOString(),
          responsable: String(r.responsable),
          estado: derivarEstadoReservacion(String(r.estado), finDate, ahora),
          resumenRecursos: String(r.resumen_recursos ?? ''),
          editable: esMioOAdmin,
        };
      });

      const eventosSipref = eventosPrincipal.map((ev) => ({
        id: ev.id,
        origen: 'SIPREF' as const,
        tipoEvento: ev.tipoEvento || 'OTRO',
        nombreEvento: ev.nombreEvento,
        espacioId: ev.espacioId,
        espacioNombre: ev.espacioNombre,
        inicio: ev.inicio.toISOString(),
        fin: ev.fin.toISOString(),
        responsable: ev.responsable,
        estado: derivarEstadoReservacion('PROGRAMADA', ev.fin, ahora),
        resumenRecursos: '',
        editable: false,
      }));

      const todos = [...eventosReservas, ...eventosSipref];
      todos.sort(
        (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
      );

      return todos;
    },
  );
}

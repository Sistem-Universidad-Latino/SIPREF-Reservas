import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { enTransaccion, obtenerPool } from '../bd/pool.js';
import { ErrorApi } from '../errores.js';
import { listarEspacios } from '../principal/adaptador.js';
import { requerirSesionAprobada } from '../seguridad/guardias.js';
import { registrarAuditoria } from '../servicios/auditoria.js';
import { obtenerConfiguracionSistema } from '../servicios/configuracionBd.js';

const esquemaCrearRecurso = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'El nombre del recurso es obligatorio')
    .max(120, 'El nombre del recurso es demasiado largo'),
  unidad: z
    .string()
    .trim()
    .min(1, 'La unidad es obligatoria')
    .max(40, 'La unidad es demasiado larga')
    .default('pieza'),
});

export async function rutasCatalogos(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/configuracion/publica',
    { preHandler: [requerirSesionAprobada] },
    async () => {
      const cfg = await obtenerConfiguracionSistema();
      return {
        ciclo: cfg.ciclo,
        bufferMinutos: cfg.bufferMinutos,
        zonaHoraria: cfg.zonaHoraria,
      };
    },
  );

  app.get(
    '/api/espacios',
    { preHandler: [requerirSesionAprobada] },
    async () => {
      return listarEspacios();
    },
  );

  app.get(
    '/api/recursos',
    { preHandler: [requerirSesionAprobada] },
    async () => {
      const pool = obtenerPool();
      const { rows } = await pool.query(
        `
        SELECT id, nombre, unidad, es_predefinido
        FROM reservas_recursos_catalogo
        WHERE activo = TRUE
        ORDER BY es_predefinido DESC, nombre ASC
        `,
      );
      return rows.map((r) => ({
        id: Number(r.id),
        nombre: String(r.nombre),
        unidad: String(r.unidad),
        esPredefinido: Boolean(r.es_predefinido),
      }));
    },
  );

  app.post(
    '/api/recursos',
    { preHandler: [requerirSesionAprobada] },
    async (request, reply) => {
      const body = esquemaCrearRecurso.parse(request.body);
      const usuario = request.usuario!;
      const pool = obtenerPool();

      const { recurso, creado } = await enTransaccion(async (tx) => {
        const { rows: existentes } = await tx.query(
          `
          SELECT id, nombre, unidad, es_predefinido, activo
          FROM reservas_recursos_catalogo
          WHERE lower(nombre) = lower($1)
          LIMIT 1
          `,
          [body.nombre],
        );

        if (existentes.length > 0) {
          const ex = existentes[0];
          const estabaInactivo = !Boolean(ex.activo);
          if (estabaInactivo) {
            await tx.query(
              `UPDATE reservas_recursos_catalogo SET activo = TRUE, unidad = $2 WHERE id = $1`,
              [ex.id, body.unidad],
            );
          }
          const dto = {
            id: Number(ex.id),
            nombre: String(ex.nombre),
            unidad: estabaInactivo ? body.unidad : String(ex.unidad),
            esPredefinido: Boolean(ex.es_predefinido),
          };

          await registrarAuditoria(tx, {
            actorTipo: 'USUARIO_RESERVAS',
            actorId: usuario.sub,
            actorNombre: usuario.nombre,
            accion: 'recurso.reutilizar',
            entidad: 'reservas_recursos_catalogo',
            entidadId: String(dto.id),
            datosDespues: dto,
            ip: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
          });

          return { recurso: dto, creado: false };
        }

        const insertRes = await tx.query(
          `
          INSERT INTO reservas_recursos_catalogo (nombre, unidad, es_predefinido, creado_por)
          VALUES ($1, $2, FALSE, $3)
          `,
          [body.nombre, body.unidad, usuario.sub],
        );

        const dto = {
          id: Number(insertRes.insertId ?? 0),
          nombre: body.nombre,
          unidad: body.unidad,
          esPredefinido: false,
        };

        await registrarAuditoria(tx, {
          actorTipo: 'USUARIO_RESERVAS',
          actorId: usuario.sub,
          actorNombre: usuario.nombre,
          accion: 'recurso.crear',
          entidad: 'reservas_recursos_catalogo',
          entidadId: String(dto.id),
          datosDespues: dto,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });

        return { recurso: dto, creado: true };
      }, pool);

      return reply.status(creado ? 201 : 200).send(recurso);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/recursos/:id',
    { preHandler: [requerirSesionAprobada] },
    async (request, reply) => {
      const idNum = Number(request.params.id);
      if (!Number.isInteger(idNum) || idNum <= 0) {
        throw new ErrorApi(400, 'VALIDACION', 'Identificador de material no válido.');
      }

      const usuario = request.usuario!;
      const pool = obtenerPool();

      await enTransaccion(async (tx) => {
        const { rows } = await tx.query(
          `SELECT id, nombre, es_predefinido, activo FROM reservas_recursos_catalogo WHERE id = $1 LIMIT 1`,
          [idNum],
        );
        if (rows.length === 0 || !rows[0].activo) {
          throw new ErrorApi(404, 'NO_ENCONTRADO', 'Material no encontrado en el catálogo.');
        }
        if (Boolean(rows[0].es_predefinido)) {
          throw new ErrorApi(403, 'PROHIBIDO', 'No es posible eliminar un material predefinido del catálogo.');
        }

        await tx.query(
          `UPDATE reservas_recursos_catalogo SET activo = FALSE WHERE id = $1`,
          [idNum],
        );

        await registrarAuditoria(tx, {
          actorTipo: 'USUARIO_RESERVAS',
          actorId: usuario.sub,
          actorNombre: usuario.nombre,
          accion: 'recurso.eliminar',
          entidad: 'reservas_recursos_catalogo',
          entidadId: String(idNum),
          datosAntes: { nombre: String(rows[0].nombre), activo: true },
          datosDespues: { activo: false },
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });
      }, pool);

      return reply.status(204).send();
    },
  );
}

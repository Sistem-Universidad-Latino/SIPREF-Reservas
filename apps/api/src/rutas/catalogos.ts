import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { enTransaccion, obtenerPool } from '../bd/pool.js';
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
          SELECT id, nombre, unidad, es_predefinido
          FROM reservas_recursos_catalogo
          WHERE lower(nombre) = lower($1)
          LIMIT 1
          `,
          [body.nombre],
        );

        if (existentes.length > 0) {
          const ex = existentes[0];
          const dto = {
            id: Number(ex.id),
            nombre: String(ex.nombre),
            unidad: String(ex.unidad),
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

        const { rows: insertados } = await tx.query(
          `
          INSERT INTO reservas_recursos_catalogo (nombre, unidad, es_predefinido, creado_por)
          VALUES ($1, $2, FALSE, $3)
          RETURNING id, nombre, unidad, es_predefinido
          `,
          [body.nombre, body.unidad, usuario.sub],
        );

        const nuevo = insertados[0];
        const dto = {
          id: Number(nuevo.id),
          nombre: String(nuevo.nombre),
          unidad: String(nuevo.unidad),
          esPredefinido: Boolean(nuevo.es_predefinido),
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
}

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

  app.get<{ Querystring: { solo_exclusivas?: string } }>(
    '/api/espacios',
    { preHandler: [requerirSesionAprobada] },
    async (request) => {
      const soloExclusivas = request.query?.solo_exclusivas === 'true';
      return listarEspacios(soloExclusivas);
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

  // ─── Plantillas de evento con materiales predeterminados ──────
  const esquemaPlantillaEvento = z.object({
    nombre: z
      .string()
      .trim()
      .min(1, 'El nombre de la plantilla es obligatorio')
      .max(150, 'El nombre no puede exceder 150 caracteres'),
    tipoEvento: z.string().trim().max(100).optional().nullable(),
    recursos: z
      .array(
        z.object({
          recursoId: z.coerce.number().int().positive(),
          cantidad: z.coerce.number().int().min(1).max(5000).default(1),
        }),
      )
      .default([]),
  });

  async function listarPlantillas(bd: ReturnType<typeof obtenerPool>, idFiltro?: number) {
    const params: unknown[] = [];
    const filtroSql = idFiltro ? 'AND p.id = $1' : '';
    if (idFiltro) params.push(idFiltro);

    const { rows: plantillasRows } = await bd.query(
      `
      SELECT p.id, p.nombre, p.tipo_evento
      FROM reservas_plantillas_evento p
      WHERE p.activo = TRUE ${filtroSql}
      ORDER BY p.nombre ASC
      `,
      params,
    );

    if (plantillasRows.length === 0) return [];

    const ids = plantillasRows.map((r) => Number(r.id));
    const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(', ');
    const { rows: recRows } = await bd.query(
      `
      SELECT
        pr.plantilla_id,
        pr.recurso_id,
        pr.cantidad,
        c.nombre,
        c.unidad
      FROM reservas_plantilla_recursos pr
      JOIN reservas_recursos_catalogo c ON c.id = pr.recurso_id
      WHERE pr.plantilla_id IN (${placeholders})
        AND c.activo = TRUE
      ORDER BY c.nombre ASC
      `,
      ids,
    );

    const mapaRecs = new Map<
      number,
      Array<{ recursoId: number; nombre: string; unidad: string; cantidad: number }>
    >();
    for (const r of recRows) {
      const pid = Number(r.plantilla_id);
      const lista = mapaRecs.get(pid) ?? [];
      lista.push({
        recursoId: Number(r.recurso_id),
        nombre: String(r.nombre),
        unidad: String(r.unidad),
        cantidad: Number(r.cantidad),
      });
      mapaRecs.set(pid, lista);
    }

    return plantillasRows.map((p) => {
      const id = Number(p.id);
      return {
        id,
        nombre: String(p.nombre),
        tipoEvento: p.tipo_evento ? String(p.tipo_evento) : null,
        recursos: mapaRecs.get(id) ?? [],
      };
    });
  }

  app.get(
    '/api/plantillas-evento',
    { preHandler: [requerirSesionAprobada] },
    async () => {
      return listarPlantillas(obtenerPool());
    },
  );

  app.post(
    '/api/plantillas-evento',
    { preHandler: [requerirSesionAprobada] },
    async (request, reply) => {
      const body = esquemaPlantillaEvento.parse(request.body);
      const usuario = request.usuario!;
      const pool = obtenerPool();

      const plantillaId = await enTransaccion(async (tx) => {
        const resIns = await tx.query(
          `
          INSERT INTO reservas_plantillas_evento (nombre, tipo_evento, activo, creado_por)
          VALUES ($1, $2, TRUE, $3)
          `,
          [body.nombre, body.tipoEvento || null, usuario.sub],
        );
        const nuevoId = Number(resIns.insertId ?? 0);

        for (const r of body.recursos) {
          await tx.query(
            `
            INSERT INTO reservas_plantilla_recursos (plantilla_id, recurso_id, cantidad)
            VALUES ($1, $2, $3)
            ON DUPLICATE KEY UPDATE cantidad = VALUES(cantidad)
            `,
            [nuevoId, r.recursoId, r.cantidad],
          );
        }

        await registrarAuditoria(tx, {
          actorTipo: 'USUARIO_RESERVAS',
          actorId: usuario.sub,
          actorNombre: usuario.nombre,
          accion: 'plantilla_evento.crear',
          entidad: 'reservas_plantillas_evento',
          entidadId: String(nuevoId),
          datosDespues: body,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });

        return nuevoId;
      }, pool);

      const [creada] = await listarPlantillas(pool, plantillaId);
      return reply.status(201).send(creada);
    },
  );

  app.put<{ Params: { id: string } }>(
    '/api/plantillas-evento/:id',
    { preHandler: [requerirSesionAprobada] },
    async (request) => {
      const idNum = Number(request.params.id);
      if (!Number.isInteger(idNum) || idNum <= 0) {
        throw new ErrorApi(400, 'VALIDACION', 'Identificador de plantilla no válido.');
      }
      const body = esquemaPlantillaEvento.parse(request.body);
      const usuario = request.usuario!;
      const pool = obtenerPool();

      await enTransaccion(async (tx) => {
        const { rows } = await tx.query(
          `SELECT id FROM reservas_plantillas_evento WHERE id = $1 AND activo = TRUE LIMIT 1`,
          [idNum],
        );
        if (rows.length === 0) {
          throw new ErrorApi(404, 'NO_ENCONTRADO', 'Plantilla de evento no encontrada.');
        }

        await tx.query(
          `
          UPDATE reservas_plantillas_evento
          SET nombre = $2, tipo_evento = $3, actualizado_en = NOW()
          WHERE id = $1
          `,
          [idNum, body.nombre, body.tipoEvento || null],
        );

        await tx.query(
          `DELETE FROM reservas_plantilla_recursos WHERE plantilla_id = $1`,
          [idNum],
        );

        for (const r of body.recursos) {
          await tx.query(
            `
            INSERT INTO reservas_plantilla_recursos (plantilla_id, recurso_id, cantidad)
            VALUES ($1, $2, $3)
            ON DUPLICATE KEY UPDATE cantidad = VALUES(cantidad)
            `,
            [idNum, r.recursoId, r.cantidad],
          );
        }

        await registrarAuditoria(tx, {
          actorTipo: 'USUARIO_RESERVAS',
          actorId: usuario.sub,
          actorNombre: usuario.nombre,
          accion: 'plantilla_evento.actualizar',
          entidad: 'reservas_plantillas_evento',
          entidadId: String(idNum),
          datosDespues: body,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });
      }, pool);

      const [actualizada] = await listarPlantillas(pool, idNum);
      return actualizada;
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/plantillas-evento/:id',
    { preHandler: [requerirSesionAprobada] },
    async (request, reply) => {
      const idNum = Number(request.params.id);
      if (!Number.isInteger(idNum) || idNum <= 0) {
        throw new ErrorApi(400, 'VALIDACION', 'Identificador de plantilla no válido.');
      }
      const usuario = request.usuario!;
      const pool = obtenerPool();

      await enTransaccion(async (tx) => {
        const { rows } = await tx.query(
          `SELECT id, nombre FROM reservas_plantillas_evento WHERE id = $1 AND activo = TRUE LIMIT 1`,
          [idNum],
        );
        if (rows.length === 0) {
          throw new ErrorApi(404, 'NO_ENCONTRADO', 'Plantilla de evento no encontrada.');
        }

        await tx.query(
          `UPDATE reservas_plantillas_evento SET activo = FALSE, actualizado_en = NOW() WHERE id = $1`,
          [idNum],
        );

        await registrarAuditoria(tx, {
          actorTipo: 'USUARIO_RESERVAS',
          actorId: usuario.sub,
          actorNombre: usuario.nombre,
          accion: 'plantilla_evento.eliminar',
          entidad: 'reservas_plantillas_evento',
          entidadId: String(idNum),
          datosAntes: { nombre: String(rows[0].nombre) },
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });
      }, pool);

      return reply.status(204).send();
    },
  );
}

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { enTransaccion, obtenerPool } from '../bd/pool.js';
import { ErrorApi } from '../errores.js';
import { requerirFirmaIntegracion } from '../seguridad/guardias.js';
import { registrarAuditoria } from '../servicios/auditoria.js';
import { enviarCorreoAprobacionAcceso } from '../servicios/correo.js';

const esquemaAdmin = z.object({
  id: z.string().trim().min(1, 'El id del administrador es obligatorio'),
  nombre: z.string().trim().min(1, 'El nombre del administrador es obligatorio'),
});

const esquemaAprobar = z.object({
  rol: z.enum(['DOCENTE', 'PERSONAL', 'ADMIN_ESPACIOS']),
  motivo: z.string().optional(),
  admin: esquemaAdmin,
});

const esquemaRechazar = z.object({
  motivo: z.string().optional(),
  admin: esquemaAdmin,
});

const esquemaRevocar = z.object({
  motivo: z.string().optional(),
  admin: esquemaAdmin,
});

const esquemaReactivar = z.object({
  rol: z.enum(['DOCENTE', 'PERSONAL', 'ADMIN_ESPACIOS']),
  admin: esquemaAdmin,
});

const esquemaPaginacion = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  tamano: z.coerce.number().int().min(1).max(100).default(20),
});

interface SolicitudAccesoDto {
  id: string;
  googleSub: string;
  nombre: string;
  correo: string;
  fotoUrl: string | null;
  estado: string;
  intentadoEn: string;
  ultimoIntentoEn: string;
  intentos: number;
  expiraEn: string;
  rolAsignado: string | null;
  resueltoPor: { id: string; nombre: string } | null;
  resueltoEn: string | null;
  motivo: string | null;
}

function mapearFilaSolicitud(r: Record<string, unknown>): SolicitudAccesoDto {
  const resueltoPor =
    r.resuelto_por_id || r.resuelto_por_nombre
      ? {
          id: String(r.resuelto_por_id ?? ''),
          nombre: String(r.resuelto_por_nombre ?? ''),
        }
      : null;

  return {
    id: String(r.id),
    googleSub: String(r.google_sub),
    nombre: String(r.nombre),
    correo: String(r.correo),
    fotoUrl: r.foto_url ? String(r.foto_url) : null,
    estado: String(r.estado),
    intentadoEn: new Date(String(r.intentado_en)).toISOString(),
    ultimoIntentoEn: new Date(String(r.ultimo_intento_en)).toISOString(),
    intentos: Number(r.intentos),
    expiraEn: new Date(String(r.expira_en)).toISOString(),
    rolAsignado: r.rol_asignado ? String(r.rol_asignado) : null,
    resueltoPor,
    resueltoEn: r.resuelto_en
      ? new Date(String(r.resuelto_en)).toISOString()
      : null,
    motivo: r.motivo !== null && r.motivo !== undefined ? String(r.motivo) : null,
  };
}

export async function rutasIntegracion(app: FastifyInstance): Promise<void> {
  // 1) GET /api/integracion/v1/solicitudes
  app.get(
    '/api/integracion/v1/solicitudes',
    { preHandler: [requerirFirmaIntegracion] },
    async (request) => {
      const query = z
        .object({
          estado: z
            .enum(['PENDIENTE', 'APROBADA', 'RECHAZADA', 'REVOCADA', 'EXPIRADA', ''])
            .optional()
            .transform((v) => (v === '' ? undefined : v)),
          q: z.string().optional(),
          pagina: z.coerce.number().int().min(1).default(1),
          tamano: z.coerce.number().int().min(1).max(100).default(20),
        })
        .parse(request.query);

      const pool = obtenerPool();
      const condiciones: string[] = [];
      const params: unknown[] = [];

      if (query.estado) {
        params.push(query.estado);
        condiciones.push(`estado = $${params.length}`);
      }

      if (query.q && query.q.trim() !== '') {
        params.push(`%${query.q.trim().toLowerCase()}%`);
        const idx = params.length;
        condiciones.push(`(lower(nombre) LIKE $${idx} OR lower(correo) LIKE $${idx})`);
      }

      const whereSql =
        condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM reservas_solicitudes_acceso ${whereSql}`,
        params,
      );
      const total = Number(countRows[0]?.total ?? 0);

      const offset = (query.pagina - 1) * query.tamano;
      const { rows } = await pool.query(
        `
        SELECT *
        FROM reservas_solicitudes_acceso
        ${whereSql}
        ORDER BY intentado_en DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `,
        [...params, query.tamano, offset],
      );

      return {
        datos: rows.map(mapearFilaSolicitud),
        pagina: query.pagina,
        tamano: query.tamano,
        total,
      };
    },
  );

  // 2) GET /api/integracion/v1/solicitudes/conteo
  app.get(
    '/api/integracion/v1/solicitudes/conteo',
    { preHandler: [requerirFirmaIntegracion] },
    async () => {
      const pool = obtenerPool();
      const { rows } = await pool.query(
        `
        SELECT estado, COUNT(*)::int AS cantidad
        FROM reservas_solicitudes_acceso
        GROUP BY estado
        `,
      );

      const conteo: Record<string, number> = {
        PENDIENTE: 0,
        APROBADA: 0,
        RECHAZADA: 0,
        REVOCADA: 0,
        EXPIRADA: 0,
      };

      for (const r of rows) {
        const est = String(r.estado);
        if (est in conteo) {
          conteo[est] = Number(r.cantidad);
        }
      }

      return conteo;
    },
  );

  // 3) GET /api/integracion/v1/solicitudes/:id
  app.get(
    '/api/integracion/v1/solicitudes/:id',
    { preHandler: [requerirFirmaIntegracion] },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        throw new ErrorApi(404, 'NO_ENCONTRADO', 'Solicitud de acceso no encontrada.');
      }

      const pool = obtenerPool();
      const { rows } = await pool.query(
        `SELECT * FROM reservas_solicitudes_acceso WHERE id = $1::uuid LIMIT 1`,
        [id],
      );

      if (rows.length === 0) {
        throw new ErrorApi(404, 'NO_ENCONTRADO', 'Solicitud de acceso no encontrada.');
      }

      return mapearFilaSolicitud(rows[0]);
    },
  );

  // 4) POST /api/integracion/v1/solicitudes/:id/aprobar
  app.post(
    '/api/integracion/v1/solicitudes/:id/aprobar',
    { preHandler: [requerirFirmaIntegracion] },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        throw new ErrorApi(404, 'NO_ENCONTRADO', 'Solicitud de acceso no encontrada.');
      }
      const body = esquemaAprobar.parse(request.body);
      const pool = obtenerPool();

      const { solicitud, recienAprobada } = await enTransaccion(async (tx) => {
        const { rows } = await tx.query(
          `SELECT * FROM reservas_solicitudes_acceso WHERE id = $1::uuid FOR UPDATE`,
          [id],
        );

        if (rows.length === 0) {
          throw new ErrorApi(
            404,
            'NO_ENCONTRADO',
            'Solicitud de acceso no encontrada.',
          );
        }

        const actual = rows[0];
        if (
          actual.estado === 'APROBADA' &&
          actual.rol_asignado === body.rol
        ) {
          return {
            solicitud: mapearFilaSolicitud(actual),
            recienAprobada: false,
          };
        }

        if (actual.estado !== 'PENDIENTE') {
          throw new ErrorApi(
            409,
            'ESTADO_INVALIDO',
            `No se puede aprobar una solicitud con estado ${String(actual.estado)}.`,
          );
        }

        const { rows: actualizadas } = await tx.query(
          `
          UPDATE reservas_solicitudes_acceso
          SET estado = 'APROBADA',
              rol_asignado = $2,
              resuelto_por_id = $3,
              resuelto_por_nombre = $4,
              resuelto_en = now(),
              motivo = COALESCE($5, motivo)
          WHERE id = $1::uuid
          RETURNING *
          `,
          [
            id,
            body.rol,
            body.admin.id,
            body.admin.nombre,
            body.motivo ?? null,
          ],
        );

        await tx.query(
          `
          UPDATE reservas_usuarios
          SET estado = 'APROBADA',
              rol = $2,
              actualizado_en = now()
          WHERE google_sub = $1
          `,
          [actual.google_sub, body.rol],
        );

        await registrarAuditoria(tx, {
          actorTipo: 'ADMIN_PRINCIPAL',
          actorId: body.admin.id,
          actorNombre: body.admin.nombre,
          accion: 'solicitud.aprobar',
          entidad: 'reservas_solicitudes_acceso',
          entidadId: id,
          datosAntes: { estado: String(actual.estado) },
          datosDespues: {
            estado: 'APROBADA',
            rolAsignado: body.rol,
            googleSub: String(actual.google_sub),
          },
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });

        return {
          solicitud: mapearFilaSolicitud(actualizadas[0]),
          recienAprobada: true,
        };
      }, pool);

      if (recienAprobada) {
        try {
          await enviarCorreoAprobacionAcceso({
            para: solicitud.correo,
            nombre: solicitud.nombre,
            rol: body.rol,
          });
        } catch (err) {
          request.log.error(
            { err, solicitudId: solicitud.id },
            'No se pudo enviar correo de aprobación de acceso',
          );
        }
      }

      return solicitud;
    },
  );

  // 5) POST /api/integracion/v1/solicitudes/:id/rechazar
  app.post(
    '/api/integracion/v1/solicitudes/:id/rechazar',
    { preHandler: [requerirFirmaIntegracion] },
    async (request) => {
      const { id } = request.params as { id: string };
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        throw new ErrorApi(404, 'NO_ENCONTRADO', 'Solicitud de acceso no encontrada.');
      }
      const body = esquemaRechazar.parse(request.body);
      const pool = obtenerPool();

      return enTransaccion(async (tx) => {
        const { rows } = await tx.query(
          `SELECT * FROM reservas_solicitudes_acceso WHERE id = $1::uuid FOR UPDATE`,
          [id],
        );

        if (rows.length === 0) {
          throw new ErrorApi(
            404,
            'NO_ENCONTRADO',
            'Solicitud de acceso no encontrada.',
          );
        }

        const actual = rows[0];
        if (actual.estado === 'RECHAZADA') {
          return mapearFilaSolicitud(actual);
        }

        if (actual.estado !== 'PENDIENTE') {
          throw new ErrorApi(
            409,
            'ESTADO_INVALIDO',
            `No se puede rechazar una solicitud con estado ${String(actual.estado)}.`,
          );
        }

        const { rows: actualizadas } = await tx.query(
          `
          UPDATE reservas_solicitudes_acceso
          SET estado = 'RECHAZADA',
              resuelto_por_id = $2,
              resuelto_por_nombre = $3,
              resuelto_en = now(),
              motivo = $4
          WHERE id = $1::uuid
          RETURNING *
          `,
          [id, body.admin.id, body.admin.nombre, body.motivo ?? null],
        );

        await tx.query(
          `
          UPDATE reservas_usuarios
          SET estado = 'RECHAZADA',
              rol = NULL,
              actualizado_en = now()
          WHERE google_sub = $1
          `,
          [actual.google_sub],
        );

        await tx.query(
          `
          UPDATE reservas_sesiones
          SET revocada_en = now()
          WHERE google_sub = $1 AND revocada_en IS NULL
          `,
          [actual.google_sub],
        );

        await registrarAuditoria(tx, {
          actorTipo: 'ADMIN_PRINCIPAL',
          actorId: body.admin.id,
          actorNombre: body.admin.nombre,
          accion: 'solicitud.rechazar',
          entidad: 'reservas_solicitudes_acceso',
          entidadId: id,
          datosAntes: { estado: String(actual.estado) },
          datosDespues: {
            estado: 'RECHAZADA',
            motivo: body.motivo ?? null,
          },
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });

        return mapearFilaSolicitud(actualizadas[0]);
      }, pool);
    },
  );

  // 6) POST /api/integracion/v1/usuarios/:sub/revocar
  app.post(
    '/api/integracion/v1/usuarios/:sub/revocar',
    { preHandler: [requerirFirmaIntegracion] },
    async (request) => {
      const { sub } = request.params as { sub: string };
      const body = esquemaRevocar.parse(request.body);
      const pool = obtenerPool();

      return enTransaccion(async (tx) => {
        const { rows: usuRows } = await tx.query(
          `SELECT * FROM reservas_usuarios WHERE google_sub = $1 FOR UPDATE`,
          [sub],
        );

        if (usuRows.length === 0) {
          throw new ErrorApi(404, 'NO_ENCONTRADO', 'Usuario no encontrado.');
        }

        const usuarioActual = usuRows[0];

        const { rows: usuActualizados } = await tx.query(
          `
          UPDATE reservas_usuarios
          SET estado = 'REVOCADA',
              rol = NULL,
              actualizado_en = now()
          WHERE google_sub = $1
          RETURNING google_sub, nombre, correo, foto_url, rol, estado, actualizado_en
          `,
          [sub],
        );

        await tx.query(
          `
          UPDATE reservas_solicitudes_acceso
          SET estado = 'REVOCADA',
              resuelto_por_id = $2,
              resuelto_por_nombre = $3,
              resuelto_en = now(),
              motivo = COALESCE($4, motivo)
          WHERE id = (
            SELECT id
            FROM reservas_solicitudes_acceso
            WHERE google_sub = $1
            ORDER BY intentado_en DESC
            LIMIT 1
          )
          `,
          [sub, body.admin.id, body.admin.nombre, body.motivo ?? null],
        );

        await tx.query(
          `
          UPDATE reservas_sesiones
          SET revocada_en = now()
          WHERE google_sub = $1 AND revocada_en IS NULL
          `,
          [sub],
        );

        await registrarAuditoria(tx, {
          actorTipo: 'ADMIN_PRINCIPAL',
          actorId: body.admin.id,
          actorNombre: body.admin.nombre,
          accion: 'usuario.revocar',
          entidad: 'reservas_usuarios',
          entidadId: sub,
          datosAntes: {
            estado: String(usuarioActual.estado),
            rol: usuarioActual.rol ? String(usuarioActual.rol) : null,
          },
          datosDespues: {
            estado: 'REVOCADA',
            motivo: body.motivo ?? null,
          },
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });

        const u = usuActualizados[0];
        return {
          googleSub: String(u.google_sub),
          nombre: String(u.nombre),
          correo: String(u.correo),
          fotoUrl: u.foto_url ? String(u.foto_url) : null,
          rol: null,
          estado: String(u.estado),
          actualizadoEn: new Date(u.actualizado_en).toISOString(),
        };
      }, pool);
    },
  );

  // 7) POST /api/integracion/v1/usuarios/:sub/reactivar
  app.post(
    '/api/integracion/v1/usuarios/:sub/reactivar',
    { preHandler: [requerirFirmaIntegracion] },
    async (request) => {
      const { sub } = request.params as { sub: string };
      const body = esquemaReactivar.parse(request.body);
      const pool = obtenerPool();

      return enTransaccion(async (tx) => {
        const { rows: usuRows } = await tx.query(
          `SELECT * FROM reservas_usuarios WHERE google_sub = $1 FOR UPDATE`,
          [sub],
        );

        if (usuRows.length === 0) {
          throw new ErrorApi(404, 'NO_ENCONTRADO', 'Usuario no encontrado.');
        }

        const usuarioActual = usuRows[0];
        if (
          usuarioActual.estado === 'APROBADA' &&
          usuarioActual.rol === body.rol
        ) {
          return {
            googleSub: String(usuarioActual.google_sub),
            nombre: String(usuarioActual.nombre),
            correo: String(usuarioActual.correo),
            fotoUrl: usuarioActual.foto_url ? String(usuarioActual.foto_url) : null,
            rol: String(usuarioActual.rol),
            estado: String(usuarioActual.estado),
            actualizadoEn: new Date(usuarioActual.actualizado_en).toISOString(),
          };
        }

        if (usuarioActual.estado !== 'REVOCADA') {
          throw new ErrorApi(
            409,
            'ESTADO_INVALIDO',
            `Solo se pueden reactivar cuentas en estado REVOCADA (estado actual: ${String(usuarioActual.estado)}).`,
          );
        }

        const { rows: usuActualizados } = await tx.query(
          `
          UPDATE reservas_usuarios
          SET estado = 'APROBADA',
              rol = $2,
              actualizado_en = now()
          WHERE google_sub = $1
          RETURNING google_sub, nombre, correo, foto_url, rol, estado, actualizado_en
          `,
          [sub, body.rol],
        );

        await tx.query(
          `
          UPDATE reservas_solicitudes_acceso
          SET estado = 'APROBADA',
              rol_asignado = $2,
              resuelto_por_id = $3,
              resuelto_por_nombre = $4,
              resuelto_en = now()
          WHERE id = (
            SELECT id
            FROM reservas_solicitudes_acceso
            WHERE google_sub = $1
            ORDER BY intentado_en DESC
            LIMIT 1
          )
          `,
          [sub, body.rol, body.admin.id, body.admin.nombre],
        );

        await registrarAuditoria(tx, {
          actorTipo: 'ADMIN_PRINCIPAL',
          actorId: body.admin.id,
          actorNombre: body.admin.nombre,
          accion: 'usuario.reactivar',
          entidad: 'reservas_usuarios',
          entidadId: sub,
          datosAntes: { estado: String(usuarioActual.estado) },
          datosDespues: { estado: 'APROBADA', rol: body.rol },
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });

        const u = usuActualizados[0];
        return {
          googleSub: String(u.google_sub),
          nombre: String(u.nombre),
          correo: String(u.correo),
          fotoUrl: u.foto_url ? String(u.foto_url) : null,
          rol: String(u.rol),
          estado: String(u.estado),
          actualizadoEn: new Date(u.actualizado_en).toISOString(),
        };
      }, pool);
    },
  );

  // 8) GET /api/integracion/v1/usuarios
  app.get(
    '/api/integracion/v1/usuarios',
    { preHandler: [requerirFirmaIntegracion] },
    async (request) => {
      const query = z
        .object({
          estado: z
            .enum(['PENDIENTE', 'APROBADA', 'RECHAZADA', 'REVOCADA', 'EXPIRADA', ''])
            .optional()
            .transform((v) => (v === '' ? undefined : v)),
          q: z.string().optional(),
          pagina: z.coerce.number().int().min(1).default(1),
          tamano: z.coerce.number().int().min(1).max(100).default(20),
        })
        .parse(request.query);

      const pool = obtenerPool();
      const condiciones: string[] = [];
      const params: unknown[] = [];

      if (query.estado) {
        params.push(query.estado);
        condiciones.push(`estado = $${params.length}`);
      }

      if (query.q && query.q.trim() !== '') {
        params.push(`%${query.q.trim().toLowerCase()}%`);
        const idx = params.length;
        condiciones.push(`(lower(nombre) LIKE $${idx} OR lower(correo) LIKE $${idx})`);
      }

      const whereSql =
        condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM reservas_usuarios ${whereSql}`,
        params,
      );
      const total = Number(countRows[0]?.total ?? 0);

      const offset = (query.pagina - 1) * query.tamano;
      const { rows } = await pool.query(
        `
        SELECT google_sub, correo, nombre, foto_url, rol, estado, creado_en, actualizado_en, ultimo_acceso_en
        FROM reservas_usuarios
        ${whereSql}
        ORDER BY creado_en DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `,
        [...params, query.tamano, offset],
      );

      return {
        datos: rows.map((u) => ({
          googleSub: String(u.google_sub),
          correo: String(u.correo),
          nombre: String(u.nombre),
          fotoUrl: u.foto_url ? String(u.foto_url) : null,
          rol: u.rol ? String(u.rol) : null,
          estado: String(u.estado),
          creadoEn: new Date(u.creado_en).toISOString(),
          actualizadoEn: new Date(u.actualizado_en).toISOString(),
          ultimoAccesoEn: u.ultimo_acceso_en
            ? new Date(u.ultimo_acceso_en).toISOString()
            : null,
        })),
        pagina: query.pagina,
        tamano: query.tamano,
        total,
      };
    },
  );

  // 9) GET /api/integracion/v1/bitacora
  app.get(
    '/api/integracion/v1/bitacora',
    { preHandler: [requerirFirmaIntegracion] },
    async (request) => {
      const query = esquemaPaginacion
        .extend({
          desde: z.string().optional(),
          hasta: z.string().optional(),
          accion: z.string().optional(),
        })
        .parse(request.query);

      const pool = obtenerPool();
      const condiciones: string[] = [];
      const params: unknown[] = [];

      if (query.desde) {
        params.push(new Date(query.desde).toISOString());
        condiciones.push(`ocurrido_en >= $${params.length}::timestamptz`);
      }

      if (query.hasta) {
        params.push(new Date(query.hasta).toISOString());
        condiciones.push(`ocurrido_en <= $${params.length}::timestamptz`);
      }

      if (query.accion && query.accion.trim() !== '') {
        params.push(query.accion.trim());
        condiciones.push(`accion = $${params.length}`);
      }

      const whereSql =
        condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM reservas_auditoria ${whereSql}`,
        params,
      );
      const total = Number(countRows[0]?.total ?? 0);

      const offset = (query.pagina - 1) * query.tamano;
      const { rows } = await pool.query(
        `
        SELECT id, ocurrido_en, actor_tipo, actor_id, actor_nombre, accion, entidad, entidad_id, datos_antes, datos_despues, ip
        FROM reservas_auditoria
        ${whereSql}
        ORDER BY ocurrido_en DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `,
        [...params, query.tamano, offset],
      );

      return {
        datos: rows.map((r) => ({
          id: Number(r.id),
          ocurridoEn: new Date(r.ocurrido_en).toISOString(),
          actorTipo: String(r.actor_tipo),
          actorId: r.actor_id ? String(r.actor_id) : null,
          actorNombre: r.actor_nombre ? String(r.actor_nombre) : null,
          accion: String(r.accion),
          entidad: String(r.entidad),
          entidadId: r.entidad_id ? String(r.entidad_id) : null,
          datosAntes: r.datos_antes ?? null,
          datosDespues: r.datos_despues ?? null,
          ip: r.ip ? String(r.ip) : null,
        })),
        pagina: query.pagina,
        tamano: query.tamano,
        total,
      };
    },
  );

  // 10) GET /api/integracion/v1/ocupacion
  app.get(
    '/api/integracion/v1/ocupacion',
    { preHandler: [requerirFirmaIntegracion] },
    async (request) => {
      const query = z
        .object({
          desde: z.string().min(1, 'El parámetro desde es obligatorio'),
          hasta: z.string().min(1, 'El parámetro hasta es obligatorio'),
          espacioId: z.string().optional(),
        })
        .parse(request.query);

      const desde = new Date(query.desde);
      const hasta = new Date(query.hasta);
      if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
        throw new ErrorApi(
          400,
          'VALIDACION',
          'Las fechas desde y hasta deben ser válidas.',
        );
      }

      const pool = obtenerPool();
      const params: unknown[] = [desde.toISOString(), hasta.toISOString()];
      let filtroEspacio = '';
      if (query.espacioId && query.espacioId.trim() !== '') {
        params.push(query.espacioId.trim());
        filtroEspacio = `AND espacio_id = $3`;
      }

      const { rows } = await pool.query(
        `
        SELECT id, codigo, tipo_evento, espacio_id, espacio_nombre, nombre_evento, responsable, inicio, fin
        FROM reservas_reservaciones
        WHERE estado = 'PROGRAMADA'
          AND inicio < $2::timestamptz
          AND fin > $1::timestamptz
          ${filtroEspacio}
        ORDER BY inicio ASC
        `,
        params,
      );

      return rows.map((r) => ({
        id: String(r.id),
        codigo: String(r.codigo),
        tipoEvento: String(r.tipo_evento),
        espacioId: String(r.espacio_id),
        espacioNombre: String(r.espacio_nombre),
        nombreEvento: String(r.nombre_evento),
        responsable: String(r.responsable),
        inicio: new Date(r.inicio).toISOString(),
        fin: new Date(r.fin).toISOString(),
      }));
    },
  );
}

import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { enTransaccion, obtenerPool } from '../bd/pool.js';
import { ErrorApi } from '../errores.js';
import { obtenerEspacio } from '../principal/adaptador.js';
import { requerirSesionAprobada } from '../seguridad/guardias.js';
import {
  describirAccionHistorial,
  registrarAuditoria,
} from '../servicios/auditoria.js';
import { obtenerConfiguracionSistema } from '../servicios/configuracionBd.js';
import {
  adquirirCandadoEspacio,
  buscarConflictosHorario,
  calcularEnviarEn,
} from '../servicios/conflictos.js';
import {
  generarCsvReservaciones,
  generarXlsxReservaciones,
} from '../servicios/exportador.js';
import { generarHtmlExpediente } from '../servicios/reimpresion.js';
import {
  consultarReservaciones,
  generarCodigoReservacion,
  obtenerReservacionDetalle,
  verificarPermisoExpediente,
} from '../servicios/reservaciones.js';

const esquemaFiltrosListado = z.object({
  q: z.string().optional(),
  espacioId: z.string().optional(),
  estado: z
    .enum(['PENDIENTE', 'REALIZADA', 'CANCELADA', ''])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  tamano: z.coerce.number().int().min(1).max(100).default(20),
  orden: z.string().optional().default('inicio_desc'),
  formato: z.enum(['csv', 'xlsx']).optional(),
});

const esquemaDisponibilidad = z.object({
  espacioId: z.string().trim().min(1, 'El espacio es obligatorio'),
  inicio: z.string().min(1, 'La fecha de inicio es obligatoria'),
  fin: z.string().min(1, 'La fecha de fin es obligatoria'),
  excluirId: z.string().uuid().optional(),
});

const esquemaCrearReservacion = z.object({
  tipoEvento: z
    .string()
    .trim()
    .min(1, 'El tipo de evento es obligatorio')
    .max(100, 'El tipo de evento no puede exceder 100 caracteres'),
  espacioId: z.string().trim().min(1, 'El espacio es obligatorio'),
  nombreEvento: z
    .string()
    .trim()
    .min(1, 'El nombre del evento es obligatorio')
    .max(200, 'El nombre del evento no puede exceder 200 caracteres'),
  codigo: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  inicio: z.string().min(1, 'La fecha de inicio es obligatoria'),
  fin: z.string().min(1, 'La fecha de fin es obligatoria'),
  responsable: z
    .string()
    .trim()
    .min(1, 'El nombre del responsable es obligatorio')
    .max(160),
  correoResponsable: z
    .string()
    .trim()
    .optional()
    .default('')
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: 'El correo del responsable no es válido',
    }),
  descripcion: z.string().optional().default(''),
  observaciones: z.string().optional().default(''),
  asistentesEstimados: z
    .number()
    .int()
    .min(0, 'Los asistentes estimados no pueden ser negativos')
    .nullable()
    .optional()
    .default(null),
  acomodoMobiliario: z
    .string()
    .trim()
    .max(255, 'El acomodo de mobiliario no puede exceder 255 caracteres')
    .optional()
    .default(''),
  sillasMesaPanel: z.coerce
    .number()
    .int()
    .min(0, 'Las sillas para mesa panel no pueden ser negativas')
    .max(500, 'Cantidad de sillas para mesa panel no válida')
    .optional()
    .default(0),
  recursos: z
    .array(
      z.object({
        recursoId: z.number().int().positive(),
        cantidad: z.number().int().min(1).max(10000),
      }),
    )
    .optional()
    .default([]),
  recordatorios: z
    .array(
      z.object({
        canal: z.enum(['SIPREF', 'CORREO']),
        anticipacion: z.number().int().min(1).max(365),
        unidad: z.enum(['MINUTOS', 'HORAS', 'DIAS']),
      }),
    )
    .max(5, 'Se permiten como máximo 5 recordatorios por reservación')
    .optional()
    .default([]),
});

const esquemaReagendar = z.object({
  inicio: z.string().min(1, 'La nueva fecha de inicio es obligatoria'),
  fin: z.string().min(1, 'La nueva fecha de fin es obligatoria'),
  espacioId: z.string().trim().min(1).optional(),
  version: z.number().int().min(1, 'La versión es obligatoria'),
});

const esquemaCancelar = z.object({
  motivo: z
    .string()
    .trim()
    .min(1, 'Debe indicar el motivo de la cancelación')
    .max(500),
});

function validarRangoHorario(
  inicioIso: string,
  finIso: string,
  exigirFuturo: boolean,
): { inicio: Date; fin: Date } {
  const inicio = new Date(inicioIso);
  const fin = new Date(finIso);

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
    throw new ErrorApi(
      400,
      'VALIDACION',
      'Las fechas de inicio y fin deben estar en formato ISO 8601 válido.',
      { campos: { inicio: 'Fecha inválida', fin: 'Fecha inválida' } },
    );
  }

  if (fin.getTime() <= inicio.getTime()) {
    throw new ErrorApi(
      400,
      'VALIDACION',
      'La hora de término debe ser posterior a la hora de inicio.',
      { campos: { fin: 'Debe ser posterior al inicio' } },
    );
  }

  const duracionMs = fin.getTime() - inicio.getTime();
  if (duracionMs > 24 * 60 * 60 * 1000) {
    throw new ErrorApi(
      400,
      'VALIDACION',
      'La duración de una reservación no puede exceder 24 horas.',
      { campos: { fin: 'Duración máxima de 24 horas' } },
    );
  }

  if (exigirFuturo && inicio.getTime() < Date.now() - 60_000) {
    throw new ErrorApi(
      400,
      'VALIDACION',
      'La fecha y hora de inicio debe estar en el futuro.',
      { campos: { inicio: 'No se pueden crear ni reagendar eventos en el pasado' } },
    );
  }

  return { inicio, fin };
}

function validarUuidParam(id: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    throw new ErrorApi(404, 'NO_ENCONTRADO', 'La reservación solicitada no existe.');
  }
  return id;
}

export async function rutasReservaciones(app: FastifyInstance): Promise<void> {
  // 1) Listado paginado de reservaciones
  app.get(
    '/api/reservaciones',
    { preHandler: [requerirSesionAprobada] },
    async (request) => {
      const f = esquemaFiltrosListado.parse(request.query);
      const desde = f.desde ? new Date(f.desde) : undefined;
      const hasta = f.hasta ? new Date(f.hasta) : undefined;

      const { datos, total } = await consultarReservaciones(
        obtenerPool(),
        request.usuario!,
        {
          q: f.q,
          espacioId: f.espacioId,
          estado: f.estado,
          desde: desde && !Number.isNaN(desde.getTime()) ? desde : undefined,
          hasta: hasta && !Number.isNaN(hasta.getTime()) ? hasta : undefined,
          pagina: f.pagina,
          tamano: f.tamano,
          orden: f.orden,
        },
      );

      return {
        datos,
        pagina: f.pagina,
        tamano: f.tamano,
        total,
      };
    },
  );

  // 2) Exportar reservaciones (CSV con BOM o XLSX)
  app.get(
    '/api/reservaciones/exportar',
    { preHandler: [requerirSesionAprobada] },
    async (request, reply) => {
      const f = esquemaFiltrosListado.parse(request.query);
      const formato = f.formato ?? 'csv';
      const desde = f.desde ? new Date(f.desde) : undefined;
      const hasta = f.hasta ? new Date(f.hasta) : undefined;

      const { datos } = await consultarReservaciones(
        obtenerPool(),
        request.usuario!,
        {
          q: f.q,
          espacioId: f.espacioId,
          estado: f.estado,
          desde: desde && !Number.isNaN(desde.getTime()) ? desde : undefined,
          hasta: hasta && !Number.isNaN(hasta.getTime()) ? hasta : undefined,
          pagina: 1,
          tamano: 100,
          orden: f.orden,
          sinPaginar: true,
        },
      );

      if (formato === 'xlsx') {
        const buffer = await generarXlsxReservaciones(datos);
        return reply
          .header(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          )
          .header(
            'Content-Disposition',
            'attachment; filename="reservaciones.xlsx"',
          )
          .send(buffer);
      }

      const csv = generarCsvReservaciones(datos);
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header(
          'Content-Disposition',
          'attachment; filename="reservaciones.csv"',
        )
        .send(csv);
    },
  );

  // 3) Verificación informativa de disponibilidad
  app.post(
    '/api/reservaciones/disponibilidad',
    { preHandler: [requerirSesionAprobada] },
    async (request) => {
      const body = esquemaDisponibilidad.parse(request.body);
      const { inicio, fin } = validarRangoHorario(body.inicio, body.fin, false);
      const pool = obtenerPool();
      const cfgSistema = await obtenerConfiguracionSistema(pool);

      const conflictos = await buscarConflictosHorario(pool, {
        espacioId: body.espacioId,
        inicio,
        fin,
        bufferMinutos: cfgSistema.bufferMinutos,
        excluirReservacionId: body.excluirId,
      });

      return {
        disponible: conflictos.length === 0,
        bufferMinutos: cfgSistema.bufferMinutos,
        conflictos,
      };
    },
  );

  // 4) Crear reservación
  app.post(
    '/api/reservaciones',
    { preHandler: [requerirSesionAprobada] },
    async (request, reply) => {
      const body = esquemaCrearReservacion.parse(request.body);
      const { inicio, fin } = validarRangoHorario(body.inicio, body.fin, true);
      const usuario = request.usuario!;
      const pool = obtenerPool();
      const cfgSistema = await obtenerConfiguracionSistema(pool);

      const detalleCreado = await enTransaccion(async (tx) => {
        const espacio = await obtenerEspacio(body.espacioId, tx);
        if (!espacio) {
          throw new ErrorApi(
            400,
            'VALIDACION',
            'El espacio seleccionado no existe o no está activo en SIPREF.',
            { campos: { espacioId: 'Espacio no encontrado en SIPREF' } },
          );
        }
        if (!espacio.esExclusivaReservas) {
          throw new ErrorApi(
            400,
            'VALIDACION',
            'Este espacio no está habilitado como zona exclusiva para reservaciones.',
            {
              campos: {
                espacioId:
                  'Este espacio no está habilitado como zona exclusiva para reservaciones.',
              },
            },
          );
        }

        // Candado transaccional por espacio (serializa concurrencia sobre el mismo espacio)
        await adquirirCandadoEspacio(tx, espacio.id);

        const conflictos = await buscarConflictosHorario(tx, {
          espacioId: espacio.id,
          inicio,
          fin,
          bufferMinutos: cfgSistema.bufferMinutos,
        });

        if (conflictos.length > 0) {
          throw new ErrorApi(
            409,
            'CONFLICTO_HORARIO',
            'El espacio seleccionado no está disponible en el horario indicado (considerando los minutos de separación entre eventos).',
            {
              bufferMinutos: cfgSistema.bufferMinutos,
              conflictos,
            },
          );
        }

        // Consolidar y validar recursos existentes
        const mapaRecursos = new Map<number, number>();
        for (const item of body.recursos) {
          mapaRecursos.set(
            item.recursoId,
            (mapaRecursos.get(item.recursoId) ?? 0) + item.cantidad,
          );
        }

        if (mapaRecursos.size > 0) {
          const idsRecursos = Array.from(mapaRecursos.keys());
          const placeholders = idsRecursos.map((_, idx) => `$${idx + 1}`).join(', ');
          const { rows: catRows } = await tx.query(
            `SELECT id FROM reservas_recursos_catalogo WHERE id IN (${placeholders}) AND activo = TRUE`,
            idsRecursos,
          );
          if (catRows.length !== idsRecursos.length) {
            throw new ErrorApi(
              400,
              'VALIDACION',
              'Uno o más recursos solicitados no existen en el catálogo.',
              { campos: { recursos: 'Recurso inválido o inactivo' } },
            );
          }
        }

        const codigo =
          body.codigo ?? (await generarCodigoReservacion(tx, inicio));

        const reservacionId = crypto.randomUUID();
        try {
          await tx.query(
            `
            INSERT INTO reservas_reservaciones (
              id,
              codigo,
              tipo_evento,
              espacio_id,
              espacio_nombre,
              nombre_evento,
              inicio,
              fin,
              responsable,
              correo_responsable,
              descripcion,
              observaciones,
              asistentes_estimados,
              acomodo_mobiliario,
              sillas_mesa_panel,
              estado,
              creado_por
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'PROGRAMADA', $16)
            `,
            [
              reservacionId,
              codigo,
              body.tipoEvento,
              espacio.id,
              espacio.nombre,
              body.nombreEvento,
              inicio,
              fin,
              body.responsable,
              body.correoResponsable || null,
              body.descripcion || null,
              body.observaciones || null,
              body.asistentesEstimados,
              body.acomodoMobiliario || null,
              body.sillasMesaPanel,
              usuario.sub,
            ],
          );
        } catch (err: unknown) {
          const pgErr = err as { code?: string };
          if (pgErr.code === '23505' || pgErr.code === 'ER_DUP_ENTRY') {
            throw new ErrorApi(
              409,
              'DUPLICADO',
              'Ya existe una reservación con el código indicado.',
            );
          }
          if (pgErr.code === '23P01') {
            throw new ErrorApi(
              409,
              'CONFLICTO_HORARIO',
              'El espacio presenta un conflicto de horario con otra reservación.',
              { bufferMinutos: cfgSistema.bufferMinutos, conflictos: [] },
            );
          }
          throw err;
        }

        for (const [recursoId, cantidad] of mapaRecursos.entries()) {
          await tx.query(
            `
            INSERT INTO reservas_recursos_evento (reservacion_id, recurso_id, cantidad)
            VALUES ($1, $2, $3)
            `,
            [reservacionId, recursoId, cantidad],
          );
        }

        for (const rec of body.recordatorios) {
          const enviarEn = calcularEnviarEn(
            inicio,
            rec.anticipacion,
            rec.unidad,
          );
          await tx.query(
            `
            INSERT INTO reservas_recordatorios (reservacion_id, canal, anticipacion, unidad, enviar_en)
            VALUES ($1, $2, $3, $4, $5)
            `,
            [
              reservacionId,
              rec.canal,
              rec.anticipacion,
              rec.unidad,
              enviarEn,
            ],
          );
        }

        const { detalle } = await obtenerReservacionDetalle(tx, reservacionId);

        await registrarAuditoria(tx, {
          actorTipo: 'USUARIO_RESERVAS',
          actorId: usuario.sub,
          actorNombre: usuario.nombre,
          accion: 'reservacion.crear',
          entidad: 'reservas_reservaciones',
          entidadId: reservacionId,
          datosAntes: null,
          datosDespues: {
            codigo: detalle.codigo,
            espacioId: detalle.espacioId,
            espacioNombre: detalle.espacioNombre,
            tipoEvento: detalle.tipoEvento,
            nombreEvento: detalle.nombreEvento,
            inicio: detalle.inicio,
            fin: detalle.fin,
            responsable: detalle.responsable,
            correoResponsable: detalle.correoResponsable,
            descripcion: detalle.descripcion,
            recursos: detalle.recursos,
            acomodoMobiliario: detalle.acomodoMobiliario,
            sillasMesaPanel: detalle.sillasMesaPanel,
            creadoPor: usuario.sub,
            creadoPorNombre: usuario.nombre,
            creadoEn: detalle.creadoEn,
          },
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });

        return detalle;
      }, pool);

      return reply.status(201).send(detalleCreado);
    },
  );

  // 5) Detalle de una reservación (cualquier usuario autenticado puede consultar en modo lectura)
  app.get(
    '/api/reservaciones/:id',
    { preHandler: [requerirSesionAprobada] },
    async (request) => {
      const { id } = request.params as { id: string };
      validarUuidParam(id);
      const { detalle } = await obtenerReservacionDetalle(obtenerPool(), id);
      return detalle;
    },
  );

  // 6) Historial de auditoría de una reservación
  app.get(
    '/api/reservaciones/:id/historial',
    { preHandler: [requerirSesionAprobada] },
    async (request) => {
      const { id } = request.params as { id: string };
      validarUuidParam(id);
      const pool = obtenerPool();
      await obtenerReservacionDetalle(pool, id);

      const { rows } = await pool.query(
        `
        SELECT ocurrido_en, actor_nombre, accion, datos_antes, datos_despues
        FROM reservas_auditoria
        WHERE entidad = 'reservas_reservaciones'
          AND entidad_id = $1
        ORDER BY ocurrido_en DESC
        `,
        [id],
      );

      return rows.map((r) => ({
        ocurridoEn: new Date(r.ocurrido_en).toISOString(),
        actorNombre: String(r.actor_nombre ?? 'Sistema'),
        accion: String(r.accion),
        descripcion: describirAccionHistorial(
          String(r.accion),
          (r.datos_antes as Record<string, unknown> | null) ?? null,
          (r.datos_despues as Record<string, unknown> | null) ?? null,
        ),
      }));
    },
  );

  // 7) Reagendar reservación (bloqueado para directores/solicitantes una vez enviada)
  app.patch(
    '/api/reservaciones/:id/reagendar',
    { preHandler: [requerirSesionAprobada] },
    async (request) => {
      const usuario = request.usuario!;
      if (usuario.rol !== 'ADMIN_ESPACIOS') {
        throw new ErrorApi(
          403,
          'PROHIBIDO',
          'No es posible modificar una reservación ya enviada. Contacte a Prefectura.',
        );
      }

      const { id } = request.params as { id: string };
      validarUuidParam(id);
      const body = esquemaReagendar.parse(request.body);
      const { inicio, fin } = validarRangoHorario(body.inicio, body.fin, true);
      const pool = obtenerPool();
      const cfgSistema = await obtenerConfiguracionSistema(pool);

      return enTransaccion(async (tx) => {
        const { rows: actuales } = await tx.query(
          `
          SELECT id, espacio_id, espacio_nombre, inicio, fin, estado, creado_por, version
          FROM reservas_reservaciones
          WHERE id = $1
          FOR UPDATE
          `,
          [id],
        );

        if (actuales.length === 0) {
          throw new ErrorApi(404, 'NO_ENCONTRADO', 'La reservación solicitada no existe.');
        }

        const actual = actuales[0];
        verificarPermisoExpediente(usuario, String(actual.creado_por));

        if (actual.estado !== 'PROGRAMADA') {
          throw new ErrorApi(
            409,
            'ESTADO_INVALIDO',
            'No es posible reagendar una reservación cancelada.',
          );
        }

        if (Number(actual.version) !== body.version) {
          throw new ErrorApi(
            409,
            'VERSION_DESACTUALIZADA',
            'La reservación fue modificada por otro usuario. Recargue los datos e intente nuevamente.',
          );
        }

        const nuevoEspacioId = body.espacioId ?? String(actual.espacio_id);
        const espacio = await obtenerEspacio(nuevoEspacioId, tx);
        if (!espacio) {
          throw new ErrorApi(
            400,
            'VALIDACION',
            'El espacio seleccionado no existe o no está activo en SIPREF.',
            { campos: { espacioId: 'Espacio no encontrado en SIPREF' } },
          );
        }
        if (
          body.espacioId &&
          body.espacioId !== String(actual.espacio_id) &&
          !espacio.esExclusivaReservas
        ) {
          throw new ErrorApi(
            400,
            'VALIDACION',
            'Este espacio no está habilitado como zona exclusiva para reservaciones.',
            {
              campos: {
                espacioId:
                  'Este espacio no está habilitado como zona exclusiva para reservaciones.',
              },
            },
          );
        }

        await adquirirCandadoEspacio(tx, espacio.id);

        const conflictos = await buscarConflictosHorario(tx, {
          espacioId: espacio.id,
          inicio,
          fin,
          bufferMinutos: cfgSistema.bufferMinutos,
          excluirReservacionId: id,
        });

        if (conflictos.length > 0) {
          throw new ErrorApi(
            409,
            'CONFLICTO_HORARIO',
            'El nuevo horario presenta conflictos con otros eventos o tiempos de preparación.',
            {
              bufferMinutos: cfgSistema.bufferMinutos,
              conflictos,
            },
          );
        }

        await tx.query(
          `
          UPDATE reservas_reservaciones
          SET espacio_id = $2,
              espacio_nombre = $3,
              inicio = $4,
              fin = $5,
              actualizado_en = NOW(),
              version = version + 1
          WHERE id = $1
          `,
          [
            id,
            espacio.id,
            espacio.nombre,
            inicio,
            fin,
          ],
        );

        // Recalcular enviar_en de los recordatorios no enviados
        const { rows: recPendientes } = await tx.query(
          `
          SELECT id, anticipacion, unidad
          FROM reservas_recordatorios
          WHERE reservacion_id = $1 AND enviado_en IS NULL
          `,
          [id],
        );

        for (const rec of recPendientes) {
          const nuevoEnviarEn = calcularEnviarEn(
            inicio,
            Number(rec.anticipacion),
            rec.unidad as 'MINUTOS' | 'HORAS' | 'DIAS',
          );
          await tx.query(
            `UPDATE reservas_recordatorios SET enviar_en = $2 WHERE id = $1`,
            [rec.id, nuevoEnviarEn],
          );
        }

        await registrarAuditoria(tx, {
          actorTipo: 'USUARIO_RESERVAS',
          actorId: usuario.sub,
          actorNombre: usuario.nombre,
          accion: 'reservacion.reagendar',
          entidad: 'reservas_reservaciones',
          entidadId: id,
          datosAntes: {
            espacioId: String(actual.espacio_id),
            inicio: new Date(actual.inicio).toISOString(),
            fin: new Date(actual.fin).toISOString(),
            version: Number(actual.version),
          },
          datosDespues: {
            espacioId: espacio.id,
            inicio: inicio.toISOString(),
            fin: fin.toISOString(),
            version: Number(actual.version) + 1,
          },
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });

        const { detalle } = await obtenerReservacionDetalle(tx, id);
        return detalle;
      }, pool);
    },
  );

  // 8) Cancelar reservación (cancelación lógica)
  app.post(
    '/api/reservaciones/:id/cancelar',
    { preHandler: [requerirSesionAprobada] },
    async (request) => {
      const { id } = request.params as { id: string };
      validarUuidParam(id);
      const body = esquemaCancelar.parse(request.body);
      const usuario = request.usuario!;
      const pool = obtenerPool();

      return enTransaccion(async (tx) => {
        const { rows: actuales } = await tx.query(
          `
          SELECT id, estado, creado_por, version
          FROM reservas_reservaciones
          WHERE id = $1
          FOR UPDATE
          `,
          [id],
        );

        if (actuales.length === 0) {
          throw new ErrorApi(404, 'NO_ENCONTRADO', 'La reservación solicitada no existe.');
        }

        const actual = actuales[0];
        verificarPermisoExpediente(usuario, String(actual.creado_por));

        if (actual.estado === 'CANCELADA') {
          throw new ErrorApi(
            409,
            'ESTADO_INVALIDO',
            'La reservación ya se encuentra cancelada.',
          );
        }

        await tx.query(
          `
          UPDATE reservas_reservaciones
          SET estado = 'CANCELADA',
              cancelado_por = $2,
              cancelado_en = NOW(),
              motivo_cancelacion = $3,
              actualizado_en = NOW(),
              version = version + 1
          WHERE id = $1
          `,
          [id, usuario.sub, body.motivo],
        );

        await registrarAuditoria(tx, {
          actorTipo: 'USUARIO_RESERVAS',
          actorId: usuario.sub,
          actorNombre: usuario.nombre,
          accion: 'reservacion.cancelar',
          entidad: 'reservas_reservaciones',
          entidadId: id,
          datosAntes: { estado: String(actual.estado) },
          datosDespues: {
            estado: 'CANCELADA',
            motivoCancelacion: body.motivo,
          },
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });

        const { detalle } = await obtenerReservacionDetalle(tx, id);
        return detalle;
      }, pool);
    },
  );

  // 9) Reimprimir expediente oficial (HTML sin QR ni sello digital)
  app.get(
    '/api/reservaciones/:id/reimprimir',
    { preHandler: [requerirSesionAprobada] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      validarUuidParam(id);
      const { detalle, creadoPorSub } = await obtenerReservacionDetalle(
        obtenerPool(),
        id,
      );
      verificarPermisoExpediente(request.usuario!, creadoPorSub);

      const html = generarHtmlExpediente(detalle);
      return reply.header('Content-Type', 'text/html; charset=utf-8').send(html);
    },
  );
}

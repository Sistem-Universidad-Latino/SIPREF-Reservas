import type { ClienteBd } from '../bd/pool.js';
import { ErrorApi } from '../errores.js';
import type { UsuarioSesion } from '../seguridad/guardias.js';
import {
  derivarEstadoReservacion,
  type EstadoReservacionMostrado,
} from './conflictos.js';

export interface RecursoAsignadoDto {
  recursoId: number;
  nombre: string;
  cantidad: number;
  unidad: string;
}

export interface RecordatorioDto {
  id: number;
  canal: 'SIPREF' | 'CORREO';
  anticipacion: number;
  unidad: 'MINUTOS' | 'HORAS' | 'DIAS';
  enviarEn: string;
  enviadoEn: string | null;
}

export interface ReservacionResumenDto {
  id: string;
  codigo: string;
  tipoEvento: string;
  nombreEvento: string;
  espacioId: string;
  espacioNombre: string;
  inicio: string;
  fin: string;
  responsable: string;
  estado: EstadoReservacionMostrado;
  resumenRecursos: string;
}

export interface ReservacionDetalleDto extends ReservacionResumenDto {
  correoResponsable: string;
  descripcion: string;
  observaciones: string;
  asistentesEstimados: number | null;
  recursos: RecursoAsignadoDto[];
  recordatorios: RecordatorioDto[];
  creadoPor: { sub: string; nombre: string };
  creadoEn: string;
  actualizadoEn: string;
  cancelacion: { por: string; en: string; motivo: string } | null;
  version: number;
}

export function formatearResumenRecursos(
  recursos: { nombre: string; cantidad: number }[],
): string {
  if (!recursos || recursos.length === 0) return '';
  return recursos.map((r) => `${r.nombre} ×${r.cantidad}`).join(', ');
}

export async function generarCodigoReservacion(
  bd: ClienteBd,
  fechaReferencia: Date = new Date(),
): Promise<string> {
  const anio = fechaReferencia.getUTCFullYear();
  const prefijoLike = `RES-${anio}-%`;
  const { rows } = await bd.query(
    `
    SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(codigo, '-', -1) AS UNSIGNED)), 0) + 1 AS siguiente
    FROM reservas_reservaciones
    WHERE codigo LIKE $1
    `,
    [prefijoLike],
  );

  const siguiente = Number(rows[0]?.siguiente ?? 1);
  return `RES-${anio}-${String(siguiente).padStart(6, '0')}`;
}

export function verificarPermisoExpediente(
  usuario: UsuarioSesion,
  creadoPorSub: string,
): void {
  if (usuario.rol === 'ADMIN_ESPACIOS') return;
  if (usuario.sub !== creadoPorSub) {
    throw new ErrorApi(
      403,
      'PROHIBIDO',
      'Solo puede consultar o modificar las reservaciones que usted registró.',
    );
  }
}

export async function obtenerReservacionDetalle(
  bd: ClienteBd,
  id: string,
): Promise<{ detalle: ReservacionDetalleDto; creadoPorSub: string; estadoBd: string }> {
  const { rows } = await bd.query(
    `
    SELECT
      r.id,
      r.codigo,
      r.tipo_evento,
      r.espacio_id,
      r.espacio_nombre,
      r.nombre_evento,
      r.inicio,
      r.fin,
      r.responsable,
      r.correo_responsable,
      r.descripcion,
      r.observaciones,
      r.asistentes_estimados,
      r.estado,
      r.creado_por,
      u_creador.nombre AS creado_por_nombre,
      r.creado_en,
      r.actualizado_en,
      r.cancelado_por,
      u_cancelador.nombre AS cancelado_por_nombre,
      r.cancelado_en,
      r.motivo_cancelacion,
      r.version
    FROM reservas_reservaciones r
    JOIN reservas_usuarios u_creador ON u_creador.google_sub = r.creado_por
    LEFT JOIN reservas_usuarios u_cancelador ON u_cancelador.google_sub = r.cancelado_por
    WHERE r.id = $1
    LIMIT 1
    `,
    [id],
  );

  if (rows.length === 0) {
    throw new ErrorApi(404, 'NO_ENCONTRADO', 'La reservación solicitada no existe.');
  }

  const r = rows[0];

  const { rows: filasRecursos } = await bd.query(
    `
    SELECT
      re.recurso_id,
      c.nombre,
      re.cantidad,
      c.unidad
    FROM reservas_recursos_evento re
    JOIN reservas_recursos_catalogo c ON c.id = re.recurso_id
    WHERE re.reservacion_id = $1
    ORDER BY c.nombre ASC
    `,
    [id],
  );

  const recursos: RecursoAsignadoDto[] = filasRecursos.map((fr) => ({
    recursoId: Number(fr.recurso_id),
    nombre: String(fr.nombre),
    cantidad: Number(fr.cantidad),
    unidad: String(fr.unidad),
  }));

  const { rows: filasRecordatorios } = await bd.query(
    `
    SELECT
      id,
      canal,
      anticipacion,
      unidad,
      enviar_en,
      enviado_en
    FROM reservas_recordatorios
    WHERE reservacion_id = $1
    ORDER BY enviar_en ASC
    `,
    [id],
  );

  const recordatorios: RecordatorioDto[] = filasRecordatorios.map((rec) => ({
    id: Number(rec.id),
    canal: rec.canal as 'SIPREF' | 'CORREO',
    anticipacion: Number(rec.anticipacion),
    unidad: rec.unidad as 'MINUTOS' | 'HORAS' | 'DIAS',
    enviarEn: new Date(rec.enviar_en).toISOString(),
    enviadoEn: rec.enviado_en ? new Date(rec.enviado_en).toISOString() : null,
  }));

  const inicioDate = new Date(r.inicio);
  const finDate = new Date(r.fin);
  const estadoMostrado = derivarEstadoReservacion(String(r.estado), finDate);

  const cancelacion =
    r.estado === 'CANCELADA' && r.cancelado_en
      ? {
          por: String(r.cancelado_por_nombre ?? r.cancelado_por ?? 'Usuario'),
          en: new Date(r.cancelado_en).toISOString(),
          motivo: String(r.motivo_cancelacion ?? ''),
        }
      : null;

  const detalle: ReservacionDetalleDto = {
    id: String(r.id),
    codigo: String(r.codigo),
    tipoEvento: r.tipo_evento,
    nombreEvento: String(r.nombre_evento),
    espacioId: String(r.espacio_id),
    espacioNombre: String(r.espacio_nombre),
    inicio: inicioDate.toISOString(),
    fin: finDate.toISOString(),
    responsable: String(r.responsable),
    estado: estadoMostrado,
    resumenRecursos: formatearResumenRecursos(recursos),
    correoResponsable: String(r.correo_responsable ?? ''),
    descripcion: String(r.descripcion ?? ''),
    observaciones: String(r.observaciones ?? ''),
    asistentesEstimados:
      r.asistentes_estimados !== null && r.asistentes_estimados !== undefined
        ? Number(r.asistentes_estimados)
        : null,
    recursos,
    recordatorios,
    creadoPor: {
      sub: String(r.creado_por),
      nombre: String(r.creado_por_nombre),
    },
    creadoEn: new Date(r.creado_en).toISOString(),
    actualizadoEn: new Date(r.actualizado_en).toISOString(),
    cancelacion,
    version: Number(r.version),
  };

  return {
    detalle,
    creadoPorSub: String(r.creado_por),
    estadoBd: String(r.estado),
  };
}

export interface FiltrosConsultaReservaciones {
  q?: string;
  espacioId?: string;
  estado?: 'PENDIENTE' | 'REALIZADA' | 'CANCELADA';
  desde?: Date;
  hasta?: Date;
  pagina: number;
  tamano: number;
  orden?: string;
  sinPaginar?: boolean;
}

export async function consultarReservaciones(
  bd: ClienteBd,
  usuario: UsuarioSesion,
  filtros: FiltrosConsultaReservaciones,
): Promise<{ datos: ReservacionResumenDto[]; total: number }> {
  const condiciones: string[] = [];
  const params: unknown[] = [];

  if (usuario.rol !== 'ADMIN_ESPACIOS') {
    params.push(usuario.sub);
    condiciones.push(`r.creado_por = $${params.length}`);
  }

  if (filtros.q && filtros.q.trim() !== '') {
    params.push(`%${filtros.q.trim().toLowerCase()}%`);
    const idx = params.length;
    condiciones.push(
      `(lower(r.nombre_evento) LIKE $${idx} OR lower(r.codigo) LIKE $${idx} OR lower(r.responsable) LIKE $${idx} OR lower(r.espacio_nombre) LIKE $${idx})`,
    );
  }

  if (filtros.espacioId && filtros.espacioId.trim() !== '') {
    params.push(filtros.espacioId.trim());
    condiciones.push(`r.espacio_id = $${params.length}`);
  }

  if (filtros.estado === 'CANCELADA') {
    condiciones.push(`r.estado = 'CANCELADA'`);
  } else if (filtros.estado === 'PENDIENTE') {
    condiciones.push(`(r.estado = 'PROGRAMADA' AND r.fin >= now())`);
  } else if (filtros.estado === 'REALIZADA') {
    condiciones.push(`(r.estado = 'PROGRAMADA' AND r.fin < now())`);
  }

  if (filtros.desde) {
    params.push(filtros.desde);
    condiciones.push(`r.fin >= $${params.length}`);
  }

  if (filtros.hasta) {
    params.push(filtros.hasta);
    condiciones.push(`r.inicio <= $${params.length}`);
  }

  const whereSql =
    condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  const ordenSql =
    filtros.orden === 'inicio_asc'
      ? 'ORDER BY r.inicio ASC'
      : 'ORDER BY r.inicio DESC';

  const { rows: conteoRows } = await bd.query(
    `SELECT COUNT(*) AS total FROM reservas_reservaciones r ${whereSql}`,
    params,
  );
  const total = Number(conteoRows[0]?.total ?? 0);

  let paginacionSql = '';
  const paramsDatos = [...params];
  if (!filtros.sinPaginar) {
    const offset = (filtros.pagina - 1) * filtros.tamano;
    paramsDatos.push(filtros.tamano, offset);
    paginacionSql = `LIMIT $${paramsDatos.length - 1} OFFSET $${paramsDatos.length}`;
  } else {
    paginacionSql = `LIMIT 5000`;
  }

  const { rows } = await bd.query(
    `
    SELECT
      r.id,
      r.codigo,
      r.tipo_evento,
      r.nombre_evento,
      r.espacio_id,
      r.espacio_nombre,
      r.inicio,
      r.fin,
      r.responsable,
      r.estado,
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
    ${whereSql}
    ${ordenSql}
    ${paginacionSql}
    `,
    paramsDatos,
  );

  const ahora = new Date();
  const datos: ReservacionResumenDto[] = rows.map((r) => {
    const finDate = new Date(r.fin);
    return {
      id: String(r.id),
      codigo: String(r.codigo),
      tipoEvento: r.tipo_evento,
      nombreEvento: String(r.nombre_evento),
      espacioId: String(r.espacio_id),
      espacioNombre: String(r.espacio_nombre),
      inicio: new Date(r.inicio).toISOString(),
      fin: finDate.toISOString(),
      responsable: String(r.responsable),
      estado: derivarEstadoReservacion(String(r.estado), finDate, ahora),
      resumenRecursos: String(r.resumen_recursos ?? ''),
    };
  });

  return { datos, total };
}

/** Tipos del contrato docs/CONTRATOS_API.md (API de la aplicación). */

export type EstadoAcceso = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'REVOCADA' | 'EXPIRADA';
export type Rol = 'DOCENTE' | 'PERSONAL' | 'ADMIN_ESPACIOS';
export type TipoEvento = 'CONFERENCIA' | 'TALLER' | 'JUNTA' | 'EXAMEN' | 'OTRO';
export type EstadoReservacion = 'PENDIENTE' | 'REALIZADA' | 'CANCELADA';
export type CanalRecordatorio = 'SIPREF' | 'CORREO';
export type UnidadAnticipacion = 'MINUTOS' | 'HORAS' | 'DIAS';
export type OrigenEvento = 'RESERVAS' | 'SIPREF';

export interface ErrorApiCuerpo {
  error: { codigo: string; mensaje: string; detalles?: Record<string, unknown> };
}

export interface Pagina<T> {
  datos: T[];
  pagina: number;
  tamano: number;
  total: number;
}

export interface SolicitudEstado {
  id: string;
  nombre: string;
  correo: string;
  fotoUrl: string | null;
  intentadoEn: string;
  expiraEn: string;
  resueltoEn: string | null;
  rolAsignado: Rol | null;
}

export interface EstadoSolicitudRespuesta {
  estado: EstadoAcceso;
  solicitud: SolicitudEstado;
  puedeEntrar: boolean;
}

export interface Yo {
  sub: string;
  nombre: string;
  correo: string;
  fotoUrl: string | null;
  rol: Rol;
  estado: EstadoAcceso;
}

export interface ActualizarPerfilEntrada {
  nombre: string;
}

export interface DevLoginEntrada {
  sub: string;
  nombre: string;
  correo: string;
  estado?: EstadoAcceso;
  rol?: Rol;
}

export interface ConfiguracionPublica {
  ciclo: string;
  bufferMinutos: number;
  zonaHoraria: string;
}

export interface Espacio {
  id: string;
  nombre: string;
  capacidad: number;
  tipo: string;
  edificio: string;
}

export interface Recurso {
  id: number;
  nombre: string;
  unidad: string;
  esPredefinido: boolean;
}

export interface EventoCalendario {
  id: string;
  origen: OrigenEvento;
  tipoEvento: TipoEvento;
  nombreEvento: string;
  espacioId: string;
  espacioNombre: string;
  inicio: string;
  fin: string;
  responsable: string;
  estado: EstadoReservacion;
  resumenRecursos: string;
  editable: boolean;
}

export interface ReservacionResumen {
  id: string;
  codigo: string;
  tipoEvento: TipoEvento;
  nombreEvento: string;
  espacioId: string;
  espacioNombre: string;
  inicio: string;
  fin: string;
  responsable: string;
  estado: EstadoReservacion;
  resumenRecursos: string;
}

export interface RecursoAsignado {
  recursoId: number;
  nombre: string;
  cantidad: number;
  unidad: string;
}

export interface Recordatorio {
  id: number;
  canal: CanalRecordatorio;
  anticipacion: number;
  unidad: UnidadAnticipacion;
  enviarEn: string;
  enviadoEn: string | null;
}

export interface ReservacionDetalle extends ReservacionResumen {
  correoResponsable: string;
  descripcion: string;
  observaciones: string;
  asistentesEstimados: number | null;
  recursos: RecursoAsignado[];
  recordatorios: Recordatorio[];
  creadoPor: { sub: string; nombre: string };
  creadoEn: string;
  actualizadoEn: string;
  cancelacion: { por: string; en: string; motivo: string } | null;
  version: number;
}

export interface EntradaHistorial {
  ocurridoEn: string;
  actorNombre: string;
  accion: string;
  descripcion: string;
}

export interface Conflicto {
  origen: OrigenEvento;
  nombreEvento: string;
  inicio: string;
  fin: string;
}

export interface DisponibilidadEntrada {
  espacioId: string;
  inicio: string;
  fin: string;
  excluirId?: string;
}

export interface DisponibilidadRespuesta {
  disponible: boolean;
  bufferMinutos: number;
  conflictos: Conflicto[];
}

export interface RecordatorioEntrada {
  canal: CanalRecordatorio;
  anticipacion: number;
  unidad: UnidadAnticipacion;
}

export interface ReservacionEntrada {
  tipoEvento: TipoEvento;
  espacioId: string;
  nombreEvento: string;
  codigo?: string;
  inicio: string;
  fin: string;
  responsable: string;
  correoResponsable: string;
  descripcion: string;
  observaciones: string;
  asistentesEstimados: number | null;
  recursos: { recursoId: number; cantidad: number }[];
  recordatorios: RecordatorioEntrada[];
}

export interface ReagendarEntrada {
  inicio: string;
  fin: string;
  espacioId?: string;
  version: number;
}

export interface FiltrosReservaciones {
  q?: string;
  espacioId?: string;
  estado?: EstadoReservacion | '';
  desde?: string;
  hasta?: string;
  pagina?: number;
  tamano?: number;
  orden?: string;
}

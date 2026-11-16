import type { EstadoReservacion, Rol, TipoEvento, UnidadAnticipacion } from '../api/tipos';

export interface InfoTipoEvento {
  tipo: TipoEvento;
  etiqueta: string;
  colorHex: string;
  clasesBadge: string;
  clasesChip: string;
  clasesPunto: string;
  clasesBordeIzq: string;
}

export const CATALOGO_TIPOS_EVENTO: Record<TipoEvento, InfoTipoEvento> = {
  CONFERENCIA: {
    tipo: 'CONFERENCIA',
    etiqueta: 'Conferencia',
    colorHex: '#2563EB',
    clasesBadge: 'bg-blue-50 text-blue-700 border-blue-200',
    clasesChip: 'bg-blue-600 text-white hover:bg-blue-700',
    clasesPunto: 'bg-blue-600',
    clasesBordeIzq: 'border-l-blue-600',
  },
  TALLER: {
    tipo: 'TALLER',
    etiqueta: 'Taller',
    colorHex: '#059669',
    clasesBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    clasesChip: 'bg-emerald-600 text-white hover:bg-emerald-700',
    clasesPunto: 'bg-emerald-600',
    clasesBordeIzq: 'border-l-emerald-600',
  },
  JUNTA: {
    tipo: 'JUNTA',
    etiqueta: 'Junta',
    colorHex: '#7C3AED',
    clasesBadge: 'bg-violet-50 text-violet-700 border-violet-200',
    clasesChip: 'bg-violet-600 text-white hover:bg-violet-700',
    clasesPunto: 'bg-violet-600',
    clasesBordeIzq: 'border-l-violet-600',
  },
  EXAMEN: {
    tipo: 'EXAMEN',
    etiqueta: 'Examen',
    colorHex: '#DC2626',
    clasesBadge: 'bg-red-50 text-red-700 border-red-200',
    clasesChip: 'bg-red-600 text-white hover:bg-red-700',
    clasesPunto: 'bg-red-600',
    clasesBordeIzq: 'border-l-red-600',
  },
  OTRO: {
    tipo: 'OTRO',
    etiqueta: 'Otro',
    colorHex: '#64748B',
    clasesBadge: 'bg-slate-100 text-slate-700 border-slate-200',
    clasesChip: 'bg-slate-600 text-white hover:bg-slate-700',
    clasesPunto: 'bg-slate-500',
    clasesBordeIzq: 'border-l-slate-500',
  },
};

export const LISTA_TIPOS_EVENTO: InfoTipoEvento[] = [
  CATALOGO_TIPOS_EVENTO.CONFERENCIA,
  CATALOGO_TIPOS_EVENTO.TALLER,
  CATALOGO_TIPOS_EVENTO.JUNTA,
  CATALOGO_TIPOS_EVENTO.EXAMEN,
  CATALOGO_TIPOS_EVENTO.OTRO,
];

export function obtenerInfoTipoEvento(tipo: TipoEvento): InfoTipoEvento {
  return CATALOGO_TIPOS_EVENTO[tipo] ?? CATALOGO_TIPOS_EVENTO.OTRO;
}

export interface InfoEstadoReservacion {
  estado: EstadoReservacion;
  etiqueta: string;
  etiquetaPlural: string;
  clasesBadge: string;
  clasesPunto: string;
}

const CATALOGO_ESTADOS_RESERVACION: Record<EstadoReservacion, InfoEstadoReservacion> = {
  PENDIENTE: {
    estado: 'PENDIENTE',
    etiqueta: 'Pendiente',
    etiquetaPlural: 'Pendientes',
    clasesBadge: 'bg-amber-50 text-amber-700 border-amber-200',
    clasesPunto: 'bg-amber-500',
  },
  REALIZADA: {
    estado: 'REALIZADA',
    etiqueta: 'Realizada',
    etiquetaPlural: 'Realizadas',
    clasesBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    clasesPunto: 'bg-emerald-500',
  },
  CANCELADA: {
    estado: 'CANCELADA',
    etiqueta: 'Cancelada',
    etiquetaPlural: 'Canceladas',
    clasesBadge: 'bg-rose-50 text-rose-700 border-rose-200',
    clasesPunto: 'bg-rose-500',
  },
};

export function obtenerInfoEstadoReservacion(estado: EstadoReservacion): InfoEstadoReservacion {
  return CATALOGO_ESTADOS_RESERVACION[estado] ?? CATALOGO_ESTADOS_RESERVACION.PENDIENTE;
}

export function obtenerEtiquetaRol(rol: Rol): string {
  switch (rol) {
    case 'DOCENTE':
      return 'Docente';
    case 'PERSONAL':
      return 'Personal';
    case 'ADMIN_ESPACIOS':
      return 'Administrador de espacios';
    default:
      return rol;
  }
}

export const OPCIONES_UNIDAD_ANTICIPACION: { valor: UnidadAnticipacion; etiqueta: string }[] = [
  { valor: 'MINUTOS', etiqueta: 'minutos' },
  { valor: 'HORAS', etiqueta: 'horas' },
  { valor: 'DIAS', etiqueta: 'días' },
];

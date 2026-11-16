import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, construirQuery } from './cliente';
import type {
  ActualizarPerfilEntrada,
  ConfiguracionPublica,
  DevLoginEntrada,
  DisponibilidadEntrada,
  DisponibilidadRespuesta,
  EntradaHistorial,
  Espacio,
  EstadoSolicitudRespuesta,
  EventoCalendario,
  FiltrosReservaciones,
  Pagina,
  ReagendarEntrada,
  Recurso,
  ReservacionDetalle,
  ReservacionEntrada,
  ReservacionResumen,
  Yo,
} from './tipos';

export const claves = {
  yo: ['yo'] as const,
  estadoSolicitud: ['estado-solicitud'] as const,
  configuracion: ['configuracion'] as const,
  espacios: ['espacios'] as const,
  recursos: ['recursos'] as const,
  calendario: (desde: string, hasta: string, espacioId?: string) =>
    ['calendario', desde, hasta, espacioId ?? ''] as const,
  reservaciones: (f: FiltrosReservaciones) => ['reservaciones', f] as const,
  reservacion: (id: string) => ['reservacion', id] as const,
  historial: (id: string) => ['reservacion', id, 'historial'] as const,
};

// ─── Autenticación ──────────────────────────────────────────────
export const useYo = () =>
  useQuery({ queryKey: claves.yo, queryFn: () => api<Yo>('/api/auth/yo'), retry: false, staleTime: 60_000 });

export const useEstadoSolicitud = () =>
  useQuery({
    queryKey: claves.estadoSolicitud,
    queryFn: () => api<EstadoSolicitudRespuesta>('/api/auth/estado-solicitud'),
    retry: false,
  });

export const salir = () => api<void>('/api/auth/salir', { method: 'POST' });
export const loginDev = (d: DevLoginEntrada) => api<unknown>('/api/auth/dev', { method: 'POST', body: d });

export function useActualizarPerfil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: ActualizarPerfilEntrada) =>
      api<Yo>('/api/auth/yo', { method: 'PATCH', body: d }),
    onSuccess: (yoActualizado) => {
      qc.setQueryData<Yo>(claves.yo, yoActualizado);
    },
  });
}

export function useEliminarCuenta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/api/auth/yo', { method: 'DELETE' }),
    onSuccess: () => {
      qc.clear();
    },
  });
}

// ─── Catálogos ──────────────────────────────────────────────────
export const useConfiguracion = () =>
  useQuery({
    queryKey: claves.configuracion,
    queryFn: () => api<ConfiguracionPublica>('/api/configuracion/publica'),
    staleTime: 10 * 60_000,
  });

export const useEspacios = () =>
  useQuery({ queryKey: claves.espacios, queryFn: () => api<Espacio[]>('/api/espacios'), staleTime: 5 * 60_000 });

export const useRecursos = () =>
  useQuery({ queryKey: claves.recursos, queryFn: () => api<Recurso[]>('/api/recursos'), staleTime: 5 * 60_000 });

export function useCrearRecurso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { nombre: string; unidad: string }) => api<Recurso>('/api/recursos', { method: 'POST', body: d }),
    onSuccess: (r) => {
      qc.setQueryData<Recurso[]>(claves.recursos, (prev) =>
        prev ? (prev.some((x) => x.id === r.id) ? prev : [...prev, r]) : [r],
      );
    },
  });
}

// ─── Calendario y reservaciones ────────────────────────────────
export const useCalendario = (desde: string, hasta: string, espacioId?: string) =>
  useQuery({
    queryKey: claves.calendario(desde, hasta, espacioId),
    queryFn: () => api<EventoCalendario[]>(`/api/calendario${construirQuery({ desde, hasta, espacioId })}`),
    placeholderData: (prev) => prev,
  });

export function queryReservaciones(f: FiltrosReservaciones): string {
  return construirQuery({
    q: f.q,
    espacioId: f.espacioId,
    estado: f.estado,
    desde: f.desde,
    hasta: f.hasta,
    pagina: f.pagina,
    tamano: f.tamano,
    orden: f.orden,
  });
}

export const useReservaciones = (f: FiltrosReservaciones) =>
  useQuery({
    queryKey: claves.reservaciones(f),
    queryFn: () => api<Pagina<ReservacionResumen>>(`/api/reservaciones${queryReservaciones(f)}`),
    placeholderData: (prev) => prev,
  });

export const useReservacion = (id: string | null) =>
  useQuery({
    queryKey: claves.reservacion(id ?? ''),
    queryFn: () => api<ReservacionDetalle>(`/api/reservaciones/${encodeURIComponent(id!)}`),
    enabled: !!id,
    retry: false,
  });

export const useHistorial = (id: string | null) =>
  useQuery({
    queryKey: claves.historial(id ?? ''),
    queryFn: () => api<EntradaHistorial[]>(`/api/reservaciones/${encodeURIComponent(id!)}/historial`),
    enabled: !!id,
    retry: false,
  });

export const consultarDisponibilidad = (d: DisponibilidadEntrada, signal?: AbortSignal) =>
  api<DisponibilidadRespuesta>('/api/reservaciones/disponibilidad', { method: 'POST', body: d, signal });

function useInvalidarReservaciones() {
  const qc = useQueryClient();
  return (id?: string) => {
    qc.invalidateQueries({ queryKey: ['calendario'] });
    qc.invalidateQueries({ queryKey: ['reservaciones'] });
    if (id) qc.invalidateQueries({ queryKey: ['reservacion', id] });
  };
}

export function useCrearReservacion() {
  const invalidar = useInvalidarReservaciones();
  return useMutation({
    mutationFn: (d: ReservacionEntrada) =>
      api<ReservacionDetalle>('/api/reservaciones', { method: 'POST', body: d }),
    onSuccess: () => invalidar(),
  });
}

export function useCancelarReservacion() {
  const invalidar = useInvalidarReservaciones();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      api<ReservacionDetalle>(`/api/reservaciones/${encodeURIComponent(id)}/cancelar`, {
        method: 'POST',
        body: { motivo },
      }),
    onSuccess: (_r, v) => invalidar(v.id),
  });
}

export function useReagendarReservacion() {
  const invalidar = useInvalidarReservaciones();
  return useMutation({
    mutationFn: ({ id, ...d }: ReagendarEntrada & { id: string }) =>
      api<ReservacionDetalle>(`/api/reservaciones/${encodeURIComponent(id)}/reagendar`, {
        method: 'PATCH',
        body: d,
      }),
    onSuccess: (_r, v) => invalidar(v.id),
  });
}

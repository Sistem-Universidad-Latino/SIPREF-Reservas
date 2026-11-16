import type { ErrorApiCuerpo } from './tipos';
import { manejarPeticionMock } from '../mocks/servidorMock';

export class ApiError extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly detalles: Record<string, unknown>;

  constructor(status: number, codigo: string, mensaje: string, detalles: Record<string, unknown> = {}) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }

  /** `detalles.campos` de un error VALIDACION (400). */
  get campos(): Record<string, string> {
    const c = this.detalles?.campos;
    return c && typeof c === 'object' ? (c as Record<string, string>) : {};
  }
}

export function esApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export function usarMocks(): boolean {
  return import.meta.env.VITE_USE_MOCKS === 'true';
}

const MENSAJES_POR_STATUS: Record<number, string> = {
  401: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  403: 'No tienes permiso para realizar esta acción.',
  404: 'No se encontró el recurso solicitado.',
  429: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
  500: 'Ocurrió un error inesperado. Intenta de nuevo más tarde.',
};

interface Opciones {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/** Cliente HTTP. Siempre usa rutas relativas /api/... (mismo origen, cookies httpOnly). */
export async function api<T>(ruta: string, { method = 'GET', body, signal }: Opciones = {}): Promise<T> {
  if (usarMocks()) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    return manejarPeticionMock<T>(ruta, method, body);
  }

  let resp: Response;
  try {
    resp = await fetch(ruta, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new ApiError(0, 'RED', 'No hay conexión con el servidor. Revisa tu red e intenta de nuevo.');
  }

  if (resp.status === 204) return undefined as T;

  const tipo = resp.headers.get('content-type') ?? '';
  const datos: unknown = tipo.includes('application/json') ? await resp.json().catch(() => null) : null;

  if (!resp.ok) {
    const err = (datos as ErrorApiCuerpo | null)?.error;
    throw new ApiError(
      resp.status,
      err?.codigo ?? 'ERROR_INTERNO',
      err?.mensaje ?? MENSAJES_POR_STATUS[resp.status] ?? 'Ocurrió un error inesperado.',
      err?.detalles ?? {},
    );
  }
  return datos as T;
}

export function construirQuery(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function mensajeDeError(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Ocurrió un error inesperado.';
}

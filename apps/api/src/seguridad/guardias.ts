import type { FastifyReply, FastifyRequest } from 'fastify';
import { obtenerPool } from '../bd/pool.js';
import { obtenerConfig } from '../config.js';
import { ErrorApi } from '../errores.js';
import { COOKIE_SESION, limpiarCookiesAutenticacion } from './cookies.js';
import { verificarFirmaHmac } from './hmac.js';
import { hashTokenSesion } from './tokens.js';

export type RolUsuario = 'DOCENTE' | 'PERSONAL' | 'ADMIN_ESPACIOS';
export type EstadoAcceso =
  | 'PENDIENTE'
  | 'APROBADA'
  | 'RECHAZADA'
  | 'REVOCADA'
  | 'EXPIRADA';

export function normalizarEstadoAcceso(
  estadoBd: string,
  estadoSolicitud?: string,
): EstadoAcceso {
  const limpio = estadoBd.trim().toUpperCase();
  if (limpio === 'ACTIVO') return 'APROBADA';
  if (limpio === 'PENDIENTE_APROBACION') return 'PENDIENTE';
  if (limpio === 'SUSPENDIDO') {
    return estadoSolicitud?.trim().toUpperCase() === 'RECHAZADA'
      ? 'RECHAZADA'
      : 'REVOCADA';
  }
  return limpio as EstadoAcceso;
}

export interface UsuarioSesion {
  sub: string;
  nombre: string;
  correo: string;
  fotoUrl: string | null;
  rol: RolUsuario;
  estado: EstadoAcceso;
  tokenHash: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    usuario?: UsuarioSesion;
    cuerpoCrudo?: string;
  }
}

/**
 * Guardia para rutas autenticadas de la aplicación.
 * Re-valida en base de datos en cada solicitud que la sesión no esté revocada/expirada
 * y que el estado actual de la cuenta sea 'APROBADA'.
 */
export async function requerirSesionAprobada(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const tokenOpaco = request.cookies?.[COOKIE_SESION];
  if (!tokenOpaco) {
    throw new ErrorApi(
      401,
      'NO_AUTENTICADO',
      'Debe iniciar sesión para acceder a este recurso.',
    );
  }

  const tokenHash = hashTokenSesion(tokenOpaco);
  const pool = obtenerPool();

  const { rows } = await pool.query(
    `
    SELECT
      s.token_hash,
      s.expira_en,
      s.revocada_en,
      u.google_sub,
      u.nombre,
      u.correo,
      u.foto_url,
      u.rol,
      u.estado
    FROM reservas_sesiones s
    JOIN reservas_usuarios u ON u.google_sub = s.google_sub
    WHERE s.token_hash = $1
    LIMIT 1
    `,
    [tokenHash],
  );

  if (rows.length === 0) {
    throw new ErrorApi(
      401,
      'NO_AUTENTICADO',
      'La sesión no es válida o ha expirado.',
    );
  }

  const fila = rows[0];
  const ahora = new Date();
  if (fila.revocada_en !== null || new Date(fila.expira_en) <= ahora) {
    throw new ErrorApi(
      401,
      'NO_AUTENTICADO',
      'La sesión ha expirado o fue cerrada.',
    );
  }

  const estadoNormalizado = normalizarEstadoAcceso(String(fila.estado));

  if (estadoNormalizado !== 'APROBADA' || !fila.rol) {
    await pool.query(
      `UPDATE reservas_sesiones SET revocada_en = now() WHERE token_hash = $1 AND revocada_en IS NULL`,
      [tokenHash],
    );
    limpiarCookiesAutenticacion(reply);
    throw new ErrorApi(
      403,
      'ACCESO_NO_APROBADO',
      'Su acceso a SIPREF Reservas ya no se encuentra aprobado.',
      { estado: fila.estado },
    );
  }

  request.usuario = {
    sub: String(fila.google_sub),
    nombre: String(fila.nombre),
    correo: String(fila.correo),
    fotoUrl: fila.foto_url ? String(fila.foto_url) : null,
    rol: fila.rol as RolUsuario,
    estado: estadoNormalizado as EstadoAcceso,
    tokenHash,
  };
}

/**
 * Guardia para rutas de la API de integración (/api/integracion/v1/*)
 * autenticadas por firma HMAC-SHA256 y lista opcional de IPs permitidas.
 */
export async function requerirFirmaIntegracion(
  request: FastifyRequest,
): Promise<void> {
  const cfg = obtenerConfig();

  if (cfg.INTEGRACION_IPS_PERMITIDAS.length > 0) {
    const ipCliente = request.ip;
    if (!cfg.INTEGRACION_IPS_PERMITIDAS.includes(ipCliente)) {
      throw new ErrorApi(
        403,
        'PROHIBIDO',
        'La dirección IP de origen no está autorizada para la API de integración.',
      );
    }
  }

  const keyId = obtenerEncabezadoSimple(request.headers['x-sipref-key-id']);
  const timestamp = obtenerEncabezadoSimple(request.headers['x-sipref-timestamp']);
  const signature = obtenerEncabezadoSimple(request.headers['x-sipref-signature']);

  const verificacion = verificarFirmaHmac({
    keyIdRecibido: keyId,
    timestampRecibido: timestamp,
    firmaRecibida: signature,
    metodo: request.method,
    pathConQuery: request.url,
    cuerpoCrudo: request.cuerpoCrudo ?? '',
    keyIdEsperado: cfg.INTEGRACION_KEY_ID,
    secreto: cfg.INTEGRACION_SECRET,
  });

  if (!verificacion.valido) {
    throw new ErrorApi(
      403,
      'FIRMA_INVALIDA',
      verificacion.motivo ?? 'Firma de integración inválida.',
    );
  }
}

function obtenerEncabezadoSimple(
  valor: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(valor)) return valor[0];
  return valor;
}

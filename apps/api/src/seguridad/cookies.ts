import type { FastifyReply } from 'fastify';
import { obtenerConfig } from '../config.js';

export const COOKIE_SESION = 'sr_sesion';
export const COOKIE_ESTADO = 'sr_estado';
export const COOKIE_OAUTH = 'sr_oauth';

export const MAX_AGE_SESION_SEG = 8 * 60 * 60; // 8 horas
export const MAX_AGE_ESTADO_SEG = 30 * 24 * 60 * 60; // 30 días
export const MAX_AGE_OAUTH_SEG = 10 * 60; // 10 minutos

function esCookieSegura(): boolean {
  const cfg = obtenerConfig();
  return cfg.NODE_ENV === 'production' || cfg.FRONTEND_URL.startsWith('https://');
}

export function escribirCookieSesion(reply: FastifyReply, tokenOpaco: string): void {
  reply.setCookie(COOKIE_SESION, tokenOpaco, {
    httpOnly: true,
    secure: esCookieSegura(),
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SESION_SEG,
  });
}

export function escribirCookieEstado(reply: FastifyReply, tokenFirmado: string): void {
  reply.setCookie(COOKIE_ESTADO, tokenFirmado, {
    httpOnly: true,
    secure: esCookieSegura(),
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: MAX_AGE_ESTADO_SEG,
  });
}

export function escribirCookieOauth(reply: FastifyReply, tokenFirmado: string): void {
  reply.setCookie(COOKIE_OAUTH, tokenFirmado, {
    httpOnly: true,
    secure: esCookieSegura(),
    sameSite: 'lax',
    path: '/api/auth/google',
    maxAge: MAX_AGE_OAUTH_SEG,
  });
}

export function limpiarCookiesAutenticacion(reply: FastifyReply): void {
  const secure = esCookieSegura();
  reply.clearCookie(COOKIE_SESION, { httpOnly: true, secure, sameSite: 'lax', path: '/' });
  reply.clearCookie(COOKIE_ESTADO, { httpOnly: true, secure, sameSite: 'lax', path: '/api/auth' });
  reply.clearCookie(COOKIE_OAUTH, { httpOnly: true, secure, sameSite: 'lax', path: '/api/auth/google' });
}

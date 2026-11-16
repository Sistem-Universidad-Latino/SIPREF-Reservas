import crypto from 'node:crypto';
import { comparacionTiempoConstante, sha256Hex } from './hmac.js';

export function generarTokenSesion(): { tokenOpaco: string; tokenHash: string } {
  const tokenOpaco = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(tokenOpaco);
  return { tokenOpaco, tokenHash };
}

export function hashTokenSesion(tokenOpaco: string): string {
  return sha256Hex(tokenOpaco);
}

export function firmarTokenDatos<T extends object>(
  datos: T,
  secreto: string,
): string {
  const json = JSON.stringify(datos);
  const b64 = Buffer.from(json, 'utf8').toString('base64url');
  const firma = crypto
    .createHmac('sha256', secreto)
    .update(b64)
    .digest('base64url');
  return `${b64}.${firma}`;
}

export function verificarTokenDatos<T>(
  token: string | undefined,
  secreto: string,
): T | null {
  if (!token || typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [b64, firmaRecibida] = partes;
  if (!b64 || !firmaRecibida) return null;

  const firmaEsperada = crypto
    .createHmac('sha256', secreto)
    .update(b64)
    .digest('base64url');

  if (!comparacionTiempoConstante(firmaRecibida, firmaEsperada)) {
    return null;
  }

  try {
    const json = Buffer.from(b64, 'base64url').toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export interface PayloadCookieEstado {
  sub: string;
  solicitudId: string;
  exp: number;
}

export interface PayloadCookieOauth {
  state: string;
  codeVerifier: string;
  exp: number;
}

export function generarPkce(): {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
} {
  const state = crypto.randomBytes(24).toString('base64url');
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { state, codeVerifier, codeChallenge };
}

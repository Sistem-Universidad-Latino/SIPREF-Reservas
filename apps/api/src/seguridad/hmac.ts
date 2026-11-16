import crypto from 'node:crypto';

export const TOLERANCIA_TIMESTAMP_SEGUNDOS = 300;

export function sha256Hex(contenido: string | Buffer): string {
  return crypto.createHash('sha256').update(contenido).digest('hex');
}

export function construirMensajeCanonicoHmac(
  timestamp: string | number,
  metodo: string,
  pathConQuery: string,
  cuerpoCrudo: string | Buffer = '',
): string {
  const hashCuerpo = sha256Hex(cuerpoCrudo);
  return `${timestamp}.${metodo.toUpperCase()}.${pathConQuery}.${hashCuerpo}`;
}

export function calcularFirmaHmac(
  secreto: string,
  timestamp: string | number,
  metodo: string,
  pathConQuery: string,
  cuerpoCrudo: string | Buffer = '',
): string {
  const mensaje = construirMensajeCanonicoHmac(
    timestamp,
    metodo,
    pathConQuery,
    cuerpoCrudo,
  );
  return crypto.createHmac('sha256', secreto).update(mensaje).digest('hex');
}

export interface ParametrosVerificacionHmac {
  keyIdRecibido: string | undefined;
  timestampRecibido: string | undefined;
  firmaRecibida: string | undefined;
  metodo: string;
  pathConQuery: string;
  cuerpoCrudo: string | Buffer;
  keyIdEsperado: string;
  secreto: string;
  ahoraSegundos?: number;
  toleranciaSegundos?: number;
}

export interface ResultadoVerificacionHmac {
  valido: boolean;
  motivo?: string;
}

export function comparacionTiempoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verificarFirmaHmac(
  params: ParametrosVerificacionHmac,
): ResultadoVerificacionHmac {
  const {
    keyIdRecibido,
    timestampRecibido,
    firmaRecibida,
    metodo,
    pathConQuery,
    cuerpoCrudo,
    keyIdEsperado,
    secreto,
    ahoraSegundos = Math.floor(Date.now() / 1000),
    toleranciaSegundos = TOLERANCIA_TIMESTAMP_SEGUNDOS,
  } = params;

  if (!keyIdRecibido || !timestampRecibido || !firmaRecibida) {
    return { valido: false, motivo: 'Faltan encabezados de autenticación HMAC.' };
  }

  if (!comparacionTiempoConstante(keyIdRecibido, keyIdEsperado)) {
    return { valido: false, motivo: 'Identificador de llave (Key-Id) inválido.' };
  }

  if (!/^\d+$/.test(timestampRecibido)) {
    return { valido: false, motivo: 'Formato de timestamp inválido.' };
  }

  const tsNum = Number(timestampRecibido);
  if (
    !Number.isFinite(tsNum) ||
    Math.abs(ahoraSegundos - tsNum) > toleranciaSegundos
  ) {
    return {
      valido: false,
      motivo: 'La marca de tiempo de la solicitud está fuera de la ventana permitida (300 s).',
    };
  }

  const firmaEsperada = calcularFirmaHmac(
    secreto,
    timestampRecibido,
    metodo,
    pathConQuery,
    cuerpoCrudo,
  );

  if (!comparacionTiempoConstante(firmaRecibida.toLowerCase(), firmaEsperada.toLowerCase())) {
    return { valido: false, motivo: 'La firma HMAC no coincide.' };
  }

  return { valido: true };
}

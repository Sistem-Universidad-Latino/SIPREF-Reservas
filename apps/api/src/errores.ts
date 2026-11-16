import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export type CodigoError =
  | 'VALIDACION'
  | 'NO_AUTENTICADO'
  | 'ACCESO_NO_APROBADO'
  | 'PROHIBIDO'
  | 'DOMINIO_NO_PERMITIDO'
  | 'FIRMA_INVALIDA'
  | 'NO_ENCONTRADO'
  | 'CONFLICTO_HORARIO'
  | 'VERSION_DESACTUALIZADA'
  | 'ESTADO_INVALIDO'
  | 'DUPLICADO'
  | 'DEMASIADAS_SOLICITUDES'
  | 'ERROR_INTERNO';

export class ErrorApi extends Error {
  public readonly estadoHttp: number;
  public readonly codigo: CodigoError;
  public readonly detalles?: Record<string, unknown>;

  constructor(
    estadoHttp: number,
    codigo: CodigoError,
    mensaje: string,
    detalles?: Record<string, unknown>,
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estadoHttp = estadoHttp;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

export function manejadorErrores(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof ErrorApi) {
    reply.status(error.estadoHttp).send({
      error: {
        codigo: error.codigo,
        mensaje: error.mensajeParaUsuario(),
        detalles: error.detalles ?? {},
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    const campos: Record<string, string> = {};
    for (const issue of error.issues) {
      const ruta = issue.path.join('.') || 'general';
      if (!campos[ruta]) {
        campos[ruta] = issue.message;
      }
    }
    reply.status(400).send({
      error: {
        codigo: 'VALIDACION',
        mensaje: 'Los datos enviados no son válidos.',
        detalles: { campos },
      },
    });
    return;
  }

  const fastifyErr = error as FastifyError;
  if (fastifyErr.statusCode === 429) {
    reply.status(429).send({
      error: {
        codigo: 'DEMASIADAS_SOLICITUDES',
        mensaje: 'Se excedió el límite de solicitudes. Intente nuevamente en unos momentos.',
        detalles: {},
      },
    });
    return;
  }

  if (fastifyErr.statusCode && fastifyErr.statusCode >= 400 && fastifyErr.statusCode < 500) {
    reply.status(fastifyErr.statusCode).send({
      error: {
        codigo: 'VALIDACION',
        mensaje: 'Solicitud mal formada o inválida.',
        detalles: {},
      },
    });
    return;
  }

  request.log.error({ err: error }, 'Error interno no controlado');
  reply.status(500).send({
    error: {
      codigo: 'ERROR_INTERNO',
      mensaje: 'Ocurrió un error interno en el servidor. Intente más tarde.',
      detalles: {},
    },
  });
}

declare module './errores.js' {
  interface ErrorApi {
    mensajeParaUsuario(): string;
  }
}

ErrorApi.prototype.mensajeParaUsuario = function (): string {
  return this.message;
};

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { type Configuracion, obtenerConfig } from './config.js';
import { ErrorApi, manejadorErrores } from './errores.js';
import { construirOpcionesLogger } from './logger.js';
import { rutasAuth } from './rutas/auth.js';
import { rutasCalendario } from './rutas/calendario.js';
import { rutasCatalogos } from './rutas/catalogos.js';
import { rutasIntegracion } from './rutas/integracion.js';
import { rutasReservaciones } from './rutas/reservaciones.js';
import { rutasSalud } from './rutas/salud.js';
import { rutasTareas } from './rutas/tareas.js';

export async function construirApp(
  cfg: Configuracion = obtenerConfig(),
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: construirOpcionesLogger(cfg.NODE_ENV),
    trustProxy: cfg.TRUST_PROXY,
  });

  // Capturar cuerpo crudo exacto para verificación de firma HMAC
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (request, body, done) => {
      const texto = typeof body === 'string' ? body : body.toString('utf8');
      request.cuerpoCrudo = texto;
      if (texto.trim() === '') {
        done(null, {});
        return;
      }
      try {
        const json = JSON.parse(texto);
        done(null, json);
      } catch {
        done(
          new ErrorApi(
            400,
            'VALIDACION',
            'El cuerpo de la solicitud no es un JSON válido.',
          ),
          undefined,
        );
      }
    },
  );

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: cfg.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(cookie, {
    secret: cfg.SESSION_SECRET,
  });

  await app.register(rateLimit, {
    max: cfg.NODE_ENV === 'production' ? 120 : 1000,
    timeWindow: '1 minute',
  });

  app.setErrorHandler(manejadorErrores);

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: {
        codigo: 'NO_ENCONTRADO',
        mensaje: 'La ruta solicitada no existe.',
        detalles: {},
      },
    });
  });

  await app.register(rutasSalud);
  await app.register(rutasAuth);
  await app.register(rutasCatalogos);
  await app.register(rutasCalendario);
  await app.register(rutasReservaciones);
  await app.register(rutasIntegracion);
  await app.register(rutasTareas);

  return app;
}

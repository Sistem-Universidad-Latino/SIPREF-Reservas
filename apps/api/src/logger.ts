import type { FastifyLoggerOptions } from 'fastify';
import type { PinoLoggerOptions } from 'fastify/types/logger.js';

export function construirOpcionesLogger(
  nodeEnv: 'development' | 'test' | 'production',
): FastifyLoggerOptions & PinoLoggerOptions {
  return {
    level: nodeEnv === 'test' ? 'silent' : nodeEnv === 'development' ? 'info' : 'info',
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'req.headers["x-sipref-signature"]',
        'req.headers["x-cron-secret"]',
        'res.headers["set-cookie"]',
        '*.password',
        '*.secret',
        '*.token',
        '*.DATABASE_URL',
        '*.SESSION_SECRET',
        '*.INTEGRACION_SECRET',
        '*.GOOGLE_CLIENT_SECRET',
        '*.CRON_SECRET',
        '*.SMTP_PASS',
      ],
      censor: '[REDACTADO]',
    },
  };
}

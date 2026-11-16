import { z } from 'zod';

const booleanoDesdeTexto = (porDefecto: boolean) =>
  z
    .union([z.boolean(), z.string(), z.undefined()])
    .transform((val) => {
      if (typeof val === 'boolean') return val;
      if (val === undefined || val.trim() === '') return porDefecto;
      const normalizado = val.trim().toLowerCase();
      if (normalizado === 'true' || normalizado === '1') return true;
      if (normalizado === 'false' || normalizado === '0') return false;
      throw new Error(`Valor booleano inválido: "${val}"`);
    });

const listaCsv = (minusculas = false) =>
  z
    .string()
    .optional()
    .transform((val) => {
      if (!val || val.trim() === '') return [] as string[];
      return val
        .split(',')
        .map((s) => (minusculas ? s.trim().toLowerCase() : s.trim()))
        .filter((s) => s.length > 0);
    });

const urlOpcional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined))
  .refine((v) => !v || /^https?:\/\/.+/.test(v), {
    message: 'Debe ser una URL HTTP/HTTPS válida',
  });

export const esquemaConfiguracion = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatorio'),
    DATABASE_SSL: z
      .enum(['true', 'false', 'no-verify'])
      .default('false'),
    GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID es obligatorio'),
    GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET es obligatorio'),
    FRONTEND_URL: z
      .string()
      .url('FRONTEND_URL debe ser una URL válida')
      .transform((u) => u.replace(/\/+$/, '')),
    SESSION_SECRET: z
      .string()
      .min(32, 'SESSION_SECRET debe tener al menos 32 caracteres'),
    INTEGRACION_KEY_ID: z.string().min(1, 'INTEGRACION_KEY_ID es obligatorio'),
    INTEGRACION_SECRET: z
      .string()
      .min(16, 'INTEGRACION_SECRET debe tener al menos 16 caracteres'),
    INTEGRACION_IPS_PERMITIDAS: listaCsv(false),
    PRINCIPAL_WEBHOOK_URL: urlOpcional,
    PRINCIPAL_WEBHOOK_SECRET: z
      .string()
      .optional()
      .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined)),
    PRINCIPAL_BITACORA_URL: urlOpcional,
    SMTP_HOST: z
      .string()
      .optional()
      .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined)),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z
      .string()
      .optional()
      .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined)),
    SMTP_PASS: z
      .string()
      .optional()
      .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined)),
    SMTP_FROM: z
      .string()
      .optional()
      .transform((v) =>
        v && v.trim() !== ''
          ? v.trim()
          : 'SIPREF Reservas <no-responder@ulatino.edu.mx>',
      ),
    DOMINIOS_PERMITIDOS: listaCsv(true),
    SOLICITUD_EXPIRACION_DIAS: z.coerce.number().int().min(1).max(365).default(30),
    CRON_SECRET: z.string().min(1, 'CRON_SECRET es obligatorio'),
    AUTH_DEV_BYPASS: booleanoDesdeTexto(false),
    TRUST_PROXY: booleanoDesdeTexto(true),
  })
  .superRefine((datos, ctx) => {
    if (datos.NODE_ENV === 'production' && datos.AUTH_DEV_BYPASS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_DEV_BYPASS'],
        message:
          'PROHIBIDO: AUTH_DEV_BYPASS no puede estar activo cuando NODE_ENV=production.',
      });
    }
    if (datos.PRINCIPAL_WEBHOOK_URL && !datos.PRINCIPAL_WEBHOOK_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PRINCIPAL_WEBHOOK_SECRET'],
        message:
          'PRINCIPAL_WEBHOOK_SECRET es obligatorio cuando PRINCIPAL_WEBHOOK_URL está configurado.',
      });
    }
  });

export type Configuracion = z.infer<typeof esquemaConfiguracion>;

export function validarConfiguracion(
  env: Record<string, string | undefined> = process.env,
): Configuracion {
  const resultado = esquemaConfiguracion.safeParse(env);
  if (!resultado.success) {
    const detalles = resultado.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Error de configuración en variables de entorno:\n${detalles}`,
    );
  }
  return resultado.data;
}

let configActiva: Configuracion | null = null;

export function obtenerConfig(): Configuracion {
  if (!configActiva) {
    configActiva = validarConfiguracion(process.env);
  }
  return configActiva;
}

export function establecerConfigParaPruebas(cfg: Configuracion): void {
  configActiva = cfg;
}

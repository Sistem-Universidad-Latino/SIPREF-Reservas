import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { enTransaccion, obtenerPool } from '../bd/pool.js';
import { obtenerConfig } from '../config.js';
import { ErrorApi } from '../errores.js';
import {
  COOKIE_ESTADO,
  COOKIE_OAUTH,
  COOKIE_SESION,
  escribirCookieEstado,
  escribirCookieOauth,
  escribirCookieSesion,
  limpiarCookiesAutenticacion,
  MAX_AGE_ESTADO_SEG,
  MAX_AGE_OAUTH_SEG,
  MAX_AGE_SESION_SEG,
} from '../seguridad/cookies.js';
import {
  type EstadoAcceso,
  requerirSesionAprobada,
  type RolUsuario,
} from '../seguridad/guardias.js';
import {
  firmarTokenDatos,
  generarPkce,
  generarTokenSesion,
  hashTokenSesion,
  type PayloadCookieEstado,
  type PayloadCookieOauth,
  verificarTokenDatos,
} from '../seguridad/tokens.js';
import { registrarAuditoria } from '../servicios/auditoria.js';
import { obtenerConfiguracionSistema } from '../servicios/configuracionBd.js';
import { encolarNotificacionSalida } from '../servicios/outbox.js';

const esquemaDevLogin = z.object({
  sub: z.string().min(1, 'El identificador sub es obligatorio'),
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  correo: z.string().email('El correo no es válido'),
  fotoUrl: z.string().url().optional().nullable(),
  estado: z
    .enum(['PENDIENTE', 'APROBADA', 'RECHAZADA', 'REVOCADA', 'EXPIRADA'])
    .optional(),
  rol: z.enum(['DOCENTE', 'PERSONAL', 'ADMIN_ESPACIOS']).optional(),
});

interface EntradaIdentidad {
  sub: string;
  nombre: string;
  correo: string;
  fotoUrl: string | null;
  ip: string | null;
  userAgent: string | null;
  forzarEstado?: EstadoAcceso;
  forzarRol?: RolUsuario;
}

interface ResultadoIdentidad {
  estado: EstadoAcceso;
  rol: RolUsuario | null;
  solicitudId: string | null;
  tokenSesionOpaco: string | null;
  destino: '/calendario' | '/acceso/estado';
}

async function procesarIngresoIdentidad(
  entrada: EntradaIdentidad,
): Promise<ResultadoIdentidad> {
  const pool = obtenerPool();
  const configSistema = await obtenerConfiguracionSistema(pool);

  return enTransaccion(async (tx) => {
    const { rows: existentes } = await tx.query(
      `SELECT google_sub, estado, rol FROM reservas_usuarios WHERE google_sub = $1 FOR UPDATE`,
      [entrada.sub],
    );

    let estadoActual: EstadoAcceso;
    let rolActual: RolUsuario | null;

    if (existentes.length === 0) {
      estadoActual = entrada.forzarEstado ?? 'PENDIENTE';
      rolActual =
        estadoActual === 'APROBADA'
          ? (entrada.forzarRol ?? 'DOCENTE')
          : (entrada.forzarRol ?? null);

      await tx.query(
        `
        INSERT INTO reservas_usuarios (
          google_sub, correo, correo_verificado, nombre, foto_url, rol, estado, ultimo_acceso_en
        )
        VALUES ($1, $2, TRUE, $3, $4, $5, $6, now())
        `,
        [
          entrada.sub,
          entrada.correo.toLowerCase(),
          entrada.nombre,
          entrada.fotoUrl,
          rolActual,
          estadoActual,
        ],
      );
    } else {
      const previo = existentes[0];
      estadoActual = (entrada.forzarEstado ?? previo.estado) as EstadoAcceso;
      rolActual = (entrada.forzarRol ?? previo.rol ?? null) as RolUsuario | null;
      if (estadoActual === 'APROBADA' && !rolActual) {
        rolActual = 'DOCENTE';
      }

      if (estadoActual === 'EXPIRADA' && !entrada.forzarEstado) {
        estadoActual = 'PENDIENTE';
      }

      await tx.query(
        `
        UPDATE reservas_usuarios
        SET correo = $2,
            correo_verificado = TRUE,
            nombre = $3,
            foto_url = COALESCE($4, foto_url),
            rol = $5,
            estado = $6,
            actualizado_en = now(),
            ultimo_acceso_en = now()
        WHERE google_sub = $1
        `,
        [
          entrada.sub,
          entrada.correo.toLowerCase(),
          entrada.nombre,
          entrada.fotoUrl,
          rolActual,
          estadoActual,
        ],
      );
    }

    if (estadoActual === 'APROBADA') {
      const { tokenOpaco, tokenHash } = generarTokenSesion();
      await tx.query(
        `
        INSERT INTO reservas_sesiones (token_hash, google_sub, expira_en, ip, user_agent)
        VALUES ($1, $2, now() + ($3 || ' seconds')::interval, $4, $5)
        `,
        [
          tokenHash,
          entrada.sub,
          String(MAX_AGE_SESION_SEG),
          entrada.ip,
          entrada.userAgent,
        ],
      );

      await registrarAuditoria(tx, {
        actorTipo: 'USUARIO_RESERVAS',
        actorId: entrada.sub,
        actorNombre: entrada.nombre,
        accion: 'sesion.iniciar',
        entidad: 'reservas_sesiones',
        entidadId: entrada.sub,
        ip: entrada.ip,
        userAgent: entrada.userAgent,
      });

      return {
        estado: 'APROBADA',
        rol: rolActual,
        solicitudId: null,
        tokenSesionOpaco: tokenOpaco,
        destino: '/calendario',
      };
    }

    if (estadoActual === 'PENDIENTE') {
      const { rows: solRows } = await tx.query(
        `
        INSERT INTO reservas_solicitudes_acceso (
          google_sub,
          correo,
          nombre,
          foto_url,
          estado,
          intentado_en,
          ultimo_intento_en,
          intentos,
          expira_en,
          ip_origen,
          user_agent
        )
        VALUES (
          $1, $2, $3, $4, 'PENDIENTE', now(), now(), 1,
          now() + ($5 || ' days')::interval, $6, $7
        )
        ON CONFLICT (google_sub) WHERE estado = 'PENDIENTE'
        DO UPDATE SET
          intentos = reservas_solicitudes_acceso.intentos + 1,
          ultimo_intento_en = now(),
          correo = EXCLUDED.correo,
          nombre = EXCLUDED.nombre,
          foto_url = COALESCE(EXCLUDED.foto_url, reservas_solicitudes_acceso.foto_url),
          ip_origen = EXCLUDED.ip_origen,
          user_agent = EXCLUDED.user_agent
        RETURNING id, intentado_en, (xmax = 0) AS recien_creada
        `,
        [
          entrada.sub,
          entrada.correo.toLowerCase(),
          entrada.nombre,
          entrada.fotoUrl,
          String(configSistema.solicitudExpiracionDias),
          entrada.ip,
          entrada.userAgent,
        ],
      );

      const sol = solRows[0];
      const solicitudId = String(sol.id);
      const recienCreada = Boolean(sol.recien_creada);

      if (recienCreada) {
        const claveIdem = `solicitud_acceso.creada:${solicitudId}`;
        const intentadoIso = new Date(sol.intentado_en).toISOString();

        await encolarNotificacionSalida(tx, {
          tipo: 'solicitud_acceso.creada',
          claveIdempotencia: claveIdem,
          payload: {
            evento: 'solicitud_acceso.creada',
            idEvento: claveIdem,
            ocurridoEn: intentadoIso,
            datos: {
              solicitudId,
              nombre: entrada.nombre,
              correo: entrada.correo.toLowerCase(),
              fotoUrl: entrada.fotoUrl,
              intentadoEn: intentadoIso,
            },
          },
        });

        await registrarAuditoria(tx, {
          actorTipo: 'USUARIO_RESERVAS',
          actorId: entrada.sub,
          actorNombre: entrada.nombre,
          accion: 'solicitud.crear',
          entidad: 'reservas_solicitudes_acceso',
          entidadId: solicitudId,
          datosDespues: {
            solicitudId,
            correo: entrada.correo.toLowerCase(),
            estado: 'PENDIENTE',
          },
          ip: entrada.ip,
          userAgent: entrada.userAgent,
        });
      }

      return {
        estado: 'PENDIENTE',
        rol: null,
        solicitudId,
        tokenSesionOpaco: null,
        destino: '/acceso/estado',
      };
    }

    // RECHAZADA, REVOCADA o EXPIRADA forzada
    const { rows: ultimas } = await tx.query(
      `
      SELECT id
      FROM reservas_solicitudes_acceso
      WHERE google_sub = $1
      ORDER BY intentado_en DESC
      LIMIT 1
      `,
      [entrada.sub],
    );

    let solicitudId: string;
    if (ultimas.length > 0) {
      solicitudId = String(ultimas[0].id);
    } else {
      const { rows: creada } = await tx.query(
        `
        INSERT INTO reservas_solicitudes_acceso (
          google_sub, correo, nombre, foto_url, estado, expira_en, resuelto_en
        )
        VALUES (
          $1, $2, $3, $4, $5,
          now() + ($6 || ' days')::interval,
          CASE WHEN $5 IN ('APROBADA', 'RECHAZADA', 'REVOCADA') THEN now() ELSE NULL END
        )
        RETURNING id
        `,
        [
          entrada.sub,
          entrada.correo.toLowerCase(),
          entrada.nombre,
          entrada.fotoUrl,
          estadoActual,
          String(configSistema.solicitudExpiracionDias),
        ],
      );
      solicitudId = String(creada[0].id);
    }

    return {
      estado: estadoActual,
      rol: rolActual,
      solicitudId,
      tokenSesionOpaco: null,
      destino: '/acceso/estado',
    };
  }, pool);
}

function aplicarCookiesSegunResultado(
  reply: FastifyReply,
  sub: string,
  resultado: ResultadoIdentidad,
): void {
  const cfg = obtenerConfig();
  if (resultado.tokenSesionOpaco) {
    escribirCookieSesion(reply, resultado.tokenSesionOpaco);
  }
  if (resultado.solicitudId) {
    const payloadEstado: PayloadCookieEstado = {
      sub,
      solicitudId: resultado.solicitudId,
      exp: Math.floor(Date.now() / 1000) + MAX_AGE_ESTADO_SEG,
    };
    const firmado = firmarTokenDatos(payloadEstado, cfg.SESSION_SECRET);
    escribirCookieEstado(reply, firmado);
  }
}

export async function rutasAuth(app: FastifyInstance): Promise<void> {
  const cfg = obtenerConfig();

  // 1) Iniciar flujo OAuth 2.0 + PKCE con Google
  app.get('/api/auth/google/iniciar', async (_request, reply) => {
    const redirectUri = `${cfg.FRONTEND_URL}/api/auth/google/callback`;
    const oauthClient = new OAuth2Client(
      cfg.GOOGLE_CLIENT_ID,
      cfg.GOOGLE_CLIENT_SECRET,
      redirectUri,
    );

    const { state, codeVerifier, codeChallenge } = generarPkce();
    const payloadOauth: PayloadCookieOauth = {
      state,
      codeVerifier,
      exp: Math.floor(Date.now() / 1000) + MAX_AGE_OAUTH_SEG,
    };

    escribirCookieOauth(
      reply,
      firmarTokenDatos(payloadOauth, cfg.SESSION_SECRET),
    );

    const urlAutorizacion = oauthClient.generateAuthUrl({
      redirect_uri: redirectUri,
      scope: ['openid', 'email', 'profile'],
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256' as never,
      prompt: 'select_account',
      response_type: 'code',
    });

    return reply.redirect(urlAutorizacion, 302);
  });

  // 2) Callback de Google OAuth 2.0
  app.get('/api/auth/google/callback', async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };
    if (query.error || !query.code || !query.state) {
      return reply.redirect(`${cfg.FRONTEND_URL}/ingresar?error=google`, 302);
    }

    const cookieOauth = request.cookies?.[COOKIE_OAUTH];
    const datosOauth = verificarTokenDatos<PayloadCookieOauth>(
      cookieOauth,
      cfg.SESSION_SECRET,
    );

    if (
      !datosOauth ||
      datosOauth.state !== query.state ||
      datosOauth.exp < Math.floor(Date.now() / 1000)
    ) {
      return reply.redirect(`${cfg.FRONTEND_URL}/ingresar?error=google`, 302);
    }

    try {
      const redirectUri = `${cfg.FRONTEND_URL}/api/auth/google/callback`;
      const oauthClient = new OAuth2Client(
        cfg.GOOGLE_CLIENT_ID,
        cfg.GOOGLE_CLIENT_SECRET,
        redirectUri,
      );

      const { tokens } = await oauthClient.getToken({
        code: query.code,
        codeVerifier: datosOauth.codeVerifier,
        redirect_uri: redirectUri,
      });

      if (!tokens.id_token) {
        return reply.redirect(`${cfg.FRONTEND_URL}/ingresar?error=google`, 302);
      }

      const ticket = await oauthClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: cfg.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (
        !payload ||
        !payload.sub ||
        !payload.email ||
        !payload.email_verified
      ) {
        return reply.redirect(`${cfg.FRONTEND_URL}/ingresar?error=google`, 302);
      }

      const correo = payload.email.toLowerCase();
      const dominio = correo.split('@')[1] ?? '';
      const configSistema = await obtenerConfiguracionSistema();

      if (
        configSistema.dominiosPermitidos.length > 0 &&
        !configSistema.dominiosPermitidos.includes(dominio)
      ) {
        return reply.redirect(`${cfg.FRONTEND_URL}/ingresar?error=dominio`, 302);
      }

      const resultado = await procesarIngresoIdentidad({
        sub: payload.sub,
        nombre: payload.name ?? correo,
        correo,
        fotoUrl: payload.picture ?? null,
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });

      aplicarCookiesSegunResultado(reply, payload.sub, resultado);
      return reply.redirect(`${cfg.FRONTEND_URL}${resultado.destino}`, 302);
    } catch (err) {
      request.log.error({ err }, 'Fallo en callback de Google OAuth');
      return reply.redirect(`${cfg.FRONTEND_URL}/ingresar?error=google`, 302);
    }
  });

  // 3) Consultar el estado de la solicitud de acceso (cookie sr_estado o sr_sesion)
  app.get('/api/auth/estado-solicitud', async (request, reply) => {
    const pool = obtenerPool();
    let sub: string | null = null;
    let solicitudIdPreferida: string | null = null;
    let tieneSesionActiva = false;

    const tokenEstado = request.cookies?.[COOKIE_ESTADO];
    if (tokenEstado) {
      const datos = verificarTokenDatos<PayloadCookieEstado>(
        tokenEstado,
        cfg.SESSION_SECRET,
      );
      if (datos && datos.exp >= Math.floor(Date.now() / 1000)) {
        sub = datos.sub;
        solicitudIdPreferida = datos.solicitudId;
      }
    }

    const tokenSesion = request.cookies?.[COOKIE_SESION];
    if (tokenSesion) {
      const tokenHash = hashTokenSesion(tokenSesion);
      const { rows: sesRows } = await pool.query(
        `
        SELECT google_sub
        FROM reservas_sesiones
        WHERE token_hash = $1
          AND revocada_en IS NULL
          AND expira_en > now()
        LIMIT 1
        `,
        [tokenHash],
      );
      if (sesRows.length > 0) {
        sub = String(sesRows[0].google_sub);
        tieneSesionActiva = true;
      }
    }

    if (!sub) {
      throw new ErrorApi(
        401,
        'NO_AUTENTICADO',
        'No se encontró una cookie válida para consultar el estado de la solicitud.',
      );
    }

    const { rows: usuRows } = await pool.query(
      `SELECT google_sub, nombre, correo, foto_url, estado, rol, creado_en FROM reservas_usuarios WHERE google_sub = $1 LIMIT 1`,
      [sub],
    );

    if (usuRows.length === 0) {
      throw new ErrorApi(401, 'NO_AUTENTICADO', 'Cuenta no encontrada.');
    }

    const usuario = usuRows[0];
    const estadoCuenta = String(usuario.estado) as EstadoAcceso;

    const { rows: solRows } = await pool.query(
      solicitudIdPreferida
        ? `
          SELECT id, nombre, correo, foto_url, estado, intentado_en, expira_en, resuelto_en, rol_asignado
          FROM reservas_solicitudes_acceso
          WHERE google_sub = $1
          ORDER BY (id = $2::uuid) DESC, intentado_en DESC
          LIMIT 1
          `
        : `
          SELECT id, nombre, correo, foto_url, estado, intentado_en, expira_en, resuelto_en, rol_asignado
          FROM reservas_solicitudes_acceso
          WHERE google_sub = $1
          ORDER BY intentado_en DESC
          LIMIT 1
          `,
      solicitudIdPreferida ? [sub, solicitudIdPreferida] : [sub],
    );

    // Si la cuenta ya fue aprobada y el usuario tenía solo sr_estado, emitimos también sr_sesion
    if (estadoCuenta === 'APROBADA' && !tieneSesionActiva) {
      const { tokenOpaco, tokenHash } = generarTokenSesion();
      await pool.query(
        `
        INSERT INTO reservas_sesiones (token_hash, google_sub, expira_en, ip, user_agent)
        VALUES ($1, $2, now() + ($3 || ' seconds')::interval, $4, $5)
        `,
        [
          tokenHash,
          sub,
          String(MAX_AGE_SESION_SEG),
          request.ip,
          request.headers['user-agent'] ?? null,
        ],
      );
      escribirCookieSesion(reply, tokenOpaco);
    }

    const sol = solRows[0];
    const ahoraIso = new Date().toISOString();

    return {
      estado: estadoCuenta,
      solicitud: sol
        ? {
            id: String(sol.id),
            nombre: String(sol.nombre),
            correo: String(sol.correo),
            fotoUrl: sol.foto_url ? String(sol.foto_url) : null,
            intentadoEn: new Date(sol.intentado_en).toISOString(),
            expiraEn: new Date(sol.expira_en).toISOString(),
            resueltoEn: sol.resuelto_en
              ? new Date(sol.resuelto_en).toISOString()
              : null,
            rolAsignado: sol.rol_asignado ? String(sol.rol_asignado) : null,
          }
        : {
            id: '00000000-0000-0000-0000-000000000000',
            nombre: String(usuario.nombre),
            correo: String(usuario.correo),
            fotoUrl: usuario.foto_url ? String(usuario.foto_url) : null,
            intentadoEn: new Date(usuario.creado_en ?? ahoraIso).toISOString(),
            expiraEn: ahoraIso,
            resueltoEn: null,
            rolAsignado: usuario.rol ? String(usuario.rol) : null,
          },
      puedeEntrar: estadoCuenta === 'APROBADA',
    };
  });

  // 4) Perfil de sesión activa (/api/auth/yo)
  app.get(
    '/api/auth/yo',
    { preHandler: [requerirSesionAprobada] },
    async (request) => {
      const u = request.usuario!;
      return {
        sub: u.sub,
        nombre: u.nombre,
        correo: u.correo,
        fotoUrl: u.fotoUrl,
        rol: u.rol,
        estado: u.estado,
      };
    },
  );

  // 5) Cerrar sesión (/api/auth/salir)
  app.post('/api/auth/salir', async (request, reply) => {
    const tokenOpaco = request.cookies?.[COOKIE_SESION];
    if (tokenOpaco) {
      const tokenHash = hashTokenSesion(tokenOpaco);
      const pool = obtenerPool();
      await pool.query(
        `UPDATE reservas_sesiones SET revocada_en = now() WHERE token_hash = $1 AND revocada_en IS NULL`,
        [tokenHash],
      );
    }
    limpiarCookiesAutenticacion(reply);
    return reply.status(204).send();
  });

  // 6) Bypass de desarrollo (/api/auth/dev) — SOLO si NODE_ENV !== 'production' y AUTH_DEV_BYPASS=true
  if (cfg.NODE_ENV !== 'production' && cfg.AUTH_DEV_BYPASS) {
    app.post(
      '/api/auth/dev',
      async (request: FastifyRequest, reply: FastifyReply) => {
        const datos = esquemaDevLogin.parse(request.body);
        const configSistema = await obtenerConfiguracionSistema();
        const correo = datos.correo.toLowerCase();
        const dominio = correo.split('@')[1] ?? '';

        if (
          configSistema.dominiosPermitidos.length > 0 &&
          !configSistema.dominiosPermitidos.includes(dominio)
        ) {
          throw new ErrorApi(
            403,
            'DOMINIO_NO_PERMITIDO',
            'El dominio de correo electrónico no está permitido en esta institución.',
          );
        }

        const resultado = await procesarIngresoIdentidad({
          sub: datos.sub,
          nombre: datos.nombre,
          correo,
          fotoUrl: datos.fotoUrl ?? null,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
          forzarEstado: datos.estado,
          forzarRol: datos.rol,
        });

        aplicarCookiesSegunResultado(reply, datos.sub, resultado);

        return {
          estado: resultado.estado,
          rol: resultado.rol,
          solicitudId: resultado.solicitudId,
          puedeEntrar: resultado.estado === 'APROBADA',
          destino: resultado.destino,
        };
      },
    );
  }
}

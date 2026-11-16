import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { construirApp } from '../src/app.js';
import { cerrarPool, crearPool, establecerPool } from '../src/bd/pool.js';
import {
  establecerConfigParaPruebas,
  validarConfiguracion,
} from '../src/config.js';
import { calcularFirmaHmac } from '../src/seguridad/hmac.js';

const testDbUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDbUrl)(
  'Pruebas de integración contra PostgreSQL local · SIPREF Reservas API',
  () => {
    let app: FastifyInstance;
    let pool: pg.Pool;

    const cfg = validarConfiguracion({
      PORT: '4000',
      NODE_ENV: 'test',
      DATABASE_URL:
        testDbUrl ??
        'postgres://sipref_reservas_app:app_local_dev@localhost:5433/sipref',
      DATABASE_SSL: 'false',
      GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      FRONTEND_URL: 'http://localhost:5173',
      SESSION_SECRET: 'secreto_de_pruebas_integracion_con_mas_de_32_caracteres',
      INTEGRACION_KEY_ID: 'sipref-principal-test',
      INTEGRACION_SECRET: 'secreto_hmac_integracion_pruebas_locales_12345',
      CRON_SECRET: 'cron_secret_pruebas_locales',
      AUTH_DEV_BYPASS: 'true',
      TRUST_PROXY: 'true',
    });

    const sufijo = Date.now().toString(36);
    const usuarioPrueba = {
      sub: `test-sub-${sufijo}`,
      nombre: 'Dra. Sofía Pruebas',
      correo: `sofia.${sufijo}@ulatino.edu.mx`,
    };

    let solicitudCreadaId = '';
    let cookieSesion = '';
    let reservacionCreadaId = '';

    function encabezadosHmac(metodo: string, pathConQuery: string, cuerpo = '') {
      const ts = String(Math.floor(Date.now() / 1000));
      const firma = calcularFirmaHmac(
        cfg.INTEGRACION_SECRET,
        ts,
        metodo,
        pathConQuery,
        cuerpo,
      );
      return {
        'x-sipref-key-id': cfg.INTEGRACION_KEY_ID,
        'x-sipref-timestamp': ts,
        'x-sipref-signature': firma,
        'content-type': 'application/json',
      };
    }

    function extraerCookieHeader(
      setCookieHeader: string | string[] | undefined,
    ): string {
      if (!setCookieHeader) return '';
      const lista = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : [setCookieHeader];
      return lista.map((c) => c.split(';')[0]).join('; ');
    }

    beforeAll(async () => {
      establecerConfigParaPruebas(cfg);
      pool = crearPool(cfg);
      establecerPool(pool);
      app = await construirApp(cfg);
      await app.ready();
    });

    afterAll(async () => {
      if (pool) {
        await pool.query(
          `DELETE FROM reservas_reservaciones WHERE creado_por = $1`,
          [usuarioPrueba.sub],
        );
        await pool.query(
          `DELETE FROM reservas_sesiones WHERE google_sub = $1`,
          [usuarioPrueba.sub],
        );
        await pool.query(
          `DELETE FROM reservas_solicitudes_acceso WHERE google_sub = $1`,
          [usuarioPrueba.sub],
        );
        await pool.query(
          `DELETE FROM reservas_usuarios WHERE google_sub = $1`,
          [usuarioPrueba.sub],
        );
      }
      if (app) await app.close();
      await cerrarPool();
    });

    it('1. Dev login crea una sola solicitud PENDIENTE aunque se intente repetidas veces', async () => {
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/auth/dev',
        payload: usuarioPrueba,
      });
      expect(res1.statusCode).toBe(200);
      const body1 = res1.json();
      expect(body1.estado).toBe('PENDIENTE');
      expect(body1.puedeEntrar).toBe(false);
      expect(body1.solicitudId).toBeTruthy();
      solicitudCreadaId = body1.solicitudId;

      // Segundo intento repetido con la misma cuenta
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/auth/dev',
        payload: usuarioPrueba,
      });
      expect(res2.statusCode).toBe(200);
      const body2 = res2.json();
      expect(body2.estado).toBe('PENDIENTE');
      expect(body2.solicitudId).toBe(solicitudCreadaId);

      // Verificar en BD que solo existe 1 solicitud PENDIENTE y tiene intentos = 2
      const { rows } = await pool.query(
        `SELECT id, intentos FROM reservas_solicitudes_acceso WHERE google_sub = $1 AND estado = 'PENDIENTE'`,
        [usuarioPrueba.sub],
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0].intentos)).toBe(2);
    });

    it('2. Aprobación mediante API de integración firmada con HMAC activa la sesión', async () => {
      const path = `/api/integracion/v1/solicitudes/${solicitudCreadaId}/aprobar`;
      const payload = JSON.stringify({
        rol: 'DOCENTE',
        admin: { id: 'admin-sipref-1', nombre: 'Director Académico' },
      });

      const resAprobar = await app.inject({
        method: 'POST',
        url: path,
        headers: encabezadosHmac('POST', path, payload),
        payload,
      });
      expect(resAprobar.statusCode).toBe(200);
      expect(resAprobar.json().estado).toBe('APROBADA');
      expect(resAprobar.json().rolAsignado).toBe('DOCENTE');

      // Reintento idempotente con el mismo rol devuelve 200
      const resIdem = await app.inject({
        method: 'POST',
        url: path,
        headers: encabezadosHmac('POST', path, payload),
        payload,
      });
      expect(resIdem.statusCode).toBe(200);

      // Ahora iniciar sesión vía dev login emite cookie de sesión funcional
      const resLogin = await app.inject({
        method: 'POST',
        url: '/api/auth/dev',
        payload: usuarioPrueba,
      });
      expect(resLogin.statusCode).toBe(200);
      expect(resLogin.json().estado).toBe('APROBADA');
      expect(resLogin.json().puedeEntrar).toBe(true);

      cookieSesion = extraerCookieHeader(resLogin.headers['set-cookie']);
      expect(cookieSesion).toContain('sr_sesion=');

      const resYo = await app.inject({
        method: 'GET',
        url: '/api/auth/yo',
        headers: { cookie: cookieSesion },
      });
      expect(resYo.statusCode).toBe(200);
      expect(resYo.json()).toMatchObject({
        sub: usuarioPrueba.sub,
        rol: 'DOCENTE',
        estado: 'APROBADA',
      });
    });

    it('3. Crea una reservación válida y registra auditoría', async () => {
      const resCrear = await app.inject({
        method: 'POST',
        url: '/api/reservaciones',
        headers: { cookie: cookieSesion },
        payload: {
          tipoEvento: 'CONFERENCIA',
          espacioId: 'A-101',
          nombreEvento: 'Seminario de Investigación',
          inicio: '2031-05-10T10:00:00-06:00',
          fin: '2031-05-10T12:00:00-06:00',
          responsable: usuarioPrueba.nombre,
          correoResponsable: usuarioPrueba.correo,
          descripcion: 'Seminario departamental',
          observaciones: '',
          asistentesEstimados: 30,
          recursos: [{ recursoId: 1, cantidad: 2 }],
          recordatorios: [{ canal: 'CORREO', anticipacion: 1, unidad: 'DIAS' }],
        },
      });

      expect(resCrear.statusCode).toBe(201);
      const detalle = resCrear.json();
      expect(detalle.id).toBeTruthy();
      expect(detalle.codigo).toMatch(/^RES-2031-\d{6}$/);
      expect(detalle.estado).toBe('PENDIENTE');
      reservacionCreadaId = detalle.id;
    });

    it('4. Rechaza con 409 CONFLICTO_HORARIO traslapes directos, dentro de los 15 min de buffer y contra SIPREF principal', async () => {
      // 4a) Dentro del buffer de 15 minutos (12:10, cuando el anterior terminó a las 12:00)
      const resBuffer = await app.inject({
        method: 'POST',
        url: '/api/reservaciones',
        headers: { cookie: cookieSesion },
        payload: {
          tipoEvento: 'JUNTA',
          espacioId: 'A-101',
          nombreEvento: 'Junta dentro del buffer',
          inicio: '2031-05-10T12:10:00-06:00',
          fin: '2031-05-10T13:00:00-06:00',
          responsable: usuarioPrueba.nombre,
          correoResponsable: usuarioPrueba.correo,
          descripcion: '',
          observaciones: '',
          asistentesEstimados: 10,
          recursos: [],
          recordatorios: [],
        },
      });
      expect(resBuffer.statusCode).toBe(409);
      expect(resBuffer.json().error.codigo).toBe('CONFLICTO_HORARIO');
      expect(resBuffer.json().error.detalles.conflictos[0].origen).toBe('RESERVAS');

      // 4b) Conflicto contra la reservación stub de SIPREF principal P-9001
      // ('AUD-1', '2032-06-15T10:00:00-06:00' a '2032-06-15T13:00:00-06:00')
      const resPrincipal = await app.inject({
        method: 'POST',
        url: '/api/reservaciones',
        headers: { cookie: cookieSesion },
        payload: {
          tipoEvento: 'CONFERENCIA',
          espacioId: 'AUD-1',
          nombreEvento: 'Evento que choca con Ceremonia de Graduación Principal',
          inicio: '2032-06-15T13:10:00-06:00',
          fin: '2032-06-15T15:00:00-06:00',
          responsable: usuarioPrueba.nombre,
          correoResponsable: usuarioPrueba.correo,
          descripcion: '',
          observaciones: '',
          asistentesEstimados: 100,
          recursos: [],
          recordatorios: [],
        },
      });
      expect(resPrincipal.statusCode).toBe(409);
      expect(resPrincipal.json().error.codigo).toBe('CONFLICTO_HORARIO');
      expect(
        resPrincipal
          .json()
          .error.detalles.conflictos.some((c: { origen: string }) => c.origen === 'SIPREF'),
      ).toBe(true);
    });

    it('5. Creación concurrente de dos reservaciones traslapadas con Promise.all: exactamente una tiene éxito', async () => {
      const payloadBase = {
        tipoEvento: 'TALLER',
        espacioId: 'B-105',
        inicio: '2031-08-20T09:00:00-06:00',
        fin: '2031-08-20T11:00:00-06:00',
        responsable: usuarioPrueba.nombre,
        correoResponsable: usuarioPrueba.correo,
        descripcion: '',
        observaciones: '',
        asistentesEstimados: 20,
        recursos: [],
        recordatorios: [],
      };

      const [r1, r2] = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/api/reservaciones',
          headers: { cookie: cookieSesion },
          payload: { ...payloadBase, nombreEvento: 'Concurrente A' },
        }),
        app.inject({
          method: 'POST',
          url: '/api/reservaciones',
          headers: { cookie: cookieSesion },
          payload: { ...payloadBase, nombreEvento: 'Concurrente B' },
        }),
      ]);

      const codigos = [r1.statusCode, r2.statusCode].sort();
      expect(codigos).toEqual([201, 409]);
    });

    it('6. Cancela lógicamente una reservación y rechaza doble cancelación', async () => {
      const resCancelar = await app.inject({
        method: 'POST',
        url: `/api/reservaciones/${reservacionCreadaId}/cancelar`,
        headers: { cookie: cookieSesion },
        payload: { motivo: 'Cambio de fecha por causas académicas' },
      });
      expect(resCancelar.statusCode).toBe(200);
      expect(resCancelar.json().estado).toBe('CANCELADA');
      expect(resCancelar.json().cancelacion.motivo).toBe(
        'Cambio de fecha por causas académicas',
      );

      const resRepetida = await app.inject({
        method: 'POST',
        url: `/api/reservaciones/${reservacionCreadaId}/cancelar`,
        headers: { cookie: cookieSesion },
        payload: { motivo: 'Segundo intento' },
      });
      expect(resRepetida.statusCode).toBe(409);
      expect(resRepetida.json().error.codigo).toBe('ESTADO_INVALIDO');
    });

    it('7. Revocar al usuario vía API de integración hace que /api/auth/yo devuelva 403 inmediatamente', async () => {
      const path = `/api/integracion/v1/usuarios/${encodeURIComponent(usuarioPrueba.sub)}/revocar`;
      const payload = JSON.stringify({
        motivo: 'Fin de contrato docente',
        admin: { id: 'admin-sipref-1', nombre: 'Director Académico' },
      });

      const resRevocar = await app.inject({
        method: 'POST',
        url: path,
        headers: encabezadosHmac('POST', path, payload),
        payload,
      });
      expect(resRevocar.statusCode).toBe(200);
      expect(resRevocar.json().estado).toBe('REVOCADA');

      const resYo = await app.inject({
        method: 'GET',
        url: '/api/auth/yo',
        headers: { cookie: cookieSesion },
      });
      expect(resYo.statusCode).toBe(403);
      expect(resYo.json().error.codigo).toBe('ACCESO_NO_APROBADO');
    });
  },
);

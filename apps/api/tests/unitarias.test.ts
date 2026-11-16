import { describe, expect, it } from 'vitest';
import { validarConfiguracion } from '../src/config.js';
import {
  calcularFirmaHmac,
  construirMensajeCanonicoHmac,
  sha256Hex,
  verificarFirmaHmac,
} from '../src/seguridad/hmac.js';
import {
  firmarTokenDatos,
  verificarTokenDatos,
} from '../src/seguridad/tokens.js';
import {
  calcularEnviarEn,
  derivarEstadoReservacion,
  hayTraslapeConBuffer,
} from '../src/servicios/conflictos.js';
import { calcularEsperaMinutosOutbox } from '../src/servicios/outbox.js';

const envBaseValido: Record<string, string> = {
  PORT: '4000',
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://sipref_reservas_app:app_local_dev@localhost:5433/sipref',
  DATABASE_SSL: 'false',
  GOOGLE_CLIENT_ID: 'client-id-prueba.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'GOCSPX-secreto-prueba',
  FRONTEND_URL: 'http://localhost:5173/',
  SESSION_SECRET: 'secreto_de_sesion_muy_largo_al_menos_32_caracteres_ok',
  INTEGRACION_KEY_ID: 'sipref-principal-local',
  INTEGRACION_SECRET: 'secreto_hmac_integracion_super_seguro_1234',
  CRON_SECRET: 'secreto_cron_123456',
  AUTH_DEV_BYPASS: 'true',
  TRUST_PROXY: 'true',
};

describe('Pruebas unitarias · SIPREF Reservas API', () => {
  describe('1. Firma y verificación HMAC de integración', () => {
    const keyId = 'sipref-principal-key';
    const secreto = 'secreto_compartido_hmac_256_bits_prueba';
    const ahoraSeg = 1_763_250_000;

    it('calcula correctamente el mensaje canónico con cuerpo vacío (SHA256(""))', () => {
      const msg = construirMensajeCanonicoHmac(
        ahoraSeg,
        'GET',
        '/api/integracion/v1/solicitudes?estado=PENDIENTE',
        '',
      );
      expect(msg).toBe(
        `${ahoraSeg}.GET./api/integracion/v1/solicitudes?estado=PENDIENTE.${sha256Hex('')}`,
      );
    });

    it('acepta una firma HMAC válida para GET y POST', () => {
      const pathGet = '/api/integracion/v1/solicitudes/conteo';
      const firmaGet = calcularFirmaHmac(secreto, ahoraSeg, 'GET', pathGet, '');

      const resGet = verificarFirmaHmac({
        keyIdRecibido: keyId,
        timestampRecibido: String(ahoraSeg),
        firmaRecibida: firmaGet,
        metodo: 'GET',
        pathConQuery: pathGet,
        cuerpoCrudo: '',
        keyIdEsperado: keyId,
        secreto,
        ahoraSegundos: ahoraSeg + 45,
      });
      expect(resGet.valido).toBe(true);

      const pathPost = '/api/integracion/v1/solicitudes/123/aprobar';
      const cuerpo = JSON.stringify({
        rol: 'DOCENTE',
        admin: { id: 'adm-1', nombre: 'Admin General' },
      });
      const firmaPost = calcularFirmaHmac(
        secreto,
        ahoraSeg,
        'POST',
        pathPost,
        cuerpo,
      );

      const resPost = verificarFirmaHmac({
        keyIdRecibido: keyId,
        timestampRecibido: String(ahoraSeg),
        firmaRecibida: firmaPost,
        metodo: 'POST',
        pathConQuery: pathPost,
        cuerpoCrudo: cuerpo,
        keyIdEsperado: keyId,
        secreto,
        ahoraSegundos: ahoraSeg,
      });
      expect(resPost.valido).toBe(true);
    });

    it('rechaza firmas cuyo timestamp se desvía más de 300 segundos', () => {
      const path = '/api/integracion/v1/solicitudes';
      const firma = calcularFirmaHmac(secreto, ahoraSeg, 'GET', path, '');

      const expirada = verificarFirmaHmac({
        keyIdRecibido: keyId,
        timestampRecibido: String(ahoraSeg),
        firmaRecibida: firma,
        metodo: 'GET',
        pathConQuery: path,
        cuerpoCrudo: '',
        keyIdEsperado: keyId,
        secreto,
        ahoraSegundos: ahoraSeg + 301,
      });
      expect(expirada.valido).toBe(false);
    });

    it('rechaza si el cuerpo, la ruta o el Key-Id fueron alterados', () => {
      const path = '/api/integracion/v1/usuarios/sub-1/revocar';
      const cuerpoOriginal = '{"admin":{"id":"1","nombre":"Admin"}}';
      const firma = calcularFirmaHmac(
        secreto,
        ahoraSeg,
        'POST',
        path,
        cuerpoOriginal,
      );

      const cuerpoAlterado = verificarFirmaHmac({
        keyIdRecibido: keyId,
        timestampRecibido: String(ahoraSeg),
        firmaRecibida: firma,
        metodo: 'POST',
        pathConQuery: path,
        cuerpoCrudo: '{"admin":{"id":"2","nombre":"Intruso"}}',
        keyIdEsperado: keyId,
        secreto,
        ahoraSegundos: ahoraSeg,
      });
      expect(cuerpoAlterado.valido).toBe(false);

      const keyInvalido = verificarFirmaHmac({
        keyIdRecibido: 'otro-key-id',
        timestampRecibido: String(ahoraSeg),
        firmaRecibida: firma,
        metodo: 'POST',
        pathConQuery: path,
        cuerpoCrudo: cuerpoOriginal,
        keyIdEsperado: keyId,
        secreto,
        ahoraSegundos: ahoraSeg,
      });
      expect(keyInvalido.valido).toBe(false);
    });
  });

  describe('2. Lógica de traslape de horarios y buffer de 15 minutos', () => {
    const buffer = 15;
    const baseInicio = new Date('2026-11-20T10:00:00-06:00');
    const baseFin = new Date('2026-11-20T12:00:00-06:00');

    it('detecta traslape directo entre dos intervalos', () => {
      const nuevoInicio = new Date('2026-11-20T11:00:00-06:00');
      const nuevoFin = new Date('2026-11-20T13:00:00-06:00');
      expect(
        hayTraslapeConBuffer(baseInicio, baseFin, nuevoInicio, nuevoFin, buffer),
      ).toBe(true);
    });

    it('detecta conflicto cuando el segundo evento inicia dentro de los 15 min de buffer posterior', () => {
      const nuevoInicio = new Date('2026-11-20T12:10:00-06:00');
      const nuevoFin = new Date('2026-11-20T13:30:00-06:00');
      expect(
        hayTraslapeConBuffer(baseInicio, baseFin, nuevoInicio, nuevoFin, buffer),
      ).toBe(true);
    });

    it('detecta conflicto cuando un evento previo termina a menos de 15 min antes del inicio', () => {
      const previoInicio = new Date('2026-11-20T08:30:00-06:00');
      const previoFin = new Date('2026-11-20T09:50:00-06:00');
      expect(
        hayTraslapeConBuffer(baseInicio, baseFin, previoInicio, previoFin, buffer),
      ).toBe(true);
    });

    it('permite un evento que inicia exactamente al cumplirse los 15 minutos de buffer (12:15)', () => {
      const nuevoInicio = new Date('2026-11-20T12:15:00-06:00');
      const nuevoFin = new Date('2026-11-20T14:00:00-06:00');
      expect(
        hayTraslapeConBuffer(baseInicio, baseFin, nuevoInicio, nuevoFin, buffer),
      ).toBe(false);
    });

    it('permite un evento previo que termina exactamente 15 minutos antes (09:45)', () => {
      const previoInicio = new Date('2026-11-20T08:00:00-06:00');
      const previoFin = new Date('2026-11-20T09:45:00-06:00');
      expect(
        hayTraslapeConBuffer(baseInicio, baseFin, previoInicio, previoFin, buffer),
      ).toBe(false);
    });
  });

  describe('3. Derivación del estado mostrado de la reservación', () => {
    const ahora = new Date('2026-11-20T12:00:00-06:00');

    it('muestra PENDIENTE si está PROGRAMADA y aún no ha concluido', () => {
      const finFuturo = new Date('2026-11-20T13:00:00-06:00');
      expect(derivarEstadoReservacion('PROGRAMADA', finFuturo, ahora)).toBe(
        'PENDIENTE',
      );
    });

    it('muestra REALIZADA si está PROGRAMADA y su hora de fin ya pasó', () => {
      const finPasado = new Date('2026-11-20T11:59:59-06:00');
      expect(derivarEstadoReservacion('PROGRAMADA', finPasado, ahora)).toBe(
        'REALIZADA',
      );
    });

    it('muestra CANCELADA siempre que el estado en BD sea CANCELADA', () => {
      const finFuturo = new Date('2026-11-25T12:00:00-06:00');
      const finPasado = new Date('2026-11-10T12:00:00-06:00');
      expect(derivarEstadoReservacion('CANCELADA', finFuturo, ahora)).toBe(
        'CANCELADA',
      );
      expect(derivarEstadoReservacion('CANCELADA', finPasado, ahora)).toBe(
        'CANCELADA',
      );
    });
  });

  describe('4. Validación de entorno y guardia de producción para AUTH_DEV_BYPASS', () => {
    it('se niega a iniciar si NODE_ENV=production y AUTH_DEV_BYPASS=true', () => {
      expect(() =>
        validarConfiguracion({
          ...envBaseValido,
          NODE_ENV: 'production',
          AUTH_DEV_BYPASS: 'true',
        }),
      ).toThrow(/AUTH_DEV_BYPASS/);
    });

    it('permite iniciar en producción cuando AUTH_DEV_BYPASS=false', () => {
      const cfg = validarConfiguracion({
        ...envBaseValido,
        NODE_ENV: 'production',
        AUTH_DEV_BYPASS: 'false',
      });
      expect(cfg.NODE_ENV).toBe('production');
      expect(cfg.AUTH_DEV_BYPASS).toBe(false);
      expect(cfg.FRONTEND_URL).toBe('http://localhost:5173');
    });

    it('rechaza SESSION_SECRET menor a 32 caracteres', () => {
      expect(() =>
        validarConfiguracion({
          ...envBaseValido,
          SESSION_SECRET: 'demasiado_corto',
        }),
      ).toThrow(/SESSION_SECRET/);
    });
  });

  describe('5. Utilidades de recordatorios, outbox y cookies firmadas', () => {
    it('calcula correctamente enviar_en restando la anticipación', () => {
      const inicio = new Date('2026-11-20T10:00:00.000Z');
      expect(calcularEnviarEn(inicio, 30, 'MINUTOS').toISOString()).toBe(
        '2026-11-20T09:30:00.000Z',
      );
      expect(calcularEnviarEn(inicio, 2, 'HORAS').toISOString()).toBe(
        '2026-11-20T08:00:00.000Z',
      );
      expect(calcularEnviarEn(inicio, 1, 'DIAS').toISOString()).toBe(
        '2026-11-19T10:00:00.000Z',
      );
    });

    it('aplica espera exponencial (1, 5, 15, 60 min...) en el outbox', () => {
      expect(calcularEsperaMinutosOutbox(1)).toBe(1);
      expect(calcularEsperaMinutosOutbox(2)).toBe(5);
      expect(calcularEsperaMinutosOutbox(3)).toBe(15);
      expect(calcularEsperaMinutosOutbox(4)).toBe(60);
    });

    it('firma y verifica tokens de cookies y rechaza manipulaciones', () => {
      const secreto = envBaseValido.SESSION_SECRET;
      const token = firmarTokenDatos({ sub: 'u-1', solicitudId: 's-1' }, secreto);
      const decodificado = verificarTokenDatos<{ sub: string; solicitudId: string }>(
        token,
        secreto,
      );
      expect(decodificado).toEqual({ sub: 'u-1', solicitudId: 's-1' });
      expect(verificarTokenDatos(`${token}x`, secreto)).toBeNull();
    });
  });
});

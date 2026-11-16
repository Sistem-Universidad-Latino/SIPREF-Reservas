import type { ClienteBd } from '../bd/pool.js';
import { obtenerPool } from '../bd/pool.js';
import { obtenerConfig } from '../config.js';

export interface ConfiguracionSistema {
  ciclo: string;
  bufferMinutos: number;
  zonaHoraria: string;
  solicitudExpiracionDias: number;
  dominiosPermitidos: string[];
}

export async function obtenerConfiguracionSistema(
  bd: ClienteBd = obtenerPool(),
): Promise<ConfiguracionSistema> {
  const cfg = obtenerConfig();
  const { rows } = await bd.query(
    `SELECT clave, valor FROM reservas_configuracion`,
  );

  const mapa = new Map<string, unknown>();
  for (const r of rows) {
    mapa.set(String(r.clave), r.valor);
  }

  const ciclo =
    typeof mapa.get('ciclo_actual') === 'string'
      ? (mapa.get('ciclo_actual') as string)
      : '2026-B';

  const bufferRaw = Number(mapa.get('buffer_minutos'));
  const bufferMinutos = Number.isFinite(bufferRaw) && bufferRaw >= 0 ? bufferRaw : 15;

  const zonaHoraria =
    typeof mapa.get('zona_horaria') === 'string'
      ? (mapa.get('zona_horaria') as string)
      : 'America/Mexico_City';

  const expRaw = Number(mapa.get('solicitud_expiracion_dias'));
  const solicitudExpiracionDias =
    cfg.SOLICITUD_EXPIRACION_DIAS ||
    (Number.isFinite(expRaw) && expRaw > 0 ? expRaw : 30);

  let dominiosPermitidos: string[] = [];
  if (cfg.DOMINIOS_PERMITIDOS.length > 0) {
    dominiosPermitidos = cfg.DOMINIOS_PERMITIDOS;
  } else if (Array.isArray(mapa.get('dominios_permitidos'))) {
    dominiosPermitidos = (mapa.get('dominios_permitidos') as unknown[])
      .map((d) => String(d).trim().toLowerCase())
      .filter((d) => d.length > 0);
  }

  return {
    ciclo,
    bufferMinutos,
    zonaHoraria,
    solicitudExpiracionDias,
    dominiosPermitidos,
  };
}

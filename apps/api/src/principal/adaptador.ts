/**
 * =============================================================================
 * Adaptador de lectura hacia SIPREF Principal (SOLO LECTURA)
 * =============================================================================
 * REGLA DURA: Este módulo es el ÚNICO lugar autorizado para consultar tablas
 * del sistema principal SIPREF (`aulas`, `eventos_aulas`). NUNCA debe ejecutar
 * INSERT, UPDATE, DELETE ni DDL sobre tablas del sistema principal.
 * =============================================================================
 */

import type { ClienteBd } from '../bd/pool.js';
import { obtenerPool } from '../bd/pool.js';

export const TABLA_PRINCIPAL_ESPACIOS = 'aulas';
export const TABLA_PRINCIPAL_EVENTOS = 'eventos_aulas';

export interface EspacioPrincipal {
  id: string;
  nombre: string;
  capacidad: number;
  tipo: string;
  edificio: string;
}

export interface EventoOcupacionPrincipal {
  id: string;
  espacioId: string;
  espacioNombre: string;
  nombreEvento: string;
  responsable: string;
  inicio: Date;
  fin: Date;
}

export interface FiltroOcupacionPrincipal {
  desde: Date;
  hasta: Date;
  espacioId?: string;
}

/**
 * Lista todos los espacios activos registrados en SIPREF principal (`aulas`).
 */
export async function listarEspacios(
  bd: ClienteBd = obtenerPool(),
): Promise<EspacioPrincipal[]> {
  const sql = `
    SELECT
      id,
      nombre,
      capacidad,
      edificio
    FROM ${TABLA_PRINCIPAL_ESPACIOS}
    WHERE estado = 'Activo'
      AND (en_mantenimiento IS NULL OR en_mantenimiento = 0)
    ORDER BY nombre ASC
  `;
  const { rows } = await bd.query(sql);
  return rows.map((r) => ({
    id: String(r.id),
    nombre: String(r.nombre),
    capacidad: Number(r.capacidad ?? 0),
    tipo: '',
    edificio: String(r.edificio ?? '').trim(),
  }));
}

/**
 * Obtiene un espacio activo por su identificador en SIPREF principal (`aulas`).
 */
export async function obtenerEspacio(
  id: string,
  bd: ClienteBd = obtenerPool(),
): Promise<EspacioPrincipal | null> {
  const sql = `
    SELECT
      id,
      nombre,
      capacidad,
      edificio
    FROM ${TABLA_PRINCIPAL_ESPACIOS}
    WHERE (CAST(id AS CHAR) = $1 OR nombre = $1)
      AND estado = 'Activo'
    LIMIT 1
  `;
  const { rows } = await bd.query(sql, [id]);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    nombre: String(r.nombre),
    capacidad: Number(r.capacidad ?? 0),
    tipo: '',
    edificio: String(r.edificio ?? '').trim(),
  };
}

/**
 * Lista los eventos programados en SIPREF principal (`eventos_aulas`) que se traslapan
 * con el rango [desde, hasta) (y opcionalmente filtrados por espacioId).
 */
export async function listarOcupacionPrincipal(
  filtro: FiltroOcupacionPrincipal,
  bd: ClienteBd = obtenerPool(),
): Promise<EventoOcupacionPrincipal[]> {
  const params: unknown[] = [filtro.desde, filtro.hasta];
  let clausulaEspacio = '';
  if (filtro.espacioId) {
    params.push(filtro.espacioId);
    clausulaEspacio = `AND (CAST(a.id AS CHAR) = $3 OR ev.aula_nombre = $3)`;
  }

  // Las columnas fecha/hora_inicio/hora_fin de SIPREF están en America/Merida (-06:00).
  // Convertimos a DATETIME UTC en la comparación para comparar contra desde/hasta (Date UTC).
  const sql = `
    SELECT
      ev.id AS id,
      COALESCE(CAST(a.id AS CHAR), ev.aula_nombre) AS espacio_id,
      ev.aula_nombre AS espacio_nombre,
      ev.nombre_evento AS titulo,
      ev.responsable AS responsable,
      CONCAT(DATE_FORMAT(ev.fecha, '%Y-%m-%d'), 'T', TIME_FORMAT(ev.hora_inicio, '%H:%i:%s'), '-06:00') AS inicio_iso,
      CONCAT(DATE_FORMAT(ev.fecha, '%Y-%m-%d'), 'T', TIME_FORMAT(ev.hora_fin, '%H:%i:%s'), '-06:00') AS fin_iso
    FROM ${TABLA_PRINCIPAL_EVENTOS} ev
    LEFT JOIN ${TABLA_PRINCIPAL_ESPACIOS} a
      ON a.nombre = ev.aula_nombre
    WHERE ev.estado <> 'Cancelado'
      AND DATE_ADD(TIMESTAMP(ev.fecha, ev.hora_inicio), INTERVAL 6 HOUR) < $2
      AND DATE_ADD(TIMESTAMP(ev.fecha, ev.hora_fin), INTERVAL 6 HOUR) > $1
      ${clausulaEspacio}
    ORDER BY ev.fecha ASC, ev.hora_inicio ASC
  `;

  const { rows } = await bd.query(sql, params);
  return rows.map((r) => ({
    id: `sipref-${r.id}`,
    espacioId: String(r.espacio_id),
    espacioNombre: String(r.espacio_nombre),
    nombreEvento: String(r.titulo),
    responsable: String(r.responsable),
    inicio: new Date(String(r.inicio_iso)),
    fin: new Date(String(r.fin_iso)),
  }));
}

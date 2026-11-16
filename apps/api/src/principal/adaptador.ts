/**
 * =============================================================================
 * Adaptador de lectura hacia SIPREF Principal (SOLO LECTURA)
 * =============================================================================
 * REGLA DURA: Este módulo es el ÚNICO lugar autorizado para consultar tablas
 * del sistema principal SIPREF. NUNCA debe ejecutar INSERT, UPDATE, DELETE ni
 * DDL sobre tablas del sistema principal.
 *
 * Los nombres reales de las tablas y columnas en producción aún están por
 * confirmarse con el equipo de SIPREF principal. Por defecto apuntan a las
 * tablas stub locales definidas en `db/local/stub_sipref_principal.sql`.
 * =============================================================================
 */

import type { ClienteBd } from '../bd/pool.js';
import { obtenerPool } from '../bd/pool.js';

// TODO(SIPREF): ajustar a nombres reales de tablas y columnas en la BD compartida de SIPREF principal
export const TABLA_PRINCIPAL_ESPACIOS = 'sipref_espacios';
export const COL_ESPACIO_ID = 'id';
export const COL_ESPACIO_NOMBRE = 'nombre';
export const COL_ESPACIO_CAPACIDAD = 'capacidad';
export const COL_ESPACIO_TIPO = 'tipo';
export const COL_ESPACIO_EDIFICIO = 'edificio';
export const COL_ESPACIO_ACTIVO = 'activo';

// TODO(SIPREF): ajustar a nombres reales de la tabla de reservaciones/ocupación de SIPREF principal
export const TABLA_PRINCIPAL_RESERVACIONES = 'sipref_reservaciones';
export const COL_RES_ID = 'id';
export const COL_RES_ESPACIO_ID = 'espacio_id';
export const COL_RES_TITULO = 'titulo';
export const COL_RES_RESPONSABLE = 'responsable';
export const COL_RES_INICIO = 'fecha_inicio';
export const COL_RES_FIN = 'fecha_fin';
export const COL_RES_ESTADO = 'estado';
export const VALOR_ESTADO_CONFIRMADA = 'CONFIRMADA';

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
 * Lista todos los espacios activos registrados en SIPREF principal.
 */
export async function listarEspacios(
  bd: ClienteBd = obtenerPool(),
): Promise<EspacioPrincipal[]> {
  // TODO(SIPREF): ajustar a nombres reales
  const sql = `
    SELECT
      ${COL_ESPACIO_ID}        AS id,
      ${COL_ESPACIO_NOMBRE}    AS nombre,
      ${COL_ESPACIO_CAPACIDAD} AS capacidad,
      ${COL_ESPACIO_TIPO}      AS tipo,
      ${COL_ESPACIO_EDIFICIO}  AS edificio
    FROM ${TABLA_PRINCIPAL_ESPACIOS}
    WHERE ${COL_ESPACIO_ACTIVO} = TRUE
    ORDER BY ${COL_ESPACIO_EDIFICIO} ASC, ${COL_ESPACIO_NOMBRE} ASC
  `;
  const { rows } = await bd.query(sql);
  return rows.map((r) => ({
    id: String(r.id),
    nombre: String(r.nombre),
    capacidad: Number(r.capacidad),
    tipo: String(r.tipo),
    edificio: String(r.edificio),
  }));
}

/**
 * Obtiene un espacio activo por su identificador en SIPREF principal.
 */
export async function obtenerEspacio(
  id: string,
  bd: ClienteBd = obtenerPool(),
): Promise<EspacioPrincipal | null> {
  // TODO(SIPREF): ajustar a nombres reales
  const sql = `
    SELECT
      ${COL_ESPACIO_ID}        AS id,
      ${COL_ESPACIO_NOMBRE}    AS nombre,
      ${COL_ESPACIO_CAPACIDAD} AS capacidad,
      ${COL_ESPACIO_TIPO}      AS tipo,
      ${COL_ESPACIO_EDIFICIO}  AS edificio
    FROM ${TABLA_PRINCIPAL_ESPACIOS}
    WHERE ${COL_ESPACIO_ID} = $1
      AND ${COL_ESPACIO_ACTIVO} = TRUE
    LIMIT 1
  `;
  const { rows } = await bd.query(sql, [id]);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    nombre: String(r.nombre),
    capacidad: Number(r.capacidad),
    tipo: String(r.tipo),
    edificio: String(r.edificio),
  };
}

/**
 * Lista las reservaciones confirmadas en SIPREF principal que se traslapan
 * con el rango [desde, hasta) (y opcionalmente filtradas por espacioId).
 */
export async function listarOcupacionPrincipal(
  filtro: FiltroOcupacionPrincipal,
  bd: ClienteBd = obtenerPool(),
): Promise<EventoOcupacionPrincipal[]> {
  // TODO(SIPREF): ajustar a nombres reales
  const params: unknown[] = [filtro.desde.toISOString(), filtro.hasta.toISOString()];
  let clausulaEspacio = '';
  if (filtro.espacioId) {
    params.push(filtro.espacioId);
    clausulaEspacio = `AND r.${COL_RES_ESPACIO_ID} = $3`;
  }

  const sql = `
    SELECT
      r.${COL_RES_ID}          AS id,
      r.${COL_RES_ESPACIO_ID}  AS espacio_id,
      COALESCE(e.${COL_ESPACIO_NOMBRE}, r.${COL_RES_ESPACIO_ID}) AS espacio_nombre,
      r.${COL_RES_TITULO}      AS titulo,
      r.${COL_RES_RESPONSABLE} AS responsable,
      r.${COL_RES_INICIO}      AS fecha_inicio,
      r.${COL_RES_FIN}         AS fecha_fin
    FROM ${TABLA_PRINCIPAL_RESERVACIONES} r
    LEFT JOIN ${TABLA_PRINCIPAL_ESPACIOS} e
      ON e.${COL_ESPACIO_ID} = r.${COL_RES_ESPACIO_ID}
    WHERE r.${COL_RES_ESTADO} = '${VALOR_ESTADO_CONFIRMADA}'
      AND r.${COL_RES_INICIO} < $2::timestamptz
      AND r.${COL_RES_FIN}    > $1::timestamptz
      ${clausulaEspacio}
    ORDER BY r.${COL_RES_INICIO} ASC
  `;

  const { rows } = await bd.query(sql, params);
  return rows.map((r) => ({
    id: String(r.id),
    espacioId: String(r.espacio_id),
    espacioNombre: String(r.espacio_nombre),
    nombreEvento: String(r.titulo),
    responsable: String(r.responsable),
    inicio: new Date(r.fecha_inicio),
    fin: new Date(r.fecha_fin),
  }));
}

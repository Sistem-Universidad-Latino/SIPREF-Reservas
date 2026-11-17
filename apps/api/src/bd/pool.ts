import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Configuracion } from '../config.js';
import { obtenerConfig } from '../config.js';

export interface ResultadoConsulta<T = Record<string, any>> {
  rows: T[];
  rowCount: number;
  insertId?: number;
}

export interface ClienteBd {
  query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<ResultadoConsulta<T>>;
}

let poolMysqlGlobal: Pool | null = null;

/**
 * Convierte placeholders estilo PostgreSQL ($1, $2, ...) a ? para MySQL/TiDB,
 * duplicando o reordenando los parámetros según el orden de aparición.
 */
function prepararSqlYParams(
  sql: string,
  params: unknown[] = [],
): { sqlMysql: string; paramsMysql: unknown[] } {
  if (!params || params.length === 0) {
    return { sqlMysql: sql, paramsMysql: [] };
  }

  const paramsMysql: unknown[] = [];
  const sqlMysql = sql.replace(/\$(\d+)/g, (_match, numStr) => {
    const idx = Number(numStr) - 1;
    const val = idx >= 0 && idx < params.length ? params[idx] : null;
    paramsMysql.push(val === undefined ? null : val);
    return '?';
  });

  return { sqlMysql, paramsMysql };
}

function envolverEjecutor(ejecutor: Pool | PoolConnection): ClienteBd {
  return {
    async query<T = Record<string, any>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<ResultadoConsulta<T>> {
      const { sqlMysql, paramsMysql } = prepararSqlYParams(sql, params);
      const [res] = await ejecutor.query(sqlMysql, paramsMysql);
      if (Array.isArray(res)) {
        return {
          rows: res as T[],
          rowCount: res.length,
        };
      }
      const header = res as ResultSetHeader;
      return {
        rows: [],
        rowCount: header.affectedRows ?? 0,
        insertId: header.insertId,
      };
    },
  };
}

export function crearPoolMysql(cfg: Configuracion = obtenerConfig()): Pool {
  const url = new URL(cfg.DATABASE_URL);
  const ssl =
    cfg.DATABASE_SSL === 'false'
      ? undefined
      : cfg.DATABASE_SSL === 'no-verify'
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true };

  return mysql.createPool({
    host: url.hostname,
    port: url.port ? Number(url.port) : 4000,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, '') || 'test',
    ssl,
    timezone: 'Z',
    waitForConnections: true,
    connectionLimit: 15,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
  });
}

export function obtenerPool(): ClienteBd {
  if (!poolMysqlGlobal) {
    poolMysqlGlobal = crearPoolMysql();
  }
  return envolverEjecutor(poolMysqlGlobal);
}

export function establecerPool(_pool: unknown): void {
  // Mantenido por compatibilidad con pruebas si se reemplaza el pool
  poolMysqlGlobal = _pool as Pool | null;
}

export async function cerrarPool(): Promise<void> {
  if (poolMysqlGlobal) {
    await poolMysqlGlobal.end();
    poolMysqlGlobal = null;
  }
}

/**
 * Ejecuta una función dentro de una transacción BEGIN ... COMMIT / ROLLBACK.
 */
export async function enTransaccion<T>(
  fn: (cliente: ClienteBd) => Promise<T>,
  _pool?: ClienteBd,
): Promise<T> {
  if (!poolMysqlGlobal) {
    poolMysqlGlobal = crearPoolMysql();
  }
  const conexion = await poolMysqlGlobal.getConnection();
  const cliente = envolverEjecutor(conexion);
  try {
    await conexion.beginTransaction();
    const resultado = await fn(cliente);
    await conexion.commit();
    return resultado;
  } catch (err) {
    try {
      await conexion.rollback();
    } catch {
      // Ignorar fallo en rollback si la conexión ya se cerró
    }
    throw err;
  } finally {
    conexion.release();
  }
}

export type { RowDataPacket };

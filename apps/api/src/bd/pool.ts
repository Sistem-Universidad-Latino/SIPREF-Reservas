import pg from 'pg';
import type { Configuracion } from '../config.js';
import { obtenerConfig } from '../config.js';

const { Pool } = pg;

export type ClienteBd = pg.Pool | pg.PoolClient;

let poolGlobal: pg.Pool | null = null;

export function crearPool(cfg: Configuracion = obtenerConfig()): pg.Pool {
  const ssl =
    cfg.DATABASE_SSL === 'false'
      ? false
      : cfg.DATABASE_SSL === 'no-verify'
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true };

  return new Pool({
    connectionString: cfg.DATABASE_URL,
    ssl,
    max: 15,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function obtenerPool(): pg.Pool {
  if (!poolGlobal) {
    poolGlobal = crearPool();
  }
  return poolGlobal;
}

export function establecerPool(pool: pg.Pool | null): void {
  poolGlobal = pool;
}

export async function cerrarPool(): Promise<void> {
  if (poolGlobal) {
    await poolGlobal.end();
    poolGlobal = null;
  }
}

/**
 * Ejecuta una función dentro de una transacción BEGIN ... COMMIT / ROLLBACK.
 */
export async function enTransaccion<T>(
  fn: (cliente: pg.PoolClient) => Promise<T>,
  pool: pg.Pool = obtenerPool(),
): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    try {
      await cliente.query('ROLLBACK');
    } catch {
      // Ignorar fallo en rollback si la conexión ya se cerró
    }
    throw err;
  } finally {
    cliente.release();
  }
}

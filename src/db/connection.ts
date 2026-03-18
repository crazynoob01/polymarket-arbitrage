import mysql from 'mysql2/promise';
import type { BotConfig } from '../types/index.js';

let pool: mysql.Pool | null = null;

export function getPool(config: BotConfig['mysql']): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.host,
      database: config.database,
      user: config.user,
      password: config.password,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

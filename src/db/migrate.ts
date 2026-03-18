import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Pool } from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(pool: Pool): Promise<void> {
  const sql = readFileSync(
    join(__dirname, 'migrations', '001_create_weather_bets.sql'),
    'utf-8'
  );
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  for (const statement of statements) {
    await pool.execute(statement);
  }
  console.log('[db] Migrations complete');
}

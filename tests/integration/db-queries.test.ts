import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPool, closePool } from '../../src/db/connection.js';
import { runMigrations } from '../../src/db/migrate.js';
import { insertBet, getBetsByStatus, updateBetStatus, getOpenBetsCount, getTotalOpenExposure } from '../../src/db/queries.js';

const TEST_DB_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  database: process.env.MYSQL_DATABASE || 'polymarket_arb_test',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'test',
};

describe('DB Queries (integration)', () => {
  let pool: ReturnType<typeof getPool>;

  beforeAll(async () => {
    pool = getPool(TEST_DB_CONFIG);
    await runMigrations(pool);
    await pool.execute('DELETE FROM weather_bets');
  });

  afterAll(async () => {
    await closePool();
  });

  it('inserts a bet and retrieves by status', async () => {
    const id = await insertBet(pool, {
      market_id: 'cond_123',
      token_id: 'tok_456',
      order_id: null,
      city: 'NYC',
      market_title: 'NYC high temp March 20 — 55-59°F',
      bracket_lower: 55,
      bracket_upper: 59,
      bracket_lower_c: 12.78,
      bracket_upper_c: 15,
      unit: 'F',
      forecast_prob: 0.52,
      market_price: 0.35,
      edge: 0.17,
      bet_size: 6.08,
      entry_price: 0.35,
      status: 'PENDING',
      resolution_date: '2026-03-20',
      phase: '2a',
    });

    expect(id).toBeGreaterThan(0);

    const pending = await getBetsByStatus(pool, 'PENDING');
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending.find(b => b.id === id)).toBeDefined();
  });

  it('updates bet status with extra fields', async () => {
    const id = await insertBet(pool, {
      market_id: 'cond_789',
      token_id: 'tok_012',
      order_id: 'ord_abc',
      city: 'London',
      market_title: 'London high temp March 21',
      bracket_lower: 10,
      bracket_upper: 12,
      bracket_lower_c: 10,
      bracket_upper_c: 12,
      unit: 'C',
      forecast_prob: 0.60,
      market_price: 0.45,
      edge: 0.15,
      bet_size: 10.00,
      entry_price: 0.45,
      status: 'PENDING',
      resolution_date: '2026-03-21',
      phase: '2b',
    });

    await updateBetStatus(pool, id, 'FILLED', { fill_amount: 10.00 });

    const filled = await getBetsByStatus(pool, 'FILLED');
    const bet = filled.find(b => b.id === id);
    expect(bet).toBeDefined();
    expect(Number(bet!.fill_amount)).toBe(10.00);
  });

  it('counts open bets and total exposure', async () => {
    const count = await getOpenBetsCount(pool);
    expect(count).toBeGreaterThanOrEqual(1);

    const exposure = await getTotalOpenExposure(pool);
    expect(exposure).toBeGreaterThan(0);
  });
});

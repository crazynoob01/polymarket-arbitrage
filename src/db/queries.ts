import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { BetRecord, BetStatus, Phase } from '../types/index.js';

export async function insertBet(
  pool: Pool,
  bet: {
    market_id: string;
    token_id: string;
    order_id: string | null;
    city: string;
    market_title: string;
    bracket_lower: number;
    bracket_upper: number;
    bracket_lower_c: number;
    bracket_upper_c: number;
    unit: 'F' | 'C';
    forecast_prob: number;
    market_price: number;
    edge: number;
    bet_size: number;
    entry_price: number;
    status: BetStatus;
    resolution_date: string;
    phase: Phase;
  }
): Promise<number> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO weather_bets
     (market_id, token_id, order_id, city, market_title, bracket_lower, bracket_upper,
      bracket_lower_c, bracket_upper_c, unit,
      forecast_prob, market_price, edge, bet_size, entry_price, status, resolution_date, phase)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      bet.market_id, bet.token_id, bet.order_id, bet.city, bet.market_title,
      bet.bracket_lower, bet.bracket_upper, bet.bracket_lower_c, bet.bracket_upper_c, bet.unit,
      bet.forecast_prob, bet.market_price, bet.edge, bet.bet_size, bet.entry_price,
      bet.status, bet.resolution_date, bet.phase,
    ]
  );
  return result.insertId;
}

export async function updateBetStatus(
  pool: Pool,
  id: number,
  status: BetStatus,
  extra?: { fill_amount?: number; gas_fee?: number; outcome?: number; pnl?: number; order_id?: string }
): Promise<void> {
  const sets: string[] = ['status = ?'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any[] = [status];

  if (extra?.fill_amount !== undefined) { sets.push('fill_amount = ?'); params.push(extra.fill_amount); }
  if (extra?.gas_fee !== undefined) { sets.push('gas_fee = ?'); params.push(extra.gas_fee); }
  if (extra?.outcome !== undefined) { sets.push('outcome = ?'); params.push(extra.outcome); }
  if (extra?.pnl !== undefined) { sets.push('pnl = ?'); params.push(extra.pnl); }
  if (extra?.order_id !== undefined) { sets.push('order_id = ?'); params.push(extra.order_id); }

  params.push(id);
  await pool.execute(`UPDATE weather_bets SET ${sets.join(', ')} WHERE id = ?`, params);
}

export async function getBetsByStatus(pool: Pool, status: BetStatus): Promise<BetRecord[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM weather_bets WHERE status = ?',
    [status]
  );
  return rows as BetRecord[];
}

export async function getOpenBetsCount(pool: Pool): Promise<number> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT COUNT(*) as count FROM weather_bets WHERE status IN ('PENDING', 'FILLED')"
  );
  return (rows[0] as { count: number }).count;
}

export async function getTotalOpenExposure(pool: Pool): Promise<number> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT COALESCE(SUM(bet_size), 0) as total FROM weather_bets WHERE status IN ('PENDING', 'FILLED')"
  );
  return Number((rows[0] as { total: number }).total);
}

export async function getDailyPnl(pool: Pool): Promise<number> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT COALESCE(SUM(pnl), 0) as total FROM weather_bets WHERE DATE(updated_at) = CURDATE() AND status IN ('WON', 'LOST')"
  );
  return Number((rows[0] as { total: number }).total);
}

export async function getHourlyPnl(pool: Pool): Promise<number> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT COALESCE(SUM(pnl), 0) as total FROM weather_bets WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR) AND status IN ('WON', 'LOST')"
  );
  return Number((rows[0] as { total: number }).total);
}

export async function getWeeklyPnl(pool: Pool): Promise<number> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT COALESCE(SUM(pnl), 0) as total FROM weather_bets WHERE YEARWEEK(updated_at, 1) = YEARWEEK(NOW(), 1) AND status IN ('WON', 'LOST')"
  );
  return Number((rows[0] as { total: number }).total);
}

export async function getMonthlyPnl(pool: Pool): Promise<number> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT COALESCE(SUM(pnl), 0) as total FROM weather_bets WHERE YEAR(updated_at) = YEAR(NOW()) AND MONTH(updated_at) = MONTH(NOW()) AND status IN ('WON', 'LOST')"
  );
  return Number((rows[0] as { total: number }).total);
}

export async function getAllTimePnl(pool: Pool): Promise<number> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT COALESCE(SUM(pnl), 0) as total FROM weather_bets WHERE status IN ('WON', 'LOST')"
  );
  return Number((rows[0] as { total: number }).total);
}

export async function getBetsForResolution(pool: Pool): Promise<BetRecord[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM weather_bets WHERE status IN ('FILLED', 'SIMULATED') AND resolution_date <= CURDATE()"
  );
  return rows as BetRecord[];
}

export async function getStaleOrders(pool: Pool, hoursOld: number): Promise<BetRecord[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM weather_bets WHERE status = 'PENDING' AND created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)",
    [hoursOld]
  );
  return rows as BetRecord[];
}

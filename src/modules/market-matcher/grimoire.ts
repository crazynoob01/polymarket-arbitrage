import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const GRIMOIRE_CMD = 'grimoire';
const POLYMARKET_CMD = process.env.POLYMARKET_OFFICIAL_CLI?.trim() || 'polymarket';

export interface GrimoireMarketResult {
  id: string;
  conditionId: string;
  clobTokenIds: string[];
  question: string;
  groupItemTitle: string;
  outcomePrices: string[];
  volume: number;
  active: boolean;
  closed: boolean;
}

/**
 * Search for markets via the official Polymarket CLI directly.
 * Uses `polymarket markets search` with JSON output.
 * Parses clobTokenIds and outcomePrices from JSON strings to arrays.
 */
export async function searchMarkets(query: string): Promise<GrimoireMarketResult[]> {
  const { stdout } = await execFileAsync(POLYMARKET_CMD, [
    'markets', 'search', query,
    '--limit', '100',
    '--output', 'json',
  ], { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });

  const raw = JSON.parse(stdout);
  const markets: GrimoireMarketResult[] = (Array.isArray(raw) ? raw : [])
    .filter((m: Record<string, unknown>) => m.active && !m.closed)
    .map((m: Record<string, unknown>) => ({
      id: String(m.id || ''),
      conditionId: String(m.conditionId || ''),
      clobTokenIds: typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : (m.clobTokenIds as string[] || []),
      question: String(m.question || ''),
      groupItemTitle: String(m.groupItemTitle || ''),
      outcomePrices: typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : (m.outcomePrices as string[] || []),
      volume: Number(m.volumeNum || m.volume || 0),
      active: Boolean(m.active),
      closed: Boolean(m.closed),
    }));

  return markets;
}

export interface OrderBookEntry {
  price: string;
  size: string;
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

export async function getOrderBook(tokenId: string): Promise<OrderBook | null> {
  try {
    const { stdout } = await execFileAsync(POLYMARKET_CMD, [
      'clob', 'book', tokenId,
      '--output', 'json',
    ], { timeout: 10_000 });

    return JSON.parse(stdout);
  } catch (err) {
    console.error(`[grimoire] clob book failed for ${tokenId}:`, err);
    return null;
  }
}

export function getBestAsk(book: OrderBook): number | null {
  if (!book.asks || book.asks.length === 0) return null;
  return parseFloat(book.asks[0].price);
}

export async function placeLimitOrder(
  tokenId: string,
  price: number,
  size: number
): Promise<{ success: boolean; orderId?: string; rawOutput: string }> {
  try {
    const { stdout } = await execFileAsync(GRIMOIRE_CMD, [
      'venue', 'polymarket', 'order',
      '--token_id', tokenId,
      '--side', 'BUY',
      '--size', size.toFixed(2),
      '--price', price.toFixed(4),
      '--type', 'GTC',
      '--format', 'json',
    ], { timeout: 30_000 });

    const result = JSON.parse(stdout);
    return {
      success: true,
      orderId: result.orderID || result.orderId || result.id,
      rawOutput: stdout,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, rawOutput: msg };
  }
}

export async function getOrderStatus(orderId: string): Promise<unknown> {
  try {
    const { stdout } = await execFileAsync(GRIMOIRE_CMD, [
      'venue', 'polymarket', 'clob', 'order', orderId,
      '--format', 'json',
    ], { timeout: 10_000 });

    return JSON.parse(stdout);
  } catch (err) {
    console.error(`[grimoire] order status failed for ${orderId}:`, err);
    return null;
  }
}

export async function getMarketData(marketId: string): Promise<Record<string, unknown> | null> {
  try {
    const { stdout } = await execFileAsync(POLYMARKET_CMD, [
      'markets', 'get', marketId,
      '--output', 'json',
    ], { timeout: 10_000 });
    return JSON.parse(stdout);
  } catch (err) {
    console.error(`[grimoire] markets get failed for ${marketId}:`, err);
    return null;
  }
}

export async function cancelOrder(orderId: string): Promise<boolean> {
  try {
    await execFileAsync(GRIMOIRE_CMD, [
      'venue', 'polymarket', 'cancel_order',
      '--order_id', orderId,
      '--format', 'json',
    ], { timeout: 10_000 });
    return true;
  } catch (err) {
    console.error(`[grimoire] cancel failed for ${orderId}:`, err);
    return false;
  }
}

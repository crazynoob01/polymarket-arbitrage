import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const GRIMOIRE_CMD = 'grimoire';

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

export async function searchMarkets(query: string): Promise<GrimoireMarketResult[]> {
  const { stdout } = await execFileAsync(GRIMOIRE_CMD, [
    'venue', 'polymarket', 'search-markets',
    '--query', query,
    '--active-only', 'true',
    '--open-only', 'true',
    '--format', 'json',
  ], { timeout: 30_000 });

  return JSON.parse(stdout);
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
    const { stdout } = await execFileAsync(GRIMOIRE_CMD, [
      'venue', 'polymarket', 'clob', 'book', tokenId,
      '--format', 'json',
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
    const { stdout } = await execFileAsync(GRIMOIRE_CMD, [
      'venue', 'polymarket', 'markets', 'get', marketId,
      '--format', 'json',
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

// src/modules/order-executor/index.ts
import type { Pool } from 'mysql2/promise';
import type { BetDecision, MatchedMarket, BracketAnalysis, OrderResult, BotConfig } from '../../types/index.js';
import { getOrderBook, getBestAsk, placeLimitOrder, getOrderStatus, cancelOrder } from '../market-matcher/grimoire.js';
import { insertBet, updateBetStatus, getBetsByStatus, getStaleOrders } from '../../db/queries.js';
import { log, error } from '../../logger.js';

export async function executeBet(
  decision: BetDecision,
  market: MatchedMarket,
  analysis: BracketAnalysis,
  config: BotConfig,
  pool: Pool
): Promise<OrderResult> {
  const book = await getOrderBook(market.tokenId);
  if (!book) {
    return { success: false, error: 'Failed to fetch order book' };
  }

  const currentAsk = getBestAsk(book);
  if (currentAsk === null) {
    return { success: false, error: 'No asks in order book' };
  }

  const currentEdge = analysis.forecastProbability - currentAsk - config.estimatedFees;
  if (currentEdge < config.minEdge) {
    return { success: false, error: `Edge gone: was ${(analysis.edge * 100).toFixed(1)}%, now ${(currentEdge * 100).toFixed(1)}% (ask moved from ${market.bestAskPrice} to ${currentAsk})` };
  }

  const limitPrice = currentAsk;
  const betSize = Math.min(decision.betSize, parseFloat(book.asks[0]?.size || '9999'));

  if (betSize < config.minBet) {
    return { success: false, error: `Available liquidity $${betSize.toFixed(2)} below min bet $${config.minBet}` };
  }

  const betFields = {
    market_id: market.marketId,
    token_id: market.tokenId,
    order_id: null as string | null,
    city: market.city.key,
    market_title: market.marketTitle,
    bracket_lower: market.bracketLowerOriginal,
    bracket_upper: market.bracketUpperOriginal,
    bracket_lower_c: market.bracketLowerC,
    bracket_upper_c: market.bracketUpperC,
    unit: market.originalUnit,
    forecast_prob: analysis.forecastProbability,
    market_price: limitPrice,
    edge: currentEdge,
    bet_size: betSize,
    entry_price: limitPrice,
    resolution_date: market.resolutionDate,
    phase: config.phase,
  };

  if (config.phase === '2a') {
    const betId = await insertBet(pool, { ...betFields, status: 'SIMULATED' });
    log(`[order-executor] SIMULATED bet #${betId}: ${market.marketTitle} @ $${limitPrice} for $${betSize}`);
    return { success: true, orderId: `SIM-${betId}` };
  }

  const result = await placeLimitOrder(market.tokenId, limitPrice, betSize);

  const betId = await insertBet(pool, {
    ...betFields,
    order_id: result.orderId || null,
    status: result.success ? 'PENDING' : 'CANCELLED',
  });

  if (result.success) {
    log(`[order-executor] Order placed #${betId}: ${market.marketTitle} @ $${limitPrice} for $${betSize}`);
  } else {
    error(`[order-executor] Order failed #${betId}: ${result.rawOutput}`);
  }

  return { success: result.success, orderId: result.orderId, rawCliOutput: result.rawOutput };
}

export async function checkOrderFills(pool: Pool): Promise<void> {
  const pending = await getBetsByStatus(pool, 'PENDING');
  console.log(`[order-executor] Checking ${pending.length} pending orders`);

  for (const bet of pending) {
    if (!bet.order_id) continue;

    const status = await getOrderStatus(bet.order_id) as Record<string, unknown> | null;
    if (!status) continue;

    const orderStatus = (status.status || status.order_status || '') as string;
    const filledSize = parseFloat(String(status.size_matched || status.filledSize || 0));

    if (orderStatus === 'MATCHED' || orderStatus === 'FILLED' || filledSize >= bet.bet_size) {
      await updateBetStatus(pool, bet.id, 'FILLED', { fill_amount: filledSize || Number(bet.bet_size) });
      console.log(`[order-executor] Order ${bet.order_id} FILLED`);
    } else if (filledSize > 0 && filledSize < bet.bet_size) {
      await updateBetStatus(pool, bet.id, 'PARTIALLY_FILLED', { fill_amount: filledSize });
      await cancelOrder(bet.order_id);
      console.log(`[order-executor] Order ${bet.order_id} partially filled ($${filledSize}), remainder cancelled`);
    }
  }
}

export async function cancelStaleOrders(pool: Pool): Promise<void> {
  const stale = await getStaleOrders(pool, 4);
  console.log(`[order-executor] Cancelling ${stale.length} stale orders`);

  for (const bet of stale) {
    if (bet.order_id) {
      await cancelOrder(bet.order_id);
    }
    await updateBetStatus(pool, bet.id, 'CANCELLED');
  }
}

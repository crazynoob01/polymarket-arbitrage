import type { BracketAnalysis, BetDecision, BotConfig } from '../../types/index.js';

export interface RiskContext {
  openBetsCount: number;
  totalOpenExposure: number;
  dailyPnl: number;
  hourlyPnl: number;
  monthlyPnl: number;
}

/**
 * Full Kelly fraction formula: f* = (p*b - q) / b
 * where b = (1 - m) / m (decimal odds), p = forecast probability, q = 1 - p, m = market price.
 * Returns negative when there is no edge.
 */
export function calcKellyFraction(p: number, m: number): number {
  if (m <= 0 || m >= 1) return 0;
  const b = (1 - m) / m;
  const q = 1 - p;
  return (p * b - q) / b;
}

/**
 * Fractional Kelly bet size.
 * Returns 0 for non-positive kelly or bankroll.
 */
export function calcBetSize(
  kellyFraction: number,
  availableBankroll: number,
  scalingFactor: number,
): number {
  if (kellyFraction <= 0 || availableBankroll <= 0) return 0;
  return availableBankroll * kellyFraction * scalingFactor;
}

/**
 * Main risk evaluation entry point. Checks all gates in priority order and
 * returns a BetDecision with size, limit price, and approval status.
 */
export function evaluateBet(
  analysis: BracketAnalysis,
  config: BotConfig,
  ctx: RiskContext,
): BetDecision {
  const { market } = analysis;

  const baseBetDecision: BetDecision = {
    approved: false,
    betSize: 0,
    limitPrice: market.bestAskPrice,
    kellyFraction: 0,
    availableBankroll: 0,
  };

  // Gate 1: Min edge
  if (analysis.edge < config.minEdge) {
    return {
      ...baseBetDecision,
      reason: `edge ${(analysis.edge * 100).toFixed(1)}% below ${(config.minEdge * 100).toFixed(0)}% threshold`,
    };
  }

  // Gate 2: Max concurrent bets
  if (ctx.openBetsCount >= config.maxConcurrentBets) {
    return {
      ...baseBetDecision,
      reason: `max concurrent bets (${config.maxConcurrentBets}) reached`,
    };
  }

  // Gate 3: Monthly loss limit
  if (ctx.monthlyPnl <= -(config.monthlyLossLimit * config.capital)) {
    return {
      ...baseBetDecision,
      reason: `monthly loss limit hit (${(config.monthlyLossLimit * 100).toFixed(0)}% of capital)`,
    };
  }

  // Gate 4: Daily loss limit
  if (ctx.dailyPnl <= -(config.dailyLossLimit * config.capital)) {
    return {
      ...baseBetDecision,
      reason: `daily loss limit hit (${(config.dailyLossLimit * 100).toFixed(0)}% of capital)`,
    };
  }

  // Gate 5: Hourly loss limit
  if (ctx.hourlyPnl <= -(config.hourlyLossLimit * config.capital)) {
    return {
      ...baseBetDecision,
      reason: `1-hour rolling loss limit hit — pausing 4 hours`,
    };
  }

  // Calculate available bankroll (capital minus all open exposure)
  const availableBankroll = config.capital - ctx.totalOpenExposure;
  if (availableBankroll <= 0) {
    return {
      ...baseBetDecision,
      reason: 'max total exposure reached (no available bankroll)',
    };
  }

  // Calculate full Kelly fraction
  const kelly = calcKellyFraction(analysis.forecastProbability, market.bestAskPrice);
  if (kelly <= 0) {
    return {
      ...baseBetDecision,
      reason: 'Kelly fraction non-positive (no edge in odds structure)',
      kellyFraction: kelly,
    };
  }

  // Apply fractional Kelly scaling and cap at maxBet
  let betSize = calcBetSize(kelly, availableBankroll, config.kellyFraction);
  betSize = Math.min(betSize, config.maxBet);
  betSize = Math.round(betSize * 100) / 100;

  // Gate 6: Min bet size
  if (betSize < config.minBet) {
    return {
      ...baseBetDecision,
      reason: `bet size $${betSize.toFixed(2)} below minimum $${config.minBet}`,
      kellyFraction: kelly,
      availableBankroll,
    };
  }

  return {
    approved: true,
    betSize,
    limitPrice: market.bestAskPrice,
    kellyFraction: kelly,
    availableBankroll,
  };
}

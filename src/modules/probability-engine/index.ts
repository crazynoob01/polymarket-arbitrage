import type { EnsembleForecast, MatchedMarket, BracketAnalysis } from '../../types/index.js';

/**
 * Count fraction of ensemble members falling within [lowerBound, upperBound).
 * Lower bound is inclusive, upper bound is exclusive.
 */
export function calcBracketProbability(
  ensembleValues: number[],
  lowerBound: number,
  upperBound: number
): number {
  const inBracket = ensembleValues.filter(v => v >= lowerBound && v < upperBound).length;
  return inBracket / ensembleValues.length;
}

/**
 * Edge = forecastProbability - bestAskPrice - estimatedFees
 */
export function calcEdge(
  forecastProbability: number,
  bestAskPrice: number,
  estimatedFees: number
): number {
  return forecastProbability - bestAskPrice - estimatedFees;
}

/**
 * Analyze a market against ensemble forecast data.
 * Returns a BracketAnalysis with probability, edge, and raw values.
 */
export function analyzeBracket(
  forecast: EnsembleForecast,
  market: MatchedMarket,
  estimatedFees: number
): BracketAnalysis {
  const ensembleValues = market.metric === 'high' ? forecast.dailyHighs : forecast.dailyLows;
  const forecastProbability = calcBracketProbability(ensembleValues, market.bracketLowerC, market.bracketUpperC);
  const edge = calcEdge(forecastProbability, market.bestAskPrice, estimatedFees);

  return {
    market,
    forecastProbability,
    membersInBracket: ensembleValues.filter(v => v >= market.bracketLowerC && v < market.bracketUpperC).length,
    totalMembers: ensembleValues.length,
    edge,
    ensembleValues: [...ensembleValues],
  };
}

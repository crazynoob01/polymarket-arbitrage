import { describe, it, expect } from 'vitest';
import { calcBracketProbability, calcEdge, analyzeBracket } from '../../src/modules/probability-engine/index.js';
import type { MatchedMarket, EnsembleForecast, CityConfig } from '../../src/types/index.js';

describe('ProbabilityEngine', () => {
  describe('calcBracketProbability', () => {
    it('returns 1.0 when all members are in bracket', () => {
      const values = Array(30).fill(15);
      expect(calcBracketProbability(values, 10, 20)).toBe(1.0);
    });

    it('returns 0.0 when no members are in bracket', () => {
      const values = Array(30).fill(5);
      expect(calcBracketProbability(values, 10, 20)).toBe(0.0);
    });

    it('counts correctly with mixed values', () => {
      const values = [
        ...Array(16).fill(12.5),
        ...Array(14).fill(11.0),
      ];
      expect(calcBracketProbability(values, 12, 13)).toBeCloseTo(16 / 30, 4);
    });

    it('lower bound is inclusive, upper bound is exclusive', () => {
      const values = [12.0, 13.0];
      expect(calcBracketProbability(values, 12, 13)).toBe(0.5);
    });

    it('handles edge bracket with -Infinity lower', () => {
      const values = [3, 4, 5, 10, 15];
      expect(calcBracketProbability(values, -Infinity, 5)).toBe(2 / 5);
    });

    it('handles edge bracket with +Infinity upper', () => {
      const values = [3, 4, 5, 10, 15];
      expect(calcBracketProbability(values, 14, Infinity)).toBe(1 / 5);
    });
  });

  describe('calcEdge', () => {
    it('returns positive edge when forecast > market price', () => {
      expect(calcEdge(0.52, 0.35, 0)).toBeCloseTo(0.17, 4);
    });

    it('subtracts estimated fees', () => {
      expect(calcEdge(0.52, 0.35, 0.02)).toBeCloseTo(0.15, 4);
    });

    it('returns negative edge when market price > forecast', () => {
      expect(calcEdge(0.30, 0.50, 0)).toBeCloseTo(-0.20, 4);
    });
  });

  describe('analyzeBracket', () => {
    const city: CityConfig = { key: 'NYC', lat: 40.78, lon: -73.97, station: 'CP', timezone: 'America/New_York' };

    const market: MatchedMarket = {
      marketId: 'cond_1', tokenId: 'tok_1', city,
      marketTitle: 'test', metric: 'high',
      bracketLowerC: 12, bracketUpperC: 15,
      bracketLowerOriginal: 54, bracketUpperOriginal: 59, originalUnit: 'F',
      resolutionDate: '2026-03-20', forecastHorizonDays: 2,
      bestAskPrice: 0.35, volume: 10000,
    };

    const forecast: EnsembleForecast = {
      city, forecastDate: '2026-03-20', modelRun: '2026-03-18T00:00:00Z',
      memberCount: 30,
      dailyHighs: [...Array(16).fill(13), ...Array(14).fill(10)],
      dailyLows: [...Array(30).fill(5)],
    };

    it('uses dailyHighs when metric is high', () => {
      const result = analyzeBracket(forecast, market, 0);
      expect(result.forecastProbability).toBeCloseTo(16 / 30, 4);
      expect(result.ensembleValues).toEqual(forecast.dailyHighs);
    });

    it('uses dailyLows when metric is low', () => {
      const lowMarket = { ...market, metric: 'low' as const, bracketLowerC: 4, bracketUpperC: 6 };
      const result = analyzeBracket(forecast, lowMarket, 0);
      expect(result.ensembleValues).toEqual(forecast.dailyLows);
    });
  });
});

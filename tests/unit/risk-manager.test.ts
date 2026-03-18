import { describe, it, expect } from 'vitest';
import { calcKellyFraction, calcBetSize, evaluateBet } from '../../src/modules/risk-manager/index.js';
import type { BracketAnalysis, MatchedMarket, BotConfig } from '../../src/types/index.js';

describe('RiskManager', () => {
  describe('calcKellyFraction', () => {
    it('returns positive fraction for the worked example', () => {
      const f = calcKellyFraction(0.52, 0.35);
      expect(f).toBeCloseTo(0.2615, 3);
    });

    it('returns 0 when no edge', () => {
      const f = calcKellyFraction(0.35, 0.35);
      expect(f).toBeLessThanOrEqual(0);
    });

    it('returns negative when market overpriced', () => {
      const f = calcKellyFraction(0.20, 0.50);
      expect(f).toBeLessThan(0);
    });
  });

  describe('calcBetSize', () => {
    it('calculates worked example correctly', () => {
      const size = calcBetSize(0.2615, 155, 0.15);
      expect(size).toBeCloseTo(6.08, 1);
    });

    it('returns 0 for negative kelly', () => {
      const size = calcBetSize(-0.1, 200, 0.15);
      expect(size).toBe(0);
    });
  });

  describe('evaluateBet', () => {
    const baseConfig: BotConfig = {
      phase: '2b',
      capital: 200,
      maxBet: 20,
      minBet: 3,
      estimatedFees: 0,
      minEdge: 0.12,
      kellyFraction: 0.15,
      maxConcurrentBets: 8,
      dailyLossLimit: 0.03,
      hourlyLossLimit: 0.02,
      monthlyLossLimit: 0.20,
      mysql: { host: '', database: '', user: '', password: '' },
      telegram: { botToken: '', chatId: '' },
    };

    const baseMarket: MatchedMarket = {
      marketId: 'cond_123',
      tokenId: 'tok_456',
      city: { key: 'NYC', lat: 40.78, lon: -73.97, station: 'CP', timezone: 'America/New_York' },
      marketTitle: 'test',
      metric: 'high',
      bracketLowerC: 12.78,
      bracketUpperC: 15,
      bracketLowerOriginal: 55,
      bracketUpperOriginal: 59,
      originalUnit: 'F',
      resolutionDate: '2026-03-20',
      forecastHorizonDays: 2,
      bestAskPrice: 0.35,
      volume: 10000,
    };

    const baseAnalysis: BracketAnalysis = {
      market: baseMarket,
      forecastProbability: 0.52,
      membersInBracket: 16,
      totalMembers: 30,
      edge: 0.17,
      ensembleValues: Array(30).fill(13),
    };

    it('approves bet with sufficient edge', () => {
      const decision = evaluateBet(baseAnalysis, baseConfig, {
        openBetsCount: 0,
        totalOpenExposure: 45,
        dailyPnl: 0,
        hourlyPnl: 0,
        monthlyPnl: 0,
      });

      expect(decision.approved).toBe(true);
      expect(decision.betSize).toBeGreaterThan(0);
      expect(decision.betSize).toBeLessThanOrEqual(20);
      expect(decision.limitPrice).toBe(0.35);
    });

    it('rejects bet below min edge', () => {
      const lowEdge = { ...baseAnalysis, edge: 0.05, forecastProbability: 0.40 };
      const decision = evaluateBet(lowEdge, baseConfig, {
        openBetsCount: 0, totalOpenExposure: 0,
        dailyPnl: 0, hourlyPnl: 0, monthlyPnl: 0,
      });
      expect(decision.approved).toBe(false);
      expect(decision.reason).toContain('edge');
    });

    it('rejects when max concurrent bets reached', () => {
      const decision = evaluateBet(baseAnalysis, baseConfig, {
        openBetsCount: 8, totalOpenExposure: 100,
        dailyPnl: 0, hourlyPnl: 0, monthlyPnl: 0,
      });
      expect(decision.approved).toBe(false);
      expect(decision.reason).toContain('concurrent');
    });

    it('rejects when bet size below minimum', () => {
      const decision = evaluateBet(baseAnalysis, baseConfig, {
        openBetsCount: 0, totalOpenExposure: 198,
        dailyPnl: 0, hourlyPnl: 0, monthlyPnl: 0,
      });
      expect(decision.approved).toBe(false);
    });

    it('caps bet at maxBet', () => {
      const bigEdge = { ...baseAnalysis, edge: 0.50, forecastProbability: 0.85 };
      const decision = evaluateBet(bigEdge, baseConfig, {
        openBetsCount: 0, totalOpenExposure: 0,
        dailyPnl: 0, hourlyPnl: 0, monthlyPnl: 0,
      });
      expect(decision.approved).toBe(true);
      expect(decision.betSize).toBeLessThanOrEqual(20);
    });

    it('pauses when daily loss limit hit', () => {
      const decision = evaluateBet(baseAnalysis, baseConfig, {
        openBetsCount: 0, totalOpenExposure: 0,
        dailyPnl: -7,
        hourlyPnl: 0, monthlyPnl: 0,
      });
      expect(decision.approved).toBe(false);
      expect(decision.reason).toContain('daily');
    });
  });
});

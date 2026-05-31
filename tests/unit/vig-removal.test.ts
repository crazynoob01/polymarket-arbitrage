import { describe, expect, it } from 'vitest';
import {
  americanToDecimal,
  americanToImpliedProb,
  compareAllMethods,
  devig2Way,
  devig3Way,
  removeVig,
} from '../../src/modules/probability-engine/vig-removal.js';

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

describe('Vig removal', () => {
  it('converts American odds to decimal odds', () => {
    expect(americanToDecimal(-150)).toBeCloseTo(1.6667, 4);
    expect(americanToDecimal(130)).toBeCloseTo(2.3, 4);
    expect(americanToDecimal(-110)).toBeCloseTo(1.9091, 4);
    expect(americanToDecimal(100)).toBe(2);
    expect(americanToDecimal(-100)).toBe(2);
  });

  it('converts American odds to implied probabilities', () => {
    expect(americanToImpliedProb(-150)).toBeCloseTo(0.6, 4);
    expect(americanToImpliedProb(130)).toBeCloseTo(0.4348, 4);
  });

  it('removes vig from a two-way market using Shin method', () => {
    const result = removeVig([1.667, 2.3], 'decimal', 'shin');

    expect(result.method).toBe('shin');
    expect(result.overround).toBeGreaterThan(1);
    expect(sum(result.fairProbabilities)).toBeCloseTo(1, 8);
    expect(result.fairProbabilities[0]).toBeGreaterThan(result.fairProbabilities[1]);
    expect(result.shinZ).toBeGreaterThanOrEqual(0);
  });

  it('removes vig from a three-way market', () => {
    const [home, draw, away] = devig3Way(2.1, 3.4, 3.8);

    expect(sum([home, draw, away])).toBeCloseTo(1, 8);
    expect(home).toBeGreaterThan(draw);
    expect(draw).toBeGreaterThan(away);
  });

  it('supports two-way convenience devigging', () => {
    const [favorite, underdog] = devig2Way(1.667, 2.3);

    expect(favorite + underdog).toBeCloseTo(1, 8);
    expect(favorite).toBeGreaterThan(underdog);
  });

  it('compares all supported methods without changing output order', () => {
    const results = compareAllMethods([1.667, 2.3], 'decimal');

    for (const method of ['multiplicative', 'shin', 'additive', 'logarithmic', 'power'] as const) {
      expect(results[method].method).toBe(method);
      expect(results[method].fairProbabilities).toHaveLength(2);
      expect(sum(results[method].fairProbabilities)).toBeCloseTo(1, 6);
    }
  });

  it('rejects invalid odds input', () => {
    expect(() => removeVig([2], 'decimal')).toThrow(/at least 2 outcomes/);
    expect(() => removeVig([1, 2], 'decimal')).toThrow(/Decimal odds/);
    expect(() => americanToDecimal(0)).toThrow(/invalid/);
  });
});

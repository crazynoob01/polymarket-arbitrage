import { describe, it, expect } from 'vitest';
import { parseMarketTitle, fahrenheitToCelsius } from '../../src/modules/market-matcher/parser.js';

describe('MarketMatcher Parser', () => {
  describe('fahrenheitToCelsius', () => {
    it('converts 32°F to 0°C', () => {
      expect(fahrenheitToCelsius(32)).toBeCloseTo(0, 1);
    });

    it('converts 55°F to 12.78°C', () => {
      expect(fahrenheitToCelsius(55)).toBeCloseTo(12.78, 1);
    });

    it('converts 100°F to 37.78°C', () => {
      expect(fahrenheitToCelsius(100)).toBeCloseTo(37.78, 1);
    });
  });

  describe('parseMarketTitle', () => {
    it('parses NYC range bracket in Fahrenheit', () => {
      const result = parseMarketTitle(
        'Will the high temperature in New York City on March 20 be between 55°F and 59°F?'
      );
      expect(result).not.toBeNull();
      expect(result!.cityKey).toBe('NYC');
      expect(result!.metric).toBe('high');
      expect(result!.bracketLowerOriginal).toBe(55);
      expect(result!.bracketUpperOriginal).toBe(59);
      expect(result!.originalUnit).toBe('F');
      expect(result!.bracketLowerC).toBeCloseTo(fahrenheitToCelsius(55), 1);
      expect(result!.bracketUpperC).toBeCloseTo(fahrenheitToCelsius(59), 1);
    });

    it('parses Shanghai single-degree Celsius market', () => {
      const result = parseMarketTitle(
        'Will the highest temperature in Shanghai be 12°C on March 19?'
      );
      expect(result).not.toBeNull();
      expect(result!.cityKey).toBe('Shanghai');
      expect(result!.bracketLowerC).toBe(12);
      expect(result!.bracketUpperC).toBe(13);
      expect(result!.originalUnit).toBe('C');
    });

    it('returns null for unknown city (Bogota)', () => {
      const result = parseMarketTitle(
        'Will the highest temperature in Bogota be 22°C on March 19?'
      );
      expect(result).toBeNull();
    });

    it('parses London Fahrenheit bracket', () => {
      const result = parseMarketTitle(
        'London daily high temperature for March 21 — 50-54°F'
      );
      expect(result).not.toBeNull();
      expect(result!.cityKey).toBe('London');
      expect(result!.metric).toBe('high');
      expect(result!.bracketLowerOriginal).toBe(50);
      expect(result!.bracketUpperOriginal).toBe(54);
      expect(result!.originalUnit).toBe('F');
    });

    it('parses Seoul Celsius bracket', () => {
      const result = parseMarketTitle(
        'Seoul max temperature March 19 bracket: 10-14°C'
      );
      expect(result).not.toBeNull();
      expect(result!.cityKey).toBe('Seoul');
      expect(result!.bracketLowerC).toBe(10);
      expect(result!.bracketUpperC).toBe(14);
      expect(result!.originalUnit).toBe('C');
    });

    it('parses "or below" edge bracket (upper = stated + 1 for inclusive)', () => {
      const result = parseMarketTitle(
        'Will the high temperature in New York City on March 20 be 32°F or below?'
      );
      expect(result).not.toBeNull();
      expect(result!.bracketUpperOriginal).toBe(33);
      expect(result!.bracketLowerOriginal).toBe(-Infinity);
    });

    it('parses "or higher/above" edge bracket', () => {
      const result = parseMarketTitle(
        'Will the high temperature in New York City on March 20 be 80°F or higher?'
      );
      expect(result).not.toBeNull();
      expect(result!.bracketLowerOriginal).toBe(80);
      expect(result!.bracketUpperOriginal).toBe(Infinity);
    });

    it('returns null for unrecognized format', () => {
      const result = parseMarketTitle('Will it rain in Tokyo tomorrow?');
      expect(result).toBeNull();
    });

    it('extracts resolution date', () => {
      const result = parseMarketTitle(
        'Will the high temperature in New York City on March 20 be between 55°F and 59°F?'
      );
      expect(result).not.toBeNull();
      expect(result!.month).toBe(3);
      expect(result!.day).toBe(20);
    });
  });
});

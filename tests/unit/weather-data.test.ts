import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseEnsembleResponse, extractDailyHighLow } from '../../src/modules/weather-data/index.js';
import type { CityConfig } from '../../src/types/index.js';

const NYC: CityConfig = {
  key: 'NYC', lat: 40.7829, lon: -73.9654,
  station: 'Central Park', timezone: 'America/New_York',
};

function makeMockResponse(date: string, memberCount: number = 30) {
  const times: string[] = [];
  for (let h = 0; h < 24; h++) {
    times.push(`${date}T${String(h).padStart(2, '0')}:00`);
  }

  const hourly: Record<string, number[] | string[]> = { time: times };
  hourly['temperature_2m'] = Array(24).fill(15.0);

  for (let m = 1; m <= memberCount; m++) {
    const key = `temperature_2m_member${String(m).padStart(2, '0')}`;
    hourly[key] = times.map((_, h) => {
      const base = 10 + m * 0.3;
      const diurnal = 5 * Math.sin((h - 6) * Math.PI / 12);
      return Math.round((base + diurnal) * 10) / 10;
    });
  }

  return { hourly };
}

describe('WeatherData', () => {
  describe('parseEnsembleResponse', () => {
    it('extracts exactly 30 named members, excluding ensemble mean', () => {
      const response = makeMockResponse('2026-03-20');
      const members = parseEnsembleResponse(response);
      expect(members.length).toBe(30);
    });

    it('throws if fewer than 25 valid members', () => {
      const response = makeMockResponse('2026-03-20', 20);
      expect(() => parseEnsembleResponse(response)).toThrow();
    });
  });

  describe('extractDailyHighLow', () => {
    it('returns one high and one low per member for the target date', () => {
      const response = makeMockResponse('2026-03-20');
      const members = parseEnsembleResponse(response);
      const result = extractDailyHighLow(response.hourly.time as string[], members, '2026-03-20');

      expect(result.dailyHighs).toHaveLength(30);
      expect(result.dailyLows).toHaveLength(30);
      for (let i = 0; i < 30; i++) {
        expect(result.dailyHighs[i]).toBeGreaterThan(result.dailyLows[i]);
      }
    });

    it('rejects members with NaN values', () => {
      const response = makeMockResponse('2026-03-20');
      const key = 'temperature_2m_member01';
      (response.hourly[key] as number[])[12] = NaN;

      const members = parseEnsembleResponse(response);
      const result = extractDailyHighLow(response.hourly.time as string[], members, '2026-03-20');

      expect(result.dailyHighs).toHaveLength(29);
      expect(result.dailyLows).toHaveLength(29);
    });
  });
});

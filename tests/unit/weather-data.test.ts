import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseEnsembleResponse, extractDailyHighLow, mergeEnsembleMembers } from '../../src/modules/weather-data/index.js';
import type { EnsembleMember } from '../../src/modules/weather-data/index.js';
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

    it('extracts 50 members when available (ECMWF)', () => {
      const response = makeMockResponse('2026-03-20', 50);
      const members = parseEnsembleResponse(response);
      expect(members.length).toBe(50);
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

    it('handles 80 members from multi-model ensemble', () => {
      const response = makeMockResponse('2026-03-20', 80);
      const members = parseEnsembleResponse(response);
      const result = extractDailyHighLow(response.hourly.time as string[], members, '2026-03-20');

      expect(result.dailyHighs).toHaveLength(80);
      expect(result.dailyLows).toHaveLength(80);
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

  describe('mergeEnsembleMembers', () => {
    it('concatenates members from multiple model results', () => {
      const gfsMembers: EnsembleMember[] = [
        { key: 'temperature_2m_member01', values: [10, 11, 12] },
        { key: 'temperature_2m_member02', values: [13, 14, 15] },
      ];
      const ecmwfMembers: EnsembleMember[] = [
        { key: 'temperature_2m_member01', values: [11, 12, 13] },
        { key: 'temperature_2m_member02', values: [14, 15, 16] },
        { key: 'temperature_2m_member03', values: [12, 13, 14] },
      ];

      const merged = mergeEnsembleMembers([
        { model: 'gfs', members: gfsMembers },
        { model: 'ecmwf', members: ecmwfMembers },
      ]);

      expect(merged.members).toHaveLength(5);
      expect(merged.members[0].key).toBe('gfs_member01');
      expect(merged.members[2].key).toBe('ecmwf_member01');
      expect(merged.sources).toEqual([
        { model: 'gfs', memberCount: 2 },
        { model: 'ecmwf', memberCount: 3 },
      ]);
    });

    it('prefixes member keys with model name to avoid collisions', () => {
      const a: EnsembleMember[] = [{ key: 'temperature_2m_member01', values: [10] }];
      const b: EnsembleMember[] = [{ key: 'temperature_2m_member01', values: [11] }];

      const merged = mergeEnsembleMembers([
        { model: 'gfs', members: a },
        { model: 'ecmwf', members: b },
      ]);

      expect(merged.members[0].key).toBe('gfs_member01');
      expect(merged.members[1].key).toBe('ecmwf_member01');
    });
  });
});

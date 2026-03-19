import { describe, it, expect } from 'vitest';
import { CITIES } from '../../src/config/cities.js';
import { loadConfig } from '../../src/config/index.js';

describe('City Config', () => {
  it('has at least 3 cities (NYC, London, Seoul + expanded)', () => {
    expect(Object.keys(CITIES).length).toBeGreaterThanOrEqual(3);
    expect(CITIES.NYC).toBeDefined();
    expect(CITIES.London).toBeDefined();
    expect(CITIES.Seoul).toBeDefined();
  });

  it('has NYC with correct coords and timezone', () => {
    expect(CITIES.NYC).toEqual({
      key: 'NYC',
      lat: 40.7829,
      lon: -73.9654,
      station: 'Central Park',
      timezone: 'America/New_York',
    });
  });

  it('has London with EGLC coords', () => {
    expect(CITIES.London.lat).toBeCloseTo(51.505, 2);
    expect(CITIES.London.lon).toBeCloseTo(0.055, 2);
    expect(CITIES.London.station).toBe('EGLC');
  });

  it('has Seoul with KMA station', () => {
    expect(CITIES.Seoul.station).toBe('KMA Seoul');
    expect(CITIES.Seoul.timezone).toBe('Asia/Seoul');
  });
});

describe('loadConfig', () => {
  it('loads config from env with defaults', () => {
    process.env.PHASE = '2a';
    process.env.CAPITAL = '200';
    process.env.MYSQL_HOST = 'localhost';
    process.env.MYSQL_DATABASE = 'polymarket_arb';
    process.env.MYSQL_USER = 'bot';
    process.env.MYSQL_PASSWORD = 'test';
    process.env.TELEGRAM_BOT_TOKEN = 'tok';
    process.env.TELEGRAM_CHAT_ID = '123';

    const config = loadConfig();

    expect(config.phase).toBe('2a');
    expect(config.capital).toBe(200);
    expect(config.maxBet).toBe(20);
    expect(config.minBet).toBe(3);
    expect(config.estimatedFees).toBe(0);
    expect(config.minEdge).toBe(0.12);
    expect(config.kellyFraction).toBe(0.15);
    expect(config.maxConcurrentBets).toBe(8);
    expect(config.dailyLossLimit).toBe(0.03);
    expect(config.hourlyLossLimit).toBe(0.02);
    expect(config.monthlyLossLimit).toBe(0.20);
  });

  it('reads MAX_BET and MIN_BET from env', () => {
    process.env.MAX_BET = '100';
    process.env.MIN_BET = '5';
    process.env.ESTIMATED_FEES = '0.02';

    const config = loadConfig();

    expect(config.maxBet).toBe(100);
    expect(config.minBet).toBe(5);
    expect(config.estimatedFees).toBe(0.02);
  });
});

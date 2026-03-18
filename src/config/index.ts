import type { BotConfig, Phase } from '../types/index.js';

export { CITIES } from './cities.js';

export function loadConfig(): BotConfig {
  const phase = (process.env.PHASE || '2a') as Phase;

  if (phase !== '2a') {
    const required = ['POLYMARKET_PRIVATE_KEY', 'POLYMARKET_API_KEY', 'POLYMARKET_API_SECRET', 'POLYMARKET_API_PASSPHRASE'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length > 0) {
      throw new Error(`Phase ${phase} requires: ${missing.join(', ')}`);
    }
  }

  return {
    phase,
    capital: Number(process.env.CAPITAL || 200),
    maxBet: Number(process.env.MAX_BET || 20),
    minBet: Number(process.env.MIN_BET || 3),
    estimatedFees: Number(process.env.ESTIMATED_FEES || 0),
    minEdge: 0.12,
    kellyFraction: 0.15,
    maxConcurrentBets: 8,
    dailyLossLimit: 0.03,
    hourlyLossLimit: 0.02,
    monthlyLossLimit: 0.20,
    scanIntervalMinutes: Number(process.env.SCAN_INTERVAL_MINUTES || 15),
    mysql: {
      host: process.env.MYSQL_HOST || 'localhost',
      database: process.env.MYSQL_DATABASE || 'polymarket_arb',
      user: process.env.MYSQL_USER || 'bot',
      password: process.env.MYSQL_PASSWORD || '',
    },
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
      chatId: process.env.TELEGRAM_CHAT_ID || '',
    },
  };
}

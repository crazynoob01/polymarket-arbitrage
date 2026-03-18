// src/index.ts
import 'dotenv/config';
import { loadConfig } from './config/index.js';
import { getPool, closePool } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { initTelegram, setTelegramContext, notify, stopTelegram } from './modules/telegram-bot/index.js';
import { startScheduler } from './modules/scheduler/index.js';
import { log, error } from './logger.js';

async function main(): Promise<void> {
  log('=== Polymarket Weather Arbitrage Bot ===');

  const config = loadConfig();
  log(`Phase: ${config.phase} | Capital: $${config.capital} | Max bet: $${config.maxBet}`);

  const pool = getPool(config.mysql);
  await runMigrations(pool);
  log('Database connected and migrated');

  initTelegram(config);
  setTelegramContext(pool, config);

  startScheduler(pool, config);

  await notify(`Bot started — Phase ${config.phase}, Capital $${config.capital}`, 'INFO');

  const shutdown = async (signal: string) => {
    log(`\n${signal} received. Shutting down...`);
    stopTelegram();
    await closePool();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  error(`Fatal error: ${err}`);
  process.exit(1);
});

// src/modules/telegram-bot/index.ts
import TelegramBot from 'node-telegram-bot-api';
import type { Pool } from 'mysql2/promise';
import type { BotConfig } from '../../types/index.js';
import { getBetsByStatus, getDailyPnl, getWeeklyPnl, getMonthlyPnl, getAllTimePnl, getTotalOpenExposure } from '../../db/queries.js';

type NotifyLevel = 'INFO' | 'WARN' | 'CRITICAL';

let bot: TelegramBot | null = null;
let chatId: string = '';
let isPaused = false;

export function initTelegram(config: BotConfig): void {
  if (!config.telegram.botToken || !config.telegram.chatId) {
    console.warn('[telegram] No bot token or chat ID — running without Telegram');
    return;
  }

  chatId = config.telegram.chatId;
  bot = new TelegramBot(config.telegram.botToken, { polling: true });

  bot.onText(/\/weather/, async (msg) => {
    if (String(msg.chat.id) !== chatId) return;
    await handleWeather(msg.chat.id);
  });

  bot.onText(/\/balance/, async (msg) => {
    if (String(msg.chat.id) !== chatId) return;
    await handleBalance(msg.chat.id);
  });

  bot.onText(/\/pnl/, async (msg) => {
    if (String(msg.chat.id) !== chatId) return;
    await handlePnl(msg.chat.id);
  });

  bot.onText(/\/pause/, async (msg) => {
    if (String(msg.chat.id) !== chatId) return;
    isPaused = true;
    await bot!.sendMessage(msg.chat.id, 'Bot paused. Existing bets ride to resolution.');
  });

  bot.onText(/\/resume/, async (msg) => {
    if (String(msg.chat.id) !== chatId) return;
    isPaused = false;
    await bot!.sendMessage(msg.chat.id, 'Bot resumed.');
  });

  bot.onText(/\/status/, async (msg) => {
    if (String(msg.chat.id) !== chatId) return;
    await handleStatus(msg.chat.id);
  });

  console.log('[telegram] Bot initialized');
}

let poolRef: Pool | null = null;
let configRef: BotConfig | null = null;

export function setTelegramContext(pool: Pool, config: BotConfig): void {
  poolRef = pool;
  configRef = config;
}

export function isBotPaused(): boolean {
  return isPaused;
}

export function setPaused(value: boolean): void {
  isPaused = value;
}

export async function notify(message: string, level: NotifyLevel = 'INFO'): Promise<void> {
  const prefix = level === 'CRITICAL' ? '🚨 ' : level === 'WARN' ? '⚠️ ' : 'ℹ️ ';
  const text = `${prefix}${message}`;

  console.log(`[telegram] ${level}: ${message}`);

  if (!bot || !chatId) return;

  try {
    await bot.sendMessage(chatId, text);
  } catch (err) {
    console.error('[telegram] Failed to send:', err);
  }
}

async function handleWeather(chat: number): Promise<void> {
  if (!poolRef) return;

  const pending = await getBetsByStatus(poolRef, 'PENDING');
  const filled = await getBetsByStatus(poolRef, 'FILLED');
  const active = [...pending, ...filled];

  if (active.length === 0) {
    await bot!.sendMessage(chat, 'No active bets.');
    return;
  }

  const lines = active.map(b =>
    `${b.city} | ${b.market_title}\nProb: ${(Number(b.forecast_prob) * 100).toFixed(1)}% | Entry: $${Number(b.entry_price).toFixed(3)} | Size: $${Number(b.bet_size).toFixed(2)} | ${b.status}\nResolves: ${b.resolution_date}`
  );

  await bot!.sendMessage(chat, `Active bets (${active.length}):\n\n${lines.join('\n\n')}`);
}

async function handleBalance(chat: number): Promise<void> {
  if (!poolRef || !configRef) return;

  const exposure = await getTotalOpenExposure(poolRef);
  const available = configRef.capital - exposure;

  await bot!.sendMessage(chat,
    `Capital: $${configRef.capital}\nExposure: $${exposure.toFixed(2)}\nAvailable: $${available.toFixed(2)}`
  );
}

async function handlePnl(chat: number): Promise<void> {
  if (!poolRef) return;

  const daily = await getDailyPnl(poolRef);
  const weekly = await getWeeklyPnl(poolRef);
  const monthly = await getMonthlyPnl(poolRef);
  const allTime = await getAllTimePnl(poolRef);

  await bot!.sendMessage(chat,
    `P&L:\nToday: $${daily.toFixed(2)}\nThis week: $${weekly.toFixed(2)}\nThis month: $${monthly.toFixed(2)}\nAll-time: $${allTime.toFixed(2)}`
  );
}

async function handleStatus(chat: number): Promise<void> {
  if (!configRef) return;

  await bot!.sendMessage(chat,
    `Status: ${isPaused ? 'PAUSED' : 'RUNNING'}\nPhase: ${configRef.phase}\nCapital: $${configRef.capital}\nMax bet: $${configRef.maxBet}`
  );
}

export function stopTelegram(): void {
  if (bot) {
    bot.stopPolling();
    bot = null;
  }
}

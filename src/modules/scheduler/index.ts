// src/modules/scheduler/index.ts
import cron from 'node-cron';
import type { Pool } from 'mysql2/promise';
import type { BotConfig } from '../../types/index.js';
import { log, warn, error } from '../../logger.js';
import { findActiveWeatherMarkets } from '../market-matcher/index.js';
import { getMarketData } from '../market-matcher/grimoire.js';
import { fetchMultiModelEnsemble, extractDailyHighLow, type EnsembleMember } from '../weather-data/index.js';
import type { EnsembleForecast } from '../../types/index.js';
import { analyzeBracket } from '../probability-engine/index.js';
import { evaluateBet, type RiskContext } from '../risk-manager/index.js';
import { executeBet, checkOrderFills, cancelStaleOrders } from '../order-executor/index.js';
import { getOpenBetsCount, getTotalOpenExposure, getDailyPnl, getHourlyPnl, getMonthlyPnl, getBetsForResolution, updateBetStatus } from '../../db/queries.js';
import { notify, isBotPaused, setPaused, setPausedUntil } from '../telegram-bot/index.js';

let isRunning = false;

async function runPipeline(pool: Pool, config: BotConfig): Promise<void> {
  if (isRunning) {
    log('[scheduler] Pipeline already running, skipping');
    return;
  }
  if (isBotPaused()) {
    log('[scheduler] Bot is paused, skipping pipeline');
    return;
  }

  isRunning = true;
  log(`[scheduler] Pipeline started at ${new Date().toISOString()}`);

  try {
    let markets: Awaited<ReturnType<typeof findActiveWeatherMarkets>>;
    try {
      markets = await findActiveWeatherMarkets();
    } catch (err) {
      error(`[scheduler] Grimoire CLI failure — market discovery unavailable: ${err}`);
      await notify(`Grimoire CLI failure — market discovery unavailable: ${err}`, 'CRITICAL');
      return;
    }

    if (markets.length === 0) {
      console.log('[scheduler] No tradeable markets found');
      await notify('No tradeable weather markets found — check Grimoire connectivity or market availability', 'WARN');
      return;
    }

    const riskCtx: RiskContext = {
      openBetsCount: await getOpenBetsCount(pool),
      totalOpenExposure: await getTotalOpenExposure(pool),
      dailyPnl: await getDailyPnl(pool),
      hourlyPnl: await getHourlyPnl(pool),
      monthlyPnl: await getMonthlyPnl(pool),
    };

    interface CachedRawEnsemble {
      times: string[];
      members: EnsembleMember[];
      modelRun: string;
      sources: Array<{ model: string; memberCount: number }>;
    }
    const rawEnsembleCache = new Map<string, CachedRawEnsemble>();

    let betsPlaced = 0;

    for (const market of markets) {
      const cacheKey = `${market.city.lat}_${market.city.lon}`;

      let cached = rawEnsembleCache.get(cacheKey);
      if (!cached) {
        try {
          cached = await fetchMultiModelEnsemble(market.city, config.ensembleModels);
          rawEnsembleCache.set(cacheKey, cached);
        } catch (err) {
          error(`[scheduler] Forecast failed for ${market.city.key}: ${err}`);
          await notify(`Forecast fetch failed for ${market.city.key}: ${err}`, 'WARN');
          continue;
        }
      }

      let forecast: EnsembleForecast;
      try {
        const { dailyHighs, dailyLows, validCount } = extractDailyHighLow(
          cached.times,
          cached.members,
          market.resolutionDate
        );
        if (validCount < 25) {
          throw new Error(`Only ${validCount} valid members for ${market.city.key} on ${market.resolutionDate} (need >= 25)`);
        }
        forecast = {
          city: market.city,
          forecastDate: market.resolutionDate,
          modelRun: cached.modelRun,
          memberCount: validCount,
          dailyHighs,
          dailyLows,
          modelSources: cached.sources,
        };
      } catch (err) {
        error(`[scheduler] Forecast processing failed for ${market.city.key} on ${market.resolutionDate}: ${err}`);
        await notify(`Forecast processing failed for ${market.city.key} (${market.resolutionDate}): ${err}`, 'WARN');
        continue;
      }

      const analysis = analyzeBracket(forecast, market, config.estimatedFees);
      console.log(`[scheduler] ${market.marketTitle}: prob=${(analysis.forecastProbability * 100).toFixed(1)}%, edge=${(analysis.edge * 100).toFixed(1)}%`);

      if (analysis.edge < config.minEdge) continue;

      const decision = evaluateBet(analysis, config, riskCtx);
      if (!decision.approved) {
        const reason = decision.reason ?? '';
        if (reason.includes('monthly loss limit')) {
          const now = new Date();
          const firstOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
          warn(`[scheduler] Monthly loss limit hit — pausing until ${firstOfNextMonth.toISOString()}. Reason: ${reason}`);
          await notify(`Monthly loss limit hit — bot paused until ${firstOfNextMonth.toISOString()}. Reason: ${reason}`, 'CRITICAL');
          setPausedUntil(firstOfNextMonth);
        } else if (reason.includes('daily loss limit')) {
          const now = new Date();
          const nextMidnightUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
          warn(`[scheduler] Daily loss limit hit — pausing until ${nextMidnightUtc.toISOString()}. Reason: ${reason}`);
          await notify(`Daily loss limit hit — bot paused until ${nextMidnightUtc.toISOString()}. Reason: ${reason}`, 'WARN');
          setPausedUntil(nextMidnightUtc);
        } else if (reason.includes('1-hour rolling loss')) {
          const resumeAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
          warn(`[scheduler] Hourly loss limit hit — pausing for 4h until ${resumeAt.toISOString()}. Reason: ${reason}`);
          await notify(`Hourly loss limit hit — bot pausing for 4 hours until ${resumeAt.toISOString()}. Reason: ${reason}`, 'WARN');
          setPausedUntil(resumeAt);
        } else {
          console.log(`[scheduler] Skipping: ${reason}`);
        }
        continue;
      }

      const result = await executeBet(decision, market, analysis, config, pool);
      if (result.success) {
        betsPlaced++;
        riskCtx.openBetsCount++;
        riskCtx.totalOpenExposure += decision.betSize;
        await notify(
          `Bet placed: ${market.city.key} ${market.marketTitle}\n` +
          `Prob: ${(analysis.forecastProbability * 100).toFixed(1)}% | Ask: $${market.bestAskPrice} | Size: $${decision.betSize}\n` +
          `Edge: ${(analysis.edge * 100).toFixed(1)}%`,
          'INFO'
        );
      }
    }

    log(`[scheduler] Pipeline complete. ${betsPlaced} bets placed.`);
  } catch (err) {
    error(`[scheduler] Pipeline error: ${err}`);
    await notify(`Pipeline error: ${err}`, 'WARN');
  } finally {
    isRunning = false;
  }
}

async function checkResolutions(pool: Pool, config: BotConfig): Promise<void> {
  const bets = await getBetsForResolution(pool);
  if (bets.length === 0) return;
  console.log(`[scheduler] Checking ${bets.length} bets for resolution`);

  for (const bet of bets) {
    try {
      const marketData = await getMarketData(bet.market_id);
      if (!marketData) continue;
      const resolved = marketData.resolved || marketData.closed;

      if (!resolved) continue;

      const outcomePrices = marketData.outcomePrices || [];
      const yesPrice = parseFloat(String((outcomePrices as string[])[0] || '0'));
      const won = yesPrice > 0.99;

      const fillAmount = Number(bet.fill_amount || bet.bet_size);
      const pnl = won
        ? fillAmount * ((1 / Number(bet.entry_price)) - 1)
        : -fillAmount;

      const gasFee = 0.02;

      await updateBetStatus(pool, bet.id, won ? 'WON' : 'LOST', {
        outcome: (marketData.outcome as number) || undefined,
        pnl: Math.round((pnl - gasFee) * 100) / 100,
        gas_fee: gasFee,
      });

      const emoji = won ? 'WIN' : 'LOSS';
      await notify(
        `${emoji}: ${bet.city} ${bet.market_title}\nP&L: $${pnl.toFixed(2)} (gas: $${gasFee})`,
        'INFO'
      );

      console.log(`[scheduler] Bet #${bet.id} resolved: ${won ? 'WON' : 'LOST'}, P&L: $${pnl.toFixed(2)}`);
    } catch (err) {
      console.error(`[scheduler] Resolution check failed for bet #${bet.id}:`, err);
    }
  }
}

export function startScheduler(pool: Pool, config: BotConfig): void {
  const interval = config.scanIntervalMinutes;
  cron.schedule(`*/${interval} * * * *`, () => {
    runPipeline(pool, config);
  });

  cron.schedule('*/30 * * * *', () => {
    checkOrderFills(pool);
  });

  cron.schedule('0 * * * *', () => {
    checkResolutions(pool, config);
  });

  cron.schedule('5 * * * *', () => {
    cancelStaleOrders(pool);
  });

  log(`[scheduler] All cron jobs scheduled`);
  log(`[scheduler] Pipeline: every ${interval}m`);
  log('[scheduler] Fill checks: every 30m');
  log('[scheduler] Resolution checks: every 1h');
  log('[scheduler] Stale order cleanup: every 1h at :05');

  // Run startup pipeline unless next scheduled run is very soon
  const now = new Date();
  const currentMin = now.getMinutes();
  const minutesUntilNext = interval - (currentMin % interval);

  if (minutesUntilNext > Math.min(5, interval / 3)) {
    log(`[scheduler] Running startup pipeline (next cron in ${minutesUntilNext}m)`);
    runPipeline(pool, config);
  } else {
    log(`[scheduler] Next cycle in ${minutesUntilNext}m — skipping startup run`);
  }
}

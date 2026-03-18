// src/modules/scheduler/index.ts
import cron from 'node-cron';
import type { Pool } from 'mysql2/promise';
import type { BotConfig } from '../../types/index.js';
import { findActiveWeatherMarkets } from '../market-matcher/index.js';
import { getMarketData } from '../market-matcher/grimoire.js';
import { fetchRawEnsemble, extractDailyHighLow, type EnsembleMember } from '../weather-data/index.js';
import type { EnsembleForecast } from '../../types/index.js';
import { analyzeBracket } from '../probability-engine/index.js';
import { evaluateBet, type RiskContext } from '../risk-manager/index.js';
import { executeBet, checkOrderFills, cancelStaleOrders } from '../order-executor/index.js';
import { getOpenBetsCount, getTotalOpenExposure, getDailyPnl, getHourlyPnl, getMonthlyPnl, getBetsForResolution, updateBetStatus } from '../../db/queries.js';
import { notify, isBotPaused, setPaused, setPausedUntil } from '../telegram-bot/index.js';

let isRunning = false;

async function runPipeline(pool: Pool, config: BotConfig): Promise<void> {
  if (isRunning) {
    console.log('[scheduler] Pipeline already running, skipping');
    return;
  }
  if (isBotPaused()) {
    console.log('[scheduler] Bot is paused, skipping pipeline');
    return;
  }

  isRunning = true;
  console.log(`[scheduler] Pipeline started at ${new Date().toISOString()}`);

  try {
    let markets: Awaited<ReturnType<typeof findActiveWeatherMarkets>>;
    try {
      markets = await findActiveWeatherMarkets();
    } catch (err) {
      console.error('[scheduler] Grimoire CLI failure — market discovery unavailable:', err);
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
    }
    const rawEnsembleCache = new Map<string, CachedRawEnsemble>();

    let betsPlaced = 0;

    for (const market of markets) {
      const cacheKey = `${market.city.lat}_${market.city.lon}`;

      let cached = rawEnsembleCache.get(cacheKey);
      if (!cached) {
        try {
          cached = await fetchRawEnsemble(market.city);
          rawEnsembleCache.set(cacheKey, cached);
        } catch (err) {
          console.error(`[scheduler] Forecast failed for ${market.city.key}:`, err);
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
        };
      } catch (err) {
        console.error(`[scheduler] Forecast processing failed for ${market.city.key} on ${market.resolutionDate}:`, err);
        await notify(`Forecast processing failed for ${market.city.key} (${market.resolutionDate}): ${err}`, 'WARN');
        continue;
      }

      const analysis = analyzeBracket(forecast, market, config.estimatedFees);
      console.log(`[scheduler] ${market.marketTitle}: prob=${(analysis.forecastProbability * 100).toFixed(1)}%, edge=${(analysis.edge * 100).toFixed(1)}%`);

      if (analysis.edge < config.minEdge) continue;

      const decision = evaluateBet(analysis, config, riskCtx);
      if (!decision.approved) {
        console.log(`[scheduler] Skipping: ${decision.reason}`);
        const reason = decision.reason ?? '';
        if (reason.includes('monthly loss limit')) {
          const now = new Date();
          const firstOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
          await notify(`Monthly loss limit hit — bot paused until ${firstOfNextMonth.toISOString()}. Reason: ${reason}`, 'CRITICAL');
          setPausedUntil(firstOfNextMonth);
        } else if (reason.includes('daily loss limit')) {
          const now = new Date();
          const nextMidnightUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
          await notify(`Daily loss limit hit — bot paused until ${nextMidnightUtc.toISOString()}. Reason: ${reason}`, 'WARN');
          setPausedUntil(nextMidnightUtc);
        } else if (reason.includes('1-hour rolling loss')) {
          const resumeAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
          await notify(`Hourly loss limit hit — bot pausing for 4 hours until ${resumeAt.toISOString()}. Reason: ${reason}`, 'WARN');
          setPausedUntil(resumeAt);
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

    console.log(`[scheduler] Pipeline complete. ${betsPlaced} bets placed.`);
  } catch (err) {
    console.error('[scheduler] Pipeline error:', err);
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
  cron.schedule('17 */2 * * *', () => {
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

  console.log('[scheduler] All cron jobs scheduled');
  console.log('[scheduler] Pipeline: every 2h at :17');
  console.log('[scheduler] Fill checks: every 30m');
  console.log('[scheduler] Resolution checks: every 1h');
  console.log('[scheduler] Stale order cleanup: every 1h at :05');

  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const nextEvenHour = currentHour % 2 === 0
    ? (currentMin < 17 ? currentHour : currentHour + 2)
    : currentHour + 1;

  const nextFire = new Date(now);
  nextFire.setHours(nextEvenHour % 24, 17, 0, 0);
  if (nextFire <= now) nextFire.setHours(nextFire.getHours() + 2);
  const minutesUntilNext = Math.round((nextFire.getTime() - now.getTime()) / 60_000);

  if (minutesUntilNext > 10) {
    console.log(`[scheduler] Running startup pipeline (next cron in ${minutesUntilNext}m)`);
    runPipeline(pool, config);
  } else {
    console.log(`[scheduler] Next cycle in ${minutesUntilNext}m — skipping startup run`);
  }
}

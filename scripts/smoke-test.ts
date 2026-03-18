/**
 * Smoke test — run locally to verify the pipeline works end-to-end.
 * No Polymarket keys needed. No MySQL needed.
 *
 * Usage: npx tsx scripts/smoke-test.ts
 */
import { CITIES } from '../src/config/cities.js';
import { fetchEnsemble, fetchRawEnsemble, extractDailyHighLow } from '../src/modules/weather-data/index.js';
import { analyzeBracket } from '../src/modules/probability-engine/index.js';
import { evaluateBet, type RiskContext } from '../src/modules/risk-manager/index.js';
import { parseMarketTitle } from '../src/modules/market-matcher/parser.js';
import type { MatchedMarket, BotConfig, EnsembleForecast } from '../src/types/index.js';

const config: BotConfig = {
  phase: '2a',
  capital: 200,
  maxBet: 20,
  minBet: 3,
  estimatedFees: 0,
  minEdge: 0.12,
  kellyFraction: 0.15,
  maxConcurrentBets: 8,
  dailyLossLimit: 0.03,
  hourlyLossLimit: 0.02,
  monthlyLossLimit: 0.20,
  mysql: { host: '', database: '', user: '', password: '' },
  telegram: { botToken: '', chatId: '' },
};

async function main() {
  console.log('=== Smoke Test: Weather Arbitrage Pipeline ===\n');

  // Step 1: Fetch real ensemble forecast for NYC
  const city = CITIES.NYC;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const forecastDate = tomorrow.toISOString().split('T')[0];

  console.log(`1. Fetching GFS ensemble for ${city.key} on ${forecastDate}...`);
  const raw = await fetchRawEnsemble(city);
  console.log(`   ✓ Got ${raw.members.length} ensemble members, ${raw.times.length} hourly timestamps`);

  const { dailyHighs, dailyLows, validCount } = extractDailyHighLow(raw.times, raw.members, forecastDate);
  console.log(`   ✓ Valid members: ${validCount}`);
  console.log(`   ✓ Daily highs range: ${Math.min(...dailyHighs).toFixed(1)}°C – ${Math.max(...dailyHighs).toFixed(1)}°C`);
  console.log(`   ✓ Daily lows range:  ${Math.min(...dailyLows).toFixed(1)}°C – ${Math.max(...dailyLows).toFixed(1)}°C`);

  const forecast: EnsembleForecast = {
    city,
    forecastDate,
    modelRun: raw.modelRun,
    memberCount: validCount,
    dailyHighs,
    dailyLows,
  };

  // Step 2: Simulate a market and analyze
  console.log('\n2. Simulating market analysis...');

  // Create a bracket around the median high
  const sortedHighs = [...dailyHighs].sort((a, b) => a - b);
  const median = sortedHighs[Math.floor(sortedHighs.length / 2)];
  const bracketLowerC = Math.floor(median) - 1;
  const bracketUpperC = Math.floor(median) + 2;

  const fakeMarket: MatchedMarket = {
    marketId: 'test_cond_001',
    tokenId: 'test_tok_001',
    city,
    marketTitle: `NYC high temp ${forecastDate} — ${bracketLowerC}°C to ${bracketUpperC}°C`,
    metric: 'high',
    bracketLowerC,
    bracketUpperC,
    bracketLowerOriginal: bracketLowerC,
    bracketUpperOriginal: bracketUpperC,
    originalUnit: 'C',
    resolutionDate: forecastDate,
    forecastHorizonDays: 1,
    bestAskPrice: 0.35, // simulated ask
    volume: 10000,
  };

  const analysis = analyzeBracket(forecast, fakeMarket, config.estimatedFees);
  console.log(`   Market: ${fakeMarket.marketTitle}`);
  console.log(`   Bracket: [${bracketLowerC}°C, ${bracketUpperC}°C)`);
  console.log(`   Members in bracket: ${analysis.membersInBracket}/${analysis.totalMembers}`);
  console.log(`   Forecast probability: ${(analysis.forecastProbability * 100).toFixed(1)}%`);
  console.log(`   Best ask (simulated): $${fakeMarket.bestAskPrice}`);
  console.log(`   Edge: ${(analysis.edge * 100).toFixed(1)}%`);

  // Step 3: Risk evaluation
  console.log('\n3. Risk evaluation...');
  const riskCtx: RiskContext = {
    openBetsCount: 0,
    totalOpenExposure: 0,
    dailyPnl: 0,
    hourlyPnl: 0,
    monthlyPnl: 0,
  };

  const decision = evaluateBet(analysis, config, riskCtx);
  if (decision.approved) {
    console.log(`   ✓ APPROVED`);
    console.log(`   Kelly fraction: ${(decision.kellyFraction * 100).toFixed(2)}%`);
    console.log(`   Bet size: $${decision.betSize.toFixed(2)}`);
    console.log(`   Limit price: $${decision.limitPrice}`);
    console.log(`   Available bankroll: $${decision.availableBankroll.toFixed(2)}`);
  } else {
    console.log(`   ✗ REJECTED: ${decision.reason}`);
  }

  // Step 4: Parser test with real-looking titles
  console.log('\n4. Parser tests with real Polymarket titles...');
  const titles = [
    'Will the high temperature in New York City on March 20 be between 55°F and 59°F?',
    'Will the high temperature in New York City on March 20 be 80°F or higher?',
    'Will the high temperature in New York City on March 20 be 32°F or below?',
    'London daily high temperature for March 21 — 50-54°F',
    'Seoul max temperature March 19 bracket: 10-14°C',
    'Will it rain in Tokyo tomorrow?',
  ];
  for (const title of titles) {
    const parsed = parseMarketTitle(title);
    if (parsed) {
      console.log(`   ✓ "${title.substring(0, 60)}..."`);
      console.log(`     → ${parsed.cityKey} ${parsed.metric} [${parsed.bracketLowerC.toFixed(1)}°C, ${parsed.bracketUpperC.toFixed(1)}°C)`);
    } else {
      console.log(`   ✗ "${title.substring(0, 60)}..." → not matched (expected for non-weather)`);
    }
  }

  // Step 5: Multi-city forecast test
  console.log('\n5. Multi-city forecast test...');
  for (const [name, c] of Object.entries(CITIES)) {
    try {
      const rawCity = await fetchRawEnsemble(c);
      const result = extractDailyHighLow(rawCity.times, rawCity.members, forecastDate);
      const avgHigh = result.dailyHighs.reduce((a, b) => a + b, 0) / result.dailyHighs.length;
      const avgLow = result.dailyLows.reduce((a, b) => a + b, 0) / result.dailyLows.length;
      console.log(`   ✓ ${name}: avg high ${avgHigh.toFixed(1)}°C, avg low ${avgLow.toFixed(1)}°C (${result.validCount} members)`);
    } catch (err) {
      console.log(`   ✗ ${name}: ${err}`);
    }
  }

  console.log('\n=== Smoke test complete ===');
}

main().catch(console.error);

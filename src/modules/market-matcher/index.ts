import { CITIES } from '../../config/index.js';
import type { CityConfig, MatchedMarket } from '../../types/index.js';
import { parseMarketTitle } from './parser.js';
import { searchMarkets, getOrderBook, getBestAsk } from './grimoire.js';

const MIN_VOLUME = 1_000;
const MAX_FORECAST_DAYS = 3;

function buildResolutionDate(month: number, day: number): string {
  const now = new Date();
  let year = now.getFullYear();
  const candidate = new Date(year, month - 1, day);
  if (candidate < now) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (candidate < today) {
      year += 1;
    }
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function calcForecastHorizonDays(resolutionDate: string): number {
  const now = new Date();
  const resolution = new Date(resolutionDate);
  const diffMs = resolution.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export async function findActiveWeatherMarkets(): Promise<MatchedMarket[]> {
  let rawMarkets: Awaited<ReturnType<typeof searchMarkets>>;
  try {
    rawMarkets = await searchMarkets('temperature');
  } catch (err) {
    console.error('[market-matcher] Grimoire CLI failure — cannot fetch markets:', err);
    throw err;
  }
  const matched: MatchedMarket[] = [];
  let skipped = { parse: 0, city: 0, volume: 0, horizon: 0, token: 0, book: 0, ask: 0 };

  console.log(`[market-matcher] Processing ${rawMarkets.length} raw markets from search`);

  for (const raw of rawMarkets) {
    const title = raw.question || raw.groupItemTitle || '';
    const parsed = parseMarketTitle(title);
    if (!parsed) {
      skipped.parse++;
      continue;
    }

    const city: CityConfig | undefined = CITIES[parsed.cityKey];
    if (!city) {
      skipped.city++;
      continue;
    }

    const volume = raw.volume || 0;
    if (volume < MIN_VOLUME) {
      skipped.volume++;
      continue;
    }

    const resolutionDate = buildResolutionDate(parsed.month, parsed.day);
    const horizon = calcForecastHorizonDays(resolutionDate);
    if (horizon < 0 || horizon > MAX_FORECAST_DAYS) {
      skipped.horizon++;
      continue;
    }

    const tokenId = raw.clobTokenIds?.[0];
    if (!tokenId) {
      skipped.token++;
      continue;
    }

    const book = await getOrderBook(tokenId);
    if (!book) {
      skipped.book++;
      continue;
    }

    const bestAsk = getBestAsk(book);
    if (bestAsk === null || bestAsk <= 0 || bestAsk >= 1) {
      skipped.ask++;
      continue;
    }

    matched.push({
      marketId: raw.conditionId || raw.id,
      tokenId,
      city,
      marketTitle: title,
      metric: parsed.metric,
      bracketLowerC: parsed.bracketLowerC,
      bracketUpperC: parsed.bracketUpperC,
      bracketLowerOriginal: parsed.bracketLowerOriginal,
      bracketUpperOriginal: parsed.bracketUpperOriginal,
      originalUnit: parsed.originalUnit,
      resolutionDate,
      forecastHorizonDays: horizon,
      bestAskPrice: bestAsk,
      volume,
    });
  }

  console.log(`[market-matcher] Filter results: ${JSON.stringify(skipped)}`);
  console.log(`[market-matcher] Found ${matched.length} tradeable weather markets`);
  return matched;
}

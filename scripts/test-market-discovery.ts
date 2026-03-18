/**
 * Test market discovery against live Polymarket.
 * Usage: npx tsx scripts/test-market-discovery.ts
 */
import { searchMarkets, getOrderBook, getBestAsk } from '../src/modules/market-matcher/grimoire.js';
import { parseMarketTitle } from '../src/modules/market-matcher/parser.js';
import { CITIES } from '../src/config/cities.js';
import type { CityConfig } from '../src/types/index.js';

async function main() {
  console.log('=== Live Market Discovery Test ===\n');

  console.log('1. Searching Polymarket for temperature markets...');
  const markets = await searchMarkets('temperature');
  console.log(`   Found ${markets.length} active markets\n`);

  console.log('2. Parsing market titles...');
  let matched = 0;
  const tradeable: Array<{ title: string; cityKey: string; tokenId: string; volume: number }> = [];

  for (const m of markets) {
    const title = m.question || m.groupItemTitle || '';
    const parsed = parseMarketTitle(title);
    if (parsed) {
      const city: CityConfig | undefined = CITIES[parsed.cityKey];
      if (city) {
        matched++;
        const tokenId = m.clobTokenIds?.[0] || '';
        tradeable.push({ title, cityKey: parsed.cityKey, tokenId, volume: Number(m.volume) });
        console.log(`   ✓ ${parsed.cityKey.padEnd(7)} | ${parsed.metric.padEnd(4)} | [${parsed.bracketLowerC === -Infinity ? '-∞' : parsed.bracketLowerC.toFixed(1)}°C, ${parsed.bracketUpperC === Infinity ? '∞' : parsed.bracketUpperC.toFixed(1)}°C) | vol: $${Number(m.volume).toFixed(0)}`);
        console.log(`     "${title.substring(0, 70)}"`);
      }
    }
  }
  console.log(`\n   Matched ${matched} markets to known cities (NYC, London, Seoul)`);
  console.log(`   Skipped ${markets.length - matched} markets (unknown cities or unparseable)\n`);

  // Test order book for first tradeable market
  if (tradeable.length > 0) {
    const first = tradeable[0];
    console.log(`3. Fetching order book for ${first.cityKey} market...`);
    console.log(`   Token: ${first.tokenId.substring(0, 30)}...`);
    const book = await getOrderBook(first.tokenId);
    if (book) {
      const bestAsk = getBestAsk(book);
      console.log(`   Best ask: ${bestAsk !== null ? `$${bestAsk}` : 'no asks'}`);
      console.log(`   Asks: ${book.asks?.length || 0}, Bids: ${book.bids?.length || 0}`);
    } else {
      console.log('   Failed to fetch order book');
    }
  } else {
    console.log('3. No tradeable markets found for known cities');
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);

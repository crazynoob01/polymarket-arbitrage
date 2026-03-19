/**
 * Verify multi-model ensemble works against live Open-Meteo API.
 * Usage: npx tsx scripts/test-multi-model.ts
 */
import { CITIES } from '../src/config/cities.js';
import { fetchMultiModelEnsemble, extractDailyHighLow } from '../src/modules/weather-data/index.js';
import { calcBracketProbability } from '../src/modules/probability-engine/index.js';

async function main() {
  console.log('=== Multi-Model Ensemble Verification ===\n');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const forecastDate = tomorrow.toISOString().split('T')[0];

  // Test with a subset of cities to avoid hammering the API
  const testCities = ['NYC', 'London', 'Seoul', 'Tokyo'];

  for (const name of testCities) {
    const city = CITIES[name];
    if (!city) continue;

    console.log(`\n--- ${name} (${forecastDate}) ---`);

    try {
      const raw = await fetchMultiModelEnsemble(city);
      const { dailyHighs, dailyLows, validCount } = extractDailyHighLow(raw.times, raw.members, forecastDate);

      console.log(`Members: ${validCount} total from ${raw.sources.map(s => `${s.model}(${s.memberCount})`).join(' + ')}`);

      const sortedHighs = [...dailyHighs].sort((a, b) => a - b);
      const mean = dailyHighs.reduce((a, b) => a + b, 0) / dailyHighs.length;
      const min = sortedHighs[0];
      const max = sortedHighs[sortedHighs.length - 1];

      console.log(`Daily high: mean=${mean.toFixed(1)}°C, range=[${min.toFixed(1)}, ${max.toFixed(1)}]°C`);

      const bracketStart = Math.floor(min) - 1;
      const bracketEnd = Math.ceil(max) + 1;
      console.log('Bracket probabilities:');
      for (let t = bracketStart; t <= bracketEnd; t++) {
        const prob = calcBracketProbability(dailyHighs, t, t + 1);
        if (prob > 0) {
          const bar = '\u2588'.repeat(Math.round(prob * 50));
          console.log(`  [${t},${t + 1})°C: ${(prob * 100).toFixed(1)}% ${bar}`);
        }
      }
    } catch (err) {
      console.error(`  ERROR: ${err}`);
    }
  }

  console.log('\n=== Done ===');
}

main().catch(console.error);

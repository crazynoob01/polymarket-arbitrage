import axios from 'axios';
import type { CityConfig, EnsembleForecast } from '../../types/index.js';

const ENSEMBLE_API = 'https://ensemble-api.open-meteo.com/v1/ensemble';
const MAX_RETRIES = 3;
const TIMEOUT_MS = 10_000;

export interface EnsembleMember {
  key: string;
  values: number[];
}

/**
 * Parse the raw Open-Meteo response, extracting all named members (up to 99).
 * Handles GFS (30), ECMWF (50), ICON (40), or any other model.
 * Excludes the unqualified `temperature_2m` (ensemble mean).
 * Throws if fewer than 25 valid members are found.
 */
export function parseEnsembleResponse(response: { hourly: Record<string, unknown> }): EnsembleMember[] {
  const members: EnsembleMember[] = [];

  for (let m = 1; m <= 99; m++) {
    const key = `temperature_2m_member${String(m).padStart(2, '0')}`;
    const values = response.hourly[key];
    if (Array.isArray(values)) {
      members.push({ key, values: values as number[] });
    }
  }

  if (members.length < 25) {
    throw new Error(`Expected at least 25 ensemble members, got ${members.length}`);
  }

  return members;
}

/**
 * Merge ensemble members from multiple model sources into a single pool.
 * Prefixes member keys with model name to avoid collisions.
 */
export function mergeEnsembleMembers(
  sources: Array<{ model: string; members: EnsembleMember[] }>
): { members: EnsembleMember[]; sources: Array<{ model: string; memberCount: number }> } {
  const merged: EnsembleMember[] = [];
  const sourceSummary: Array<{ model: string; memberCount: number }> = [];

  for (const source of sources) {
    for (const member of source.members) {
      const shortKey = member.key.replace('temperature_2m_', '');
      merged.push({ key: `${source.model}_${shortKey}`, values: member.values });
    }
    sourceSummary.push({ model: source.model, memberCount: source.members.length });
  }

  return { members: merged, sources: sourceSummary };
}

/**
 * Fetch ensemble forecasts from multiple NWP models and merge into a single member pool.
 * Falls back to GFS-only if ECMWF fetch fails.
 */
export async function fetchMultiModelEnsemble(
  city: CityConfig,
  modelIds?: string[]
): Promise<{
  times: string[];
  members: EnsembleMember[];
  modelRun: string;
  sources: Array<{ model: string; memberCount: number }>;
}> {
  const models = (modelIds ?? ['gfs_seamless', 'ecmwf_ifs025']).map(id => ({
    id,
    name: id.split('_')[0],
  }));

  const fetches = models.map(async (model) => {
    const url = `${ENSEMBLE_API}?latitude=${city.lat}&longitude=${city.lon}&hourly=temperature_2m&models=${model.id}&forecast_days=3&timezone=${encodeURIComponent(city.timezone)}`;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await axios.get(url, { timeout: TIMEOUT_MS });
        const data = response.data;
        const members = parseEnsembleResponse(data);

        return {
          model: model.name,
          members,
          times: data.hourly.time as string[],
          modelRun: data.current?.time || new Date().toISOString(),
        };
      } catch (err) {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }
    }
    console.warn(`[weather-data] Failed to fetch ${model.name} ensemble for ${city.key}, skipping`);
    return null;
  });

  const fetchResults = await Promise.all(fetches);
  const results: Array<{ model: string; members: EnsembleMember[] }> = [];
  let times: string[] = [];
  let modelRun = '';

  for (const result of fetchResults) {
    if (result) {
      results.push({ model: result.model, members: result.members });
      if (!times.length) times = result.times;
      if (!modelRun) modelRun = result.modelRun;
    }
  }

  if (results.length === 0) {
    throw new Error(`[weather-data] All model fetches failed for ${city.key}`);
  }

  const merged = mergeEnsembleMembers(results);
  console.log(`[weather-data] ${city.key}: merged ${merged.members.length} members from ${merged.sources.map(s => `${s.model}(${s.memberCount})`).join(' + ')}`);

  return {
    times,
    members: merged.members,
    modelRun,
    sources: merged.sources,
  };
}

/**
 * For each member, extract the daily high and low for the target date.
 * Rejects members containing NaN/null in the target date window.
 */
export function extractDailyHighLow(
  times: string[],
  members: EnsembleMember[],
  targetDate: string
): { dailyHighs: number[]; dailyLows: number[]; validCount: number } {
  const dateIndices: number[] = [];
  for (let i = 0; i < times.length; i++) {
    if (times[i].startsWith(targetDate)) {
      dateIndices.push(i);
    }
  }

  if (dateIndices.length < 20) {
    throw new Error(`Insufficient hourly data for ${targetDate}: got ${dateIndices.length} hours (need >= 20)`);
  }

  const dailyHighs: number[] = [];
  const dailyLows: number[] = [];

  for (const member of members) {
    const dateValues = dateIndices.map(i => member.values[i]);

    if (dateValues.some(v => v === null || v === undefined || Number.isNaN(v))) {
      console.warn(`[weather-data] Rejecting ${member.key}: contains NaN/null on ${targetDate}`);
      continue;
    }

    dailyHighs.push(Math.max(...dateValues));
    dailyLows.push(Math.min(...dateValues));
  }

  return { dailyHighs, dailyLows, validCount: dailyHighs.length };
}

/**
 * Fetch raw GFS ensemble data from Open-Meteo for a given city.
 * Returns parsed members and raw time array without extracting per-date highs/lows.
 * Retries up to 3 times with exponential backoff.
 */
export async function fetchRawEnsemble(city: CityConfig): Promise<{
  times: string[];
  members: EnsembleMember[];
  modelRun: string;
}> {
  const url = `${ENSEMBLE_API}?latitude=${city.lat}&longitude=${city.lon}&hourly=temperature_2m&models=gfs_seamless&forecast_days=3&timezone=${encodeURIComponent(city.timezone)}`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(url, { timeout: TIMEOUT_MS });
      const data = response.data;

      const members = parseEnsembleResponse(data);

      return {
        times: data.hourly.time as string[],
        members,
        modelRun: data.current?.time || new Date().toISOString(),
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        const delayMs = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  throw new Error(`[weather-data] Failed to fetch raw ensemble for ${city.key} after ${MAX_RETRIES} retries: ${lastError?.message}`);
}

/**
 * Fetch GFS ensemble forecast from Open-Meteo for a given city.
 * Returns an EnsembleForecast with daily highs/lows per member.
 * Retries up to 3 times with exponential backoff.
 */
export async function fetchEnsemble(
  city: CityConfig,
  forecastDate: string
): Promise<EnsembleForecast> {
  const url = `${ENSEMBLE_API}?latitude=${city.lat}&longitude=${city.lon}&hourly=temperature_2m&models=gfs_seamless&forecast_days=3&timezone=${encodeURIComponent(city.timezone)}`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await axios.get(url, { timeout: TIMEOUT_MS });
      const data = response.data;

      const members = parseEnsembleResponse(data);
      const { dailyHighs, dailyLows, validCount } = extractDailyHighLow(
        data.hourly.time,
        members,
        forecastDate
      );

      if (validCount < 25) {
        throw new Error(`Only ${validCount} valid members for ${city.key} on ${forecastDate} (need >= 25)`);
      }

      return {
        city,
        forecastDate,
        modelRun: data.current?.time || new Date().toISOString(),
        memberCount: validCount,
        dailyHighs,
        dailyLows,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        const delayMs = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  throw new Error(`[weather-data] Failed to fetch ensemble for ${city.key} after ${MAX_RETRIES} retries: ${lastError?.message}`);
}

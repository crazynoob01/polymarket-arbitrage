import type { CityConfig } from '../types/index.js';

export const CITIES: Record<string, CityConfig> = {
  NYC: {
    key: 'NYC',
    lat: 40.7829,
    lon: -73.9654,
    station: 'Central Park',
    timezone: 'America/New_York',
  },
  London: {
    key: 'London',
    lat: 51.505,
    lon: 0.055,
    station: 'EGLC',
    timezone: 'Europe/London',
  },
  Seoul: {
    key: 'Seoul',
    lat: 37.5665,
    lon: 126.978,
    station: 'KMA Seoul',
    timezone: 'Asia/Seoul',
  },
};

const KNOWN_CITIES: Record<string, string> = {
  'new york city': 'NYC',
  'new york': 'NYC',
  'nyc': 'NYC',
  'london': 'London',
  'seoul': 'Seoul',
};

export interface ParsedMarket {
  cityKey: string;
  metric: 'high' | 'low';
  bracketLowerOriginal: number;
  bracketUpperOriginal: number;
  bracketLowerC: number;
  bracketUpperC: number;
  originalUnit: 'F' | 'C';
  month: number;
  day: number;
}

export function fahrenheitToCelsius(f: number): number {
  if (f === -Infinity) return -Infinity;
  if (f === Infinity) return Infinity;
  return (f - 32) * 5 / 9;
}

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4,
  may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4,
  jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function findCity(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [name, key] of Object.entries(KNOWN_CITIES)) {
    if (lower.includes(name)) return key;
  }
  return null;
}

function extractDate(text: string): { month: number; day: number } | null {
  const monthNames = Object.keys(MONTH_MAP).join('|');
  const dateRegex = new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})\\b`, 'i');
  const dateMatch = text.match(dateRegex);
  if (!dateMatch) return null;

  const month = MONTH_MAP[dateMatch[1].toLowerCase()];
  if (!month) return null;

  return { month, day: parseInt(dateMatch[2], 10) };
}

function extractMetric(text: string): 'high' | 'low' {
  const lower = text.toLowerCase();
  if (lower.includes('low') || lower.includes('min')) return 'low';
  return 'high';
}

export function parseMarketTitle(title: string): ParsedMarket | null {
  const cityKey = findCity(title);
  if (!cityKey) return null;

  const metric = extractMetric(title);
  const dateInfo = extractDate(title);
  if (!dateInfo) return null;

  const hasF = /°F/i.test(title);
  const hasC = /°C/i.test(title);
  const unit: 'F' | 'C' = hasF ? 'F' : hasC ? 'C' : 'F';

  let bracketLower: number;
  let bracketUpper: number;

  // Pattern: "X°F or below" / "X°C or below"
  const belowMatch = title.match(/(-?\d+)\s*°[FC]\s+or\s+below/i);
  if (belowMatch) {
    bracketLower = -Infinity;
    bracketUpper = parseInt(belowMatch[1], 10) + 1;
    return buildResult(cityKey, metric, bracketLower, bracketUpper, unit, dateInfo);
  }

  // Pattern: "X°F or higher" / "X°F or above"
  const aboveMatch = title.match(/(-?\d+)\s*°[FC]\s+or\s+(higher|above)/i);
  if (aboveMatch) {
    bracketLower = parseInt(aboveMatch[1], 10);
    bracketUpper = Infinity;
    return buildResult(cityKey, metric, bracketLower, bracketUpper, unit, dateInfo);
  }

  // Pattern: "between X°F and Y°F"
  const betweenMatch = title.match(/between\s+(-?\d+)\s*°[FC]\s+and\s+(-?\d+)\s*°[FC]/i);
  if (betweenMatch) {
    bracketLower = parseInt(betweenMatch[1], 10);
    bracketUpper = parseInt(betweenMatch[2], 10);
    return buildResult(cityKey, metric, bracketLower, bracketUpper, unit, dateInfo);
  }

  // Pattern: "X-Y°F" or "X-Y°C"
  const dashMatch = title.match(/(-?\d+)\s*[-–]\s*(-?\d+)\s*°[FC]/i);
  if (dashMatch) {
    bracketLower = parseInt(dashMatch[1], 10);
    bracketUpper = parseInt(dashMatch[2], 10);
    return buildResult(cityKey, metric, bracketLower, bracketUpper, unit, dateInfo);
  }

  // Pattern: single degree "be X°C"
  const singleMatch = title.match(/be\s+(-?\d+)\s*°([FC])/i);
  if (singleMatch) {
    const val = parseInt(singleMatch[1], 10);
    bracketLower = val;
    bracketUpper = val + 1;
    return buildResult(cityKey, metric, bracketLower, bracketUpper, unit, dateInfo);
  }

  return null;
}

function buildResult(
  cityKey: string,
  metric: 'high' | 'low',
  lower: number,
  upper: number,
  unit: 'F' | 'C',
  dateInfo: { month: number; day: number }
): ParsedMarket {
  const lowerC = unit === 'F' ? fahrenheitToCelsius(lower) : lower;
  const upperC = unit === 'F' ? fahrenheitToCelsius(upper) : upper;

  return {
    cityKey,
    metric,
    bracketLowerOriginal: lower,
    bracketUpperOriginal: upper,
    bracketLowerC: lowerC,
    bracketUpperC: upperC,
    originalUnit: unit,
    month: dateInfo.month,
    day: dateInfo.day,
  };
}

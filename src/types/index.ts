/** City configuration — static, from config */
export interface CityConfig {
  key: string;
  lat: number;
  lon: number;
  station: string;
  timezone: string;
}

/** Output of MarketMatcher — one per discovered market */
export interface MatchedMarket {
  marketId: string;
  tokenId: string;
  city: CityConfig;
  marketTitle: string;
  metric: 'high' | 'low';
  bracketLowerC: number;
  bracketUpperC: number;
  bracketLowerOriginal: number;
  bracketUpperOriginal: number;
  originalUnit: 'F' | 'C';
  resolutionDate: string;
  forecastHorizonDays: number;
  bestAskPrice: number;
  volume: number;
}

/** Output of WeatherData — ensemble forecast for one city/date */
export interface EnsembleForecast {
  city: CityConfig;
  forecastDate: string;
  modelRun: string;
  memberCount: number;
  dailyHighs: number[];
  dailyLows: number[];
}

/** Output of ProbabilityEngine — analysis for one market */
export interface BracketAnalysis {
  market: MatchedMarket;
  forecastProbability: number;
  membersInBracket: number;
  totalMembers: number;
  edge: number;
  ensembleValues: number[];
}

/** Output of RiskManager — bet decision */
export interface BetDecision {
  approved: boolean;
  reason?: string;
  betSize: number;
  limitPrice: number;
  kellyFraction: number;
  availableBankroll: number;
}

/** Output of OrderExecutor — order placement result */
export interface OrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
  rawCliOutput?: string;
}

/** Bet record as stored in MySQL */
export type BetStatus = 'PENDING' | 'FILLED' | 'PARTIALLY_FILLED' | 'WON' | 'LOST' | 'CANCELLED' | 'SIMULATED';
export type Phase = '2a' | '2b' | '2c';

export interface BetRecord {
  id: number;
  market_id: string;
  token_id: string;
  order_id: string | null;
  city: string;
  market_title: string;
  bracket_lower: number;
  bracket_upper: number;
  bracket_lower_c: number;
  bracket_upper_c: number;
  unit: 'F' | 'C';
  forecast_prob: number;
  market_price: number;
  edge: number;
  bet_size: number;
  entry_price: number;
  fill_amount: number | null;
  gas_fee: number | null;
  status: BetStatus;
  resolution_date: string;
  outcome: number | null;
  pnl: number | null;
  phase: Phase;
  created_at: Date;
  updated_at: Date;
}

/** Bot configuration loaded from env */
export interface BotConfig {
  phase: Phase;
  capital: number;
  maxBet: number;
  minBet: number;
  estimatedFees: number;
  minEdge: number;
  kellyFraction: number;
  maxConcurrentBets: number;
  dailyLossLimit: number;
  hourlyLossLimit: number;
  monthlyLossLimit: number;
  scanIntervalMinutes: number;
  mysql: {
    host: string;
    database: string;
    user: string;
    password: string;
  };
  telegram: {
    botToken: string;
    chatId: string;
  };
}

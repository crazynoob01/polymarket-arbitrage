# Sports Sharp Line Arbitrage Bot — Design Spec

**Date:** 2026-03-19
**Status:** Draft
**Goal:** Automated bot that exploits mispricings in Polymarket sports markets by comparing Pinnacle sharp bookmaker lines against Polymarket prices.

---

## 1. Overview

A new strategy module that extends the existing polymarket-arbitrage bot. Compares Pinnacle sportsbook odds (via The Odds API) against Polymarket sports market prices. When Pinnacle's vig-removed fair probability exceeds Polymarket's price by more than a configurable edge threshold, the bot places a LIMIT BUY order via Grimoire CLI.

### Why This Works

Pinnacle is the sharpest sportsbook in the world — it accepts unlimited bets from professionals, so its closing lines represent the best publicly available probability estimate for sporting events. Polymarket's sports markets are priced by crypto-native casual bettors who are not professional sports bettors.

**Evidence this edge exists:**
- Academic study (IMDEA, 2025): **$39.6M** in arbitrage profits extracted from Polymarket
- Sports is the **least accurate category** on Polymarket (69.8% vs 81.2% for politics)
- A documented market maker profits **$60-80K/month** on Pinnacle-vs-Polymarket spreads
- EdgeScouts (commercial scanner) finds **50-150 edges/day** in sports at 6-12% per trade
- Polymarket futures markets trade up to **40% below fair value** vs sharp lines

### Key Properties

- **Mechanical edge** — Pinnacle sharp odds as truth source, not LLM predictions
- **High frequency** — 25-50 matchable markets per day, 3-5 tradeable edges
- **Fast resolution** — games resolve in 2-6 hours (vs 24-48h for weather)
- **Deep liquidity** — $30K-$1M per game market (vs $1-5K for weather)
- **Phased rollout** — paper trade -> $200 live -> $1,000 live (same phases as weather)
- **Shared infrastructure** — reuses Grimoire wrappers, TelegramBot, DB infra, Kelly math (after refactoring risk-manager and order-executor to be strategy-agnostic)

---

## 2. Architecture

### 2.1 New Modules

```
src/modules/
  sports/
    odds-client/          # The Odds API client — fetches Pinnacle + Polymarket odds
    vig-removal/          # Converts raw bookmaker odds to fair probabilities (Shin method)
    sports-matcher/       # Matches The Odds API events to Polymarket condition IDs for execution
    sports-pipeline/      # Orchestrates: fetch odds -> compare -> risk check -> execute
```

### 2.2 Reused As-Is (Low-Level Wrappers Only)

```
src/modules/
  market-matcher/grimoire.ts  # getOrderBook, getBestAsk, placeLimitOrder, getOrderStatus, cancelOrder
  telegram-bot/               # Alerts, pause/resume commands
  logger.ts                   # Logging infrastructure
```

### 2.3 Requires Refactoring (Strategy-Agnostic Extraction)

The existing `risk-manager` and `order-executor` are tightly coupled to weather types (`BracketAnalysis`, `MatchedMarket`). Before sports can reuse them, we must extract strategy-agnostic interfaces.

```
src/modules/
  risk-manager/       # Extract core risk logic into strategy-agnostic function
  order-executor/     # Extract Grimoire execution logic from weather-specific DB writes
  scheduler/          # Add sports cron jobs alongside weather cron
  db/queries.ts       # Add sports_bets queries + cross-table P&L aggregation
src/types/            # Add base StrategyAnalysis interface + sports-specific types
src/config/           # Add SportsConfig type and loader
```

#### 2.3.1 Risk Manager Refactoring

Current `evaluateBet` takes `BracketAnalysis` (weather-specific). Extract a lower-level function:

```typescript
/** Strategy-agnostic input for risk evaluation */
interface StrategyAnalysis {
  forecastProbability: number;  // our estimated true prob
  bestAskPrice: number;        // current market price
  edge: number;                // forecastProbability - bestAskPrice - fees
}

/** Accepts any strategy's analysis — weather or sports */
function evaluateRisk(
  analysis: StrategyAnalysis,
  config: BotConfig,
  ctx: RiskContext
): BetDecision
```

The existing `evaluateBet` becomes a thin wrapper that maps `BracketAnalysis` -> `StrategyAnalysis` and calls `evaluateRisk`. The sports pipeline calls `evaluateRisk` directly with its own `SportsEdge` data.

#### 2.3.2 Order Executor Refactoring

Current `executeBet` combines Grimoire execution with weather-specific DB writes. Split into:

1. **`executeOrder(tokenId, limitPrice, betSize, config)`** — strategy-agnostic Grimoire execution (re-verify edge, check liquidity, place LIMIT BUY). Returns `OrderResult`.
2. **Weather-specific wrapper** — calls `executeOrder` + writes to `weather_bets`
3. **Sports-specific wrapper** — calls `executeOrder` + writes to `sports_bets`

The low-level Grimoire functions in `grimoire.ts` are already strategy-agnostic.

#### 2.3.3 Cross-Table P&L Queries

Risk limits (daily/hourly/monthly loss, concurrent bets, total exposure) MUST aggregate across both tables. Add:

```sql
-- Open bets count (shared limit)
SELECT COUNT(*) FROM (
  SELECT id FROM weather_bets WHERE status IN ('PENDING','FILLED','PARTIALLY_FILLED')
  UNION ALL
  SELECT id FROM sports_bets WHERE status IN ('PENDING','FILLED','PARTIALLY_FILLED')
) combined;

-- Daily P&L (shared limit)
SELECT COALESCE(SUM(pnl), 0) FROM (
  SELECT pnl FROM weather_bets WHERE status IN ('WON','LOST') AND updated_at >= CURDATE()
  UNION ALL
  SELECT pnl FROM sports_bets WHERE status IN ('WON','LOST') AND updated_at >= CURDATE()
) combined;

-- Same pattern for hourly P&L, monthly P&L, total open exposure
```

### 2.4 Pipeline Flow

```
Every 15 minutes during active game hours:

1. FETCH ODDS
   The Odds API: GET /v4/sports/{sport}/odds?bookmakers=pinnacle,polymarket
   → Returns both Pinnacle odds AND Polymarket prices for every game, pre-matched
   → One call per sport per market type
   → Cost: 1 credit per (market_type x region)

2. VIG REMOVAL
   For each game where Pinnacle has odds:
   → Convert Pinnacle decimal odds to implied probabilities
   → Remove vig using Shin method → fair probabilities
   → For 2-way (NBA/NFL): closed-form solution
   → For 3-way (soccer): iterative Shin solver

3. EDGE DETECTION
   For each game where both Pinnacle and Polymarket have prices:
   → edge = pinnacle_fair_prob - polymarket_price - estimated_fees
   → If edge > min_edge (default 5%): signal

4. RISK CHECK (reuse existing evaluateBet)
   → Kelly sizing with 0.15x fractional Kelly
   → Check concurrent bets, daily/hourly/monthly loss limits
   → Cap at maxBet

5. MARKET RESOLUTION (match to Polymarket token for execution)
   → Look up Polymarket condition_id and token_id for the matching game outcome
   → Verify orderbook has sufficient liquidity at or near the target price

6. EXECUTE (reuse existing executeBet flow)
   → Fetch current orderbook via Grimoire
   → Re-verify edge at current best ask
   → Place LIMIT BUY via Grimoire CLI
   → Log to DB, send Telegram alert
```

### 2.5 Data Flow Diagram

```
The Odds API
  ├── Pinnacle odds ──→ VigRemoval (Shin) ──→ fair_probability
  └── Polymarket odds ──→ polymarket_price
                                                    │
                                    edge = fair_prob - poly_price
                                                    │
                                            edge > threshold?
                                                    │ yes
                                            RiskManager.evaluateBet()
                                                    │ approved
                                    SportsMatcher.resolvePolymarketToken()
                                                    │
                                    OrderExecutor.executeBet() via Grimoire
```

---

## 3. Domain Types

```typescript
/** Sports supported by the bot */
export type Sport = 'basketball_nba' | 'soccer_epl' | 'soccer_uefa_champs_league' |
  'icehockey_nhl' | 'mma_mixed_martial_arts' | 'basketball_ncaab';

/** A matched game with odds from both sources */
export interface SportsMatchedGame {
  /** The Odds API event ID */
  eventId: string;
  sport: Sport;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;  // ISO 8601
  /** Pinnacle raw decimal odds per outcome */
  pinnacleOdds: { name: string; price: number }[];
  /** Vig-removed fair probabilities per outcome */
  fairProbabilities: Map<string, number>;
  /** Polymarket prices per outcome (0-1) */
  polymarketPrices: Map<string, number>;
  /** Polymarket condition IDs / token IDs for order execution */
  polymarketTokens: Map<string, { conditionId: string; tokenId: string }>;
  /** Overround (vig) percentage */
  overround: number;
}

/** An edge opportunity detected in a game */
export interface SportsEdge {
  game: SportsMatchedGame;
  outcome: string;           // e.g., "Lakers"
  fairProbability: number;   // Pinnacle vig-removed
  polymarketPrice: number;   // current ask on Polymarket
  edge: number;              // fairProbability - polymarketPrice - fees
  marketType: 'h2h' | 'spreads' | 'totals';
}

/** Sports-specific bet record for DB */
export interface SportsBetRecord {
  id: number;
  strategy: 'sports';
  event_id: string;
  sport: string;
  home_team: string;
  away_team: string;
  outcome_name: string;
  market_type: string;
  pinnacle_fair_prob: number;
  polymarket_price: number;
  edge: number;
  bet_size: number;
  entry_price: number;
  condition_id: string;
  token_id: string;
  order_id: string | null;
  fill_amount: number | null;
  status: BetStatus;
  commence_time: string;
  phase: Phase;
  pnl: number | null;
  created_at: Date;
  updated_at: Date;
}
```

---

## 4. Module Details

### 4.1 Odds Client (`src/modules/sports/odds-client/`)

Thin HTTP client for The Odds API v4.

```typescript
interface OddsClientConfig {
  apiKey: string;
  baseUrl: string;  // https://api.the-odds-api.com/v4
}

/** Fetch odds for a sport from Pinnacle + Polymarket in one call */
async function fetchOdds(sport: Sport, markets: string[]): Promise<OddsApiResponse[]>

/** Fetch list of in-season sports (free, 0 credits) */
async function fetchSports(): Promise<SportInfo[]>

/** Fetch events without odds (free, 0 credits) */
async function fetchEvents(sport: Sport): Promise<EventInfo[]>
```

**Credit usage per call:** `markets.length x 1` (we always use region `eu` for Pinnacle + `us` for Polymarket = 2 regions, so `markets.length x 2`).

**Polling strategy:**
- During active game hours: every 15 minutes
- Outside game hours: every 60 minutes (just to catch line movements on upcoming games)
- Game hours vary by sport/timezone — NBA games 7-11 PM ET, EPL games 7:30 AM - 12 PM ET, etc.

### 4.2 Vig Removal (`src/modules/sports/vig-removal/`)

Already implemented by the research agent at `src/modules/probability-engine/vig-removal.ts`. Provides:

- `removeVig(odds, format, method)` — main entry point
- Shin method (recommended) — handles 2-way (closed-form) and 3-way (iterative)
- Multiplicative method as fallback/sanity check
- American-to-decimal odds conversion
- Validated against reference Python implementation (mberk/shin)

**Pinnacle typical vig by sport:**

| Sport | Vig | Notes |
|-------|-----|-------|
| NBA moneyline | 2.5-3.5% | |
| NFL moneyline | 2.5-3.5% | |
| Soccer 2-way | 2-3% | "Will Team X win?" |
| Soccer 3-way | 3-5% | Home/Draw/Away |
| NHL moneyline | 3-4% | |

### 4.3 Sports Matcher (`src/modules/sports/sports-matcher/`)

Maps The Odds API events to Polymarket tokens for order execution. This is the trickiest module.

**The Odds API provides Polymarket prices directly** (Polymarket is listed as a bookmaker). However, for order execution via Grimoire CLI, we need the Polymarket `conditionId` and `tokenId`.

**Approach:**
1. The Odds API gives us `home_team`, `away_team`, `commence_time` for each game
2. Query Polymarket's Gamma API for matching sports markets using structured slug patterns: `{league}-{away_abbr}-{home_abbr}-{date}` (e.g., `nba-det-was-2026-03-19`)
3. Cache the mapping (game -> conditionId -> tokenId) per day — markets don't change after creation
4. For each detected edge, look up the matching token from cache

**Slug convention discovered from live scan:**
```
nba-det-was-2026-03-19              # moneyline
nba-atl-dal-2026-03-18-spread-away-8pt5  # spread
nba-lac-nop-2026-03-18-total-236pt5      # total
epl-mac-cry-2026-03-21-mac         # soccer team win
```

**Team name normalization:** Maintain a static mapping from The Odds API team names (e.g., "Los Angeles Lakers") to Polymarket abbreviations (e.g., "lal"). Start with NBA and expand.

### 4.4 Sports Pipeline (`src/modules/sports/sports-pipeline/`)

Orchestrates the full cycle. Called by the scheduler.

```typescript
async function runSportsPipeline(pool: Pool, config: SportsConfig): Promise<void> {
  // 1. For each configured sport:
  for (const sport of config.sports) {
    // 2. Fetch odds (Pinnacle + Polymarket) from The Odds API
    const games = await oddsClient.fetchOdds(sport, ['h2h']);

    // 3. For each game with both Pinnacle and Polymarket odds:
    for (const game of games) {
      // 4. Remove vig from Pinnacle odds -> fair probabilities
      const fairProbs = removeVig(game.pinnacleOdds, 'decimal', 'shin');

      // 5. Compare fair prob vs Polymarket price
      for (const outcome of game.outcomes) {
        const edge = fairProbs[outcome] - game.polymarketPrice[outcome] - config.estimatedFees;
        if (edge < config.minEdge) continue;

        // 6. Resolve Polymarket token for this outcome
        const token = await sportsMatcher.resolveToken(game, outcome);
        if (!token) continue;

        // 7. Build analysis object compatible with existing RiskManager
        const analysis = buildSportsAnalysis(game, outcome, fairProbs, token);

        // 8. Risk check (reuse existing evaluateBet)
        const decision = evaluateBet(analysis, config, riskCtx);
        if (!decision.approved) continue;

        // 9. Execute (reuse existing executeBet)
        await executeBet(decision, token, analysis, config, pool);
      }
    }
  }
}
```

---

## 5. Configuration

### 5.1 New Environment Variables

```bash
# The Odds API
ODDS_API_KEY=your_key_here

# Sports strategy config
SPORTS_ENABLED=true
SPORTS_MIN_EDGE=0.05              # 5% minimum edge (lower than weather's 12%)
SPORTS_KELLY_FRACTION=0.15        # same as weather
SPORTS_MAX_BET=20                 # phase-dependent
SPORTS_MAX_CONCURRENT=8
SPORTS_SCAN_INTERVAL_MINUTES=15
SPORTS_LIST=basketball_nba,soccer_epl,icehockey_nhl  # comma-separated
SPORTS_MIN_VOLUME=50000           # skip markets under $50K volume
```

### 5.2 Why 5% Min Edge (vs Weather's 12%)

Weather markets have higher per-trade edge but fewer opportunities (1-3/day). Sports markets have lower per-trade edge but much higher frequency (3-5/day). A 5% edge threshold balances:
- High enough to survive Polymarket's 0.10% taker fee and gas costs
- Low enough to capture the 6-12% edges that EdgeScouts documents
- Backed by the market maker interview data (1.5-2.5 cent fills with Pinnacle at 64.5c vs Polymarket at 62-63c = ~2.5% edge on individual NFL games)

### 5.3 Risk Parameters (Shared with Weather)

The existing risk manager applies identically:
- 0.15x fractional Kelly
- Max concurrent bets: 8 (shared across strategies)
- Daily loss limit: 3% of capital
- 1-hour rolling loss: 2% -> pause 4h
- Monthly loss cap: 20% -> pause for month

---

## 6. Database Schema

### Option A: New Table (recommended — cleaner separation)

```sql
CREATE TABLE sports_bets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id VARCHAR(100) NOT NULL,
  sport VARCHAR(50) NOT NULL,
  home_team VARCHAR(100) NOT NULL,
  away_team VARCHAR(100) NOT NULL,
  outcome_name VARCHAR(100) NOT NULL,
  market_type VARCHAR(20) NOT NULL DEFAULT 'h2h',
  condition_id VARCHAR(100) NOT NULL,
  token_id VARCHAR(100) NOT NULL,
  order_id VARCHAR(100),
  pinnacle_fair_prob DECIMAL(5,4) NOT NULL,
  polymarket_price DECIMAL(5,4) NOT NULL,
  edge DECIMAL(5,4) NOT NULL,
  bet_size DECIMAL(10,2) NOT NULL,
  entry_price DECIMAL(5,4) NOT NULL,
  fill_amount DECIMAL(10,2),
  gas_fee DECIMAL(6,4),
  status ENUM('PENDING','FILLED','PARTIALLY_FILLED','WON','LOST','CANCELLED','SIMULATED') NOT NULL,
  commence_time DATETIME NOT NULL,
  phase ENUM('2a','2b','2c') NOT NULL,
  outcome TINYINT,
  pnl DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_sport_date (sport, commence_time),
  INDEX idx_phase (phase)
);
```

### DB Query Changes

Add parallel query functions for sports_bets that mirror the existing weather_bets queries:
- `insertSportsBet`, `updateSportsBetStatus`
- `getSportsBetsByStatus`, `getStaleSportsOrders`
- `getSportsBetsForResolution`
- **P&L queries must aggregate across BOTH tables** for shared risk limits (daily/hourly/monthly)

---

## 7. The Odds API Credit Budget

| Plan | Credits/mo | Price | Enough? |
|------|-----------|-------|---------|
| Free | 500 | $0 | Dev/testing only (5 days) |
| 20K | 20,000 | $30/mo | Tight — 1 sport, h2h only, every 15 min |
| **100K** | **100,000** | **$59/mo** | **Good for 3-4 sports, h2h, every 10 min** |
| 5M | 5,000,000 | $119/mo | Overkill unless adding spreads/totals |

**Recommended: Start with $30/mo (20K plan) during paper trade, upgrade to $59/mo for live.**

Credit math for 20K plan:
- 1 sport (NBA), h2h only, Pinnacle + Polymarket regions: 2 credits per call
- Every 15 min during NBA game hours (6h/day): 24 calls/day = 48 credits/day
- 30 days = 1,440 credits/month — well within 20K
- Room to add 2-3 more sports

---

## 8. Supported Sports (Phase 1)

| Sport | API Key | Games/Day | Season | Why |
|-------|---------|-----------|--------|-----|
| **NBA** | `basketball_nba` | 5-8 | Oct-Jun | Highest Polymarket volume, most liquid |
| **Soccer EPL** | `soccer_epl` | 2-5 (match days) | Aug-May | Very high volume on Polymarket |
| **NHL** | `icehockey_nhl` | 5-8 | Oct-Jun | Good volume, complements NBA schedule |

**Phase 2 additions:** NCAA basketball (`basketball_ncaab` — March Madness), UEFA Champions League (`soccer_uefa_champs_league`), UFC (`mma_mixed_martial_arts`).

---

## 9. Market Type Priority

| Market Type | API key | Edge Potential | Liquidity | Build Priority |
|-------------|---------|---------------|-----------|----------------|
| **Moneyline (h2h)** | `h2h` | Highest | Best | **Phase 1** |
| Spread | `spreads` | Medium | Good | Phase 2 |
| Over/Under | `totals` | Medium | Moderate | Phase 2 |
| Player props | N/A | Unknown | Very low | Skip |

Start with moneyline only. It's simplest (2-way outcome, direct probability comparison) and has the best liquidity on Polymarket.

---

## 10. Phased Rollout

### Phase 2a: Paper Trade (2-3 weeks)
- Build all modules
- Run pipeline with `PHASE=2a` — simulated trades logged to DB
- Measure: number of edges found, simulated hit rate, simulated P&L
- **Exit criteria:** 50+ simulated bets, simulated win rate > 52%, positive simulated P&L

### Phase 2b: Live with $200 ($30/mo API)
- Deploy with real money, $20 max per bet
- Start with NBA moneyline only
- **Exit criteria:** 30+ live bets, win rate > 50%, no single-day loss > 5% of capital

### Phase 2c: Scale to $500-$1000 ($59/mo API)
- Increase max bet to $50
- Add EPL and NHL
- Add spread markets
- Full risk manager rules

---

## 11. Scheduler Integration

```typescript
// In src/modules/scheduler/index.ts — add alongside weather cron

// Sports pipeline: every 15 min
cron.schedule('*/15 * * * *', () => {
  if (!config.sportsEnabled) return;
  runSportsPipeline(pool, sportsConfig);
});

// Sports fill checks: every 10 min (faster than weather — games resolve quickly)
cron.schedule('*/10 * * * *', () => {
  if (!config.sportsEnabled) return;
  checkSportsOrderFills(pool);
});

// Sports resolution checks: every 30 min
cron.schedule('*/30 * * * *', () => {
  if (!config.sportsEnabled) return;
  checkSportsResolutions(pool);
});
```

---

## 12. Risk Considerations

### Edge Compression
- Arbitrage opportunity duration has shrunk from 12.3s (2024) to 2.7s (2025) for internal arb
- Cross-market sharp-line comparison is less crowded but will compress over time
- Mitigation: monitor monthly win rate, pause if < 50% over 100+ bets

### Capital Allocation
- At $500 total capital, DO NOT split between weather and sports
- Run one strategy at a time in live mode; the other in paper trade
- At $1000+, consider 60/40 split (sports/weather) based on which has higher volume

### Correlated Risk
- All strategies share Polymarket platform risk (USDC depeg, smart contract, regulatory)
- Sports bets within the same day may be correlated (e.g., slate of NBA favorites all losing)
- Mitigation: max concurrent bets limit + daily loss limit

### API Dependency
- The Odds API is the single data source — if it goes down, bot cannot find edges
- Pinnacle odds may have delay (scraped from public site, not direct feed)
- Mitigation: graceful degradation (skip cycle, alert via Telegram)

---

## 13. Expected Returns

### Conservative Estimate ($500 capital, NBA-only)

| Metric | Value |
|--------|-------|
| Tradeable games/day | 5-8 |
| Edges found (>5%) | 1-3 |
| Average bet size | $8 |
| Average edge | 6% |
| EV per bet | $0.48 |
| Bets per month | 45-90 |
| **Monthly EV** | **$22-$43** |
| Monthly API cost | $30 |
| **Net monthly profit** | **-$8 to +$13** |

At NBA-only + $500 capital + $30/mo API, breakeven is tight. The strategy becomes clearly profitable when:
- Adding EPL + NHL (doubles+ opportunity count)
- Scaling capital to $1000 (doubles bet size)
- Both together: ~$60-130 net monthly profit

### Realistic Estimate ($1000 capital, 3 sports)

| Metric | Value |
|--------|-------|
| Tradeable games/day | 15-25 |
| Edges found (>5%) | 3-5 |
| Average bet size | $15 |
| Average edge | 6% |
| EV per bet | $0.90 |
| Bets per month | 90-150 |
| **Monthly EV** | **$81-$135** |
| Monthly API cost | $59 |
| **Net monthly profit** | **$22-$76** |

---

## 14. Sports Resolution Logic

### Pre-Game Only (Phase 1)

The bot trades **pre-game markets only**. Skip any game where `commenceTime < now`. This avoids latency risk on in-play markets where stale odds (1-20 min delay from The Odds API) would be dangerous.

### Resolution Checking

Same approach as weather — poll Polymarket via Grimoire CLI:
1. Every 30 minutes, query each open sports bet's market via `getMarketData(condition_id)`
2. If `resolved === true` or `closed === true`, read `outcomePrices` to determine win/loss
3. Calculate P&L: `won ? fillAmount * ((1/entryPrice) - 1) : -fillAmount`
4. Update `sports_bets` row, send Telegram alert

### Edge Cases

- **Postponed games:** Polymarket typically voids the market (refund). Bot should detect "voided" status and mark bet as CANCELLED with pnl=0.
- **Overtime:** Does not affect resolution — final score after OT counts.
- **Disputed resolution:** Rare for sports (objective score). If stuck >48h unresolved, alert operator via Telegram.

---

## 15. Duplicate Bet Prevention

Before placing a bet, check:
```sql
SELECT COUNT(*) FROM sports_bets
WHERE event_id = ? AND outcome_name = ? AND status NOT IN ('CANCELLED', 'LOST', 'WON')
```
If count > 0, skip. This prevents the 15-minute polling cycle from placing multiple bets on the same game outcome.

---

## 16. Concurrency Guard

The sports pipeline gets its own `isRunning` flag, independent of the weather pipeline. Both can run concurrently since they share risk limits via cross-table DB queries (section 2.3.3), but each protects against overlapping with itself.

```typescript
let isSportsRunning = false;

async function runSportsPipeline(...) {
  if (isSportsRunning) return;
  isSportsRunning = true;
  try { ... } finally { isSportsRunning = false; }
}
```

Pause state is **global** — if the hourly loss limit triggers from sports losses, BOTH strategies pause. This is correct because the risk limits protect total capital.

---

## 17. The Odds API Error Handling

### Credit Monitoring
Track remaining credits from response header `x-requests-remaining`. Alert via Telegram at:
- 20% remaining: WARN
- 5% remaining: CRITICAL — reduce polling frequency to preserve credits

### HTTP Errors
| Code | Action |
|------|--------|
| 200 | Process normally |
| 401 | Invalid API key — alert operator, stop sports pipeline |
| 429 | Rate limited — back off 60 seconds, retry once |
| 500/503 | Server error — skip this cycle, log warning |
| Timeout (>10s) | Skip this cycle, log warning |

No retries beyond one attempt per cycle. If The Odds API is down, the sports pipeline simply skips that cycle (same as weather skipping when Open-Meteo is down).

### Estimated Fees for Sports

`ESTIMATED_FEES` should be set to **0.005** (0.5%) for sports to account for:
- Polymarket taker fee: 0.10% of contract premium
- Gas cost: ~$0.02-0.05 per trade (~0.3% on an $8 bet)
- Slippage: ~0.1% (small orders on liquid markets)

This means a 5% raw edge becomes ~4.5% net edge.

---

## 18. Sports Config Type

```typescript
interface SportsConfig {
  enabled: boolean;
  oddsApiKey: string;
  oddsApiBaseUrl: string;        // https://api.the-odds-api.com/v4
  minEdge: number;               // 0.05 (5%)
  kellyFraction: number;         // 0.15
  maxBet: number;                // phase-dependent
  maxConcurrent: number;         // 8 (shared with weather via cross-table query)
  scanIntervalMinutes: number;   // 15
  sports: Sport[];               // ['basketball_nba']
  minVolume: number;             // 50000
  estimatedFees: number;         // 0.005
  preGameOnly: boolean;          // true (Phase 1)
}

function loadSportsConfig(): SportsConfig {
  return {
    enabled: process.env.SPORTS_ENABLED === 'true',
    oddsApiKey: process.env.ODDS_API_KEY || '',
    oddsApiBaseUrl: 'https://api.the-odds-api.com/v4',
    minEdge: Number(process.env.SPORTS_MIN_EDGE || 0.05),
    kellyFraction: 0.15,
    maxBet: Number(process.env.SPORTS_MAX_BET || 20),
    maxConcurrent: 8,
    scanIntervalMinutes: Number(process.env.SPORTS_SCAN_INTERVAL || 15),
    sports: (process.env.SPORTS_LIST || 'basketball_nba').split(',') as Sport[],
    minVolume: Number(process.env.SPORTS_MIN_VOLUME || 50000),
    estimatedFees: Number(process.env.SPORTS_ESTIMATED_FEES || 0.005),
    preGameOnly: true,
  };
}
```

---

## 19. Open Questions

1. **Polymarket token resolution for sports:** Can The Odds API's Polymarket prices be directly mapped to condition IDs? Or do we need Gamma API / Grimoire for the mapping step? **Must spike before implementation.**
2. **Game-hour scheduling:** Should we hardcode game windows per sport, or dynamically fetch from The Odds API events endpoint (free, 0 credits)?
3. **Spread/total markets (Phase 2):** The Odds API provides these with point values (e.g., -3.5). Do Polymarket spread markets use the same point values? Needs validation before Phase 2.
4. **3-way soccer handling:** Polymarket splits soccer into 3 separate neg-risk binary markets (Win/Draw/Win). The Odds API's `h2h` for soccer returns 3-way odds. Each Polymarket binary market's "Yes" price should map to one of the 3 Shin-removed fair probabilities. **Must validate with a live EPL match before adding soccer.**

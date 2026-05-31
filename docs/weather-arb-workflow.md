# Weather Arbitrage Bot — Workflow Visualization

**Reference:** `docs/superpowers/specs/2026-03-18-weather-arb-bot-design.md`

---

## How Polymarket Weather Markets Work (Beginner Guide)

### What is Polymarket?

Polymarket is a prediction market — a platform where you bet on the outcome of real-world events. You buy "Yes" or "No" contracts. If you're right, each contract pays out **$1.00**. If you're wrong, you lose what you paid.

All trading happens on the **Polygon blockchain** (a layer-2 Ethereum network), so transactions are cheap (~$0.01-0.05 gas). You fund your account with USDC (a stablecoin pegged to $1). There is **no KYC** — you just connect a crypto wallet.

### How Weather Markets Are Structured

Polymarket organizes weather bets into **events** and **markets**:

**Event** = The parent question. Example:
> "Highest temperature in Shanghai on March 19?"

**Markets** = Individual brackets within that event. Each bracket is a separate bet:

| Market (bracket) | Question | Yes Price | Implied Probability |
|-------------------|----------|-----------|---------------------|
| 4°C or below | "Will the highest temperature in Shanghai be 4°C or below on March 19?" | $0.0005 | 0.05% |
| 5°C | "Will the highest temperature in Shanghai be 5°C on March 19?" | $0.0005 | 0.05% |
| ... | ... | ... | ... |
| 11°C | "Will the highest temperature in Shanghai be 11°C on March 19?" | $0.145 | 14.5% |
| **12°C** | **"Will the highest temperature in Shanghai be 12°C on March 19?"** | **$0.635** | **63.5%** |
| 13°C | "Will the highest temperature in Shanghai be 13°C on March 19?" | $0.18 | 18% |
| 14°C or higher | "Will the highest temperature in Shanghai be 14°C or higher on March 19?" | $0.0295 | 2.95% |

*This is real data from Polymarket as of March 18, 2026.*

The prices across all brackets in an event should roughly sum to $1.00 (100%), because exactly one bracket will win. If they don't sum to $1.00, there's a pricing inefficiency — which is what our bot exploits.

### What "Yes Price" Means

The **Yes price** is what you pay for a contract that pays $1.00 if the bracket wins.

- If the 12°C bracket's Yes price is **$0.635**, you pay $0.635 per contract
- If the actual high temperature on March 19 is 12°C, you get **$1.00 back** → profit of **$0.365** per contract (57.5% return)
- If the actual high is anything else, you get **$0.00 back** → loss of **$0.635**

The Yes price IS the market's implied probability. A price of $0.635 means the market thinks there's a 63.5% chance that bracket wins.

### What Our Bot Does With This

Our bot checks: "What does NOAA/Open-Meteo's weather forecast say the probability actually is?"

If the forecast says 12°C has a **78% chance** (based on 30 weather model runs) but the market prices it at **63.5%**, that's a **14.5% edge**. Since our threshold is 12%, the bot would buy.

### Key Polymarket Concepts

**Condition ID** (`conditionId`) — A unique hex identifier for each market. This is the blockchain-level ID used in smart contracts.
```
"0x7d217e44e92e0dc59a4fb1dae2584957d23aa311a2aa43dc62d2ab1b604d6738"
```

**Token ID** (`clobTokenIds`) — Each market has TWO tokens: one for "Yes" and one for "No". These are the actual tradeable assets on the CLOB (Central Limit Order Book).
```json
"clobTokenIds": [
  "53924890409...",   // Yes token
  "10903181316..."    // No token
]
```
When we buy "Yes" on a bracket, we're buying the first token ID.

**CLOB (Central Limit Order Book)** — Polymarket's trading engine. Like a stock exchange order book: buyers place bids, sellers place asks. Orders are matched off-chain (fast) but settled on-chain (secure). We always use **LIMIT orders** (set our price) not **MARKET orders** (take whatever price is available) because weather market order books are thin and market orders get terrible fills.

**Best Ask** — The lowest price someone is willing to sell at. This is the price we'd actually pay if we buy. In the Shanghai example: `"bestAsk": "0.003"` for the 7°C bracket means we can buy Yes contracts at $0.003 each.

**Best Bid** — The highest price someone is willing to buy at. Not relevant for our bot since we only buy, never sell.

**Spread** — The gap between best bid and best ask. Wide spreads (>$0.05) mean the market is thin/illiquid. We avoid these.

**Volume** — Total amount traded on this market. Higher volume = more liquid = easier to get orders filled. We filter for markets with >= $5,000 volume.

**Neg Risk** (`negRisk: true`) — Multi-outcome events (like temperature brackets) use Polymarket's "negative risk" system. This means all brackets in an event are linked: buying "Yes" on one bracket is economically equivalent to buying "No" on all other brackets. The system ensures prices stay consistent.

**Resolution Source** — Where Polymarket checks the actual outcome. For weather:
```
"resolutionSource": "https://www.wunderground.com/history/daily/cn/shanghai/ZSPD"
```
Each city resolves against a specific weather station. Our bot must know which station maps to which city — if we use the wrong one, we could be right about the temperature but wrong about the resolution.

**Fees** — Weather markets currently have **zero trading fees** (`"feesEnabled": false`). Polymarket has added fees to some categories (sports, crypto), but weather is free as of March 2026. Gas on Polygon is ~$0.01-0.05 per trade.

### Real Example: How the Bot Would Trade This

Using the Shanghai March 19 event above:

1. **Bot discovers** the event via API: `GET /events?slug=highest-temperature-in-shanghai-on-march-19-2026`
2. **Bot parses** each bracket: city=Shanghai, date=March 19, metric=high, brackets from 4°C to 14°C+
3. **Bot fetches** 30-member GFS ensemble forecast for Shanghai on March 19
4. **Bot counts**: 23 of 30 ensemble members predict a high of 12°C → P(12°C) = 0.767 (76.7%)
5. **Bot compares**: market price = $0.635 (63.5%), forecast = 76.7%, edge = 13.2%
6. **Edge > 12% threshold** → bot calculates bet size via Kelly criterion
7. **Bot places** LIMIT BUY order for Yes tokens on the 12°C bracket at $0.635
8. **March 19 arrives**, actual high is 12°C → bot's Yes tokens pay out $1.00 each → profit

### API Structure (What the Bot Actually Sees)

The bot discovers markets through the Gamma API. Here's the real structure of the Shanghai event:

```
EVENT (parent)
├── id: "272259"
├── title: "Highest temperature in Shanghai on March 19?"
├── slug: "highest-temperature-in-shanghai-on-march-19-2026"
├── resolutionSource: "https://www.wunderground.com/history/daily/cn/shanghai/ZSPD"
├── endDate: "2026-03-19T12:00:00Z"
├── volume: $101,883
├── liquidity: $44,680
│
├── MARKET: "4°C or below"
│   ├── id: "1596683"
│   ├── conditionId: "0x..."
│   ├── clobTokenIds: ["<yes_token>", "<no_token>"]
│   ├── outcomePrices: ["0.0005", "0.9995"]
│   └── volume: $6,184
│
├── MARKET: "5°C"
│   ├── id: "1596684"
│   └── outcomePrices: ["0.0005", "0.9995"]
│
├── ... (one market per degree)
│
├── MARKET: "12°C"  ← highest probability bracket
│   ├── id: "1596691"
│   ├── outcomePrices: ["0.635", "0.365"]
│   └── volume: $4,649
│
└── MARKET: "14°C or higher"
    ├── id: "1596693"
    └── outcomePrices: ["0.0295", "0.9705"]
```

### What the Market Matcher Must Parse

The Market Matcher's job is to turn this API data into structured objects our bot can work with. Specifically:

**From the event level:**
- `title` → extract city name and date ("Shanghai", "March 19")
- `resolutionSource` → map to our known weather station config
- `endDate` → calculate forecast horizon (how many days until resolution)

**From each market (bracket) level:**
- `question` or `groupItemTitle` → extract bracket bounds ("12°C" → lower=12, upper=13)
- `outcomePrices[0]` → Yes price = market-implied probability
- `clobTokenIds[0]` → Yes token ID (what we buy)
- `volume` → filter out low-volume brackets
- `conditionId` → needed for order placement and tracking

**Edge brackets** need special handling:
- "4°C or below" → lower=-Infinity, upper=5 (or a very low number like -50)
- "14°C or higher" → lower=14, upper=+Infinity (or a very high number like 60)

**Title variations by city** (regex patterns must handle all of these):
- Shanghai: `"Will the highest temperature in Shanghai be 12°C on March 19?"`
- NYC: `"Will the high temperature in New York City on March 20 be between 55°F and 59°F?"`
- London: `"London daily high temperature for March 21 — 50-54°F"`
- Seoul: `"Seoul max temperature March 19 bracket: 10-14°C"`

The Market Matcher uses regex patterns to parse these. Unrecognized formats are logged and skipped — the operator adds new patterns manually when Polymarket changes their title format.

### Discovery API Endpoints

The bot uses two main API endpoints:

**1. Search for weather events:**
```
GET https://gamma-api.polymarket.com/events?slug_contains=temperature&closed=false
```
Returns parent events with nested markets.

**2. Alternative — search markets directly:**
```
grimoire venue polymarket search-markets --query "temperature" --active-only true --open-only true --format json
```
Returns individual markets. Must group by event to see all brackets.

The bot tries both approaches and deduplicates. The Grimoire CLI is preferred because it handles authentication, but the Gamma API is the fallback for discovery.

---

## Full Pipeline (Every 2 Hours at :17)

```
╔══════════════════════════════════════════════════════════════════╗
║                    SCHEDULER (every 2h at :17)                   ║
╚══════════════════════════╦═══════════════════════════════════════╝
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│  1. MARKET MATCHER — Discovery & Parsing                         │
│                                                                  │
│  grimoire venue polymarket search-markets --query "temperature"  │
│                           ▼                                      │
│  Parse each title → { city, date, metric, unit, bracket }        │
│                           ▼                                      │
│  Filter: known city? within 3 days? volume >= $5K?               │
│                           ▼                                      │
│  Convert F brackets → C (canonical unit)                         │
│  Fetch best ask: grimoire clob book <token_id>                   │
│                           ▼                                      │
│  Output: MatchedMarket[]                                         │
└──────────────────────────┬───────────────────────────────────────┘
                           ▼
              ┌─── For each MatchedMarket ───┐
              ▼                              │
┌─────────────────────────────────┐          │
│  2. WEATHER DATA — Fetch        │          │
│                                 │          │
│  Open-Meteo Ensemble API        │          │
│  30 GFS perturbation members    │          │
│          ▼                      │          │
│  Extract daily high/low per     │          │
│  member (city local timezone)   │          │
│          ▼                      │          │
│  Validate: NaN? missing?        │          │
│  ┌─── FAIL ──→ Skip city,      │          │
│  │             WARN on Telegram │          │
│  └─── OK                       │          │
│          ▼                      │          │
│  Output: EnsembleForecast       │          │
└────────────┬────────────────────┘          │
             ▼                               │
┌─────────────────────────────────┐          │
│  3. PROBABILITY ENGINE          │          │
│                                 │          │
│  Count members in bracket (°C)  │          │
│  P = members_in / 30           │          │
│          ▼                      │          │
│  edge = P - bestAsk - fees      │          │
│          ▼                      │          │
│  edge < 12%? ──→ SKIP ─────────┼──────────┤
│          ▼                      │          │
│  Output: BracketAnalysis        │          │
└────────────┬────────────────────┘          │
             ▼                               │
┌─────────────────────────────────┐          │
│  4. RISK MANAGER                │          │
│                                 │          │
│  Kelly: f = (p*b - q) / b      │          │
│  betSize = bankroll * f * 0.15  │          │
│          ▼                      │          │
│  ┌── Check gates:               │          │
│  │   kellyFraction <= 0? ─→ SKIP┼──────────┤
│  │   betSize < $3 min?   ─→ SKIP┼──────────┤
│  │   8 concurrent bets?  ─→ SKIP┼──────────┤
│  │   monthly loss 20%?   ─→ PAUSE BOT      │
│  │   daily loss 3%?      ─→ PAUSE till UTC 0│
│  │   hourly loss 2%?     ─→ PAUSE 4h       │
│  │   exposure >= capital? ─→ SKIP┼──────────┤
│  └── All pass                   │          │
│          ▼                      │          │
│  Cap: min(betSize, MAX_BET)     │          │
│          ▼                      │          │
│  Output: BetDecision            │          │
│          (approved: true)       │          │
└────────────┬────────────────────┘          │
             ▼                               │
┌─────────────────────────────────┐          │
│  5. ORDER EXECUTOR              │          │
│                                 │          │
│  Re-check order book            │          │
│  Best ask moved? ──→ SKIP ──────┼──────────┤
│          ▼                      │          │
│  Phase 2a? ──→ Log SIMULATED    │          │
│          ▼    (no real order)   │          │
│  Phase 2b/2c:                   │          │
│  grimoire venue polymarket      │          │
│    order --side BUY             │          │
│    --price <bestAsk>            │          │
│    --size <betSize>             │          │
│    --type GTC                   │          │
│          ▼                      │          │
│  Store in MySQL: PENDING        │          │
│          ▼                      │          │
│  Telegram: INFO "Bet placed"    │          │
└────────────┬────────────────────┘          │
             └────────────────── next market ─┘
```

---

## Order Lifecycle (Post-Placement)

```
  PENDING ─────────────────────────────────────────────────────┐
     │                                                         │
     │  ◄── Poll every 30 min ──►                              │
     │                                                         │
     ├── Fully filled ──→ FILLED ─────────┐                    │
     │                                    │                    │
     ├── Partially filled ──→ Track fill, │                    │
     │   cancel remainder    FILLED       │                    │
     │                                    │                    │
     ├── 4 hours elapsed, ──→ CANCELLED   │                    │
     │   not filled           (forecast   │                    │
     │                        may have    │                    │
     │                        changed)    │                    │
     │                                    │                    │
     └── Error ──→ CANCELLED              │                    │
                   Telegram WARN          │                    │
                                          │                    │
  ◄── Poll every 1 hour ──►              │                    │
                                          ▼                    │
                              ┌────────────────────┐           │
                              │  RESOLUTION CHECK   │           │
                              │                    │           │
                              │  Market resolved?  │           │
                              │       ▼            │           │
                              │  YES: fetch result │           │
                              │       ▼            │           │
                              │  Actual temp in    │           │
                              │  bracket?          │           │
                              │   │         │      │           │
                              │  YES       NO      │           │
                              │   ▼         ▼      │           │
                              │  WON      LOST     │           │
                              │   │         │      │           │
                              │   ▼         ▼      │           │
                              │  Record P&L        │           │
                              │  (incl. gas fees)  │           │
                              │       ▼            │           │
                              │  Update bankroll   │           │
                              │       ▼            │           │
                              │  Check drawdown    │           │
                              │  thresholds        │           │
                              │       ▼            │           │
                              │  Telegram: INFO    │           │
                              │  "Won $X" / "Lost" │           │
                              └────────────────────┘           │
                                                               │
  SIMULATED (Phase 2a) ────────────────────────────────────────┘
     │
     ▼  Same resolution check, but P&L is hypothetical
     Record in MySQL for backtesting / validation
```

---

## Timing Summary

```
:17  ──→  Full pipeline (scan → match → forecast → risk → execute)
:30  ──→  Check order fills
:00  ──→  Check resolutions + Check order fills
+4h  ──→  Cancel unfilled orders from 2 cycles ago
```

---

## Status Transitions

```
Order placed ──→ PENDING
                    │
                    ├── filled ──────────→ FILLED ──→ resolved ──→ WON / LOST
                    ├── partial fill ────→ FILLED (filled portion) + CANCELLED (remainder)
                    ├── 4h timeout ─────→ CANCELLED
                    └── error ──────────→ CANCELLED

Paper trade ──→ SIMULATED ──→ resolved ──→ WON / LOST (hypothetical P&L)
```

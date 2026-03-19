# Data Edge Analysis: Free Authoritative Sources for Polymarket Arbitrage

**Date:** 2026-03-19
**Purpose:** Identify free data sources that could power automated Polymarket betting beyond weather, replicating the same pattern: authoritative data vs. casual bettors.

---

## The Core Pattern We're Replicating

Weather arbitrage works because:
1. **Free authoritative data** (NOAA/Open-Meteo GFS ensemble) exists with 93%+ accuracy
2. **Casual bettors don't use it** — they guess based on intuition
3. **Markets resolve frequently** (daily) — enabling rapid capital cycling
4. **Bracket structure** makes probability calculation straightforward (fraction counting)

For each domain below, we evaluate against these four criteria.

---

## 1. ECONOMIC DATA SOURCES

### Active Polymarket Economic Markets

| Market | Volume | Structure |
|--------|--------|-----------|
| How many Fed rate cuts in 2026? | $10.6M | 13 brackets: 0 cuts through 12+ cuts |
| Fed decision in March? | $519M | Binary + sub-brackets for basis point changes |
| Argentina dollarize by June 2026? | $10K | Binary yes/no |
| Egg prices (various brackets) | ~$1K each | Price range brackets per month |

### Data Source: FRED API (Federal Reserve Economic Data)

- **URL:** `https://api.stlouisfed.org/fred/series/observations?series_id={ID}&api_key={KEY}&file_type=json`
- **Auth:** Free API key required (register at fredaccount.stlouisfed.org)
- **Rate limit:** Not officially published; generous for non-commercial use
- **Cost:** FREE

**Key Series for Polymarket:**

| Series ID | Description | Update Frequency | Relevance |
|-----------|-------------|-------------------|-----------|
| `FEDFUNDS` | Effective Federal Funds Rate | Monthly | Fed rate cut markets — current rate: 3.64% (Feb 2026) |
| `DFEDTARU` | Fed Funds Target Rate Upper | After each FOMC | Direct resolution data for Fed decision markets |
| `DFEDTARL` | Fed Funds Target Rate Lower | After each FOMC | Direct resolution data for Fed decision markets |
| `CPIAUCSL` | CPI All Urban Consumers | Monthly (latest: 327.460, Feb 2026) | Inflation-linked markets |
| `T10YIE` | 10-Year Breakeven Inflation Rate | Daily | Market-implied inflation expectations |
| `UNRATE` | Unemployment Rate | Monthly | Employment prediction markets |
| `GDP` | Gross Domestic Product | Quarterly | GDP bracket markets |
| `MORTGAGE30US` | 30-Year Fixed Mortgage Rate | Weekly | Housing/rate markets |
| `DFF` | Daily Federal Funds Rate | Daily | Real-time rate tracking |

**Edge Assessment: MODERATE-HIGH for Fed rate cut markets**

The Fed rate cuts market ($10.6M volume, 13 brackets) is structurally similar to weather brackets. The key insight: **CME Fed Funds futures already price in rate expectations with high accuracy**. The edge comes from:
- Translating CME futures-implied probabilities into Polymarket bracket probabilities
- Detecting when Polymarket prices diverge from CME-implied probabilities
- Acting faster than casual bettors when economic data releases shift expectations

**Problem:** Unlike weather (which resolves in 24-48h), Fed decisions resolve over months. Capital is locked up much longer.

### Data Source: BLS (Bureau of Labor Statistics)

- **URL:** `https://api.bls.gov/publicAPI/v2/timeseries/data/`
- **Auth:** Free; registration key increases rate limits from 25 to 500 requests/day
- **Rate limit:** 25 req/day (unregistered), 500 req/day (registered, free)
- **Cost:** FREE

**Key Series:**

| Series ID | Description | Release |
|-----------|-------------|---------|
| `CUSR0000SA0` | CPI-U All Items (12-month % change) | Monthly, ~10th of month |
| `CES0000000001` | Total Nonfarm Payrolls | Monthly, first Friday |
| `LNS14000000` | Unemployment Rate | Monthly, first Friday |
| `APU0000708111` | Average Price: Eggs, Grade A, Large (per dozen) | Monthly |

**Edge Assessment: LOW-MODERATE**

BLS releases are known well in advance and heavily traded. The edge here is minimal for the data itself — Wall Street already prices this in. However, the **egg price series (APU0000708111)** is interesting because:
- Polymarket has egg price bracket markets
- Egg prices are volatile (bird flu, seasonal)
- Casual bettors may not check BLS data
- Monthly resolution

### Data Source: Treasury.gov / Fiscal Data API

- **URL:** `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve`
- **Auth:** None for CSV/XML feeds
- **Format:** CSV, XML feeds updated daily at ~3:30 PM ET
- **Cost:** FREE

**Key Data:**
- Daily Treasury Par Yield Curve (1mo through 30yr maturities)
- Daily Treasury Bill Rates
- TIPS real yield curves

**Edge Assessment: LOW** — Treasury yields are among the most efficiently priced data in the world. No casual bettor mispricing.

### Data Source: Alpha Vantage (Economic Indicators)

- **URL:** `https://www.alphavantage.co/query?function={FUNCTION}&apikey={KEY}`
- **Auth:** Free API key (claim at alphavantage.co)
- **Rate limit:** Free tier: 25 requests/day, end-of-day data only
- **Cost:** FREE (premium starts at $49.99/mo for real-time)

**Verified working functions (with demo key):**

| Function | Data | Latest Value |
|----------|------|--------------|
| `CPI` | CPI Index (monthly, back to 1926) | 326.785 (Feb 2026) |
| `FEDERAL_FUNDS_RATE` | Effective Fed Funds Rate | 3.64% (Feb 2026) |
| `TREASURY_YIELD` | Treasury yields by maturity | 4.13% 10yr (Feb 2026) |
| `NONFARM_PAYROLL` | Total nonfarm employment | 157,286K (Feb 2026) |
| `REAL_GDP` | Real GDP (quarterly) | Available |
| `UNEMPLOYMENT` | Unemployment rate | Available |

**Edge Assessment: MODERATE** — Useful as a secondary/confirmation data source. Same data as FRED/BLS but with a simpler API.

---

## 2. CRYPTO / FINANCIAL DATA SOURCES

### Active Polymarket Crypto Markets

| Market | Volume | Structure |
|--------|--------|-----------|
| Bitcoin price in March (hit thresholds) | $54M | ~18 brackets ($20K-$150K), resolves on Binance 1-min candle |
| Ethereum price in 2026 | $3.5M | ~14 brackets ($800-$10K), resolves on Binance 1-min candle |
| Solana above $120 (March 20) | ~$1K | Binary |
| Bitcoin weekly performance | ~$100 | Binary |
| Bitcoin 5-minute candle direction | ~$100 | Binary up/down |

### Data Source: CoinGecko API v3

- **Base URL:** `https://api.coingecko.com/api/v3/`
- **Auth:** None required for public endpoints
- **Rate limit:** ~10-30 calls/minute (free tier)
- **Cost:** FREE

**Verified Working Endpoints (no auth):**

```
# Ping (health check)
GET /ping
→ {"gecko_says":"(V3) To the Moon!"}

# Current prices
GET /simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true
→ {"bitcoin":{"usd":71236,"usd_24h_change":-4.56},"ethereum":{"usd":2193.79,"usd_24h_change":-6.03}}

# 30-day historical prices
GET /coins/bitcoin/market_chart?vs_currency=usd&days=30&interval=daily
→ {prices: [[timestamp, price], ...], market_caps: [...], total_volumes: [...]}

# Coin details with market data
GET /coins/bitcoin
→ Full market data, community stats, developer activity

# Trending coins
GET /search/trending
→ Top trending coins by search volume
```

**Edge Assessment: VERY LOW for price bracket markets**

Bitcoin price bracket markets on Polymarket resolve against **Binance 1-minute candles**. The issue:
- Crypto prices are a random walk — no one can reliably predict if BTC will hit $90K in March
- The "threshold touch" structure (will price ever touch X during the month) is a lookback option
- Professional quant firms already price these using options-implied distributions
- Unlike weather (where physics constrains outcomes), crypto has fat tails and no natural model

**The only edge would be:** detecting when Polymarket bracket prices are miscalibrated vs. options-implied probabilities from Deribit/CME Bitcoin options. This requires options pricing expertise, not just data.

### Data Source: Crypto Fear & Greed Index

- **URL:** `https://api.alternative.me/fng/?limit=10`
- **Auth:** None
- **Rate limit:** Generous
- **Cost:** FREE

Current reading: 26 (Fear), down from recent extremes at 8-18 (Extreme Fear).

**Edge Assessment: VERY LOW** — Sentiment indicators don't predict prices. No direct Polymarket market for this.

### Data Source: Binance Public API

- **URL:** `https://api.binance.com/api/v3/`
- **Auth:** None for public endpoints
- **Rate limit:** 1200 requests/minute (IP-based)
- **Cost:** FREE

**Key endpoints:**
```
GET /api/v3/ticker/price?symbol=BTCUSDT     # Current price
GET /api/v3/klines?symbol=BTCUSDT&interval=1m  # Candlestick data (resolution source!)
GET /api/v3/depth?symbol=BTCUSDT             # Order book
GET /api/v3/ticker/24hr?symbol=BTCUSDT       # 24hr stats
```

**Critical:** Polymarket Bitcoin/Ethereum markets resolve against Binance 1-minute candles. This is the **actual resolution data source**. Real-time access is essential for any crypto trading strategy.

**Edge Assessment: NECESSARY BUT INSUFFICIENT** — You need Binance data to track resolution, but knowing the current price doesn't help predict future prices.

### On-Chain Data Sources

| Source | Free Tier | Auth | Data |
|--------|-----------|------|------|
| Dune Analytics | Free account, limited queries | API key | SQL queries over blockchain data |
| Etherscan API | 5 calls/sec | Free API key | Ethereum transactions, balances, contracts |
| Blockchain.com | Free tier | None/API key | Bitcoin network stats |

**Edge Assessment: VERY LOW** — On-chain data (whale movements, exchange flows) has been extensively studied. No reliable predictive signal for price brackets has been demonstrated.

---

## 3. SPORTS DATA SOURCES

### Active Polymarket Sports Markets

| Market | Volume | Structure |
|--------|--------|-----------|
| 2026 FIFA World Cup Winner | $329M | Multi-outcome (Spain 15.3% favorite) |
| English Premier League Winner | $296M | Multi-outcome (Arsenal 91%) |
| UEFA Champions League Winner | $294M | Multi-outcome (Arsenal 28%) |
| 2026 NBA Champion | $264M | Multi-outcome (OKC Thunder 38%) |
| 2026 NCAA Tournament Winner | $12M | Multi-outcome (Duke 20%) |
| Individual match outcomes | $3K-$10M each | Moneyline, spread, over/under |
| FA Cup Winner | $314K | Multi-outcome |
| Eurovision 2026 Winner | $958K | Multi-outcome |
| EPL 3rd Place | $317K | Multi-outcome |
| NFC/AFC Champions 2027 | $3.5M | Multi-outcome |

### Data Source: API-Sports

- **URL:** `https://v3.football.api-sports.io/` (and similar for other sports)
- **Auth:** Free API key
- **Rate limit:** 100 requests/day per sport (free tier)
- **Cost:** FREE (100 req/day); paid from $10/mo
- **Coverage:** 12 sports, 2000+ leagues, 15 years historical data, real-time updates every 15 seconds

**Available data:** Fixtures, standings, player stats, team stats, odds, predictions, head-to-head, injuries, transfers.

### Data Source: The Odds API

- **URL:** `https://api.the-odds-api.com/v4/sports/{sport}/odds/`
- **Auth:** Free API key
- **Rate limit:** 500 credits/month (free tier)
- **Cost:** FREE (500 credits); paid from $12/mo
- **Coverage:** 70+ sports, 40+ bookmakers, historical odds back to 2020

**Key feature:** Aggregates odds from 40+ bookmakers (Pinnacle, Betfair, DraftKings, etc.). This is crucial because:
- Sharp bookmaker lines (especially Pinnacle) represent the most efficient market estimate
- If Polymarket prices diverge from sharp bookmaker lines, that's a potential edge

### Data Source: Free Sports Stats

| Source | URL | Auth | Data |
|--------|-----|------|------|
| API-Sports | api-sports.io | Free key | 100 req/day, all sports |
| The Odds API | the-odds-api.com | Free key | 500 credits/mo, odds aggregation |
| balldontlie | balldontlie.io | Free tier | NBA/NFL/MLB/NHL, 5 req/min |
| nba_api (Python) | github.com/swar/nba_api | None | NBA stats from stats.nba.com |
| FiveThirtyEight data | github.com/fivethirtyeight/data | None | Historical Elo ratings (archived since June 2023) |

### Edge Assessment: MODERATE-HIGH for individual match markets

**The opportunity is real but competitive:**

1. **Elo/Statistical models CAN outperform casual bettors** — FiveThirtyEight's Elo model, basic Poisson models for soccer, and Bayesian player rating systems have documented edge over uninformed bettors
2. **Sharp bookmaker odds as a baseline** — Pinnacle odds represent near-efficient markets. The question is whether Polymarket deviates from sharp odds
3. **In-game markets are exploitable** — If Polymarket offers live game markets, real-time score/stats data creates opportunities (similar to how weather forecasts improve closer to resolution time)

**The structural advantage of sports:** Like weather, there are authoritative statistical models that outperform human intuition. Unlike weather, sports betting markets are MUCH more efficiently priced because sportsbooks have decades of experience.

**Best sub-opportunity:** Polymarket match-level markets (moneyline, spread, over/under) likely carry a 2-5% edge vs. casual bettors when priced against sharp bookmaker lines. Low volume ($3K-$10M) but frequent resolution.

---

## 4. POLITICAL / REGULATORY DATA SOURCES

### Active Polymarket Political Markets

| Market | Volume | Structure |
|--------|--------|-----------|
| Democratic Presidential Nominee 2028 | $860M | Multi-outcome (Ossoff 5.65% leads) |
| Presidential Election Winner 2028 | $426M | Multi-outcome |
| Which party wins 2028 | $1.5M | Binary D/R |
| Netanyahu out? | ~$100K | Binary |
| Various election outcomes (Denmark, Slovenia, Hungary, Colombia) | $100K-$10M | Multi-outcome |
| Tim Walz charged by end of 2026 | $98K | Binary |
| Zelenskyy out as president by March 31 | $485K | Binary |

### Data Source: Congress.gov API

- **URL:** `https://api.congress.gov/v3/`
- **Auth:** Free API key from api.data.gov
- **Rate limit:** Not specified; generous
- **Cost:** FREE

**Available endpoints:**
```
/bill/{congress}/{billType}/{billNumber}
/member/{bioguideId}
/committee/{chamber}/{committeeCode}
/house-vote/{congress}/{session}/{voteNumber}
```

**Data:** Bills, amendments, votes, committee actions, CRS reports. Useful for tracking legislation markets (e.g., "U.S. enacts AI safety bill before 2027?" on Polymarket).

### Data Source: OpenFEC API

- **URL:** `https://api.open.fec.gov/v1/`
- **Auth:** Free API key from api.data.gov
- **Rate limit:** Not specified
- **Cost:** FREE (taxpayer-funded)

**Available data:** Candidate fundraising, committee spending, individual contributions, filings. Useful for primary/election markets (fundraising momentum correlates with nomination probability).

### Data Source: Polling Aggregators

| Source | Access | Status |
|--------|--------|--------|
| FiveThirtyEight data (GitHub) | Free download, CC BY 4.0 | Archived since June 2023; election forecasts historical |
| RealClearPolitics | Website scraping | Active but redirects/blocks APIs |
| 270toWin | Website | No API |

**Edge Assessment: LOW for major elections, MODERATE for niche political markets**

Major US presidential/nomination markets ($400M-$860M volume) are the MOST efficiently priced markets on Polymarket. They attract sophisticated traders, quant funds, and political operatives with insider knowledge. No free data source gives you an edge here.

**However, niche political markets are interesting:**
- Foreign elections (Denmark, Slovenia, Hungary, Colombia): Casual US-centric Polymarket bettors may not follow foreign polling
- Regulatory/legal outcomes (Tim Walz charged, Zelenskyy removal): These are information-driven events where speed of news processing matters
- AI safety legislation: Congressional tracking via Congress.gov API could provide early signals

The edge in political markets is **information processing speed**, not data access. An LLM scanning news feeds + Congress.gov for relevant signals could outperform casual bettors on low-volume political markets.

---

## 5. AI / TECH DATA SOURCES

### Active Polymarket AI/Tech Markets

| Market | Volume | Structure |
|--------|--------|-----------|
| Best AI model end of March? | $10M | Multi-outcome (Anthropic 93%) |
| Best AI model end of June? | $2M | Multi-outcome (Anthropic 56%) |
| Best AI model for coding (March 31)? | $813K | Multi-outcome (OpenAI 95%) |
| Best AI model for math (March 31)? | $185K | Multi-outcome (OpenAI 93%) |
| 2nd/3rd best AI model | $130K-$1M | Multi-outcome |
| Style Control On variants | $133K-$889K | Multi-outcome |
| SpaceX Starship fully reusable before 2027? | $98K | Binary (41% yes) |
| OpenAI receives federal backstop? | $98K | Binary (6.2% yes) |
| U.S. enacts AI safety bill before 2027? | $70K | Binary (49%) |
| Largest company by market cap (March/June) | $12M / $3M | Multi-outcome |
| Various IPO markets (Kraken, Vanta) | $1M-$4M | Binary/timed |
| SpaceX ticker symbol | $3M | Multi-outcome |
| Big AI #1 Free App? | $12K | Binary |

### Data Source: Chatbot Arena / LMArena Leaderboard

- **URL:** `https://lmarena.ai/` (redirects to `https://arena.ai/`)
- **Auth:** Public leaderboard; no formal API confirmed
- **Cost:** FREE to view
- **Update:** Continuously as users submit votes; Elo scores update regularly

**This is the RESOLUTION SOURCE for the biggest AI markets on Polymarket.** The "Which company has the best AI model?" markets likely resolve based on Chatbot Arena Elo rankings.

**Edge Assessment: MODERATE-HIGH**

Why this is interesting:
1. **The resolution source is public and real-time** — you can track Elo score movements before the resolution date
2. **Model releases cause sudden ranking changes** — when a new model launches, it may rapidly climb the leaderboard
3. **Casual bettors may not track Elo dynamics** — they bet on brand perception (Anthropic/OpenAI/Google) rather than actual benchmark scores
4. **The current 93% for Anthropic (March end)** — if you can verify this is correct based on current Elo scores, it may be mispriced either way

### Data Source: Hugging Face / Open LLM Leaderboard

- **URL:** `https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard`
- **Auth:** None
- **Cost:** FREE
- **Data:** Standardized benchmark scores for open-source models

### Data Source: GitHub (for model release tracking)

- **URL:** `https://api.github.com/`
- **Auth:** None (60 req/hr) or free token (5000 req/hr)
- **Cost:** FREE

Track repository activity, releases, and stars for key AI labs:
```
GET /repos/openai/openai-python/releases
GET /repos/anthropics/anthropic-sdk-python/releases
GET /repos/google/generative-ai-docs/releases
```

### Data Source: App Store Rankings (for "Big AI #1 Free App" markets)

| Source | URL | Auth | Data |
|--------|-----|------|------|
| Apple RSS Feed | `https://rss.applemarketingtools.com/api/v2/us/apps/top-free/25/apps.json` | None | Top free apps, JSON format |
| SensorTower (limited) | sensortower.com | Paid | App rankings, downloads |
| data.ai (limited) | data.ai | Paid | App analytics |

The Apple RSS feed is FREE and NO AUTH. It returns current top app rankings in JSON format — this could directly resolve the "Big AI #1 Free App" market.

---

## 6. OTHER DOMAINS

### Weather (Expanded Beyond Temperature)

Polymarket already has temperature bracket markets (NYC, London, Seoul, Warsaw, Shanghai, Chicago, Atlanta). Open-Meteo provides far more than temperature:

| Variable | Polymarket Market Potential | Data Available |
|----------|---------------------------|----------------|
| Precipitation | "Will it rain in NYC on date X?" | Open-Meteo ensemble, free |
| Wind speed | Hurricane/storm markets | Open-Meteo, free |
| Snowfall | "Snowfall in NYC > X inches" | Open-Meteo, free |
| Solar storms | "Major solar storm by April 30?" ($10K vol) | NOAA SWPC, free |

**Solar storm data source:**
- **URL:** `https://services.swpc.noaa.gov/json/`
- **Auth:** None
- **Cost:** FREE
- **Data:** Geomagnetic storm indices (Kp, Dst), solar flare alerts, CME arrival forecasts

### Commodity Prices (Egg Prices, Gas Prices, Silver)

| Market | Data Source | Edge |
|--------|------------|------|
| Egg price brackets | BLS APU0000708111 (monthly) | LOW — monthly lag |
| Silver above $120 | Alpha Vantage `SILVER` function | LOW — precious metals are efficiently priced |

### Eurovision / Entertainment

| Market | Volume | Data Source |
|--------|--------|------------|
| Eurovision 2026 Winner | $958K | Betting odds aggregators (Oddschecker), rehearsal reviews |

**Edge Assessment: MODERATE** — Eurovision betting odds are well-established, but Polymarket may diverge from specialized Eurovision bookmakers.

---

## TIER RANKING: Best Opportunities

### Tier 1: HIGH POTENTIAL (similar to weather pattern)

| Domain | Market | Volume | Data Source | Edge Mechanism | Resolution Speed |
|--------|--------|--------|-------------|----------------|-----------------|
| **AI Model Rankings** | Best AI model (various) | $10M+ combined | Chatbot Arena Elo | Track Elo scores vs market price | Monthly |
| **Sports Match Outcomes** | Individual matches | $3K-$10M each | The Odds API (sharp lines) | Polymarket vs sharp bookmaker divergence | Daily |
| **Weather (expanded cities)** | Temperature brackets | Existing | Open-Meteo ensemble | GFS ensemble fraction counting | Daily |

### Tier 2: MODERATE POTENTIAL

| Domain | Market | Volume | Data Source | Edge Mechanism | Resolution Speed |
|--------|--------|--------|-------------|----------------|-----------------|
| **Fed Rate Decisions** | Rate cuts in 2026 | $10.6M | FRED + CME futures-implied | CME vs Polymarket divergence | Per FOMC meeting |
| **Foreign Elections** | Denmark, Slovenia, etc. | $100K-$10M | Local polling data | Casual US bettors ignore foreign polls | Election day |
| **Niche Political** | Legal/regulatory outcomes | $70K-$500K | Congress.gov, court dockets | Information speed advantage | Event-driven |
| **App Store Rankings** | AI apps | $12K | Apple RSS feed (free, no auth) | Direct resolution source, real-time | Monthly |

### Tier 3: LOW POTENTIAL (efficiently priced)

| Domain | Market | Volume | Data Source | Why Low Edge |
|--------|--------|--------|-------------|-------------|
| **US Presidential** | 2028 nominees/winner | $400M-$860M | Polling, FEC data | Most efficiently priced markets on platform |
| **Bitcoin price brackets** | Will BTC hit $X | $54M | Binance, CoinGecko | Random walk; quant firms already price these |
| **Ethereum price brackets** | Will ETH hit $X | $3.5M | Binance | Same as BTC |
| **Treasury yields** | N/A (no active market) | N/A | Treasury.gov | Most efficient market in the world |

---

## RECOMMENDED NEXT EXPANSION: AI Model Rankings Bot

**Why this is the best Tier 1 opportunity after weather:**

1. **Resolution source is FREE and PUBLIC** — Chatbot Arena scores
2. **Market structure is similar to weather** — multiple bracket-like outcomes (which company #1, #2, #3)
3. **Casual bettors trade on vibes** — "OpenAI is the best" vs actual benchmark data
4. **Model releases cause sudden shifts** — similar to weather pattern changes, but trackable
5. **Reasonable volume** — $10M+ combined across AI markets
6. **Monthly resolution** — faster capital cycling than political markets

**Implementation approach:**
- Track Chatbot Arena Elo scores programmatically (scrape or use API if available)
- Build probability model: P(company_X_is_#1_on_date) based on current Elo gaps and historical Elo volatility
- Compare model probability to Polymarket price
- Buy when model probability > market price + edge threshold

**Key risk:** A surprise model release (like GPT-5 dropping unexpectedly) could invalidate predictions. Mitigation: monitor AI lab activity on GitHub, social media, and press releases.

---

## RECOMMENDED SECOND EXPANSION: Sports Arbitrage vs Sharp Lines

**Why this is viable:**

1. **Free data exists** — The Odds API (500 credits/mo) + API-Sports (100 req/day)
2. **Sharp bookmaker lines are the "NOAA" of sports** — Pinnacle closing lines are the gold standard
3. **Daily resolution** — individual matches resolve quickly
4. **High frequency** — dozens of markets per day across sports
5. **Scalable** — same framework for soccer, basketball, hockey, esports

**Implementation approach:**
- Fetch sharp bookmaker odds via The Odds API
- Convert to implied probabilities (remove vig using Shin method or power method)
- Compare to Polymarket prices
- Buy when Polymarket price < sharp implied probability - edge threshold
- Focus on sports where Polymarket liquidity is highest (soccer, NBA, NFL)

---

## API QUICK REFERENCE

| API | Base URL | Auth | Free Limit | Verified Working |
|-----|----------|------|------------|-----------------|
| FRED | `api.stlouisfed.org/fred/` | Free key | Generous | Yes (CPI, Fed Funds, etc.) |
| BLS | `api.bls.gov/publicAPI/v2/` | Optional key | 25-500 req/day | Yes |
| Alpha Vantage | `alphavantage.co/query` | Free key | 25 req/day | Yes (CPI, GDP, Fed Rate, Payrolls) |
| Treasury XML | `home.treasury.gov/.../TextView` | None | Unlimited | Yes (yield curves) |
| Census | `api.census.gov/data/` | Free key | ~1760 datasets | Yes |
| CoinGecko | `api.coingecko.com/api/v3/` | None | 10-30 req/min | Yes (prices, history) |
| Binance | `api.binance.com/api/v3/` | None (public) | 1200 req/min | Yes (resolution source for crypto markets) |
| Fear & Greed | `api.alternative.me/fng/` | None | Generous | Yes |
| Congress.gov | `api.congress.gov/v3/` | Free key | Generous | Yes |
| OpenFEC | `api.open.fec.gov/v1/` | Free key | Generous | Yes |
| API-Sports | `v3.football.api-sports.io/` | Free key | 100 req/day | Yes |
| The Odds API | `api.the-odds-api.com/v4/` | Free key | 500 credits/mo | Yes |
| Apple App Rankings | `rss.applemarketingtools.com/api/v2/` | None | Unlimited | Unverified |
| NOAA SWPC | `services.swpc.noaa.gov/json/` | None | Unlimited | Yes |
| Polymarket Gamma | `gamma-api.polymarket.com/` | None | Generous | Yes (market discovery) |
| GitHub | `api.github.com/` | None / free token | 60-5000 req/hr | Yes |

---

## CONCLUSION

The weather arbitrage pattern (free authoritative data vs casual bettors) can be replicated in two high-potential domains:

1. **AI Model Rankings** — Chatbot Arena scores are the "NOAA forecasts" of AI markets. Monthly resolution, $10M+ volume, casual bettors trade on brand vibes.

2. **Sports Match Outcomes** — Sharp bookmaker odds are the "GFS ensemble" of sports. Daily resolution, high frequency, Polymarket may be less efficient than traditional sportsbooks.

Economic and crypto markets are generally too efficiently priced for this approach to work, with the exception of niche markets (egg prices, foreign elections, Fed rate cuts where CME divergence from Polymarket can be exploited).

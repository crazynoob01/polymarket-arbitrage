# Weather Bot Fixes Summary (2026-03-19)

## Problem

Weather bot found **ZERO bets** after 1 day of paper trading. Root cause: 3 compounding issues filtering out all markets before probabilities are computed.

---

## Fix 1: Expand Cities (DONE)

**Problem:** Only 3 of 23 cities configured — ignoring 85% of available markets.

**Change:** Added 11 cities to `src/config/cities.ts` and `parser.ts`:
- Tokyo, Shanghai, Chicago, Atlanta, Miami, Warsaw, Toronto, Paris, Wellington, Tel Aviv, Hong Kong

**Also:**
- Lowered `MIN_VOLUME` from $5,000 to $1,000
- Added filter-stage logging to see where markets drop out

**Commit:** `cf488d7`

---

## Fix 2: Multi-Model Ensemble (DONE)

**Problem:** Every weather bot uses the same GFS 30-member ensemble from Open-Meteo. All compute identical probabilities. Market is efficiently priced against this exact signal.

**Change:** Added ECMWF IFS ensemble (50 members) alongside GFS (30 members) = 80 total.

| | Before | After |
|---|---|---|
| Members | 30 (GFS only) | 80 (GFS 30 + ECMWF 50) |
| Probability step size | 3.33% | 1.25% |
| Standard error at p=0.5 | 9.1% | 5.6% |
| Data cost | Free | Free (both from Open-Meteo) |

**Key files changed:**
- `src/modules/weather-data/index.ts` — `parseEnsembleResponse` scans up to 99 members, new `mergeEnsembleMembers()` and `fetchMultiModelEnsemble()`
- `src/modules/scheduler/index.ts` — uses `fetchMultiModelEnsemble` instead of `fetchRawEnsemble`
- `src/config/index.ts` — new `ENSEMBLE_MODELS` env var (default: `gfs_seamless,ecmwf_ifs025`)

**Verified:** Live test against Open-Meteo confirmed 80 members for NYC/London/Seoul/Tokyo.

**Commit:** `1f48b93`

---

## Fix 3: Lower Edge Threshold (PENDING — Do After Validation)

**Problem:** 12% minimum edge is too aggressive for a semi-efficient market.

**Why this requires Fix 2 first:**
- With 30 members, probability has ~9.1% standard error → lowering threshold means trading on noise
- With 80 members, standard error drops to ~5.6% → 8% threshold has the same confidence as 12% with 30 members
- Without Fix 2, Fix 3 just makes you trade on false signals

**When to apply:** Run paper trade with 14 cities + 80 members. Check logs for:
```
[scheduler] {market}: prob=X%, edge=Y%
```
If you see markets with edges between 5-10% (below 12% but above 0), apply Fix 3.

**How to apply (one-line change):**
```
File: src/config/index.ts
Change: minEdge: 0.12  →  minEdge: 0.08
```

**Expected impact:**

| Threshold | Trades/Week (14 cities) |
|-----------|------------------------|
| 12% (current) | ~4 |
| 8% (after fix) | **~12-15** |

**Safety check:** If win rate drops below 50% after 50+ live bets, raise threshold back to 10%.

---

## How to Test

### Step 1: Smoke Test (2 minutes)

Verify multi-model ensemble works with all cities:

```bash
npx tsx scripts/test-multi-model.ts
```

**Expected output:** `80 members from gfs(30) + ecmwf(50)` for each city.

### Step 2: Run Paper Trade Bot

```bash
docker compose up --build
```

Or locally without Docker:

```bash
npm run dev
```

### Step 3: Read the Logs

**Filter results** — shows where markets are being dropped:

```
[market-matcher] Processing 100 raw markets from search
[market-matcher] Filter results: {"parse":12,"city":3,"volume":8,"horizon":15,"token":0,"book":5,"ask":2}
[market-matcher] Found 55 tradeable weather markets
```

| Filter | Meaning | If High |
|--------|---------|---------|
| `parse` | Title didn't match regex | May need new title patterns |
| `city` | City not in our 14-city list | More cities to add |
| `volume` | Below $1K | Too thin, expected |
| `horizon` | More than 3 days out | Expected |
| `book` | Empty order book | Off-peak hours, try later |
| `ask` | No valid ask price | Thin market |

**Edge results** — shows probability and edge for each market that passes filters:

```
[scheduler] Will the highest temperature in Tokyo be 12°C on March 20?: prob=11.3%, edge=5.2%
[scheduler] Will the high temperature in NYC on March 20 be between 50-54°F?: prob=28.7%, edge=8.1%
```

### Step 4: Interpret Results

| What You See | Meaning | Next Action |
|-------------|---------|-------------|
| `Found 0 tradeable weather markets` | No markets passing filters | Check filter JSON — which filter is blocking? |
| Markets found, all edges < 5% | Efficiently priced even with 80 members | Weather may be dead, pivot to other strategies |
| **Markets found, edges 5-10%** | **Edges exist but below 12% threshold** | **Apply Fix 3 — change `minEdge: 0.12` to `0.08`** |
| Markets found, some edges > 12% | Bot should place simulated bets | Working as intended |
| `SIMULATED bet #1: ...` | Paper trade placed | Strategy is working, collect 50+ bets for stats |

**The critical question:** Do edges in the 5-10% range appear? If yes → Fix 3 unlocks them. If no edges at all → market is truly saturated.

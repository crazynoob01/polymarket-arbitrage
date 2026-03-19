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

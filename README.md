# Polymarket Weather Arbitrage Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A TypeScript research and execution bot for finding weather-market edges on Polymarket. It compares live weather prediction-market prices with ensemble forecasts from Open-Meteo, sizes positions with a conservative Kelly model, and can either paper trade or place live limit orders through Polymarket-compatible CLIs.

This project is intended for research, paper trading, and operator-supervised experimentation. It is not financial advice, and it can lose money if used for live trading.

## What It Does

- Discovers active Polymarket weather markets and parses city, date, temperature metric, bracket, token ID, volume, and best ask.
- Fetches multi-model Open-Meteo ensemble forecasts, currently GFS plus ECMWF by default.
- Computes bracket probabilities from ensemble member counts.
- Calculates edge against the best ask after estimated fees.
- Applies bankroll, exposure, drawdown, concurrent-bet, and minimum-edge checks.
- Records simulated or live orders in MySQL.
- Sends optional Telegram notifications and supports operational controls.

## Why This Exists

Prediction markets increasingly depend on high-quality open data, but many small markets are still hard to analyze reproducibly. This project packages a complete weather-market research workflow: market discovery, title parsing, ensemble forecast processing, probability estimation, risk controls, order execution boundaries, and paper-trade persistence.

The goal is not to promise profitable trading. The goal is to make the analysis pipeline auditable, testable, and reusable for research into prediction-market pricing and weather-model calibration.

## Architecture

The app is a modular Node.js monolith:

```text
src/index.ts
  -> scheduler
    -> market-matcher
    -> weather-data
    -> probability-engine
    -> risk-manager
    -> order-executor
    -> telegram-bot
  -> db
  -> config
```

Core behavior is intentionally plain function calls rather than HTTP services. MySQL stores discovered bets, fills, statuses, and P&L-related fields.

## Trading Modes

`PHASE` controls execution:

| Phase | Behavior |
| --- | --- |
| `2a` | Paper trading. Inserts simulated bets only. Default and safest mode. |
| `2b` | Live trading with small bankroll settings. Requires Polymarket credentials. |
| `2c` | Live trading with larger bankroll settings. Requires Polymarket credentials. |

Always start with `PHASE=2a` until you have verified market parsing, forecast quality, sizing, and order logs.

## Requirements

- Node.js 20+
- npm
- MySQL 8, or Docker Compose
- Polymarket CLI for market discovery and order-book reads
- Grimoire CLI for live order placement and order management
- Optional Telegram bot token and chat ID

## Quick Start

```bash
npm install
cp .env.example .env
npm run build
npm test
```

For a local full stack:

```bash
docker compose up --build
```

The default `.env.example` is configured for paper trading and Docker Compose MySQL. Fill in Polymarket credentials only when intentionally moving to a live phase.

## Configuration

Important environment variables:

| Variable | Purpose |
| --- | --- |
| `PHASE` | `2a`, `2b`, or `2c`; defaults to paper trading. |
| `CAPITAL` | Bankroll used by risk sizing. |
| `MAX_BET` / `MIN_BET` | Per-bet size bounds. |
| `ESTIMATED_FEES` | Fee adjustment subtracted from edge. |
| `SCAN_INTERVAL_MINUTES` | Cron interval for market scans. |
| `ENSEMBLE_MODELS` | Open-Meteo model IDs, comma-separated. |
| `MYSQL_*` | MySQL connection settings. |
| `POLYMARKET_*` | Required for live trading only. |
| `TELEGRAM_*` | Optional notifications and operator commands. |

See [.env.example](.env.example) for the complete template.

## Commands

```bash
npm run dev              # Start local watcher
npm run start            # Run the bot directly
npm run build            # Compile TypeScript
npm run typecheck        # Type-check without emitting
npm test                 # Unit tests
npm run test:integration # MySQL-backed integration tests
```

Integration tests require a reachable MySQL database and set `RUN_INTEGRATION_TESTS=1` automatically through the script.

## Documentation

- [Weather arbitrage workflow](docs/weather-arb-workflow.md)
- [Polymarket credential setup](docs/polymarket-credentials-setup.md)
- [Roadmap](ROADMAP.md)
- [Changelog](CHANGELOG.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)

## Data Sources

- Open-Meteo Ensemble API for weather model forecasts.
- Polymarket market and CLOB data through local CLI tools.
- MySQL for bot state and bet history.
- Telegram Bot API for notifications, if configured.

## Safety Notes

- Live phases can place real orders. Keep `PHASE=2a` unless you intend to trade.
- Do not commit `.env`, private keys, API secrets, generated CLOB credentials, logs, or local database dumps.
- Use a dedicated wallet and limited bankroll for experimentation.
- Thin prediction-market order books can move quickly; this bot re-checks best ask before execution, but that does not remove execution risk.
- Weather market resolution can depend on specific stations and source rules. Verify that configured stations match each market's resolution source before live trading.

## Project Status

The current implementation is most appropriate for research and paper-trade validation. The repo includes unit tests for parsing, probability logic, risk management, weather-data transforms, config loading, and vig removal. Live execution should be treated as experimental and operator-supervised.

## Maintainer Notes

This repository is maintained as an open-source research project. Useful contributions include parser fixtures for new Polymarket title formats, forecast-model validation, safer execution controls, additional paper-trade analytics, and documentation improvements.

## License

MIT. See [LICENSE](LICENSE).

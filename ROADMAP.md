# Roadmap

This roadmap keeps the project focused on safe, auditable research before broader automation.

## Current Focus

- Keep paper trading as the default path.
- Improve test coverage for market parsing, probability estimation, and risk controls.
- Document setup and operational workflows clearly enough for outside contributors.
- Keep live trading behind explicit configuration and clear warnings.

## Near-Term

- Add fixtures for more Polymarket weather title formats.
- Add parser tests built from real but redacted market examples.
- Add paper-trade analytics for calibration, hit rate, realized edge, and drawdown.
- Add a Docker Compose profile for local integration tests.
- Add structured logs for market filters and skipped-order reasons.

## Later

- Add station-resolution validation against market metadata.
- Add safer live-order dry-run and confirmation modes.
- Add dashboards or exports for paper-trade review.
- Compare model families and calibration methods across cities.
- Improve strategy interfaces so non-weather research modules can reuse common risk and execution primitives.

## Non-Goals

- Promising profitable trading.
- Encouraging unattended live execution.
- Storing private keys or generated credentials in the repository.
- Supporting closed-source data providers as a hard dependency.

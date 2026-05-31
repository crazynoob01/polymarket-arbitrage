# Security Policy

## Sensitive Data

Never commit:

- `.env` files
- Private keys or wallet seed phrases
- Polymarket API key, secret, or passphrase
- Telegram bot tokens or chat IDs
- Database dumps, logs, or screenshots containing account data

If a secret is committed or shared, rotate it immediately. Removing it from a later commit is not enough.

## Live Trading Risk

This repository can be configured to place real Polymarket orders. Keep `PHASE=2a` for paper trading unless you intentionally want live execution. Use a dedicated wallet with limited funds for live experiments.

## Reporting Issues

For security-sensitive bugs, avoid posting exploit details publicly. Open a minimal issue describing the affected area and coordinate privately with the maintainer.

# Changelog

## Unreleased

- Added public README, MIT license, contribution guide, security policy, roadmap, and changelog.
- Added GitHub issue templates, pull request template, and CI workflow.
- Clarified `.env.example` defaults and live-trading credential requirements.
- Tightened `.gitignore` and Docker build context to avoid publishing local secrets, logs, editor files, venvs, and agent artifacts.
- Made MySQL integration tests opt-in so unit tests run without local database setup.
- Added vig-removal utilities and tests for odds/probability research support.

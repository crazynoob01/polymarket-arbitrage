# Contributing

Contributions are welcome when they keep the bot understandable, testable, and safe to run.

## Local Setup

```bash
npm install
cp .env.example .env
npm run build
npm test
```

Use `PHASE=2a` while developing. Do not run live trading phases from a development branch unless you understand the risk and have reviewed the order path.

## Tests

```bash
npm test                 # Unit tests
npm run test:integration # Requires MySQL
npm run typecheck
```

Prefer focused unit tests for parser, probability, and risk changes. Add integration coverage when database behavior changes.

## Pull Requests

- Keep changes narrowly scoped.
- Document changes that affect trading behavior or risk controls.
- Do not commit secrets, logs, local editor files, generated build output, or database artifacts.
- Include the commands you ran to verify the change.

## Maintainer Workflow

Maintainers should review changes with extra care when they touch:

- Live order execution
- Risk limits and bankroll sizing
- Credential handling
- Market parsing
- Database migrations
- External API behavior

For changes in those areas, require tests or a written manual verification note.

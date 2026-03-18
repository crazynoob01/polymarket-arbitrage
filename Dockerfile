FROM node:20-slim

# Install deps: curl for downloads, pnpm for grimoire
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates \
    && npm install -g pnpm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Install polymarket CLI binary ---
ARG TARGETARCH
RUN ARCH=$(case "${TARGETARCH}" in \
      "arm64") echo "aarch64" ;; \
      "amd64"|*) echo "x86_64" ;; \
    esac) && \
    curl -sL "https://github.com/Polymarket/polymarket-cli/releases/download/v0.1.5/polymarket-v0.1.5-${ARCH}-unknown-linux-gnu.tar.gz" \
      -o /tmp/polymarket.tar.gz && \
    tar xzf /tmp/polymarket.tar.gz -C /usr/local/bin && \
    chmod +x /usr/local/bin/polymarket && \
    rm /tmp/polymarket.tar.gz

# --- Install grimoire CLI (needed for live order execution) ---
RUN mkdir -p /opt/grimoire && \
    echo '{"dependencies":{"@grimoirelabs/cli":"^0.14.2"},"pnpm":{"overrides":{"@uniswap/sdk-core":"^6.0.0"}}}' \
      > /opt/grimoire/package.json && \
    cd /opt/grimoire && pnpm install --prod 2>/dev/null; \
    echo '#!/bin/sh' > /usr/local/bin/grimoire && \
    echo 'exec node /opt/grimoire/node_modules/@grimoirelabs/cli/dist/index.js "$@"' >> /usr/local/bin/grimoire && \
    chmod +x /usr/local/bin/grimoire

# --- Install app dependencies ---
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Verify CLIs are available
RUN polymarket --version && grimoire --version 2>/dev/null || true

CMD ["node", "--import", "tsx", "src/index.ts"]

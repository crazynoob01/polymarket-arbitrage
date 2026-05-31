# Polymarket API Credentials Setup

## Overview

Four credentials are needed to interact with the Polymarket CLOB API:

| Env Variable | Source |
|---|---|
| `POLYMARKET_PRIVATE_KEY` | Exported from Polymarket UI |
| `POLYMARKET_API_KEY` | Generated programmatically |
| `POLYMARKET_API_SECRET` | Generated programmatically |
| `POLYMARKET_API_PASSPHRASE` | Generated programmatically |

## Step 1: Export Your Private Key

1. Go to [polymarket.com](https://polymarket.com) and sign in
2. Navigate to **Settings → Private Key**
3. Click **"Start Export"**
4. Sign into Magic.Link and copy the displayed private key
5. Store it securely — never share it

## Step 2: Generate CLOB API Credentials

The API key, secret, and passphrase are not available in the Polymarket UI. They must be generated programmatically using your private key.

### Using the included script

```bash
# First run creates a venv and installs dependencies
python3 scripts/generate-clob-keys.py

# If that fails due to externally-managed-environment, use the venv python directly
scripts/.venv/bin/python3 scripts/generate-clob-keys.py
```

The script will prompt for your private key (hidden input) and output the three env vars.

### Manual method (Python)

```bash
pip install py-clob-client
```

```python
from py_clob_client.client import ClobClient

client = ClobClient(
    "https://clob.polymarket.com",
    key="0xYOUR_PRIVATE_KEY",
    chain_id=137,
)

# For accounts that have already traded on Polymarket:
creds = client.derive_api_key()

# For new accounts:
# creds = client.create_api_key()
```

## Step 3: Verify Credentials

```bash
scripts/.venv/bin/python3 -c "
from py_clob_client.client import ClobClient
from py_clob_client.clob_types import ApiCreds

creds = ApiCreds(
    api_key='',
    api_secret='',
    api_passphrase=''
)

client = ClobClient(
    'https://clob.polymarket.com',
    key='',
    chain_id=137,
    creds=creds,
    signature_type=2 
)
print(client.get_orders())
"
```

If credentials are valid, this returns your balance and allowance info.

## Step 4: Add to `.env`

```env
POLYMARKET_PRIVATE_KEY=0x...
POLYMARKET_API_KEY=...
POLYMARKET_API_SECRET=...
POLYMARKET_API_PASSPHRASE=...
```

## Notes

- **`derive_api_key()`** works for accounts that have already enabled trading (have a CLOB wallet). Use this if `create_api_key()` returns a 400 error.
- **`create_api_key()`** is for first-time CLOB setup.
- The Relayer API Keys page in Polymarket settings is for gasless on-chain transactions — it is **not** the same as CLOB API credentials.
- All credentials are tied to your wallet on Polygon (chain ID 137).

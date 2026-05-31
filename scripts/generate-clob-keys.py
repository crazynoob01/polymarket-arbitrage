"""
Generate Polymarket CLOB API credentials from your private key.
Usage: python3 scripts/generate-clob-keys.py
"""
import getpass
import subprocess
import sys
import os

venv_dir = os.path.join(os.path.dirname(__file__), ".venv")

# Create venv and install dependency if needed
if not os.path.exists(venv_dir):
    print("Creating virtual environment...")
    subprocess.check_call([sys.executable, "-m", "venv", venv_dir])
    pip = os.path.join(venv_dir, "bin", "pip")
    print("Installing py-clob-client...")
    subprocess.check_call([pip, "install", "py-clob-client"])

# Re-exec inside the venv if we're not already in it
venv_python = os.path.join(venv_dir, "bin", "python3")
if sys.executable != venv_python and os.path.realpath(sys.executable) != os.path.realpath(venv_python):
    os.execv(venv_python, [venv_python] + sys.argv)

from py_clob_client.client import ClobClient

private_key = getpass.getpass("Enter your Polymarket private key: ")

# Ensure it has 0x prefix
if not private_key.startswith("0x"):
    private_key = "0x" + private_key

client = ClobClient(
    "https://clob.polymarket.com",
    key=private_key,
    chain_id=137,
)

print("\nGenerating CLOB API credentials...\n")

try:
    creds = client.derive_api_key()
    print("(Derived existing API key)\n")
except Exception:
    try:
        creds = client.create_api_key()
        print("(Created new API key)\n")
    except Exception as e:
        print(f"Error: {e}")
        print("\nMake sure you have:")
        print("  1. Signed up on polymarket.com")
        print("  2. Enabled trading (which creates your CLOB wallet)")
        print("  3. Used the correct private key from the Private Key page")
        sys.exit(1)

print("Add these to your .env file:\n")
api_key = getattr(creds, "api_key", getattr(creds, "key", ""))
api_secret = getattr(creds, "api_secret", getattr(creds, "secret", ""))
api_passphrase = getattr(creds, "api_passphrase", getattr(creds, "passphrase", ""))

print(f"POLYMARKET_API_KEY={api_key}")
print(f"POLYMARKET_API_SECRET={api_secret}")
print(f"POLYMARKET_API_PASSPHRASE={api_passphrase}")

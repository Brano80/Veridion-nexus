#!/usr/bin/env bash
# Generate a new Ed25519 private key seed for ED25519_PRIVATE_KEY env var.
# Run once, store output in .env — never commit.
python3 -c "import os, base64; print('ED25519_PRIVATE_KEY=' + base64.b64encode(os.urandom(32)).decode())"

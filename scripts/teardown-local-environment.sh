#!/usr/bin/env bash
set -euo pipefail

echo "No local teardown is required. Alchemy stages are managed explicitly with CEIRD_CLOUDFLARE=1 pnpm alchemy destroy --profile ceird-env --env-file .env.local --stage <stage>."

#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

echo "Preparing local environment in $repo_root"

if command -v corepack >/dev/null 2>&1; then
  corepack enable
elif command -v pnpm >/dev/null 2>&1; then
  echo "corepack not found; using existing pnpm $(pnpm --version)"
else
  echo "Neither corepack nor pnpm is available; install pnpm to continue." >&2
  exit 1
fi

pnpm install --frozen-lockfile

env_target="$repo_root/.env.local"

if [[ -f "$env_target" ]]; then
  echo "Preserving existing .env.local"
  exit 0
fi

env_temp="$(mktemp "$repo_root/.env.local.tmp.XXXXXX")"
cleanup_env_temp() {
  rm -f "$env_temp"
}
trap cleanup_env_temp EXIT

env_source=""

if [[ -n "${LOCAL_ENV_SOURCE:-}" ]]; then
  if [[ -f "$LOCAL_ENV_SOURCE" ]]; then
    env_source="$LOCAL_ENV_SOURCE"
  elif [[ -d "$LOCAL_ENV_SOURCE" && -f "$LOCAL_ENV_SOURCE/.env.local" ]]; then
    env_source="$LOCAL_ENV_SOURCE/.env.local"
  else
    echo "LOCAL_ENV_SOURCE did not point to an env file: $LOCAL_ENV_SOURCE" >&2
  fi
fi

if [[ -n "$env_source" ]]; then
  cp "$env_source" "$env_temp"
  chmod 600 "$env_temp"
  mv "$env_temp" "$env_target"
  trap - EXIT
  echo "Copied .env.local from $env_source"
  exit 0
fi

echo "Missing .env.local. Create one at the repo root or set LOCAL_ENV_SOURCE to an env file or directory containing .env.local." >&2
exit 1

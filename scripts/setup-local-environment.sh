#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

echo "Preparing local environment in $repo_root"

env_target="$repo_root/.env.local"

if [[ -f "$env_target" ]]; then
  echo "Using existing .env.local"
else
  echo "Missing .env.local. Codex-managed worktrees copy ignored env files listed in .worktreeinclude." >&2
  echo "Create .env.local in the source checkout before creating the worktree." >&2
  exit 1
fi

echo "Using opensrc global cache at ${OPENSRC_HOME:-$HOME/.opensrc}"

if command -v corepack >/dev/null 2>&1; then
  corepack enable
elif command -v pnpm >/dev/null 2>&1; then
  echo "corepack not found; using existing pnpm $(pnpm --version)"
else
  echo "Neither corepack nor pnpm is available; install pnpm to continue." >&2
  exit 1
fi

pnpm install --frozen-lockfile

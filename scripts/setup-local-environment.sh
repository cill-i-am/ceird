#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

if [[ -z "$env_source" ]]; then
  while IFS= read -r line; do
    if [[ "$line" == worktree\ * ]]; then
      worktree_path="${line#worktree }"
      if [[ "$worktree_path" != "$repo_root" && -f "$worktree_path/.env.local" ]]; then
        env_source="$worktree_path/.env.local"
        break
      fi
    fi
  done < <(git worktree list --porcelain)
fi

if [[ -n "$env_source" ]]; then
  cp "$env_source" "$env_temp"
  chmod 600 "$env_temp"
  mv "$env_temp" "$env_target"
  trap - EXIT
  echo "Copied .env.local from $env_source"
  exit 0
fi

LOCAL_ENV_DEV_SCRIPT="$script_dir/dev.mjs" node --input-type=module > "$env_temp" <<'NODE'
import { pathToFileURL } from "node:url";

const { createDevEnvironment } = await import(
  pathToFileURL(process.env.LOCAL_ENV_DEV_SCRIPT).href
);

const env = createDevEnvironment({ PATH: process.env.PATH ?? "" });

for (const key of [
  "AUTH_EMAIL_FROM",
  "AUTH_EMAIL_FROM_NAME",
  "AUTH_EMAIL_TRANSPORT",
]) {
  console.log(`${key}=${String(env[key]).replaceAll("\n", "")}`);
}
NODE
chmod 600 "$env_temp"
mv "$env_temp" "$env_target"
trap - EXIT

echo "Created minimal .env.local for noop-email sandbox development"

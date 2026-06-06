#!/usr/bin/env node
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const credentialsEnvName = "ALCHEMY_CLOUDFLARE_STATE_STORE_CREDENTIALS";

function isHttpsUrl(value) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function parseStateStoreCredentials(value) {
  let credentials;

  try {
    credentials = JSON.parse(value);
  } catch (error) {
    throw new Error(
      "ALCHEMY_CLOUDFLARE_STATE_STORE_CREDENTIALS must be valid JSON.",
      { cause: error }
    );
  }

  if (typeof credentials.url !== "string" || !isHttpsUrl(credentials.url)) {
    throw new Error(
      "Alchemy Cloudflare state store credentials must include an https url."
    );
  }

  if (
    typeof credentials.authToken !== "string" ||
    credentials.authToken.length === 0
  ) {
    throw new Error(
      "Alchemy Cloudflare state store credentials must include authToken."
    );
  }

  return credentials;
}

export function restoreStateStoreCredentials(input) {
  parseStateStoreCredentials(input.value);
  mkdirSync(dirname(input.credentialsFile), { recursive: true });
  writeFileSync(input.credentialsFile, input.value);
  chmodSync(input.credentialsFile, 0o600);

  return input.credentialsFile;
}

export function defaultCredentialsFile(homeDirectory = homedir()) {
  return join(
    homeDirectory,
    ".alchemy",
    "credentials",
    "default",
    "cloudflare-state-store.json"
  );
}

function main() {
  const value = process.env[credentialsEnvName];

  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${credentialsEnvName} is required`);
  }

  const credentialsFile = restoreStateStoreCredentials({
    credentialsFile: defaultCredentialsFile(),
    value,
  });

  console.log(
    `Restored Alchemy Cloudflare state store credentials to ${credentialsFile}`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

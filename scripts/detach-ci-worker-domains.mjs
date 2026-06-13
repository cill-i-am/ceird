#!/usr/bin/env node

import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const ciStagePattern = /^ci-[0-9]+-[0-9]+$/;
const previewStagePattern = /^pr-[0-9]+$/;
const serviceHostnameEnv = [
  ["app", "CEIRD_APP_HOSTNAME"],
  ["api", "CEIRD_API_HOSTNAME"],
  ["agent", "CEIRD_AGENT_HOSTNAME"],
  ["mcp", "CEIRD_MCP_HOSTNAME"],
  ["sync", "CEIRD_SYNC_HOSTNAME"],
];
const workerServices = ["app", "api", "agent", "mcp", "sync"];

function requiredEnv(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function formatCloudflareErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return "Cloudflare API request failed";
  }

  return errors
    .map((error) => {
      if (error && typeof error === "object" && "message" in error) {
        const code =
          "code" in error && error.code !== undefined ? ` ${error.code}` : "";
        return `Cloudflare API error${code}: ${error.message}`;
      }
      return `Cloudflare API error: ${String(error)}`;
    })
    .join("; ");
}

function parseJsonResponse(text) {
  if (text.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Cloudflare API returned a non-JSON response");
  }
}

function readDomainsResult(body) {
  if (Array.isArray(body?.result)) {
    return body.result;
  }

  if (Array.isArray(body?.result?.domains)) {
    return body.result.domains;
  }

  return [];
}

export function collectCiWorkerHostnames(env = process.env) {
  const stage = requiredEnv(env, "CI_STAGE");
  if (!ciStagePattern.test(stage)) {
    throw new Error(`Refusing to detach Worker domains for stage ${stage}`);
  }

  return serviceHostnameEnv.map(([service, envName]) => {
    const hostname = requiredEnv(env, envName);
    const expectedHostname = `${service}-${stage}.ceird.app`;
    if (hostname !== expectedHostname) {
      throw new Error(
        `${envName} must be ${expectedHostname} for CI stage ${stage}`
      );
    }
    return hostname;
  });
}

export function collectPreviewWorkerHostnames(env = process.env) {
  const stage = requiredEnv(env, "PREVIEW_STAGE");
  const zoneName = requiredEnv(env, "CEIRD_ZONE_NAME");
  if (!previewStagePattern.test(stage)) {
    throw new Error(
      `Refusing to detach preview Worker domains for stage ${stage}`
    );
  }

  return workerServices.map((service) => `${service}.${stage}.${zoneName}`);
}

export function collectWorkerHostnames(env = process.env) {
  if (typeof env.CI_STAGE === "string" && env.CI_STAGE.trim() !== "") {
    return collectCiWorkerHostnames(env);
  }

  if (
    typeof env.PREVIEW_STAGE === "string" &&
    env.PREVIEW_STAGE.trim() !== ""
  ) {
    return collectPreviewWorkerHostnames(env);
  }

  throw new Error("CI_STAGE or PREVIEW_STAGE is required");
}

export function readCloudflareCredentials(env = process.env) {
  return {
    accountId: requiredEnv(env, "CLOUDFLARE_ACCOUNT_ID"),
    apiKey: requiredEnv(env, "CLOUDFLARE_API_KEY"),
    email: requiredEnv(env, "CLOUDFLARE_EMAIL"),
  };
}

async function cloudflareRequest(
  { apiKey, email },
  { method = "GET", path, searchParams },
  fetchImpl
) {
  const url = new URL(`https://api.cloudflare.com/client/v4${path}`);
  for (const [name, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(name, value);
  }

  const response = await fetchImpl(url, {
    headers: {
      "X-Auth-Email": email,
      "X-Auth-Key": apiKey,
    },
    method,
  });
  const body = parseJsonResponse(await response.text());

  if (!response.ok || body.success === false) {
    const error = new Error(formatCloudflareErrors(body.errors));
    error.status = response.status;
    error.cloudflareErrors = body.errors;
    throw error;
  }

  return body;
}

export async function listWorkerDomainsForHostname(
  credentials,
  hostname,
  fetchImpl = fetch
) {
  const body = await cloudflareRequest(
    credentials,
    {
      path: `/accounts/${credentials.accountId}/workers/domains`,
      searchParams: { hostname },
    },
    fetchImpl
  );

  return readDomainsResult(body).filter(
    (domain) => domain?.hostname === hostname
  );
}

export async function deleteWorkerDomain(
  credentials,
  domain,
  {
    attempts = 5,
    fetchImpl = fetch,
    sleepImpl = sleep,
    stdout = process.stdout,
  } = {}
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await cloudflareRequest(
        credentials,
        {
          method: "DELETE",
          path: `/accounts/${credentials.accountId}/workers/domains/${domain.id}`,
        },
        fetchImpl
      );
      stdout.write(`Detached Worker domain ${domain.hostname}\n`);
      return;
    } catch (error) {
      if (error?.status === 404) {
        stdout.write(`Worker domain ${domain.hostname} was already detached\n`);
        return;
      }

      if (attempt === attempts) {
        throw error;
      }

      stdout.write(
        `Retrying Worker domain detach for ${domain.hostname} after attempt ${attempt}\n`
      );
      await sleepImpl(attempt * 5000);
    }
  }
}

export async function detachCiWorkerDomains({
  credentials,
  fetchImpl = fetch,
  hostnames,
  sleepImpl = sleep,
  stdout = process.stdout,
} = {}) {
  const resolvedCredentials = credentials ?? readCloudflareCredentials();
  const resolvedHostnames = hostnames ?? collectWorkerHostnames();

  for (const hostname of resolvedHostnames) {
    const domains = await listWorkerDomainsForHostname(
      resolvedCredentials,
      hostname,
      fetchImpl
    );

    if (domains.length === 0) {
      stdout.write(`No Worker domain attached for ${hostname}\n`);
      continue;
    }

    for (const domain of domains) {
      await deleteWorkerDomain(resolvedCredentials, domain, {
        fetchImpl,
        sleepImpl,
        stdout,
      });
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await detachCiWorkerDomains();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

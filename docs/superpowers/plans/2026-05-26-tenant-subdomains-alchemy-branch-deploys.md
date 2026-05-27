# Tenant Subdomains And Alchemy Branch Deploys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add organization tenant subdomains without degrading localhost development or the existing Alchemy staging/preview branch deploy model.

**Architecture:** Keep the current Alchemy system hosts as stable neutral entrypoints (`app.<stage>.ceird.app`, `api.<stage>.ceird.app`, production `app.ceird.app`) and add tenant hosts beside them. Production tenants use `{orgSlug}.ceird.app`; non-production tenants use `{orgSlug}--{tenantStageAlias}.ceird.app` so every dynamic tenant host remains a first-level `ceird.app` label covered by Universal SSL. Alchemy owns one stage-scoped Worker route per non-production stage and production owns the wildcard tenant route with system-host safeguards.

**Tech Stack:** Alchemy v2, Cloudflare Workers Custom Domains, Cloudflare Worker Routes, Cloudflare wildcard DNS, TanStack Start, TanStack Router, Better Auth, Effect Config/Schema, Drizzle, Vitest, Playwright.

---

## Current Behavior To Preserve

- `pnpm dev -- --stage <stage>` continues to emit and use the existing Alchemy system hosts.
- Production remains explicitly pinned to `app.ceird.app`, `api.ceird.app`, `agent.ceird.app`, and `mcp.ceird.app` by `.github/workflows/deploy-main.yml`.
- PR previews continue using `app.pr-${PR}.ceird.app`, `api.pr-${PR}.ceird.app`, and `agent.pr-${PR}.ceird.app` for login, health checks, and e2e setup.
- Package-local Playwright mode continues to use `http://127.0.0.1:4173` and `http://127.0.0.1:3001`.
- Login, signup, password reset, verification, OAuth consent, invitation acceptance, and create-organization remain valid on the neutral app host.

## Target Host Matrix

| Environment          | Neutral app host            | API host                    | Tenant host                               |
| -------------------- | --------------------------- | --------------------------- | ----------------------------------------- |
| Production           | `app.ceird.app`             | `api.ceird.app`             | `{orgSlug}.ceird.app`                     |
| Staging              | `app.staging.ceird.app`     | `api.staging.ceird.app`     | `{orgSlug}--staging.ceird.app`            |
| PR preview           | `app.pr-123.ceird.app`      | `api.pr-123.ceird.app`      | `{orgSlug}--pr-123.ceird.app`             |
| Local Alchemy stage  | `app.<stageSlug>.ceird.app` | `api.<stageSlug>.ceird.app` | `{orgSlug}--<tenantStageAlias>.ceird.app` |
| Package-local server | `127.0.0.1:4173`            | `127.0.0.1:3001`            | disabled by default                       |

## File Structure

- Modify `infra/stages.ts`
  - Owns tenant stage alias derivation, tenant route pattern derivation, tenant host mode, tenant trusted origin patterns, and stage-specific auth cookie prefix.

- Modify `infra/stages.test.ts`
  - Covers production, staging, PR, long branch, and local Alchemy stage tenant config.

- Modify `infra/stages.contract.ts`
  - Keeps the infra config contract compile-time complete after adding tenant fields.

- Create `infra/cloudflare-tenant-routing.ts`
  - Owns temporary Alchemy resources for Cloudflare wildcard DNS and Worker Routes until Alchemy ships native DNS/route resources.
  - Uses Cloudflare REST APIs with Alchemy lifecycle state so PR route cleanup happens on `alchemy destroy`.

- Create `infra/cloudflare-tenant-routing.test.ts`
  - Unit tests route-pattern validation, DNS record payloads, and route payloads without calling Cloudflare.

- Modify `alchemy.run.ts`
  - Adds the tenant routing provider layer to the root stack providers.

- Modify `infra/cloudflare-stack.ts`
  - Wires tenant routing after the app Worker exists and returns tenant outputs.

- Modify `apps/app/infra/cloudflare-vite.ts`
  - Injects app runtime/build-time tenant env: tenant host mode, base domain, stage alias, neutral app origin, and reserved hosts.

- Modify `apps/app/src/cloudflare-env.d.ts` and `apps/app/src/cloudflare-env.test.ts`
  - Keeps Cloudflare app env type contract aligned with Alchemy.

- Modify `apps/domain/infra/cloudflare-worker.ts`
  - Injects Better Auth cookie prefix and trusted origin patterns for tenant hosts.

- Modify `apps/agent/infra/cloudflare-worker.ts`
  - Keeps `AUTH_APP_ORIGIN` on the neutral app origin; do not point agent auth at tenant hosts.

- Modify `apps/domain/src/domains/identity/authentication/config.ts`
  - Loads additional trusted origins and cookie prefix from env.
  - Supports wildcard trusted origins such as `https://*.ceird.app` and `https://*--pr-123.ceird.app`.

- Modify `apps/domain/src/domains/identity/authentication/authentication.test.ts`
  - Covers tenant trusted origins, stage cookie prefixes, and cross-subdomain cookies.

- Modify `packages/identity-core/src/index.ts` and `packages/identity-core/src/index.test.ts`
  - Reduces generated organization slug max length so `{slug}--{tenantStageAlias}` never exceeds a 63-character DNS label.

- Modify `apps/domain/src/domains/identity/authentication/schema.ts`
  - Adds a DB check for the organization slug length cap.

- Generate a Drizzle migration under `apps/domain/drizzle` and `apps/domain/drizzle-alchemy`
  - Adds or replaces the organization slug check constraint with format plus max length.

- Create `apps/app/src/lib/tenant-host.ts`
  - Pure host parser/builder for neutral and tenant origins.

- Create `apps/app/src/lib/tenant-host.test.ts`
  - Covers production tenant hosts, non-production tenant hosts, reserved hosts, long labels, localhost disabled mode, and path preservation.

- Modify `apps/app/src/features/auth/auth-request-context.server.ts`
  - Reads the request host, resolves a tenant slug when present, and prefers the matching organization over the session active org for request context.

- Modify `apps/app/src/features/auth/app-context-types.ts`
  - Adds optional requested-organization metadata to the app auth context snapshot if needed by route guards/tests.

- Modify `apps/app/src/features/auth/app-context-middleware.test.ts`
  - Covers SSR context resolution from tenant host to matching organization.

- Modify `apps/app/src/features/organizations/organization-access.ts`
  - Allows organization access resolution to prefer a tenant-requested organization slug when present.

- Modify `apps/app/src/features/organizations/organization-active-sync-boundary.tsx`
  - Keeps session active organization synchronized after tenant-host route resolution.

- Modify `apps/app/src/features/organizations/organization-switcher.tsx`
  - Switches organizations by setting the active organization, then navigating to the target tenant host when tenant hosts are enabled.

- Modify `apps/app/src/features/organizations/organization-switcher.test.tsx`
  - Covers cross-host switching, current-host no-op behavior, and local fallback behavior.

- Modify `apps/app/src/features/organizations/organization-onboarding-page.tsx`
  - After org creation, routes the user into the new tenant host at the correct step.

- Modify `apps/app/src/features/organizations/organization-onboarding-page.test.tsx`
  - Covers org creation redirect behavior.

- Modify `apps/app/e2e/test-origins.ts`, `apps/app/e2e/test-urls.ts`, and `apps/app/playwright.config.ts`
  - Adds optional tenant origin helpers without changing package-local defaults.

- Modify `apps/app/e2e/auth.test.ts` and/or add `apps/app/e2e/tenant-subdomains.test.ts`
  - Exercises create-org redirect and org switching on a tenant host for Alchemy-backed stages.

- Modify `.github/workflows/preview.yml`
  - Keeps existing neutral health checks and adds tenant URL derivation/comment output.

- Modify `.github/workflows/build.yml`
  - Adds staging tenant URL derivation for staging e2e.

- Modify `docs/architecture/cloudflare-ci.md`
  - Documents system hosts, tenant hosts, stage route ownership, and cleanup behavior.

- Modify `docs/architecture/auth.md`
  - Documents neutral auth routes, tenant host cookie/trusted-origin behavior, and cross-stage cookie isolation.

- Modify `docs/architecture/frontend.md`
  - Documents tenant host parsing and organization switching behavior.

---

## Task 1: Add Tenant Stage Config

**Files:**

- Modify: `infra/stages.ts`
- Modify: `infra/stages.test.ts`
- Modify: `infra/stages.contract.ts`

- [ ] **Step 1: Write failing tests for tenant stage config**

Add tests to `infra/stages.test.ts`:

```ts
it("uses production tenant hosts only when main is on the canonical app host", () => {
  const config = Effect.runSync(
    loadInfraStageConfig("main").pipe(
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromEnv({
            env: {
              AUTH_EMAIL_FROM: "no-reply@example.com",
              CEIRD_APP_HOSTNAME: "app.ceird.app",
              CEIRD_API_HOSTNAME: "api.ceird.app",
              CEIRD_AGENT_HOSTNAME: "agent.ceird.app",
              CEIRD_MCP_HOSTNAME: "mcp.ceird.app",
              CEIRD_ZONE_NAME: "ceird.app",
              GOOGLE_MAPS_API_KEY: "google-key",
            },
          })
        )
      )
    )
  );

  expect(config.tenantHostMode).toBe("production");
  expect(config.tenantBaseDomain).toBe("ceird.app");
  expect(config.tenantStageAlias).toBeUndefined();
  expect(config.tenantRoutePattern).toBe("*.ceird.app/*");
  expect(config.tenantTrustedOriginPattern).toBe("https://*.ceird.app");
  expect(config.authCookiePrefix).toBe("ceird-main");
});

it("keeps local main-stage defaults in staged tenant mode", () => {
  const config = Effect.runSync(
    loadInfraStageConfig("main").pipe(
      Effect.provide(ConfigProvider.layer(makeConfigProvider()))
    )
  );

  expect(config.appHostname).toBe("app.main.example.com");
  expect(config.tenantHostMode).toBe("stage");
  expect(config.tenantStageAlias).toBe("main");
  expect(config.tenantRoutePattern).toBe("*--main.example.com/*");
  expect(config.tenantTrustedOriginPattern).toBe("https://*--main.example.com");
});

it("derives tenant host aliases for PR previews", () => {
  const config = Effect.runSync(
    loadInfraStageConfig("pr-123").pipe(
      Effect.provide(ConfigProvider.layer(makeConfigProvider()))
    )
  );

  expect(config.tenantHostMode).toBe("stage");
  expect(config.tenantStageAlias).toBe("pr-123");
  expect(config.tenantRoutePattern).toBe("*--pr-123.example.com/*");
  expect(config.authCookiePrefix).toBe("ceird-pr-123");
});

it("uses a short deterministic tenant alias for long branch stages", () => {
  const config = Effect.runSync(
    loadInfraStageConfig(
      "feature/this-stage-name-is-way-too-long-for-tenant-hosts"
    ).pipe(Effect.provide(ConfigProvider.layer(makeConfigProvider())))
  );

  expect(config.tenantStageAlias).toMatch(/^s-[a-f0-9]{12}$/);
  expect(config.tenantStageAlias?.length).toBeLessThanOrEqual(14);
  expect(
    `example-org--${config.tenantStageAlias}.example.com`.split(".")[0]
  ).toHaveLength(27);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm run test:infra -- infra/stages.test.ts
```

Expected: FAIL because tenant fields do not exist.

- [ ] **Step 3: Implement tenant config fields**

In `infra/stages.ts`, extend `InfraStageConfig` with:

```ts
export type TenantHostMode = "disabled" | "production" | "stage";

export interface InfraStageConfig {
  // existing fields...
  readonly authCookiePrefix: string;
  readonly tenantBaseDomain: DomainName;
  readonly tenantHostMode: TenantHostMode;
  readonly tenantReservedHostnames: readonly DomainName[];
  readonly tenantRoutePattern: string | undefined;
  readonly tenantStageAlias: string | undefined;
  readonly tenantTrustedOriginPattern: string | undefined;
}
```

Add helpers near `makeStageSlug`:

```ts
const maxTenantStageAliasLength = 14;

function makeTenantStageAlias(identity: AlchemyStageIdentity) {
  if (identity.stageSlug.length <= maxTenantStageAliasLength) {
    return identity.stageSlug;
  }

  const hash = createHash("sha256")
    .update(identity.stage)
    .digest("hex")
    .slice(0, 12);

  return `s-${hash}`;
}

function makeAuthCookiePrefix(identity: AlchemyStageIdentity) {
  return `ceird-${identity.stageSlug}`.slice(0, 48);
}

function resolveTenantHostMode(input: {
  readonly appHostname: string;
  readonly identity: AlchemyStageIdentity;
  readonly zoneName: string;
}): TenantHostMode {
  if (
    input.identity.isProduction &&
    input.appHostname === `app.${input.zoneName}`
  ) {
    return "production";
  }

  return "stage";
}

function makeTenantRoutePattern(input: {
  readonly mode: TenantHostMode;
  readonly stageAlias: string | undefined;
  readonly zoneName: string;
}) {
  if (input.mode === "production") {
    return `*.${input.zoneName}/*`;
  }

  if (input.mode === "stage" && input.stageAlias) {
    return `*--${input.stageAlias}.${input.zoneName}/*`;
  }

  return undefined;
}

function makeTenantTrustedOriginPattern(input: {
  readonly mode: TenantHostMode;
  readonly stageAlias: string | undefined;
  readonly zoneName: string;
}) {
  if (input.mode === "production") {
    return `https://*.${input.zoneName}`;
  }

  if (input.mode === "stage" && input.stageAlias) {
    return `https://*--${input.stageAlias}.${input.zoneName}`;
  }

  return undefined;
}
```

After `appHostname`, `apiHostname`, `agentHostname`, and `mcpHostname` load, derive:

```ts
const tenantBaseDomain = zoneName;
const tenantHostMode = resolveTenantHostMode({
  appHostname,
  identity,
  zoneName,
});
const tenantStageAlias =
  tenantHostMode === "stage" ? makeTenantStageAlias(identity) : undefined;
const tenantRoutePattern = makeTenantRoutePattern({
  mode: tenantHostMode,
  stageAlias: tenantStageAlias,
  zoneName,
});
const tenantTrustedOriginPattern = makeTenantTrustedOriginPattern({
  mode: tenantHostMode,
  stageAlias: tenantStageAlias,
  zoneName,
});
const tenantReservedHostnames = [
  appHostname,
  apiHostname,
  agentHostname,
  mcpHostname,
];
const authCookiePrefix = makeAuthCookiePrefix(identity);
```

Return those fields in the config object.

- [ ] **Step 4: Update config contract**

Add the new fields to `configWithoutCloudflareBootstrapSecrets` in `infra/stages.contract.ts`:

```ts
authCookiePrefix: "ceird-main",
tenantBaseDomain: "example.com",
tenantHostMode: "stage",
tenantReservedHostnames: [
  "app.example.com",
  "api.example.com",
  "agent.example.com",
  "mcp.example.com",
],
tenantRoutePattern: "*--main.example.com/*",
tenantStageAlias: "main",
tenantTrustedOriginPattern: "https://*--main.example.com",
```

- [ ] **Step 5: Run infra tests**

Run:

```bash
pnpm run test:infra -- infra/stages.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add infra/stages.ts infra/stages.test.ts infra/stages.contract.ts
git commit -m "feat: add tenant stage host config"
```

---

## Task 2: Cap Organization Slugs For Tenant DNS Labels

**Files:**

- Modify: `packages/identity-core/src/index.ts`
- Modify: `packages/identity-core/src/index.test.ts`
- Modify: `apps/domain/src/domains/identity/authentication/schema.ts`
- Generate: `apps/domain/drizzle/<timestamp>_organization_slug_length/migration.sql`
- Generate: `apps/domain/drizzle-alchemy/<timestamp>_organization_slug_length/migration.sql`

- [ ] **Step 1: Write failing slug tests**

In `packages/identity-core/src/index.test.ts`, change the long-slug test:

```ts
it("keeps truncated slugs short enough for tenant stage host labels", () => {
  const slug = createOrganizationSlugFromName(`${"a".repeat(63)} & Beta`);

  expect(slug).toBe("a".repeat(40));
  expect(slug).toMatch(ORGANIZATION_SLUG_PATTERN);
});
```

Add:

```ts
it("rejects organization slugs longer than the tenant-safe maximum", () => {
  expect(() =>
    decodeCreateOrganizationInput({
      name: "Acme Field Ops",
      slug: "a".repeat(41),
    })
  ).toThrow();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @ceird/identity-core test
```

Expected: FAIL because slugs still truncate at 64 and the schema does not cap length.

- [ ] **Step 3: Implement slug cap**

In `packages/identity-core/src/index.ts`, add:

```ts
export const ORGANIZATION_SLUG_MAX_LENGTH = 40;
```

Update `OrganizationSlugSchema`:

```ts
export const OrganizationSlugSchema = Schema.Trim.pipe(
  Schema.check(
    Schema.isMinLength(2),
    Schema.isMaxLength(ORGANIZATION_SLUG_MAX_LENGTH),
    Schema.isPattern(ORGANIZATION_SLUG_PATTERN)
  )
);
```

Update `createOrganizationSlugFromName`:

```ts
    .slice(0, ORGANIZATION_SLUG_MAX_LENGTH)
```

- [ ] **Step 4: Add DB check**

In `apps/domain/src/domains/identity/authentication/schema.ts`, import `ORGANIZATION_SLUG_MAX_LENGTH`:

```ts
import {
  ORGANIZATION_ROLES,
  ORGANIZATION_SLUG_MAX_LENGTH,
} from "@ceird/identity-core";
```

Replace the organization slug check with:

```ts
check(
  "organization_slug_format_chk",
  sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(${table.slug}) <= ${ORGANIZATION_SLUG_MAX_LENGTH}`
),
```

- [ ] **Step 5: Generate and inspect migrations**

Run:

```bash
pnpm --filter domain db:generate
```

Expected: new migration files under `apps/domain/drizzle` and `apps/domain/drizzle-alchemy` that replace the slug check constraint.

Inspect the SQL and ensure it:

```sql
ALTER TABLE "organization" DROP CONSTRAINT "organization_slug_format_chk";
ALTER TABLE "organization" ADD CONSTRAINT "organization_slug_format_chk" CHECK ("organization"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length("organization"."slug") <= 40);
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter @ceird/identity-core test
pnpm --filter domain test -- authentication
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/identity-core/src/index.ts packages/identity-core/src/index.test.ts apps/domain/src/domains/identity/authentication/schema.ts apps/domain/drizzle apps/domain/drizzle-alchemy
git commit -m "feat: cap organization slugs for tenant hosts"
```

---

## Task 3: Add Alchemy-Owned Tenant Routing Resources

**Files:**

- Create: `infra/cloudflare-tenant-routing.ts`
- Create: `infra/cloudflare-tenant-routing.test.ts`
- Modify: `alchemy.run.ts`
- Modify: `infra/cloudflare-stack.ts`

- [ ] **Step 1: Write pure payload tests**

Create `infra/cloudflare-tenant-routing.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";

import {
  makeCloudflareTenantDnsRecordPayload,
  makeCloudflareTenantWorkerRoutePayload,
  validateTenantRoutePattern,
} from "./cloudflare-tenant-routing.ts";

describe("tenant Cloudflare routing helpers", () => {
  it("creates an originless proxied wildcard DNS record payload", () => {
    expect(makeCloudflareTenantDnsRecordPayload("ceird.app")).toStrictEqual({
      content: "192.0.2.0",
      name: "*",
      proxied: true,
      ttl: 1,
      type: "A",
    });
  });

  it("creates a Worker route payload for a stage tenant route", () => {
    expect(
      makeCloudflareTenantWorkerRoutePayload({
        pattern: "*--pr-123.ceird.app/*",
        scriptName: "ceird-pr-123-app",
      })
    ).toStrictEqual({
      pattern: "*--pr-123.ceird.app/*",
      script: "ceird-pr-123-app",
    });
  });

  it("creates a no-script bypass route payload for reserved production hosts", () => {
    expect(
      makeCloudflareTenantWorkerRoutePayload({
        pattern: "api.ceird.app/*",
        scriptName: undefined,
      })
    ).toStrictEqual({
      pattern: "api.ceird.app/*",
    });
  });

  it("rejects route patterns outside the configured zone", () => {
    expect(() =>
      validateTenantRoutePattern({
        pattern: "*--pr-123.example.net/*",
        zoneName: "ceird.app",
      })
    ).toThrow(/must target ceird\.app/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm run test:infra -- infra/cloudflare-tenant-routing.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement helper functions**

Create `infra/cloudflare-tenant-routing.ts` with pure helpers first:

```ts
export interface TenantWorkerRoutePayloadInput {
  readonly pattern: string;
  readonly scriptName: string | undefined;
}

export function makeCloudflareTenantDnsRecordPayload(zoneName: string) {
  void zoneName;

  return {
    content: "192.0.2.0",
    name: "*",
    proxied: true,
    ttl: 1,
    type: "A",
  } as const;
}

export function makeCloudflareTenantWorkerRoutePayload(
  input: TenantWorkerRoutePayloadInput
) {
  return {
    pattern: input.pattern,
    ...(input.scriptName === undefined ? {} : { script: input.scriptName }),
  } as const;
}

export function validateTenantRoutePattern(input: {
  readonly pattern: string;
  readonly zoneName: string;
}) {
  if (!input.pattern.endsWith(`.${input.zoneName}/*`)) {
    throw new Error(
      `Tenant route pattern ${input.pattern} must target ${input.zoneName}.`
    );
  }

  if (!input.pattern.startsWith("*.") && !input.pattern.startsWith("*--")) {
    throw new Error(
      `Tenant route pattern ${input.pattern} must start with a hostname wildcard.`
    );
  }
}
```

- [ ] **Step 4: Add Alchemy resources**

In the same file, define resources:

```ts
import { Credentials } from "alchemy/Cloudflare/Credentials";
import { CloudflareEnvironment } from "alchemy/Cloudflare/CloudflareEnvironment";
import { resolveZoneId } from "alchemy/Cloudflare/Zone";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import type { Input } from "alchemy/Input";
import type { Providers } from "alchemy/Cloudflare";
```

Create resource types:

```ts
export type TenantWildcardDnsRecord = Resource<
  "Ceird.Cloudflare.TenantWildcardDnsRecord",
  { readonly zoneName: string },
  {
    readonly recordId: string;
    readonly zoneId: string;
    readonly zoneName: string;
  },
  never,
  Providers
>;

export const TenantWildcardDnsRecord = Resource<TenantWildcardDnsRecord>(
  "Ceird.Cloudflare.TenantWildcardDnsRecord"
);

export type TenantWorkerRoute = Resource<
  "Ceird.Cloudflare.TenantWorkerRoute",
  {
    readonly pattern: string;
    readonly scriptName?: Input<string> | undefined;
    readonly zoneName: string;
  },
  {
    readonly pattern: string;
    readonly routeId: string;
    readonly scriptName?: string | undefined;
    readonly zoneId: string;
  },
  never,
  Providers
>;

export const TenantWorkerRoute = Resource<TenantWorkerRoute>(
  "Ceird.Cloudflare.TenantWorkerRoute"
);
```

Implement providers with Cloudflare REST APIs:

```ts
interface CloudflareCredentialsLike {
  readonly apiBaseUrl: string;
  readonly apiKey?: Redacted.Redacted<string> | undefined;
  readonly apiToken?: Redacted.Redacted<string> | undefined;
  readonly accessToken?: Redacted.Redacted<string> | undefined;
  readonly email?: string | undefined;
  readonly type: "apiKey" | "apiToken" | "oauth";
}

function formatCloudflareHeaders(credentials: CloudflareCredentialsLike) {
  if (
    credentials.type === "apiKey" &&
    credentials.apiKey &&
    credentials.email
  ) {
    return {
      "X-Auth-Key": Redacted.value(credentials.apiKey),
      "X-Auth-Email": credentials.email,
    };
  }

  if (credentials.type === "apiToken" && credentials.apiToken) {
    return {
      Authorization: `Bearer ${Redacted.value(credentials.apiToken)}`,
    };
  }

  if (credentials.type === "oauth" && credentials.accessToken) {
    return {
      Authorization: `Bearer ${Redacted.value(credentials.accessToken)}`,
    };
  }

  throw new Error("Unsupported Cloudflare credential shape.");
}

async function readCloudflareJson<T>(
  input: {
    readonly body?: unknown;
    readonly method: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
    readonly path: string;
  },
  credentials: CloudflareCredentialsLike
): Promise<T> {
  const response = await fetch(`${credentials.apiBaseUrl}${input.path}`, {
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    headers: {
      ...formatCloudflareHeaders(credentials),
      ...(input.body === undefined
        ? {}
        : { "content-type": "application/json" }),
    },
    method: input.method,
  });

  const payload = (await response.json().catch(() => null)) as T;

  if (!response.ok) {
    throw new Error(`Cloudflare API ${input.method} ${input.path} failed.`);
  }

  return payload;
}
```

Use response shapes:

```ts
interface CloudflareListResponse<T> {
  readonly result?: readonly T[];
  readonly success: boolean;
}

interface CloudflareItemResponse<T> {
  readonly result?: T;
  readonly success: boolean;
}

interface CloudflareDnsRecordResult {
  readonly id: string;
}

interface CloudflareWorkerRouteResult {
  readonly id: string;
  readonly pattern: string;
  readonly script?: string | undefined;
}
```

Provider behavior:

- `TenantWildcardDnsRecordProvider`
  - resolves `zoneId`
  - reads existing `A` record where `name=*.<zoneName>` or `name=*`
  - creates/updates proxied `A * -> 192.0.2.0`
  - does not delete the record on resource delete unless this stack created it; keep deletion conservative for the global zone record

- `TenantWorkerRouteProvider`
  - resolves `zoneId`
  - reads existing route by saved route id
  - creates route using `POST /zones/{zoneId}/workers/routes`
  - updates route using `PUT /zones/{zoneId}/workers/routes/{routeId}`
  - omits `script` for no-script bypass routes used by reserved production hosts
  - deletes route using `DELETE /zones/{zoneId}/workers/routes/{routeId}`

- [ ] **Step 5: Add provider layer**

In `alchemy.run.ts`, include:

```ts
import {
  TenantWildcardDnsRecordProvider,
  TenantWorkerRouteProvider,
} from "./infra/cloudflare-tenant-routing.ts";
```

Add both providers to the provider merge:

```ts
TenantWildcardDnsRecordProvider(),
TenantWorkerRouteProvider(),
```

- [ ] **Step 6: Wire route creation in stack**

In `infra/cloudflare-stack.ts`, after `const app = yield* makeAppWorker(...)`, add:

```ts
const tenantDns =
  input.config.tenantRoutePattern === undefined
    ? undefined
    : yield *
      TenantWildcardDnsRecord("TenantWildcardDns", {
        zoneName: input.config.zoneName,
      });

const tenantRoute =
  input.config.tenantRoutePattern === undefined
    ? undefined
    : yield *
      TenantWorkerRoute("TenantWorkerRoute", {
        pattern: input.config.tenantRoutePattern,
        scriptName: app.workerName,
        zoneName: input.config.zoneName,
      });

const tenantReservedHostBypassRoutes =
  input.config.tenantHostMode !== "production"
    ? []
    : yield *
      Effect.all(
        input.config.tenantReservedHostnames.map((hostname, index) =>
          TenantWorkerRoute(`TenantReservedHostBypassRoute${index}`, {
            pattern: `${hostname}/*`,
            scriptName: undefined,
            zoneName: input.config.zoneName,
          })
        )
      );
```

Return route details in `makeCloudflareStack` output:

```ts
tenantRoutePattern: tenantRoute?.pattern,
tenantReservedHostBypassRoutePatterns: tenantReservedHostBypassRoutes.map(
  (route) => route.pattern
),
tenantWildcardDnsRecordId: tenantDns?.recordId,
```

- [ ] **Step 7: Run infra tests and typecheck**

Run:

```bash
pnpm run test:infra -- infra/cloudflare-tenant-routing.test.ts infra/cloudflare-stack.test.ts
pnpm run check-types:infra
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add alchemy.run.ts infra/cloudflare-stack.ts infra/cloudflare-tenant-routing.ts infra/cloudflare-tenant-routing.test.ts
git commit -m "feat: manage tenant worker routes with alchemy"
```

---

## Task 4: Pass Tenant Environment Into App And Auth Workers

**Files:**

- Modify: `apps/app/infra/cloudflare-vite.ts`
- Modify: `apps/app/src/cloudflare-env.d.ts`
- Modify: `apps/app/src/cloudflare-env.test.ts`
- Modify: `apps/domain/infra/cloudflare-worker.ts`
- Modify: `apps/agent/infra/cloudflare-worker.ts`
- Modify: `infra/cloudflare-stack.test.ts`

- [ ] **Step 1: Write failing env contract tests**

Add expectations to `infra/cloudflare-stack.test.ts` for:

```ts
expect(appEnv.TENANT_BASE_DOMAIN).toBe("example.com");
expect(appEnv.TENANT_HOST_MODE).toBe("stage");
expect(appEnv.TENANT_STAGE_ALIAS).toBe("pr-123");
expect(appEnv.SYSTEM_APP_ORIGIN).toBe("https://app.pr-123.example.com");
expect(appEnv.VITE_TENANT_BASE_DOMAIN).toBe("example.com");
expect(appEnv.VITE_TENANT_HOST_MODE).toBe("stage");
expect(appEnv.VITE_TENANT_STAGE_ALIAS).toBe("pr-123");
expect(appEnv.VITE_SYSTEM_APP_ORIGIN).toBe("https://app.pr-123.example.com");
expect(domainEnv.AUTH_COOKIE_PREFIX).toBe("ceird-pr-123");
expect(domainEnv.AUTH_TRUSTED_ORIGINS).toContain(
  "https://*--pr-123.example.com"
);
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm run test:infra -- infra/cloudflare-stack.test.ts
```

Expected: FAIL because env values are not present.

- [ ] **Step 3: Extend app worker env**

In `apps/app/infra/cloudflare-vite.ts`, extend `AppWorkerConfiguredEnv`:

```ts
readonly SYSTEM_APP_ORIGIN: string;
readonly TENANT_BASE_DOMAIN: string;
readonly TENANT_HOST_MODE: "disabled" | "production" | "stage";
readonly TENANT_RESERVED_HOSTNAMES: string;
readonly TENANT_STAGE_ALIAS?: string | undefined;
readonly VITE_SYSTEM_APP_ORIGIN: string;
readonly VITE_TENANT_BASE_DOMAIN: string;
readonly VITE_TENANT_HOST_MODE: "disabled" | "production" | "stage";
readonly VITE_TENANT_RESERVED_HOSTNAMES: string;
readonly VITE_TENANT_STAGE_ALIAS?: string | undefined;
```

Change `makeAppWorkerEnv` input to include `config` and return:

```ts
SYSTEM_APP_ORIGIN: `https://${input.config.appHostname}`,
TENANT_BASE_DOMAIN: input.config.tenantBaseDomain,
TENANT_HOST_MODE: input.config.tenantHostMode,
TENANT_RESERVED_HOSTNAMES: input.config.tenantReservedHostnames.join(","),
...(input.config.tenantStageAlias === undefined
  ? {}
  : { TENANT_STAGE_ALIAS: input.config.tenantStageAlias }),
VITE_SYSTEM_APP_ORIGIN: `https://${input.config.appHostname}`,
VITE_TENANT_BASE_DOMAIN: input.config.tenantBaseDomain,
VITE_TENANT_HOST_MODE: input.config.tenantHostMode,
VITE_TENANT_RESERVED_HOSTNAMES:
  input.config.tenantReservedHostnames.join(","),
...(input.config.tenantStageAlias === undefined
  ? {}
  : { VITE_TENANT_STAGE_ALIAS: input.config.tenantStageAlias }),
```

- [ ] **Step 4: Extend domain worker env**

In `apps/domain/infra/cloudflare-worker.ts`, add:

```ts
readonly AUTH_COOKIE_PREFIX: string;
readonly AUTH_TRUSTED_ORIGINS: string;
```

Return:

```ts
AUTH_COOKIE_PREFIX: input.config.authCookiePrefix,
AUTH_TRUSTED_ORIGINS: [
  `https://${input.config.appHostname}`,
  input.config.tenantTrustedOriginPattern,
]
  .filter((value): value is string => typeof value === "string")
  .join(","),
```

Keep `AUTH_APP_ORIGIN` as the neutral app origin.

- [ ] **Step 5: Update Cloudflare env type**

In `apps/app/src/cloudflare-env.d.ts`, add the new app env keys. Keep optional `TENANT_STAGE_ALIAS` and `VITE_TENANT_STAGE_ALIAS`.

- [ ] **Step 6: Run env tests**

Run:

```bash
pnpm run test:infra -- infra/cloudflare-stack.test.ts
pnpm --filter app test -- cloudflare-env
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/app/infra/cloudflare-vite.ts apps/app/src/cloudflare-env.d.ts apps/app/src/cloudflare-env.test.ts apps/domain/infra/cloudflare-worker.ts apps/agent/infra/cloudflare-worker.ts infra/cloudflare-stack.test.ts
git commit -m "feat: expose tenant host config to workers"
```

---

## Task 5: Configure Better Auth For Tenant Hosts

**Files:**

- Modify: `apps/domain/src/domains/identity/authentication/config.ts`
- Modify: `apps/domain/src/domains/identity/authentication/authentication.test.ts`
- Modify: `apps/domain/src/domains/identity/authentication/auth.ts`

- [ ] **Step 1: Write failing auth config tests**

Add tests to `authentication.test.ts`:

```ts
it("adds configured tenant trusted origins", () => {
  const config = makeAuthenticationConfig({
    appOrigin: "https://app.pr-123.ceird.app",
    baseUrl: "https://api.pr-123.ceird.app/api/auth",
    cookiePrefix: "ceird-pr-123",
    databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    secret: "super-secret-value",
    trustedOrigins: ["https://*--pr-123.ceird.app"],
  });

  expect(config.trustedOrigins).toContain("https://*--pr-123.ceird.app");
  expect(
    matchesTrustedOrigin(
      "https://acme-field-ops--pr-123.ceird.app",
      config.trustedOrigins
    )
  ).toBeTruthy();
  expect(config.advanced?.cookiePrefix).toBe("ceird-pr-123");
});

it("shares cookies across stage system and tenant hosts on ceird.app", () => {
  const config = makeAuthenticationConfig({
    appOrigin: "https://app.pr-123.ceird.app",
    baseUrl: "https://api.pr-123.ceird.app/api/auth",
    cookieDomain: "ceird.app",
    databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
    secret: "super-secret-value",
  });

  expect(config.advanced?.crossSubDomainCookies).toStrictEqual({
    enabled: true,
    domain: "ceird.app",
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter domain test -- authentication
```

Expected: FAIL because `cookiePrefix`, `cookieDomain`, and extra trusted origins are not supported.

- [ ] **Step 3: Extend auth environment/config**

In `config.ts`, extend `AuthenticationEnvironment`:

```ts
readonly cookieDomain?: string | undefined;
readonly cookiePrefix?: string | undefined;
readonly trustedOrigins?: readonly string[] | undefined;
```

Extend `AuthenticationConfig["advanced"]`:

```ts
readonly cookiePrefix?: string | undefined;
```

Update `TrustedOriginPattern` to allow the stage infix wildcard:

```ts
const TrustedOriginPattern = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^https?:\/\/[a-z0-9*?.-]+(?::\d+)?$/i)),
  Schema.brand("TrustedOriginPattern")
);
```

Update `makeAuthenticationTrustedOrigins` to merge explicit origins:

```ts
for (const trustedOrigin of environment.trustedOrigins ?? []) {
  trustedOrigins.add(makeTrustedOriginPattern(trustedOrigin));
}
```

Update cross-domain domain resolution:

```ts
const crossSubDomainCookieDomain =
  environment.cookieDomain ?? resolveCrossSubDomainCookieDomain(environment);
```

Add cookie prefix:

```ts
advanced: {
  trustedProxyHeaders: true,
  ...(environment.cookiePrefix
    ? { cookiePrefix: environment.cookiePrefix }
    : {}),
  ...(crossSubDomainCookieDomain
    ? {
        crossSubDomainCookies: {
          enabled: true,
          domain: crossSubDomainCookieDomain,
        },
      }
    : {}),
},
```

- [ ] **Step 4: Load env values**

In `loadAuthenticationConfig`, load:

```ts
const cookiePrefix =
  yield * Config.string("AUTH_COOKIE_PREFIX").pipe(Config.option);
const cookieDomain =
  yield * Config.string("AUTH_COOKIE_DOMAIN").pipe(Config.option);
const trustedOrigins =
  yield * Config.string("AUTH_TRUSTED_ORIGINS").pipe(Config.option);
```

Decode comma-separated origins:

```ts
function parseTrustedOriginList(value: string | undefined) {
  return value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
```

Pass:

```ts
cookieDomain: Option.getOrUndefined(cookieDomain),
cookiePrefix: Option.getOrUndefined(cookiePrefix),
trustedOrigins: parseTrustedOriginList(Option.getOrUndefined(trustedOrigins)),
```

- [ ] **Step 5: Inject cookie domain from infra**

In `apps/domain/infra/cloudflare-worker.ts`, add:

```ts
readonly AUTH_COOKIE_DOMAIN: string;
```

Set:

```ts
AUTH_COOKIE_DOMAIN: input.config.tenantBaseDomain,
```

This intentionally shares auth cookies across `app.pr-123.ceird.app`, `api.pr-123.ceird.app`, and `my-org--pr-123.ceird.app`, while `AUTH_COOKIE_PREFIX` isolates each stage.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter domain test -- authentication
pnpm run test:infra -- infra/cloudflare-stack.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/domain/src/domains/identity/authentication/config.ts apps/domain/src/domains/identity/authentication/authentication.test.ts apps/domain/src/domains/identity/authentication/auth.ts apps/domain/infra/cloudflare-worker.ts infra/cloudflare-stack.test.ts
git commit -m "feat: trust tenant hosts for auth"
```

---

## Task 6: Add Tenant Host Parser And URL Builder

**Files:**

- Create: `apps/app/src/lib/tenant-host.ts`
- Create: `apps/app/src/lib/tenant-host.test.ts`
- Modify: `apps/app/src/lib/api-origin.test.ts`

- [ ] **Step 1: Write failing parser tests**

Create `apps/app/src/lib/tenant-host.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildOrganizationTenantOrigin,
  parseTenantHost,
  readTenantHostConfigFromEnv,
} from "./tenant-host";

describe("tenant host parsing", () => {
  it("parses production tenant hosts", () => {
    expect(
      parseTenantHost("acme-field-ops.ceird.app", {
        baseDomain: "ceird.app",
        hostMode: "production",
        reservedHostnames: ["app.ceird.app", "api.ceird.app"],
      })
    ).toStrictEqual({ kind: "tenant", organizationSlug: "acme-field-ops" });
  });

  it("does not treat reserved production hosts as tenants", () => {
    expect(
      parseTenantHost("app.ceird.app", {
        baseDomain: "ceird.app",
        hostMode: "production",
        reservedHostnames: ["app.ceird.app", "api.ceird.app"],
      })
    ).toStrictEqual({ kind: "system" });
  });

  it("parses stage tenant hosts", () => {
    expect(
      parseTenantHost("acme-field-ops--pr-123.ceird.app", {
        baseDomain: "ceird.app",
        hostMode: "stage",
        reservedHostnames: ["app.pr-123.ceird.app", "api.pr-123.ceird.app"],
        stageAlias: "pr-123",
      })
    ).toStrictEqual({ kind: "tenant", organizationSlug: "acme-field-ops" });
  });

  it("builds stage tenant origins without changing the path", () => {
    expect(
      buildOrganizationTenantOrigin("acme-field-ops", {
        baseDomain: "ceird.app",
        hostMode: "stage",
        reservedHostnames: [],
        stageAlias: "pr-123",
      })
    ).toBe("https://acme-field-ops--pr-123.ceird.app");
  });

  it("disables tenant hosts for localhost mode", () => {
    expect(
      parseTenantHost("127.0.0.1", {
        baseDomain: "ceird.app",
        hostMode: "disabled",
        reservedHostnames: [],
      })
    ).toStrictEqual({ kind: "disabled" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter app test -- tenant-host
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement parser**

Create `apps/app/src/lib/tenant-host.ts`:

```ts
export type TenantHostMode = "disabled" | "production" | "stage";

export interface TenantHostConfig {
  readonly baseDomain: string;
  readonly hostMode: TenantHostMode;
  readonly reservedHostnames: readonly string[];
  readonly stageAlias?: string | undefined;
}

export type TenantHostResolution =
  | { readonly kind: "disabled" }
  | { readonly kind: "system" }
  | { readonly kind: "tenant"; readonly organizationSlug: string };

const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseTenantHost(
  hostname: string,
  config: TenantHostConfig
): TenantHostResolution {
  const normalized = hostname.toLowerCase();

  if (config.hostMode === "disabled") {
    return { kind: "disabled" };
  }

  if (config.reservedHostnames.includes(normalized)) {
    return { kind: "system" };
  }

  if (!normalized.endsWith(`.${config.baseDomain}`)) {
    return { kind: "system" };
  }

  const label = normalized.slice(
    0,
    normalized.length - `.${config.baseDomain}`.length
  );

  if (label.includes(".")) {
    return { kind: "system" };
  }

  const organizationSlug =
    config.hostMode === "production"
      ? label
      : readStageOrganizationSlug(label, config.stageAlias);

  if (!organizationSlug || !ORGANIZATION_SLUG_PATTERN.test(organizationSlug)) {
    return { kind: "system" };
  }

  return { kind: "tenant", organizationSlug };
}

function readStageOrganizationSlug(
  label: string,
  stageAlias: string | undefined
) {
  if (!stageAlias) {
    return;
  }

  const suffix = `--${stageAlias}`;

  if (!label.endsWith(suffix)) {
    return;
  }

  return label.slice(0, -suffix.length);
}

export function buildOrganizationTenantOrigin(
  organizationSlug: string,
  config: TenantHostConfig
) {
  if (config.hostMode === "production") {
    return `https://${organizationSlug}.${config.baseDomain}`;
  }

  if (config.hostMode === "stage" && config.stageAlias) {
    return `https://${organizationSlug}--${config.stageAlias}.${config.baseDomain}`;
  }

  return undefined;
}

export function buildOrganizationTenantUrl(
  organizationSlug: string,
  path: string,
  config: TenantHostConfig
) {
  const origin = buildOrganizationTenantOrigin(organizationSlug, config);

  if (!origin) {
    return;
  }

  return new URL(path, origin).toString();
}

export function readTenantHostConfigFromEnv(): TenantHostConfig {
  return {
    baseDomain: import.meta.env.VITE_TENANT_BASE_DOMAIN ?? "",
    hostMode:
      (import.meta.env.VITE_TENANT_HOST_MODE as TenantHostMode | undefined) ??
      "disabled",
    reservedHostnames: (import.meta.env.VITE_TENANT_RESERVED_HOSTNAMES ?? "")
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter((hostname) => hostname.length > 0),
    stageAlias: import.meta.env.VITE_TENANT_STAGE_ALIAS,
  };
}
```

- [ ] **Step 4: Update API origin tests if needed**

Add one test to `apps/app/src/lib/api-origin.test.ts` proving tenant hosts still call the configured API origin:

```ts
it("uses explicit API origin for tenant hosts", () => {
  expect(
    resolveApiOrigin(
      "https://acme-field-ops--pr-123.ceird.app",
      "https://api.pr-123.ceird.app"
    )
  ).toBe("https://api.pr-123.ceird.app");
});
```

- [ ] **Step 5: Run app tests**

Run:

```bash
pnpm --filter app test -- tenant-host api-origin
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/lib/tenant-host.ts apps/app/src/lib/tenant-host.test.ts apps/app/src/lib/api-origin.test.ts
git commit -m "feat: add tenant host parsing"
```

---

## Task 7: Resolve Request Organization From Tenant Host

**Files:**

- Modify: `apps/app/src/features/auth/auth-request-context.server.ts`
- Modify: `apps/app/src/features/auth/app-context-types.ts`
- Modify: `apps/app/src/features/auth/app-context-middleware.test.ts`
- Modify: `apps/app/src/features/organizations/organization-access.ts`
- Modify: `apps/app/src/features/organizations/organization-active-sync-boundary.tsx`

- [ ] **Step 1: Write failing middleware test**

In `app-context-middleware.test.ts`, add a case where:

- request host is `beta-field-ops--pr-123.ceird.app`
- session active org is `org_123`
- org list contains `org_123`/`acme-field-ops` and `org_456`/`beta-field-ops`
- hydrated app context resolves `activeOrganizationId` to `org_456`
- active sync target becomes `org_456`

Use this assertion shape:

```ts
expect(snapshot.activeOrganizationId).toBe("org_456");
expect(snapshot.requestedOrganizationSlug).toBe("beta-field-ops");
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter app test -- app-context-middleware
```

Expected: FAIL because tenant host context is ignored.

- [ ] **Step 3: Add tenant host request resolver**

In `auth-request-context.server.ts`, import:

```ts
import {
  parseTenantHost,
  readTenantHostConfigFromEnv,
} from "#/lib/tenant-host";
```

Add:

```ts
function readRequestedOrganizationSlug(request: Request) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!host) {
    return;
  }

  const resolution = parseTenantHost(
    host.split(":")[0] ?? host,
    readTenantHostConfigFromEnv()
  );

  return resolution.kind === "tenant" ? resolution.organizationSlug : undefined;
}
```

Update `buildAppAuthContextSnapshotForRequest`:

```ts
const requestedOrganizationSlug = readRequestedOrganizationSlug(request);
```

When organizations are available, resolve by slug first:

```ts
const resolvedActiveOrganizationId = resolveActiveOrganizationId(
  activeOrganizationId,
  organizations,
  requestedOrganizationSlug
);
```

Update resolver:

```ts
function resolveActiveOrganizationId(
  activeOrganizationId: OrganizationId | null,
  organizations: readonly OrganizationSummary[],
  requestedOrganizationSlug?: string | undefined
): OrganizationId | null {
  if (requestedOrganizationSlug) {
    const requested = organizations.find(
      (organization) => organization.slug === requestedOrganizationSlug
    );

    if (requested) {
      return requested.id;
    }
  }

  if (!activeOrganizationId) {
    return organizations[0]?.id ?? null;
  }

  return (
    organizations.find(
      (organization) => organization.id === activeOrganizationId
    )?.id ??
    organizations[0]?.id ??
    null
  );
}
```

- [ ] **Step 4: Extend app context snapshot type**

In `app-context-types.ts`, add optional:

```ts
requestedOrganizationSlug: Schema.optional(Schema.String),
```

Return it only when present:

```ts
...(requestedOrganizationSlug ? { requestedOrganizationSlug } : {}),
```

- [ ] **Step 5: Preserve active sync behavior**

In `organization-access.ts`, no direct tenant parsing should happen. Instead, ensure existing active sync compares the session active org and the route-resolved active org. This keeps `OrganizationActiveSyncBoundary` responsible for calling Better Auth `setActive`.

If existing route context does not include the session active org separately, add:

```ts
sessionActiveOrganizationId: currentActiveOrganizationId,
```

to the returned organization access state and use it in `createActiveOrganizationSync`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter app test -- app-context-middleware organization-access organization-active-sync-boundary
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/features/auth/auth-request-context.server.ts apps/app/src/features/auth/app-context-types.ts apps/app/src/features/auth/app-context-middleware.test.ts apps/app/src/features/organizations/organization-access.ts apps/app/src/features/organizations/organization-active-sync-boundary.tsx
git commit -m "feat: resolve organization context from tenant hosts"
```

---

## Task 8: Redirect Organization Creation And Switching To Tenant Hosts

**Files:**

- Modify: `apps/app/src/features/organizations/organization-switcher.tsx`
- Modify: `apps/app/src/features/organizations/organization-switcher.test.tsx`
- Modify: `apps/app/src/features/organizations/organization-onboarding-page.tsx`
- Modify: `apps/app/src/features/organizations/organization-onboarding-page.test.tsx`

- [ ] **Step 1: Write failing switcher tests**

In `organization-switcher.test.tsx`, add:

```ts
it("switches organizations by navigating to the target tenant host when enabled", async () => {
  const assign = vi.fn();
  vi.stubGlobal("location", {
    ...window.location,
    assign,
    origin: "https://acme-field-ops--pr-123.ceird.app",
    pathname: "/jobs",
    search: "",
    hash: "",
  });

  renderOrganizationSwitcher({
    activeOrganization: {
      id: "org_123",
      name: "Acme Field Ops",
      slug: "acme-field-ops",
    },
    organizations: [
      { id: "org_123", name: "Acme Field Ops", slug: "acme-field-ops" },
      { id: "org_456", name: "Beta Field Ops", slug: "beta-field-ops" },
    ],
    tenantHostConfig: {
      baseDomain: "ceird.app",
      hostMode: "stage",
      reservedHostnames: [],
      stageAlias: "pr-123",
    },
  });

  await userEvent.click(screen.getByRole("button", { name: /acme/i }));
  await userEvent.click(screen.getByRole("menuitemradio", { name: /beta/i }));

  expect(mockedSetActiveOrganization).toHaveBeenCalledWith("org_456");
  expect(assign).toHaveBeenCalledWith(
    "https://beta-field-ops--pr-123.ceird.app/jobs"
  );
});
```

- [ ] **Step 2: Run switcher tests to verify they fail**

Run:

```bash
pnpm --filter app test -- organization-switcher
```

Expected: FAIL because switcher only invalidates the router.

- [ ] **Step 3: Implement tenant-aware switcher navigation**

In `organization-switcher.tsx`, import:

```ts
import {
  buildOrganizationTenantUrl,
  readTenantHostConfigFromEnv,
} from "#/lib/tenant-host";
```

After `await setActiveOrganization(nextOrganizationId);`, resolve the target organization:

```ts
const nextOrganization = organizations.find(
  (organization) => organization.id === nextOrganizationId
);
const nextTenantUrl = nextOrganization
  ? buildOrganizationTenantUrl(
      nextOrganization.slug,
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
      readTenantHostConfigFromEnv()
    )
  : undefined;

if (nextTenantUrl && nextTenantUrl !== window.location.href) {
  window.location.assign(nextTenantUrl);
  return;
}
```

Keep the existing router invalidation fallback for localhost and disabled tenant mode.

- [ ] **Step 4: Write onboarding redirect tests**

In `organization-onboarding-page.test.tsx`, test the chosen behavior:

```ts
it("continues to the created organization's tenant host after setup", async () => {
  const assign = vi.fn();
  vi.stubGlobal("location", {
    ...window.location,
    assign,
    origin: "https://app.pr-123.ceird.app",
  });

  mockedCreateCurrentServerOrganization.mockResolvedValue({
    id: "org_123",
    name: "Acme Field Ops",
    slug: "acme-field-ops",
  });

  render(<OrganizationOnboardingPage />);
  await userEvent.type(screen.getByLabelText(/team name/i), "Acme Field Ops");
  await userEvent.click(screen.getByRole("button", { name: /create team/i }));
  await screen.findByRole("button", { name: /skip for now/i });
  await userEvent.click(screen.getByRole("button", { name: /skip for now/i }));

  expect(assign).toHaveBeenCalledWith(
    "https://acme-field-ops--pr-123.ceird.app/"
  );
});
```

This preserves the existing invite step and redirects when the user continues.

- [ ] **Step 5: Implement onboarding redirect**

In `organization-onboarding-page.tsx`, pass a tenant-aware continue handler to `InviteMembersStep`:

```ts
const continueToCreatedOrganization = React.useCallback(() => {
  if (!createdOrganization) {
    void navigate({ to: "/" });
    return;
  }

  const tenantUrl = buildOrganizationTenantUrl(
    createdOrganization.slug,
    "/",
    readTenantHostConfigFromEnv()
  );

  if (tenantUrl) {
    window.location.assign(tenantUrl);
    return;
  }

  void navigate({ to: "/" });
}, [createdOrganization, navigate]);
```

Use:

```tsx
onContinue = { continueToCreatedOrganization };
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter app test -- organization-switcher organization-onboarding-page
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/features/organizations/organization-switcher.tsx apps/app/src/features/organizations/organization-switcher.test.tsx apps/app/src/features/organizations/organization-onboarding-page.tsx apps/app/src/features/organizations/organization-onboarding-page.test.tsx
git commit -m "feat: navigate organization flows to tenant hosts"
```

---

## Task 9: Add CI And E2E Tenant Coverage

**Files:**

- Modify: `apps/app/e2e/test-origins.ts`
- Modify: `apps/app/e2e/test-urls.ts`
- Modify: `apps/app/playwright.config.ts`
- Add: `apps/app/e2e/tenant-subdomains.test.ts`
- Modify: `.github/workflows/preview.yml`
- Modify: `.github/workflows/build.yml`

- [ ] **Step 1: Add Playwright tenant origin helpers**

In `test-origins.ts`, add:

```ts
export const TENANT_ORIGIN = readOptionalEnv("PLAYWRIGHT_TENANT_URL");
```

In `test-urls.ts`, export it:

```ts
export {
  AGENT_ORIGIN,
  API_ORIGIN,
  APP_ORIGIN,
  TENANT_ORIGIN,
  USE_PACKAGE_LOCAL_SERVER,
};
```

- [ ] **Step 2: Add tenant e2e test**

Create `apps/app/e2e/tenant-subdomains.test.ts`:

```ts
import { expect, test } from "@playwright/test";

import { TENANT_ORIGIN, USE_PACKAGE_LOCAL_SERVER } from "./test-urls";
import { createAuthenticatedSession } from "./helpers/auth-session";

test.skip(
  USE_PACKAGE_LOCAL_SERVER,
  "tenant subdomains are disabled for package-local server mode"
);
test.skip(
  !TENANT_ORIGIN,
  "PLAYWRIGHT_TENANT_URL is required for tenant subdomain e2e"
);

test("created organization can be opened on the tenant host", async ({
  page,
}) => {
  const session = await createAuthenticatedSession(page, {
    organizationName: "Preview Tenant Health",
  });

  await page.goto(TENANT_ORIGIN!);

  await expect(page).toHaveURL(
    new RegExp(`^${TENANT_ORIGIN!.replaceAll(".", "\\.")}`)
  );
  await expect(page.getByText(session.organizationName)).toBeVisible();
});
```

Adjust helper names to match the existing `helpers/auth-session.ts` return shape.

- [ ] **Step 3: Derive tenant URL in PR workflow**

In `.github/workflows/preview.yml`, add:

```yaml
PLAYWRIGHT_TENANT_URL: https://preview-tenant-health--pr-${{ github.event.pull_request.number }}.ceird.app
```

Keep existing `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_API_URL`, and `PLAYWRIGHT_AGENT_URL`.

Update the PR comment to include:

```md
- Tenant example: `https://<org-slug>--pr-${PR_NUMBER}.ceird.app`
```

- [ ] **Step 4: Derive tenant URL in staging workflow**

In `.github/workflows/build.yml`, add:

```yaml
PLAYWRIGHT_TENANT_URL: https://staging-tenant-health--staging.ceird.app
```

- [ ] **Step 5: Run package-local e2e sanity**

Run:

```bash
PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1 pnpm --filter app e2e
```

Expected: PASS; tenant test is skipped locally.

- [ ] **Step 6: Run app tests**

Run:

```bash
pnpm --filter app test -- tenant-subdomains test-origins
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/app/e2e apps/app/playwright.config.ts .github/workflows/preview.yml .github/workflows/build.yml
git commit -m "test: cover tenant subdomains in previews"
```

---

## Task 10: Document The New Host Model

**Files:**

- Modify: `docs/architecture/cloudflare-ci.md`
- Modify: `docs/architecture/auth.md`
- Modify: `docs/architecture/frontend.md`
- Modify: `infra/README.md`

- [ ] **Step 1: Update Cloudflare CI docs**

In `cloudflare-ci.md`, document:

```md
Tenant hostnames are additive to system hostnames.

- System app/API/Agent/MCP hostnames keep the existing Alchemy stage shape.
- Production tenant hostnames use `{orgSlug}.ceird.app`.
- Non-production tenant hostnames use `{orgSlug}--{tenantStageAlias}.ceird.app`.
- PR preview stages own one Cloudflare Worker route, `*--pr-N.ceird.app/*`, and destroy it with the Alchemy stage.
- The wildcard DNS record for `*.ceird.app` is global and not recreated per organization.
```

- [ ] **Step 2: Update auth docs**

In `auth.md`, document:

```md
Auth entry routes remain on the neutral app host. Better Auth trusts the neutral app origin and the stage tenant origin pattern. Cookies are scoped to `ceird.app` in deployed environments and isolated by `AUTH_COOKIE_PREFIX`, which is derived from the Alchemy stage.
```

- [ ] **Step 3: Update frontend docs**

In `frontend.md`, document:

```md
The frontend resolves organization context from the host before falling back to the Better Auth active organization. Organization switching first updates Better Auth's active organization and then navigates to the target tenant host when tenant host mode is enabled. Local package-server mode keeps tenant host mode disabled.
```

- [ ] **Step 4: Update infra README**

In `infra/README.md`, add tenant fields to the deployed resources section and explain that tenant routing is stage-owned while system custom domains remain exact.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/cloudflare-ci.md docs/architecture/auth.md docs/architecture/frontend.md infra/README.md
git commit -m "docs: describe tenant subdomain routing"
```

---

## Task 11: Full Verification

**Files:**

- No code changes; verification only.

- [ ] **Step 1: Run focused checks**

Run:

```bash
pnpm run test:infra
pnpm --filter @ceird/identity-core test
pnpm --filter domain test
pnpm --filter app test
```

Expected: PASS.

- [ ] **Step 2: Run type checks**

Run:

```bash
pnpm check-types
```

Expected: PASS.

- [ ] **Step 3: Run lint and format**

Run:

```bash
pnpm lint
pnpm format
```

Expected: PASS.

- [ ] **Step 4: Run package-local Playwright**

Run:

```bash
PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1 pnpm --filter app e2e
```

Expected: PASS with tenant subdomain e2e skipped.

- [ ] **Step 5: Ask before provider-mutating verification**

Do not run `alchemy deploy`, `alchemy dev`, or `alchemy destroy` without explicit user confirmation of the stage and Cloudflare credentials.

Ask:

```text
Do you want me to run an Alchemy deploy/dev verification for a disposable stage? I would use stage codex-tenant-subdomains unless you prefer a different stage.
```

- [ ] **Step 6: If approved, verify a disposable Alchemy stage**

Run only after approval:

```bash
CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file .env.local --stage codex-tenant-subdomains
```

Expected:

- stack outputs include existing app/API/Agent/MCP origins
- tenant route exists for `*--s-<hash>.ceird.app/*` or `*--codex-tenant.ceird.app/*` depending on alias
- neutral app health works
- tenant host returns the app rather than a Cloudflare routing error

- [ ] **Step 7: Commit verification-only doc tweak if needed**

If verification reveals operational notes, update `docs/architecture/cloudflare-ci.md` and commit:

```bash
git add docs/architecture/cloudflare-ci.md
git commit -m "docs: capture tenant route verification notes"
```

---

## Rollout Notes

- This is safe to merge before any real organizations exist because tenant routing is additive and current system hosts remain valid.
- The largest operational risk is production wildcard route overlap with `app.ceird.app`, `api.ceird.app`, `agent.ceird.app`, and `mcp.ceird.app`. The plan adds exact no-script bypass routes for those reserved hosts, and that behavior must be verified in a non-production zone before main deploy.
- If Cloudflare/Alchemy native DNS and Worker Route resources appear before implementation, replace `infra/cloudflare-tenant-routing.ts` with native resources and keep the rest of the plan unchanged.
- Future custom domains should plug into `tenant-host.ts` as a separate host lookup path: custom domain -> organization id/slug mapping. Do not mix custom domain provisioning into this first tenant-subdomain rollout.

## Self-Review

- Spec coverage: The plan preserves local/package server behavior, keeps current Alchemy system hosts, adds production and non-production tenant host support, accounts for Better Auth cookies/trusted origins, updates organization creation/switching, and adds CI/e2e/docs.
- Placeholder scan: No `TBD`, `TODO`, or "implement later" placeholders remain. The plan includes one explicit verification gate for provider-mutating commands.
- Type consistency: `tenantHostMode`, `tenantStageAlias`, `tenantBaseDomain`, `tenantRoutePattern`, `tenantTrustedOriginPattern`, and `authCookiePrefix` are introduced in infra and carried through worker env and app parsing consistently.
- Scope check: Custom customer domains are intentionally excluded from implementation and left as an extension point.

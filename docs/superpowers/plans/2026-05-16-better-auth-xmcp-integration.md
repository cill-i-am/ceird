# Better Auth xmcp Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OAuth-ready Better Auth support for remote MCP clients and integrate xmcp as Ceird's MCP framework without replacing the existing auth tables, organization model, or Effect API services.

**Architecture:** Better Auth remains the authorization server and source of truth. xmcp runs as the MCP server layer, with a custom Ceird middleware that validates Bearer tokens through Better Auth and resolves the current user, scopes, and organization actor before tools call existing Effect domain services. We add only the UI required for OAuth consent and token/application visibility; normal sign-in/sign-up stays on the existing auth pages.

**Tech Stack:** Better Auth OAuth Provider or MCP plugin, xmcp, Effect, Drizzle, Postgres, TanStack Start, Cloudflare Workers, Vitest, Playwright, MCP Inspector or Vercel AI SDK client smoke tests.

---

## Current Decision

Use `xmcp` for the MCP framework. Do not use `@xmcp-dev/better-auth` as the primary auth integration. Task 0 records and verifies the spike: preliminary package inspection on May 16, 2026 found the adapter is pinned to older xmcp, Better Auth, React, and Express assumptions, creates its own Better Auth instance, and does not expose hooks for Ceird's existing Drizzle schema mapping.

Reasoning:

- xmcp gives us file-based tools, middleware, structured outputs, tool annotations, HTTP transport, and Cloudflare deployment shape.
- The xmcp Better Auth adapter currently exposes a standalone `betterAuthProvider(authConfig)` wrapper, not a way to pass Ceird's existing Better Auth instance.
- Ceird already owns Better Auth through `apps/api/src/domains/identity/authentication/auth.ts` and snake_case Drizzle tables in `apps/api/src/domains/identity/authentication/schema.ts`.
- Better Auth's OAuth Provider plugin is the long-term path because the Better Auth MCP plugin docs say the MCP plugin is moving toward OAuth Provider. Current package metadata says OAuth Provider requires `better-auth@^1.6.11`, so upgrade the API and app Better Auth packages together before adding OAuth tables.

## UI Decision

Yes, we need a small amount of UI, but not a new login system.

Required UI:

- OAuth consent page for MCP clients requesting Ceird scopes.
- OAuth error/denied page for failed authorization or declined consent.
- Connected agents/settings section so a user can see and revoke authorized MCP clients or tokens.

Not required:

- New sign-in page.
- New sign-up page.
- Separate xmcp-generated auth UI.
- A full marketplace or client-management console for the first version.

The OAuth consent UI should reuse the existing app shell when the user is signed in. If the user is not signed in, Better Auth should redirect to the existing `/login` page and return to the consent flow after login.

## Impeccable UI Gate

Tasks 9 and 10 are product UI work. Before writing UI tests or code for either task, the implementing agent must use the `impeccable` skill with its `shape` command.

Required setup for each UI task:

1. Run the Impeccable context loader:

```bash
node .agents/skills/impeccable/scripts/load-context.mjs
```

2. Treat the register as `product`.
3. Load:
   - `.agents/skills/impeccable/reference/product.md`
   - `.agents/skills/impeccable/reference/shape.md`
4. Produce a compact design brief and get explicit approval before UI implementation.

Default design lane for these tasks:

- Register: product.
- Color strategy: Restrained.
- Theme scene sentence: an office admin authorizes or reviews agent access during a workday in the existing light authenticated workspace, needing confidence about what an agent can see or change.
- Anchor references: Linear settings, Vercel account/security settings, Raycast extension permission prompts.
- Fidelity: production-ready.
- Breadth: one consent flow plus one settings section.
- Interactivity: shipped-quality forms/actions with loading, error, success, disabled, keyboard, and responsive states.

The shape brief should confirm or refine these defaults, not restart brand exploration from scratch.

## File Structure

Create:

- `apps/api/src/domains/mcp/auth.ts`
  - Validates MCP bearer tokens and converts them into a Ceird MCP session.
- `apps/api/src/domains/mcp/context.ts`
  - Resolves user id, active organization id, organization role, and scope checks for tool handlers.
- `apps/api/src/domains/mcp/server.ts`
  - Creates the xmcp server/handler and wires middleware.
- `apps/api/src/domains/mcp/tools/*.ts`
  - Thin outcome-based tools that call existing domain services.
- `apps/api/src/domains/mcp/tool-result.ts`
  - Shared structured output and domain-error formatting helpers.
- `apps/api/src/domains/mcp/manifest.ts`
  - Enumerates tool coverage and intentionally excluded API operations.
- `apps/api/src/domains/mcp/*.test.ts`
  - Unit tests for auth, scope checks, tool manifests, and tool results.
- `apps/app/src/routes/oauth.consent.tsx`
  - Consent page for OAuth/MCP client authorization.
- `apps/app/src/features/auth/oauth-consent-page.tsx`
  - Consent UI implementation.
- `apps/app/src/features/settings/connected-agents-section.tsx`
  - User settings section for connected MCP clients/tokens.

Modify:

- `apps/api/package.json`
  - Add `xmcp` and Better Auth OAuth/MCP dependencies.
- `apps/api/src/domains/identity/authentication/schema.ts`
  - Add Better Auth OAuth provider tables in our Drizzle style.
- `apps/api/src/domains/identity/authentication/auth.ts`
  - Add OAuth Provider or interim MCP plugin.
- `apps/api/src/domains/identity/authentication/config.ts`
  - Add MCP/OAuth resource, issuer, trusted origin, scope, and consent route config.
- `apps/api/src/server.ts`
  - Mount MCP and well-known discovery endpoints.
- `apps/api/src/worker.ts`
  - Ensure Cloudflare Worker handles MCP routes and discovery.
- `apps/api/drizzle/*`
  - Add generated migration for OAuth tables.
- `apps/app/src/features/settings/user-settings-page.tsx`
  - Add Connected agents section.
- `docs/architecture/auth.md`
  - Document OAuth/MCP auth.
- `docs/architecture/api.md`
  - Document MCP route ownership.
- `docs/architecture/agent-mcp-api.md`
  - Update xmcp recommendation after implementation.

## Task 0: Resolve xmcp Better Auth Compatibility Spike

**Files:**

- Modify: `docs/architecture/agent-mcp-api.md`
- Modify: `docs/superpowers/plans/2026-05-16-better-auth-xmcp-integration.md`

- [ ] **Step 1: Inspect package metadata**

Run:

```bash
npm view xmcp@latest version peerDependencies dependencies exports --json
npm view @xmcp-dev/better-auth@latest version peerDependencies dependencies --json
npm view @better-auth/oauth-provider@latest version peerDependencies dependencies --json
npm view better-auth@latest version --json
```

Expected:

- `xmcp` latest is `0.6.10`.
- `xmcp` depends on `@modelcontextprotocol/sdk` and `jose`, and peers React 19 plus Zod 3 or 4.
- `@xmcp-dev/better-auth` latest is `0.0.11`.
- `@xmcp-dev/better-auth` peers `xmcp@^0.1.9-canary.1` and depends on `better-auth@1.3.4`, Express 4, React 18, and React Router 7.
- `@better-auth/oauth-provider` latest is `1.6.11` and peers `better-auth@^1.6.11`.
- `better-auth` latest is `1.6.11`.

- [ ] **Step 2: Extract the xmcp Better Auth adapter source**

Run:

```bash
rm -rf /tmp/ceird-xmcp-better-auth-spike
mkdir -p /tmp/ceird-xmcp-better-auth-spike
npm pack --silent @xmcp-dev/better-auth@latest --pack-destination /tmp/ceird-xmcp-better-auth-spike
tar -xzf /tmp/ceird-xmcp-better-auth-spike/xmcp-dev-better-auth-0.0.11.tgz -C /tmp/ceird-xmcp-better-auth-spike
```

Expected:

- The tarball extracts to `/tmp/ceird-xmcp-better-auth-spike/package`.
- The package includes `dist/provider.d.ts`, `dist/provider.js`, `dist/types.d.ts`, and bundled `dist/auth-ui` assets.

- [ ] **Step 3: Inspect the adapter API**

Run:

```bash
sed -n '1,220p' /tmp/ceird-xmcp-better-auth-spike/package/dist/provider.d.ts
sed -n '1,260p' /tmp/ceird-xmcp-better-auth-spike/package/dist/provider.js
sed -n '1,220p' /tmp/ceird-xmcp-better-auth-spike/package/dist/types.d.ts
```

Expected:

- `betterAuthProvider(auth: BetterAuthConfig): XmcpMiddleware` is the exported integration point.
- `BetterAuthConfig` requires a `pg` `Pool`, `baseURL`, `secret`, and optional email/password or Google provider config.
- The adapter calls `betterAuth(...)` internally instead of accepting an existing Better Auth instance.
- The adapter installs `mcp({ loginPage: "/auth/sign-in" })`, creates an Express `Router`, handles `/api/auth/*`, `/.well-known/oauth-authorization-server`, and `/mcp`, and serves bundled auth UI.
- There are no hooks for Ceird's existing Better Auth instance, Effect HTTP server, TanStack app login pages, or snake_case Drizzle schema mapping.

- [ ] **Step 4: Record the decision in the architecture guide**

Add this decision to `docs/architecture/agent-mcp-api.md`:

```md
### xmcp Better Auth Adapter Spike

The MCP layer should use `xmcp`, but Ceird should not use
`@xmcp-dev/better-auth@0.0.11` as the primary integration. The adapter creates a
new Better Auth instance from a `pg` pool, installs its own MCP plugin and
Express auth routes, bundles its own sign-in UI, and is pinned to older
`better-auth`, React, and `xmcp` assumptions. Ceird already owns Better Auth,
Drizzle schema mapping, organization membership, and app login routes, so MCP
auth should be implemented as custom xmcp middleware that validates Better Auth
OAuth tokens and resolves a `CeirdMcpSession`.

Use Better Auth OAuth Provider as the token authority after upgrading the app
and API Better Auth packages together to `1.6.11` or newer. Re-check the plugin
schema with the Better Auth CLI before generating the migration.
```

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/agent-mcp-api.md docs/superpowers/plans/2026-05-16-better-auth-xmcp-integration.md
git commit -m "docs: record xmcp better auth spike"
```

## Task 1: Prove Better Auth OAuth Schema Shape

**Files:**

- Modify: `apps/api/src/domains/identity/authentication/schema.ts`
- Test: `apps/api/src/domains/identity/authentication/authentication.test.ts`

- [ ] **Step 1: Inspect Better Auth schema output**

Run:

```bash
pnpm --filter api exec npx @better-auth/cli@latest generate --config src/domains/identity/authentication/auth.ts
```

Expected:

- The command either generates/prints schema requirements for OAuth Provider/MCP or fails because our auth factory is not exported in CLI-discoverable shape.
- Capture the required models and columns from the output or Better Auth docs before editing.

- [ ] **Step 2: Add failing schema export test**

Add a test that asserts the auth schema contains OAuth provider models in Ceird's schema barrel:

```ts
import { describe, expect, it } from "vitest";

import { authSchema } from "./schema.js";

describe("auth OAuth schema", () => {
  it("exports OAuth provider tables for MCP authorization", () => {
    expect(authSchema).toHaveProperty("oauthApplication");
    expect(authSchema).toHaveProperty("oauthAccessToken");
    expect(authSchema).toHaveProperty("oauthConsent");
  });
});
```

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/authentication.test.ts
```

Expected: FAIL because the tables are not exported yet.

- [ ] **Step 3: Add OAuth tables in Drizzle style**

Add Drizzle tables using snake_case physical columns and camelCase TypeScript fields. Match Better Auth model names exactly:

```ts
export const oauthApplication = pgTable("oauth_application", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  metadata: text("metadata"),
  clientId: text("client_id").notNull().unique(),
  clientSecret: text("client_secret"),
  redirectURLs: text("redirect_urls").notNull(),
  type: text("type").notNull(),
  disabled: boolean("disabled"),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const oauthAccessToken = pgTable("oauth_access_token", {
  id: text("id").primaryKey(),
  accessToken: text("access_token").notNull().unique(),
  refreshToken: text("refresh_token").unique(),
  accessTokenExpiresAt: timestamp("access_token_expires_at").notNull(),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  clientId: text("client_id").notNull(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  scopes: text("scopes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const oauthConsent = pgTable("oauth_consent", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  scopes: text("scopes").notNull(),
  consentGiven: boolean("consent_given").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

Also add these tables to `authSchema`.

- [ ] **Step 4: Run schema test**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/authentication.test.ts
```

Expected: PASS for the new schema export test.

- [ ] **Step 5: Generate and inspect migration**

Run:

```bash
pnpm --filter api db:generate
```

Expected:

- A new migration appears under `apps/api/drizzle`.
- The migration creates only OAuth/MCP tables and indexes.
- The migration does not alter existing auth, jobs, sites, or labels tables.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/domains/identity/authentication/schema.ts apps/api/drizzle apps/api/src/domains/identity/authentication/authentication.test.ts
git commit -m "feat: add oauth schema for mcp auth"
```

## Task 2: Configure Better Auth OAuth/MCP Provider

**Files:**

- Modify: `apps/api/src/domains/identity/authentication/auth.ts`
- Modify: `apps/api/src/domains/identity/authentication/config.ts`
- Test: `apps/api/src/domains/identity/authentication/authentication.test.ts`

- [ ] **Step 1: Write failing config test**

Add a test that checks the auth handler exposes OAuth metadata after plugin registration:

```ts
it("serves OAuth authorization metadata for MCP clients", async () => {
  const response = await auth.handler(
    new Request(
      "http://127.0.0.1:3001/api/auth/.well-known/oauth-authorization-server"
    )
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    authorization_endpoint: expect.stringContaining("/api/auth/"),
    token_endpoint: expect.stringContaining("/api/auth/"),
  });
});
```

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/authentication.test.ts
```

Expected: FAIL with 404 or missing metadata.

- [ ] **Step 2: Add OAuth Provider plugin**

Prefer the newer OAuth Provider plugin when compatible with the installed Better Auth version. Configure it with existing app routes:

```ts
import { jwt } from "better-auth/plugins";
import { oauthProvider } from "@better-auth/oauth-provider";

const CEIRD_MCP_SCOPES = ["openid", "profile", "email", "ceird:read", "ceird:write", "ceird:admin"];

plugins: [
  jwt(),
  oauthProvider({
    loginPage: "/login",
    consentPage: "/oauth/consent",
    scopes: CEIRD_MCP_SCOPES,
    allowDynamicClientRegistration: true,
  }),
  organization({ ... }),
]
```

If the package API differs, use Better Auth's interim `mcp({ loginPage: "/login", oidcConfig: { scopes: CEIRD_MCP_SCOPES } })` plugin and record the migration note in `docs/architecture/auth.md`.

- [ ] **Step 3: Add config decoding**

Add config fields:

```ts
readonly mcpResourceUrl: string;
readonly oauthIssuerUrl: string;
readonly oauthConsentPath: "/oauth/consent";
readonly oauthScopes: readonly string[];
```

Decode them from environment with safe local defaults:

```ts
MCP_RESOURCE_URL=https://api.ceird.localhost:1355/mcp
OAUTH_ISSUER_URL=https://api.ceird.localhost:1355/api/auth
```

- [ ] **Step 4: Run auth tests**

Run:

```bash
pnpm --filter api test -- src/domains/identity/authentication/authentication.test.ts
```

Expected: PASS, including metadata route.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/identity/authentication/auth.ts apps/api/src/domains/identity/authentication/config.ts apps/api/src/domains/identity/authentication/authentication.test.ts
git commit -m "feat: configure oauth provider for mcp clients"
```

## Task 3: Add Well-Known Discovery Routes

**Files:**

- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/worker.ts`
- Test: `apps/api/src/server.test.ts`
- Test: `apps/api/src/worker.test.ts`

- [ ] **Step 1: Write failing HTTP tests**

Add tests for:

```ts
GET /.well-known/oauth-authorization-server
GET /.well-known/oauth-protected-resource
```

Expected metadata:

```json
{
  "issuer": "https://.../api/auth",
  "authorization_endpoint": "https://.../api/auth/...",
  "token_endpoint": "https://.../api/auth/...",
  "scopes_supported": [
    "openid",
    "profile",
    "email",
    "ceird:read",
    "ceird:write",
    "ceird:admin"
  ]
}
```

Run:

```bash
pnpm --filter api test -- src/server.test.ts src/worker.test.ts
```

Expected: FAIL because root well-known routes are not mounted.

- [ ] **Step 2: Implement metadata forwarding**

Use Better Auth helpers if available:

```ts
import {
  oAuthDiscoveryMetadata,
  oAuthProtectedResourceMetadata,
} from "better-auth/plugins";
```

Mount root well-known routes that call those handlers with the existing auth instance. If helper exports differ, call the Better Auth `/api/auth/.well-known/*` handlers and return their response from the root path.

- [ ] **Step 3: Expose `WWW-Authenticate` for MCP**

Ensure CORS exposes:

```http
WWW-Authenticate
```

for MCP and auth routes so clients can discover auth metadata from 401 responses.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter api test -- src/server.test.ts src/worker.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/server.ts apps/api/src/worker.ts apps/api/src/server.test.ts apps/api/src/worker.test.ts
git commit -m "feat: expose oauth discovery for mcp"
```

## Task 4: Add xmcp Package And Server Skeleton

**Files:**

- Modify: `apps/api/package.json`
- Create: `apps/api/src/domains/mcp/server.ts`
- Create: `apps/api/src/domains/mcp/server.test.ts`

- [ ] **Step 1: Install dependencies**

Run:

```bash
pnpm --filter api add xmcp zod
```

If xmcp requires a separate Cloudflare adapter package, add it in this task and document the exact package in the commit.

- [ ] **Step 2: Write failing route test**

Add a test that unauthenticated `/mcp` requests return 401 with a Bearer challenge:

```ts
it("requires OAuth bearer auth for MCP requests", async () => {
  const response = await fetchApi(
    new Request("http://127.0.0.1:3001/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    })
  );

  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toContain("Bearer");
});
```

Run:

```bash
pnpm --filter api test -- src/domains/mcp/server.test.ts
```

Expected: FAIL because there is no MCP server.

- [ ] **Step 3: Add server skeleton**

Create `server.ts` with a handler shaped like:

```ts
export async function handleMcpRequest(request: Request): Promise<Response> {
  return new Response(null, {
    status: 401,
    headers: {
      "WWW-Authenticate":
        'Bearer resource_metadata="https://api.ceird.localhost:1355/.well-known/oauth-protected-resource"',
    },
  });
}
```

The next task replaces this with Better Auth token validation and xmcp routing.

- [ ] **Step 4: Mount `/mcp`**

Modify `apps/api/src/server.ts` or the Effect HTTP app boundary so `GET`, `POST`, and `DELETE` under `/mcp` delegate to `handleMcpRequest`.

- [ ] **Step 5: Run route test**

```bash
pnpm --filter api test -- src/domains/mcp/server.test.ts src/server.test.ts
```

Expected: PASS for the 401 challenge.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml apps/api/src/domains/mcp apps/api/src/server.ts
git commit -m "feat: add mcp route skeleton"
```

## Task 5: Add Ceird MCP Auth Middleware

**Files:**

- Create: `apps/api/src/domains/mcp/auth.ts`
- Create: `apps/api/src/domains/mcp/context.ts`
- Test: `apps/api/src/domains/mcp/auth.test.ts`

- [ ] **Step 1: Write failing token validation tests**

Test cases:

```ts
it("rejects missing bearer tokens");
it("rejects tokens without ceird:read for read tools");
it("accepts Better Auth MCP sessions with ceird:read");
it("maps session user id and scopes into CeirdMcpSession");
```

Expected session type:

```ts
export interface CeirdMcpSession {
  readonly userId: string;
  readonly clientId?: string;
  readonly scopes: ReadonlySet<"ceird:read" | "ceird:write" | "ceird:admin">;
}
```

- [ ] **Step 2: Implement auth adapter**

Use the Better Auth in-process helper when MCP runs inside `apps/api`:

```ts
const session = await auth.api.getMcpSession({ headers: request.headers });
```

If using OAuth Provider resource client instead, call the provider's resource-client token validation helper. Convert string scopes into a `ReadonlySet`.

- [ ] **Step 3: Implement scope helpers**

Add:

```ts
export function requireMcpScope(
  session: CeirdMcpSession,
  scope: "ceird:read" | "ceird:write" | "ceird:admin"
): void {
  if (!session.scopes.has(scope)) {
    throw new McpScopeDeniedError(scope);
  }
}
```

- [ ] **Step 4: Run auth tests**

```bash
pnpm --filter api test -- src/domains/mcp/auth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/mcp/auth.ts apps/api/src/domains/mcp/context.ts apps/api/src/domains/mcp/auth.test.ts
git commit -m "feat: validate mcp oauth sessions"
```

## Task 6: Register First xmcp Read Tools

**Files:**

- Create: `apps/api/src/domains/mcp/tools/get-viewer-context.ts`
- Create: `apps/api/src/domains/mcp/tools/list-jobs.ts`
- Create: `apps/api/src/domains/mcp/tools/get-job.ts`
- Create: `apps/api/src/domains/mcp/tool-result.ts`
- Test: `apps/api/src/domains/mcp/tools/read-tools.test.ts`

- [ ] **Step 1: Write failing tool tests**

Cover:

```ts
get_viewer_context returns user, active organization, and role.
list_jobs returns paginated structuredContent.
get_job returns detail structuredContent.
read tools require ceird:read.
```

- [ ] **Step 2: Add shared result helper**

```ts
export function mcpStructuredResult<T>(summary: string, data: T) {
  return {
    content: [{ type: "text" as const, text: summary }],
    structuredContent: data,
  };
}
```

- [ ] **Step 3: Implement `get_viewer_context`**

Tool metadata:

```ts
export const metadata = {
  name: "get_viewer_context",
  description:
    "Return the current Ceird user, active organization, organization role, and granted MCP scopes.",
  annotations: {
    title: "Get viewer context",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
};
```

- [ ] **Step 4: Implement `list_jobs` and `get_job`**

Use existing jobs service or HttpApi client internals, not raw SQL. Inputs mirror `JobListQuerySchema` and `WorkItemId`.

- [ ] **Step 5: Wire tools into xmcp server**

Register these tools through xmcp's tool loading convention or explicit server registration, depending on which shape compiles best in `apps/api`.

- [ ] **Step 6: Run tests**

```bash
pnpm --filter api test -- src/domains/mcp/tools/read-tools.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/domains/mcp
git commit -m "feat: expose first mcp read tools"
```

## Task 7: Add Low-Risk Write Tools

**Files:**

- Create: `apps/api/src/domains/mcp/tools/create-service-area.ts`
- Create: `apps/api/src/domains/mcp/tools/create-site.ts`
- Create: `apps/api/src/domains/mcp/tools/create-label.ts`
- Create: `apps/api/src/domains/mcp/tools/create-job.ts`
- Create: `apps/api/src/domains/mcp/tools/add-job-comment.ts`
- Test: `apps/api/src/domains/mcp/tools/write-tools.test.ts`

- [ ] **Step 1: Write failing write-tool tests**

Cover:

```ts
write tools reject ceird:read-only sessions.
create_service_area creates an organization-scoped service area.
create_site geocodes and returns map-ready coordinates.
create_label creates a label.
create_job creates a job with existing site and inline contact.
add_job_comment records a comment.
```

- [ ] **Step 2: Implement tools with annotations**

Use:

```ts
annotations: {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
}
```

- [ ] **Step 3: Map domain errors**

Return stable structured errors:

```ts
{
  error: {
    tag: "_tag",
    message: "Human-readable message",
    retryable: false
  }
}
```

- [ ] **Step 4: Run write-tool tests**

```bash
pnpm --filter api test -- src/domains/mcp/tools/write-tools.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/mcp/tools apps/api/src/domains/mcp/tool-result.ts
git commit -m "feat: add mcp write tools for field data"
```

## Task 8: Add Admin Tools After Scope Tests

**Files:**

- Create: `apps/api/src/domains/mcp/tools/invite-member.ts`
- Create: `apps/api/src/domains/mcp/tools/update-member-role.ts`
- Create: `apps/api/src/domains/mcp/tools/remove-member.ts`
- Test: `apps/api/src/domains/mcp/tools/admin-tools.test.ts`

- [ ] **Step 1: Write failing admin tests**

Cover:

```ts
admin tools require ceird:admin.
admin tools still enforce organization owner/admin role.
invite_member accepts admin/member/external roles only.
remove_member is marked destructive.
```

- [ ] **Step 2: Implement Better Auth organization wrappers**

Call Better Auth organization APIs through the existing auth instance or app-owned server helper. Do not bypass Better Auth hooks.

- [ ] **Step 3: Add destructive annotations**

For `remove_member`:

```ts
annotations: {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
}
```

- [ ] **Step 4: Run admin tests**

```bash
pnpm --filter api test -- src/domains/mcp/tools/admin-tools.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/mcp/tools apps/api/src/domains/mcp/tools/admin-tools.test.ts
git commit -m "feat: expose mcp admin tools"
```

## Task 9: Build OAuth Consent UI

**Files:**

- Create: `apps/app/src/routes/oauth.consent.tsx`
- Create: `apps/app/src/features/auth/oauth-consent-page.tsx`
- Create: `apps/app/src/features/auth/oauth-consent-page.test.tsx`
- Modify: `docs/architecture/frontend.md`

- [ ] **Step 1: Run Impeccable shape for the consent flow**

Load Impeccable context and references:

```bash
node .agents/skills/impeccable/scripts/load-context.mjs
sed -n '1,240p' .agents/skills/impeccable/reference/product.md
sed -n '1,260p' .agents/skills/impeccable/reference/shape.md
```

Write a compact design brief for `/oauth/consent` covering:

- primary action: understand requested agent access, then allow or deny
- active organization and user context
- client name, client metadata, requested scopes, and risk level
- default, unauthenticated redirect, loading, denied, error, success, and expired/invalid request states
- keyboard flow, focus return, and mobile layout
- exact copy for scope descriptions and destructive/admin warnings

Stop and get explicit approval before implementing.

- [ ] **Step 2: Write failing UI tests**

Test:

```ts
it("shows the MCP client name and requested scopes");
it("submits allow and deny actions to Better Auth");
it("redirects unauthenticated users through existing login");
```

- [ ] **Step 3: Implement consent route from the approved shape brief**

The route reads Better Auth OAuth consent query params and renders:

- client name
- requested scopes with Ceird-specific descriptions
- Allow button
- Deny button

Scope copy:

```ts
const SCOPE_LABELS = {
  "ceird:read":
    "Read organizations, members, jobs, sites, labels, rate cards, and activity",
  "ceird:write":
    "Create and update jobs, sites, labels, service areas, rate cards, comments, visits, and costs",
  "ceird:admin":
    "Manage invitations, member roles, member removal, and collaborator grants",
};
```

- [ ] **Step 4: Wire to Better Auth consent action**

Use the OAuth Provider client plugin if available. If Better Auth exposes only form POST endpoints, post to the provider's consent endpoint with the original query parameters and selected decision.

- [ ] **Step 5: Run UI tests**

```bash
pnpm --filter app test -- src/features/auth/oauth-consent-page.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/routes/oauth.consent.tsx apps/app/src/features/auth/oauth-consent-page.tsx apps/app/src/features/auth/oauth-consent-page.test.tsx docs/architecture/frontend.md
git commit -m "feat: add oauth consent page"
```

## Task 10: Add Connected Agents Settings UI

**Files:**

- Create: `apps/app/src/features/settings/connected-agents-section.tsx`
- Modify: `apps/app/src/features/settings/user-settings-page.tsx`
- Test: `apps/app/src/features/settings/connected-agents-section.test.tsx`

- [ ] **Step 1: Run Impeccable shape for connected agents settings**

Load Impeccable context and references:

```bash
node .agents/skills/impeccable/scripts/load-context.mjs
sed -n '1,240p' .agents/skills/impeccable/reference/product.md
sed -n '1,260p' .agents/skills/impeccable/reference/shape.md
```

Write a compact design brief for the settings section covering:

- primary action: review connected MCP clients and revoke access
- placement inside existing user settings
- empty, loading, loaded, revoke-confirming, revoked, error, and long-client-name states
- scope display, last-used/created metadata, and client identity confidence
- whether revoke needs inline confirmation, popover confirmation, or an explicit destructive button state
- responsive behavior and keyboard access

Stop and get explicit approval before implementing.

- [ ] **Step 2: Write failing settings tests**

Cover:

```ts
it("lists connected OAuth MCP clients");
it("shows granted scopes");
it("revokes a client authorization");
it("shows an empty state when no agents are connected");
```

- [ ] **Step 3: Add settings section from the approved shape brief**

Display:

- client name
- created/authorized date
- scopes
- revoke button

- [ ] **Step 4: Wire revoke action**

Use Better Auth OAuth Provider endpoints for token/client consent revocation. Do not delete rows directly from the app.

- [ ] **Step 5: Run settings tests**

```bash
pnpm --filter app test -- src/features/settings/connected-agents-section.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/features/settings apps/app/src/features/settings/user-settings-page.tsx
git commit -m "feat: show connected mcp agents"
```

## Task 11: Add MCP End-To-End Validation

**Files:**

- Create: `apps/api/src/domains/mcp/mcp.integration.test.ts`
- Create: `apps/app/e2e/mcp-auth.test.ts`
- Modify: `docs/architecture/agent-mcp-api.md`

- [ ] **Step 1: Add API integration test**

Create a test that:

1. Creates a user and organization.
2. Issues or simulates an OAuth MCP token with `ceird:read ceird:write`.
3. Calls MCP tools:
   - `get_viewer_context`
   - `create_service_area`
   - `create_site`
   - `create_label`
   - `create_job`
   - `add_job_comment`
   - `list_activity`

Expected: all tools return valid `structuredContent`.

- [ ] **Step 2: Add browser parity e2e**

Use sandbox:

```bash
pnpm sandbox:up
PLAYWRIGHT_USE_EXTERNAL_SERVER=1 pnpm --filter app e2e -- mcp-auth.test.ts
```

The e2e should create data through MCP, then verify the app displays it in:

- jobs list
- jobs map
- sites directory
- activity timeline

- [ ] **Step 3: Update architecture doc**

Record the final xmcp decision, auth plugin decision, UI support, and validation commands in `docs/architecture/agent-mcp-api.md`.

- [ ] **Step 4: Run broad checks**

```bash
pnpm --filter api test
pnpm --filter app test
pnpm check-types
pnpm format
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domains/mcp apps/app/e2e/mcp-auth.test.ts docs/architecture/agent-mcp-api.md
git commit -m "test: validate mcp auth and app parity"
```

## Spike Results And Remaining Confirmations

Resolved by Task 0:

- `xmcp` remains the preferred MCP framework because it gives Ceird file-based tools, middleware, structured outputs, HTTP transport, and Cloudflare-compatible deployment shape.
- `@xmcp-dev/better-auth@0.0.11` is not the primary auth path because it depends on `better-auth@1.3.4`, Express 4, React 18, and `xmcp@^0.1.9-canary.1`; creates its own Better Auth instance; serves its own auth UI; and does not expose hooks for our existing auth tables.
- Ceird should build custom xmcp middleware against its own Better Auth instance.
- Better Auth OAuth Provider currently requires `better-auth@^1.6.11`, so upgrade API and app Better Auth packages together before adding OAuth Provider tables.

Remaining during implementation:

- Confirm the exact OAuth Provider table shape with Better Auth CLI output or current primary docs after the package upgrade.
- Confirm whether the `xmcp` handler mounts cleanly inside the existing Effect HTTP server or should be served from a sibling Worker route while sharing the same API package and auth database. This is a transport integration choice, not an auth compatibility spike.

## Self-Review

Spec coverage:

- Better Auth OAuth/MCP support: Tasks 1-3.
- Better Auth/xmcp compatibility spike: Task 0.
- xmcp integration: Tasks 0 and 4-8.
- UI needs: Tasks 9-10.
- Validation/proof: Task 11.
- Existing auth tables preserved: Tasks 0-2 require Drizzle-style schema, no xmcp-generated auth UI, and no xmcp canned SQL.

Placeholder scan:

- No task depends on an unnamed future file.
- Remaining confirmations are bounded implementation checks, not missing implementation instructions.

Type consistency:

- MCP scope names are consistently `ceird:read`, `ceird:write`, and `ceird:admin`.
- Session type is consistently `CeirdMcpSession`.
- OAuth/MCP UI route is consistently `/oauth/consent`.

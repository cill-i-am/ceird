# Global Agent Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an unobtrusive app-level Ceird Agent chat that can be opened from anywhere in the authenticated app, connects to the org/user/thread-scoped Cloudflare Agent, and is covered by focused app tests plus Playwright E2E.

**Architecture:** The browser app owns only thread selection, Agent Worker connection, and chat UI. Domain remains the source of truth for thread creation/authorization and the Agent Worker remains the execution runtime over the completed action registry. The authenticated shell mounts one global launcher/drawer so jobs, sites, members, labels, and future action surfaces all share the same entry point.

**Tech Stack:** TanStack Start, React 19, existing shadcn-style primitives, app hotkey layer, `@ceird/agents-core`, `agents/react`, `@cloudflare/ai-chat/react`, Cloudflare Agent Worker, Playwright.

---

### Task 1: App Agent API Boundary

**Files:**

- Modify: `apps/app/package.json`
- Modify: `apps/app/src/features/api/app-api-client.ts`
- Create: `apps/app/src/features/agent/agent-client.ts`
- Test: `apps/app/src/features/agent/agent-client.test.ts`

- [x] **Step 1: Write the failing client tests**

Test that the app API client exposes agent thread endpoints and that `ensureCurrentAgentThread()` lists existing threads before creating one.

Run: `pnpm --filter app test -- src/features/agent/agent-client.test.ts`

Expected: FAIL because `features/agent/agent-client.ts` does not exist yet.

- [x] **Step 2: Add `@ceird/agents-core` to the app package and the composed Effect API**

Import `AgentThreadsApiGroup` and `AgentActionsApiGroup` in `features/api/app-api-client.ts`, then add both groups to `CeirdApi`.

- [x] **Step 3: Implement browser helpers**

Create `features/agent/agent-client.ts` with:

- `listCurrentAgentThreads()`
- `createCurrentAgentThread(title?)`
- `authorizeCurrentAgentThread(threadId)`
- `ensureCurrentAgentThread()`

All helpers use `runBrowserAppApiRequest(...)`, shared schemas from `@ceird/agents-core`, and no local duplicated DTOs.

- [x] **Step 4: Verify narrow tests**

Run: `pnpm --filter app test -- src/features/agent/agent-client.test.ts src/features/api/app-api-client.test.ts`

Expected: PASS.

### Task 2: Agent Origin Runtime Contract

**Files:**

- Modify: `apps/app/infra/cloudflare-vite.ts`
- Modify: `apps/app/src/cloudflare-env.d.ts`
- Modify: `apps/app/src/lib/api-origin.test.ts` or create `apps/app/src/lib/agent-origin.test.ts`
- Create: `apps/app/src/lib/agent-origin.ts`
- Modify: `infra/cloudflare-stack.ts`
- Modify: `infra/cloudflare-stack.test.ts`
- Modify: `apps/app/playwright.config.ts`
- Modify: `apps/app/e2e/test-origins.ts`

- [x] **Step 1: Write the failing origin tests**

Test that `resolveAgentHost("https://agent.example.com")` returns `agent.example.com`, that local origins are handled, and that missing configured origin falls back to the browser origin only in local tests.

Run: `pnpm --filter app test -- src/lib/agent-origin.test.ts`

Expected: FAIL because `agent-origin.ts` does not exist yet.

- [x] **Step 2: Pass Agent Worker origin into the app Worker**

Add `AGENT_ORIGIN` and `VITE_AGENT_ORIGIN` to the app Worker env, update `CloudflareEnv`, and pass `agentOrigin` from root `infra/cloudflare-stack.ts` into `makeAppWorker(...)`.

- [x] **Step 3: Update infra contract tests**

Update `infra/cloudflare-stack.test.ts` to assert the app env includes API and Agent origins.

- [x] **Step 4: Verify infra contracts**

Run: `pnpm run check-types:infra && pnpm run test:infra -- cloudflare-stack.test.ts`

Expected: PASS.

### Task 3: Global Agent Chat Drawer

**Files:**

- Create: `apps/app/src/features/agent/global-agent-chat.tsx`
- Create: `apps/app/src/features/agent/global-agent-chat.test.tsx`
- Modify: `apps/app/src/components/app-layout.tsx`
- Modify: `apps/app/src/components/app-layout.test.tsx`
- Modify: `apps/app/src/hotkeys/hotkey-registry.ts`
- Modify: `apps/app/src/features/command-bar/app-global-command-actions.tsx`
- Modify: `apps/app/src/features/command-bar/app-global-command-actions.test.tsx`

- [x] **Step 1: Write failing UI tests**

Cover:

- the app shell renders one global Ceird Agent launcher when an active organization exists
- `Mod+J` opens the drawer
- command bar exposes "Open Ceird Agent"
- opening the drawer calls `ensureCurrentAgentThread()`
- submitted prompt appears in the composer flow

Run: `pnpm --filter app test -- src/features/agent/global-agent-chat.test.tsx src/components/app-layout.test.tsx src/features/command-bar/app-global-command-actions.test.tsx`

Expected: FAIL because the global component and command action do not exist yet.

- [x] **Step 2: Implement launcher and responsive drawer**

Mount `GlobalAgentChat` inside `AppLayout`, after the `Outlet`, and hide it when there is no active organization. Use the existing `ResponsiveDrawer` with right-side desktop and bottom mobile behavior.

- [x] **Step 3: Wire Cloudflare Agent chat**

Use `useAgent({ agent: "CeirdAgent", name: thread.agentInstanceName, host, query })` and `useAgentChat({ agent })`. The query calls `authorizeCurrentAgentThread(thread.id)` and supplies `{ token }`. Render text message parts, compact tool status rows, loading/error states, and a bottom composer.

- [x] **Step 4: Add hotkeys and command action**

Add `openAgentChat` as `Mod+J` and `agentSubmit` as `Mod+Enter`. Register "Open Ceird Agent" in the global command bar and have both the visible launcher and command action use the same custom event to open the drawer.

- [x] **Step 5: Verify narrow UI tests**

Run: `pnpm --filter app test -- src/features/agent/global-agent-chat.test.tsx src/components/app-layout.test.tsx src/features/command-bar/app-global-command-actions.test.tsx src/hotkeys/hotkey-display.test.tsx`

Expected: PASS.

### Task 4: E2E Coverage

**Files:**

- Create: `apps/app/e2e/global-agent-chat.test.ts`
- Create: `apps/app/e2e/pages/global-agent-chat.ts`
- Modify: `apps/app/playwright.config.ts`
- Modify: `apps/app/e2e/test-origins.ts`

- [x] **Step 1: Write failing Playwright test**

Cover an authenticated org user opening the app-level agent from `/jobs`, verify the drawer opens without route changes, mock the agent thread HTTP endpoints and Agent Worker websocket URL, and assert the composer sends through the global chat surface.

Run: `PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1 pnpm --filter app e2e -- global-agent-chat.test.ts`

Expected: FAIL until the UI and env hooks exist.

- [x] **Step 2: Implement page object and route mocks**

Use existing signup/onboarding helpers and Playwright `page.route(...)` for `/agent/threads`, `/agent/threads/:id/authorize`, and Agent Worker websocket URL construction checks. Keep the test focused on app wiring, not model output.

- [x] **Step 3: Verify E2E**

Run: `PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1 pnpm --filter app e2e -- global-agent-chat.test.ts`

Expected: PASS.

### Task 5: Docs And Broad Verification

**Files:**

- Modify: `docs/architecture/frontend.md`
- Modify: `docs/architecture/api.md`
- Modify: `docs/architecture/local-development-and-infra.md`

- [x] **Step 1: Update architecture docs**

Document the app-level agent entry point, Agent Worker origin env, thread authorization flow, and E2E expectations.

- [x] **Step 2: Run focused package checks**

Run:

- `pnpm --filter app check-types`
- `pnpm --filter app test`
- `pnpm --filter app e2e -- global-agent-chat.test.ts`
- `pnpm run check-types:infra`
- `pnpm run test:infra -- cloudflare-stack.test.ts`

Expected: PASS.

- [x] **Step 3: Run handoff checks**

Run:

- `pnpm check-types`
- `pnpm lint`
- `pnpm format`
- `pnpm test`

Expected: PASS, with any pre-existing noisy test warnings noted separately from failures.

Actual: `pnpm check-types`, `pnpm lint`, and `pnpm format` pass. `pnpm test`
was run and fails in the pre-existing domain integration suite outside this
chat change: `authentication.integration.test.ts` loses
`BETTER_AUTH_BASE_URL` in the full-file run, and `http.integration.test.ts`
has existing auth rate-limit / service-area response issues. The focused app,
infra, and global-agent-chat E2E proof all pass.

---

## Self-Review

**Spec coverage:** The plan covers app-level access from anywhere, unobtrusive drawer UX, backend registry usage, Cloudflare Agent Worker connection, command/hotkey discoverability, and E2E proof.

**Placeholder scan:** No implementation placeholder is left as a product requirement. Each task names files, expected tests, and behavior to implement.

**Type consistency:** Agent DTOs remain owned by `@ceird/agents-core`; app-only runtime origin helpers stay in `apps/app/src/lib`; chat UI state stays feature-local.

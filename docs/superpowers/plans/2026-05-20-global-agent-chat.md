# Global Agent Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a global app-level “Ask Ceird” chat drawer that can connect to org/user/thread-scoped Cloudflare Agent instances, show tool/result/approval UI, and stay available from anywhere in the authenticated app.

**Architecture:** The authenticated app shell owns one unobtrusive global agent entry point. The `/_app/_org` boundary provides active org, current user, thread list, and authorization. The chat drawer uses Cloudflare `useAgent` plus `@cloudflare/ai-chat/react`, while UI pieces are composed from existing Ceird shadcn/base components and selected AI Elements registry components.

**Tech Stack:** TanStack Start, React 19, Effect HttpApi client, `@ceird/agents-core`, Cloudflare Agents SDK client hooks, AI SDK/AI Elements, shadcn/base-luma, Hugeicons, existing hotkey and command-bar layers.

---

## Dependency

This plan assumes the backend action registry plan has either landed or that this client is initially wired to the current limited action set.

The client can start with read-only chat before backend registry expansion is complete, but approval cards for write/destructive actions should not ship until the action manifest endpoint exists.

## File Structure

- Modify: `apps/app/package.json`
  - Add `@cloudflare/ai-chat`, `agents`, `@ai-sdk/react`, and `ai` if not already available to `apps/app`.
- Modify: `apps/app/src/features/api/app-api-client.ts`
  - Add `AgentThreadsApiGroup` and action manifest group from `@ceird/agents-core`.
- Create: `apps/app/src/features/agents/agent-api.ts`
  - Browser/server helpers for threads, authorization, and manifest.
- Create: `apps/app/src/features/agents/agent-provider.tsx`
  - Org-scoped state provider for active thread, drawer state, context attachments, and thread mutations.
- Create: `apps/app/src/features/agents/agent-drawer.tsx`
  - Desktop right drawer and mobile bottom drawer shell.
- Create: `apps/app/src/features/agents/agent-chat.tsx`
  - Cloudflare agent connection and `useAgentChat` integration.
- Create: `apps/app/src/features/agents/agent-message-list.tsx`
  - Message rendering, empty state, streaming state, tool cards.
- Create: `apps/app/src/features/agents/agent-composer.tsx`
  - Prompt input and send/stop controls.
- Create: `apps/app/src/features/agents/agent-action-card.tsx`
  - Tool result and approval card rendering from manifest metadata.
- Create: `apps/app/src/features/agents/agent-context.ts`
  - Context attachment types for route, page, selected job/site, filters, and open detail drawer.
- Modify: `apps/app/src/routes/_app._org.tsx`
  - Install the provider at the org boundary.
- Modify: `apps/app/src/components/site-header.tsx`
  - Add the unobtrusive global “Ask Ceird” trigger.
- Modify: `apps/app/src/features/command-bar/app-global-command-actions.tsx`
  - Register global command bar entries.
- Modify: `apps/app/src/hotkeys/hotkey-registry.ts`
  - Add a global hotkey for opening Ask Ceird.
- Modify: `docs/architecture/system-overview.md`
  - Document the client chat topology.

## Task 1: Add Client Dependencies And API Contract

**Files:**

- Modify: `apps/app/package.json`
- Modify: `apps/app/src/features/api/app-api-client.ts`
- Create: `apps/app/src/features/agents/agent-api.ts`
- Test: `apps/app/src/features/agents/agent-api.test.ts`

- [ ] **Step 1: Add dependencies**

Run:

```bash
pnpm --filter app add @ai-sdk/react @cloudflare/ai-chat agents ai
```

Expected: `apps/app/package.json` and `pnpm-lock.yaml` update.

- [ ] **Step 2: Add agent groups to the app API client**

In `apps/app/src/features/api/app-api-client.ts`, extend `CeirdApi`:

```ts
import { AgentActionsApiGroup, AgentThreadsApiGroup } from "@ceird/agents-core";

const CeirdApi = HttpApi.make("CeirdApi")
  .add(JobsApiGroup)
  .add(RateCardsApiGroup)
  .add(LabelsApiGroup)
  .add(ServiceAreasApiGroup)
  .add(SitesApiGroup)
  .add(AgentThreadsApiGroup)
  .add(AgentActionsApiGroup);
```

If the backend manifest group is not yet available, add only `AgentThreadsApiGroup` and leave the manifest task blocked on the backend plan.

- [ ] **Step 3: Write API helper tests**

Create tests that mock `runBrowserAppApiRequest` and assert helpers call:

- `agentThreads.listAgentThreads`
- `agentThreads.createAgentThread`
- `agentThreads.authorizeAgentConnect`
- `agentActions.listAgentActions`

Run: `pnpm --filter app test -- src/features/agents/agent-api.test.ts`

Expected: FAIL because helpers do not exist.

- [ ] **Step 4: Implement `agent-api.ts`**

Create helpers:

```ts
export function listAgentThreads() {
  return runBrowserAppApiRequest("Agents.listThreads", (client) =>
    client.agentThreads.listAgentThreads({ urlParams: {} })
  );
}

export function createAgentThread(input: CreateAgentThreadInput) {
  return runBrowserAppApiRequest("Agents.createThread", (client) =>
    client.agentThreads.createAgentThread({ payload: input })
  );
}

export function authorizeAgentConnect(threadId: AgentThreadId) {
  return runBrowserAppApiRequest("Agents.authorizeConnect", (client) =>
    client.agentThreads.authorizeAgentConnect({ path: { threadId } })
  );
}
```

- [ ] **Step 5: Run app tests**

Run: `pnpm --filter app test -- src/features/agents/agent-api.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/app/package.json apps/app/src/features/api/app-api-client.ts apps/app/src/features/agents pnpm-lock.yaml
git commit -m "feat: add app agent API client"
```

## Task 2: Add Global Agent Provider At The Org Boundary

**Files:**

- Create: `apps/app/src/features/agents/agent-provider.tsx`
- Create: `apps/app/src/features/agents/agent-context.ts`
- Modify: `apps/app/src/routes/_app._org.tsx`
- Test: `apps/app/src/features/agents/agent-provider.test.tsx`

- [ ] **Step 1: Write provider tests**

Test that:

```ts
expect(screen.getByRole("button", { name: /ask ceird/i })).toBeInTheDocument();
await user.click(screen.getByRole("button", { name: /ask ceird/i }));
expect(screen.getByRole("dialog", { name: /ask ceird/i })).toBeInTheDocument();
```

Also test that provider resets when `activeOrganizationId` changes.

Run: `pnpm --filter app test -- src/features/agents/agent-provider.test.tsx`

Expected: FAIL because the provider does not exist.

- [ ] **Step 2: Define context attachment types**

Create:

```ts
export type AgentContextAttachment =
  | { type: "route"; pathname: string; search: string }
  | { type: "job"; workItemId: string; title?: string }
  | { type: "site"; siteId: string; name?: string }
  | { type: "filters"; label: string; value: unknown };
```

- [ ] **Step 3: Implement provider state**

Provider responsibilities:

- drawer open state
- active thread id
- thread list state
- connect authorization state
- context attachments
- `openAgent()`
- `openAgentWithContext(attachments)`
- `createThread(title?)`
- `archiveThread(threadId)`

Use existing app patterns: typed React context, `useMemo`, `useCallback`, no ad hoc global stores.

- [ ] **Step 4: Install provider**

In `apps/app/src/routes/_app._org.tsx`:

```tsx
<AgentProvider
  activeOrganizationId={activeOrganizationId}
  currentUserId={currentUserId}
>
  <OrganizationActiveSyncBoundary
    activeOrganizationSync={activeOrganizationSync}
  >
    ...
  </OrganizationActiveSyncBoundary>
</AgentProvider>
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter app test -- src/features/agents/agent-provider.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/features/agents apps/app/src/routes/_app._org.tsx
git commit -m "feat: add global agent provider"
```

## Task 3: Install And Adapt AI Elements Components

**Files:**

- Modify/Create via shadcn CLI under `apps/app/src/components/ai-elements` or `apps/app/src/components/ui`, depending on registry output.
- Modify generated files to use `#` aliases, base primitives, semantic tokens, and Hugeicons.

- [ ] **Step 1: Inspect registry components**

Run:

```bash
pnpm dlx shadcn@latest view @ai-elements/conversation -c apps/app
pnpm dlx shadcn@latest view @ai-elements/message -c apps/app
pnpm dlx shadcn@latest view @ai-elements/prompt-input -c apps/app
pnpm dlx shadcn@latest view @ai-elements/tool -c apps/app
pnpm dlx shadcn@latest view @ai-elements/confirmation -c apps/app
```

Expected: component definitions render without changing the worktree.

- [ ] **Step 2: Add the initial components**

Run:

```bash
pnpm dlx shadcn@latest add @ai-elements/conversation @ai-elements/message @ai-elements/prompt-input @ai-elements/tool @ai-elements/confirmation -c apps/app
```

Expected: source files are added to the app.

- [ ] **Step 3: Review generated files**

Read every added file and fix:

- hardcoded `@/` imports to `#`
- lucide icons to Hugeicons or existing project icons
- raw color classes to semantic tokens
- `space-y-*` or `space-x-*` to flex `gap-*`
- missing accessible titles on overlays
- component names that collide with existing UI exports

- [ ] **Step 4: Run focused checks**

Run:

```bash
pnpm --filter app check-types
pnpm --filter app test -- src/components
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/components apps/app/components.json apps/app/package.json pnpm-lock.yaml
git commit -m "feat: add AI chat UI primitives"
```

## Task 4: Build The Global Drawer Shell

**Files:**

- Create: `apps/app/src/features/agents/agent-drawer.tsx`
- Modify: `apps/app/src/components/site-header.tsx`
- Modify: `apps/app/src/hotkeys/hotkey-registry.ts`
- Modify: `apps/app/src/features/command-bar/app-global-command-actions.tsx`
- Test: `apps/app/src/features/agents/agent-drawer.test.tsx`
- Test: `apps/app/src/components/site-header.test.tsx`
- Test: `apps/app/src/features/command-bar/app-global-command-actions.test.tsx`

- [ ] **Step 1: Write drawer and trigger tests**

Assert:

- top-level trigger appears in app shell
- trigger opens a dialog named `Ask Ceird`
- mobile uses bottom drawer behavior through existing responsive drawer primitives
- command action opens the same drawer
- hotkey does not fire while typing in inputs

Run:

```bash
pnpm --filter app test -- src/features/agents/agent-drawer.test.tsx src/components/site-header.test.tsx src/features/command-bar/app-global-command-actions.test.tsx
```

Expected: FAIL.

- [ ] **Step 2: Add hotkey**

In `hotkey-registry.ts`, add:

```ts
openAgent: {
  group: "Layout",
  hotkey: "Mod+J",
  id: "openAgent",
  label: "Ask Ceird",
  scope: "global",
}
```

If `Mod+J` conflicts in practice, choose another global chord before implementation.

- [ ] **Step 3: Build drawer shell**

Use existing `ResponsiveDrawer`, `DrawerTitle`, `DrawerDescription`, `Button`, `Tooltip`, `ShortcutHint`, and `Separator`. The shell needs:

- header with title, active org context, thread menu
- context chip row
- scrollable message area
- composer footer

- [ ] **Step 4: Add app-level trigger**

Place a compact icon button in `SiteHeader`, near existing layout controls, with tooltip:

```tsx
<TooltipContent>
  <span>Ask Ceird</span>
  <ShortcutHint
    hotkey={HOTKEYS.openAgent.hotkey}
    label={HOTKEYS.openAgent.label}
  />
</TooltipContent>
```

- [ ] **Step 5: Register command actions**

Add command actions:

- `Ask Ceird`
- `Ask about this page`
- `New agent thread`

- [ ] **Step 6: Run tests**

Run focused tests from Step 1.

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/app/src/features/agents apps/app/src/components/site-header.tsx apps/app/src/hotkeys/hotkey-registry.ts apps/app/src/features/command-bar
git commit -m "feat: add global Ask Ceird drawer"
```

## Task 5: Connect Chat To Cloudflare Agent Threads

**Files:**

- Create: `apps/app/src/features/agents/agent-chat.tsx`
- Create: `apps/app/src/features/agents/agent-message-list.tsx`
- Create: `apps/app/src/features/agents/agent-composer.tsx`
- Modify: `apps/app/src/features/agents/agent-drawer.tsx`
- Test: `apps/app/src/features/agents/agent-chat.test.tsx`

- [ ] **Step 1: Write chat integration tests**

Mock `useAgent` and `useAgentChat`, then assert:

```ts
expect(useAgent).toHaveBeenCalledWith(
  expect.objectContaining({
    agent: "CeirdAgent",
    name: expect.stringContaining("org:"),
    query: expect.any(Function),
  })
);
```

Assert sent messages include context attachments in the body.

Run: `pnpm --filter app test -- src/features/agents/agent-chat.test.tsx`

Expected: FAIL.

- [ ] **Step 2: Implement connection**

Use:

```tsx
const agent = useAgent({
  agent: "CeirdAgent",
  name: authorization.agentInstanceName,
  query: async () => ({ token: authorization.token }),
  queryDeps: [authorization.token],
  cacheTtl: 30_000,
});

const chat = useAgentChat({
  agent,
  body: () => ({
    context: attachments,
  }),
});
```

- [ ] **Step 3: Render messages**

Render text parts, tool parts, streaming state, and empty state. Avoid exposing raw JSON unless the part is unknown and useful for development behind a debug guard.

- [ ] **Step 4: Implement composer**

Use AI Elements prompt input with:

- multiline input
- send button
- stop button when streaming
- disabled state while no thread authorization exists
- placeholder: `Ask Ceird to find, create, update, or organize work...`

- [ ] **Step 5: Run tests**

Run: `pnpm --filter app test -- src/features/agents/agent-chat.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/features/agents
git commit -m "feat: connect Ask Ceird chat"
```

## Task 6: Add Tool Cards And Approval UI

**Files:**

- Create: `apps/app/src/features/agents/agent-action-card.tsx`
- Modify: `apps/app/src/features/agents/agent-message-list.tsx`
- Test: `apps/app/src/features/agents/agent-action-card.test.tsx`

- [ ] **Step 1: Write approval card tests**

Assert:

- read tool renders as compact result card
- write action renders confirmation card
- destructive action uses stronger copy and requires explicit approve button
- approve calls `addToolApprovalResponse({ id, approved: true })`
- reject calls `addToolApprovalResponse({ id, approved: false })`

Run: `pnpm --filter app test -- src/features/agents/agent-action-card.test.tsx`

Expected: FAIL.

- [ ] **Step 2: Implement action card**

Input:

```ts
interface AgentActionCardProps {
  readonly manifest: AgentActionManifestResponse;
  readonly part: UIMessage["parts"][number];
  readonly onApprove: (id: string) => void;
  readonly onReject: (id: string) => void;
}
```

Use AI Elements `Tool` and `Confirmation` primitives, adapted to Ceird tokens.

- [ ] **Step 3: Ensure exact confirmation copy**

Cards must show:

- action label
- target object when available
- active organization
- actor role if relevant
- generated input summary
- clear approve/reject controls

- [ ] **Step 4: Keep mutations disabled without approval**

If the backend manifest is unavailable, render a non-actionable tool state and keep mutation tools disabled at infra/env level.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter app test -- src/features/agents/agent-action-card.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/features/agents
git commit -m "feat: add agent action approval cards"
```

## Task 7: Add Context Attachments From App Surfaces

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-route-content.tsx`
- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.tsx`
- Modify: `apps/app/src/features/sites/sites-route-content.tsx`
- Modify: `apps/app/src/features/sites/sites-detail-sheet.tsx`
- Modify: `apps/app/src/features/agents/agent-context.ts`
- Test: jobs/sites route tests.

- [ ] **Step 1: Write context tests**

Assert command actions exist:

- `Ask about this job`
- `Ask about this site`
- `Ask about current filters`

Run relevant jobs/sites tests.

Expected: FAIL.

- [ ] **Step 2: Add context registration helpers**

Expose:

```ts
useAgentContextAttachment(attachment);
useOpenAgentWithContext();
```

These should register context while a route/detail drawer is mounted and remove it on unmount.

- [ ] **Step 3: Wire jobs and sites**

Jobs page attaches route/filter context. Job detail drawer attaches selected job id/title. Sites page attaches route/filter context. Site detail drawer attaches selected site id/name.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter app test -- src/features/jobs src/features/sites src/features/agents
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/features
git commit -m "feat: attach page context to Ask Ceird"
```

## Task 8: Verify In Browser And Document

**Files:**

- Modify: `docs/architecture/system-overview.md`
- Modify: `docs/architecture/api.md`

- [ ] **Step 1: Update architecture docs**

Document:

- global entry points
- thread lifecycle
- connect-token flow
- approval boundary
- mobile/desktop drawer behavior
- dependency on the domain action registry

- [ ] **Step 2: Run full checks**

Run:

```bash
pnpm format
pnpm lint
pnpm check-types
pnpm test
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Browser verification**

Start an explicit Alchemy stage only after confirming credentials and stage name. Then verify:

- desktop drawer opens from the app header
- mobile drawer opens as a bottom sheet
- a read-only chat can connect and stream
- thread switch/create works
- command bar entry opens the same drawer
- approval cards render for mocked write/destructive tool parts

- [ ] **Step 4: Commit**

```bash
git add docs apps/app
git commit -m "docs: describe global agent chat"
```

## Self-Review Checklist

- [ ] The agent is global and app-level, not page-specific.
- [ ] Jobs/sites/settings/members are context sources, not separate assistants.
- [ ] The drawer is unobtrusive at rest.
- [ ] Desktop uses right drawer, mobile uses bottom drawer.
- [ ] Hotkeys are discoverable and respect focus.
- [ ] Write/destructive actions require client approval.
- [ ] UI uses existing Ceird shadcn/base primitives and adapted AI Elements.
- [ ] Tests prove thread, connect, drawer, composer, tool, approval, and context behavior.

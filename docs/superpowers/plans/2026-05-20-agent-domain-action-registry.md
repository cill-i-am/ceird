# Agent Domain Action Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current hand-wired Agent action switch with a typed domain action registry that can expose any approved Ceird API action to the Agent runtime and future clients.

**Architecture:** `packages/agents-core` owns cross-runtime action metadata, names, schemas, and presentation-safe confirmation descriptors. `apps/domain` owns action handlers, authorization, transactions, activity, and idempotency. `apps/agent` derives AI SDK tools from the shared registry instead of maintaining a separate tool list.

**Tech Stack:** Effect Schema/HttpApi, Drizzle/Postgres action ledger, Cloudflare Agents SDK, AI SDK tools, existing domain services/repositories.

---

## Current State

The backend is not yet a full domain action registry.

What exists:

- `packages/agents-core/src/index.ts` defines `AGENT_ACTION_NAMES`, `AGENT_ACTION_DEFINITIONS`, action kind, action run DTOs, and thread APIs.
- `apps/domain/src/domains/agents/actions.ts` has one central executor, but it is a `switch` over hard-coded actions.
- `apps/agent/src/tools.ts` separately hand-writes AI SDK tool definitions, names, descriptions, and Zod schemas.

What is missing:

- one source of truth for action metadata, input schema, result schema, display copy, confirmation policy, and model/tool description
- registry-driven domain execution
- registry-driven AI tool generation
- action manifest endpoint for client approval UI
- coverage beyond the first jobs/labels/sites subset
- member/invitation actions, which currently need a domain-owned agent-safe facade over Better Auth organization behavior

## File Structure

- Modify: `packages/agents-core/src/index.ts`
  - Keep public DTOs and ids.
  - Add action metadata schemas and an action manifest DTO.
- Create: `packages/agents-core/src/action-registry.ts`
  - Define `defineAgentAction`, typed action specs, registry maps, and exported action name arrays.
- Create: `packages/agents-core/src/actions/jobs.ts`
  - Shared job action names, input schemas, result presentation metadata.
- Create: `packages/agents-core/src/actions/sites.ts`
  - Shared site action names, input schemas, result presentation metadata.
- Create: `packages/agents-core/src/actions/labels.ts`
  - Shared label action names, input schemas, result presentation metadata.
- Create: `packages/agents-core/src/actions/organization.ts`
  - Shared organization/member/configuration action names and input schemas.
- Modify: `packages/agents-core/src/index.test.ts`
  - Prove registry names, kinds, and manifest schemas stay in sync.
- Create: `apps/domain/src/domains/agents/action-registry.ts`
  - Bind shared action specs to Effect handlers.
- Modify: `apps/domain/src/domains/agents/actions.ts`
  - Delegate execution to the registry rather than a switch.
- Modify: `apps/domain/src/domains/agents/http.ts`
  - Add public `GET /agent/actions` manifest endpoint.
- Modify: `apps/domain/src/domains/agents/service.ts`
  - Expose manifest listing and registry-driven action execution.
- Modify: `apps/domain/src/domains/agents/repositories.ts`
  - Preserve current ledger behavior; add tests for registry action metadata and replay.
- Modify: `apps/domain/src/domains/agents/repositories.test.ts`
  - Keep current ledger tests and add action manifest assertions.
- Modify: `apps/domain/src/domains/agents/schema.ts`
  - Only if the ledger needs new metadata fields. Prefer no schema change unless required.
- Modify: `apps/agent/src/tools.ts`
  - Generate AI SDK tools from the registry metadata.
- Modify: `apps/agent/src/tools.test.ts`
  - Assert available tools match registry filters and mutation gating.
- Modify: `docs/architecture/api.md`
  - Document registry, manifest, action classes, and approval boundary.
- Modify: `docs/architecture/system-overview.md`
  - Update agent flow from hand-written tools to registry-driven actions.

## Task 1: Move Action Metadata Into `@ceird/agents-core`

**Files:**

- Create: `packages/agents-core/src/action-registry.ts`
- Create: `packages/agents-core/src/actions/jobs.ts`
- Create: `packages/agents-core/src/actions/sites.ts`
- Create: `packages/agents-core/src/actions/labels.ts`
- Create: `packages/agents-core/src/actions/organization.ts`
- Modify: `packages/agents-core/src/index.ts`
- Test: `packages/agents-core/src/index.test.ts`

- [ ] **Step 1: Write failing registry metadata tests**

Add tests that assert:

```ts
expect(AGENT_ACTION_NAMES).toContain("ceird.jobs.create");
expect(AGENT_ACTION_NAMES).toContain("ceird.sites.create");
expect(AGENT_ACTION_NAMES).toContain("ceird.labels.create");
expect(AGENT_ACTION_NAMES).toContain("ceird.organization.members.invite");
expect(getAgentActionDefinition("ceird.jobs.create").kind).toBe("write");
expect(getAgentActionDefinition("ceird.jobs.remove_label").kind).toBe(
  "destructive"
);
expect(AGENT_ACTION_MANIFEST_SCHEMA).toBeDefined();
```

Run: `pnpm --filter @ceird/agents-core test`

Expected: FAIL because the registry files and new actions do not exist yet.

- [ ] **Step 2: Add the shared registry types**

Create `packages/agents-core/src/action-registry.ts` with these concepts:

```ts
import { Schema } from "effect";

export const AgentActionConfirmationPolicy = Schema.Literal(
  "none",
  "confirm",
  "confirm_destructive"
);
export type AgentActionConfirmationPolicy = Schema.Schema.Type<
  typeof AgentActionConfirmationPolicy
>;

export interface AgentActionSpec<Name extends string = string> {
  readonly name: Name;
  readonly kind: AgentActionKind;
  readonly confirmationPolicy: AgentActionConfirmationPolicy;
  readonly modelName: string;
  readonly modelDescription: string;
  readonly inputSchema: Schema.Schema.Any;
  readonly display: {
    readonly label: string;
    readonly summary: string;
    readonly target?: string;
  };
}

export function defineAgentAction<const Name extends string>(
  spec: AgentActionSpec<Name>
): AgentActionSpec<Name> {
  return spec;
}
```

Import `AgentActionKind` from the current core file or move the literal into this file and re-export it from `index.ts`. Keep runtime schemas in core because app, domain, and agent all cross this boundary.

- [ ] **Step 3: Define action groups by domain**

Create action group files with existing actions plus the first broad API coverage:

```ts
export const jobAgentActions = [
  defineAgentAction({
    name: "ceird.jobs.list",
    kind: "read",
    confirmationPolicy: "none",
    modelName: "listJobs",
    modelDescription: "List Ceird jobs for the active organization.",
    inputSchema: JobListQuerySchema,
    display: { label: "List jobs", summary: "Read jobs" },
  }),
  defineAgentAction({
    name: "ceird.jobs.create",
    kind: "write",
    confirmationPolicy: "confirm",
    modelName: "createJob",
    modelDescription: "Create a Ceird job in the active organization.",
    inputSchema: CreateJobInputSchema,
    display: {
      label: "Create job",
      summary: "Creates a new job",
      target: "job",
    },
  }),
  defineAgentAction({
    name: "ceird.jobs.remove_label",
    kind: "destructive",
    confirmationPolicy: "confirm_destructive",
    modelName: "removeJobLabel",
    modelDescription: "Remove a label from an existing Ceird job.",
    inputSchema: RemoveJobLabelActionInputSchema,
    display: {
      label: "Remove job label",
      summary: "Removes a label from a job",
      target: "job",
    },
  }),
];
```

Use existing schemas from `@ceird/jobs-core`, `@ceird/sites-core`, and `@ceird/labels-core` where they already exist. Add only agent-specific wrapper schemas when the HTTP endpoint splits input across path and body.

- [ ] **Step 4: Export one complete registry**

In `packages/agents-core/src/index.ts`, export:

```ts
export const AGENT_ACTIONS = [
  ...labelAgentActions,
  ...siteAgentActions,
  ...serviceAreaAgentActions,
  ...jobAgentActions,
  ...rateCardAgentActions,
  ...organizationAgentActions,
] as const;

export const AGENT_ACTION_NAMES = AGENT_ACTIONS.map((action) => action.name);
export const AgentActionNameSchema = Schema.Literal(...AGENT_ACTION_NAMES);
export type AgentActionName = Schema.Schema.Type<typeof AgentActionNameSchema>;

export function getAgentActionDefinition(name: AgentActionName) {
  const action = AGENT_ACTIONS_BY_NAME[name];
  return action;
}
```

Keep the public `getAgentActionKind` helper as a compatibility wrapper.

- [ ] **Step 5: Run package tests**

Run: `pnpm --filter @ceird/agents-core test && pnpm --filter @ceird/agents-core check-types`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agents-core
git commit -m "feat: define agent action registry contract"
```

## Task 2: Make Domain Execution Registry-Driven

**Files:**

- Create: `apps/domain/src/domains/agents/action-registry.ts`
- Modify: `apps/domain/src/domains/agents/actions.ts`
- Test: `apps/domain/src/domains/agents/repositories.test.ts`
- Test: `apps/domain/src/domains/http.integration.test.ts`

- [ ] **Step 1: Write failing domain execution tests**

Add tests for:

```ts
it("executes actions through the registry", async () => {
  const action = yield * AgentActions.execute(actor, "ceird.labels.list", {});
  expect(action).toEqual({ labels: [] });
});

it("rejects an action missing from the registry", async () => {
  const exit = await Effect.runPromiseExit(
    AgentActions.execute(actor, "ceird.missing.action" as AgentActionName, {})
  );
  expectExitTag(exit, "@ceird/agents-core/AgentActionRejectedError");
});
```

Run: `pnpm --filter domain test -- src/domains/agents`

Expected: FAIL because execution is still switch-based.

- [ ] **Step 2: Add domain handler registry**

Create `apps/domain/src/domains/agents/action-registry.ts`:

```ts
export interface DomainAgentActionHandler<Name extends AgentActionName> {
  readonly name: Name;
  readonly execute: (
    actor: OrganizationActor,
    input: unknown
  ) => Effect.Effect<unknown, unknown>;
}

export function defineDomainAgentAction<Name extends AgentActionName>(
  handler: DomainAgentActionHandler<Name>
): DomainAgentActionHandler<Name> {
  return handler;
}
```

Then define handlers in grouped arrays, initially by moving the current switch branches without changing behavior.

- [ ] **Step 3: Replace the switch with registry lookup**

In `apps/domain/src/domains/agents/actions.ts`, replace `switch (name)` with:

```ts
const handler = domainAgentActionsByName.get(name);

if (!handler) {
  return (
    yield *
    Effect.fail(
      new AgentActionRejectedError({
        message: `Unsupported agent action: ${name}`,
        name,
      })
    )
  );
}

return (
  yield *
  handler
    .execute(actor, input)
    .pipe(Effect.mapError((error) => mapActionError(name, error)))
);
```

Keep `decodeActionInput`, `mapActionError`, and helper functions local until they are shared by multiple handler files.

- [ ] **Step 4: Add registry coverage tests**

Assert that every shared action has a domain handler or is intentionally hidden:

```ts
for (const action of AGENT_ACTIONS) {
  expect(domainAgentActionsByName.has(action.name)).toBe(true);
}
```

Run: `pnpm --filter domain test -- src/domains/agents`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/domain/src/domains/agents packages/agents-core
git commit -m "refactor: execute agent actions through registry"
```

## Task 3: Add An Action Manifest Endpoint For Clients

**Files:**

- Modify: `packages/agents-core/src/index.ts`
- Modify: `apps/domain/src/domains/agents/http.ts`
- Modify: `apps/domain/src/domains/agents/service.ts`
- Test: `apps/domain/src/domains/http.integration.test.ts`

- [ ] **Step 1: Write failing manifest API tests**

Expected behavior:

```ts
const response = await fetch("/agent/actions");
expect(response.status).toBe(200);
expect(await response.json()).toMatchObject({
  items: [
    {
      name: "ceird.jobs.create",
      kind: "write",
      confirmationPolicy: "confirm",
      display: { label: "Create job" },
    },
  ],
});
```

Run: `pnpm --filter domain test -- src/domains/http.integration.test.ts`

Expected: FAIL because `/agent/actions` does not exist.

- [ ] **Step 2: Add manifest DTOs**

Add:

```ts
export const AgentActionManifestItemSchema = Schema.Struct({
  confirmationPolicy: AgentActionConfirmationPolicy,
  display: Schema.Struct({
    label: Schema.String,
    summary: Schema.String,
    target: Schema.optional(Schema.String),
  }),
  kind: AgentActionKindSchema,
  modelName: Schema.String,
  name: AgentActionNameSchema,
});

export const AgentActionManifestResponseSchema = Schema.Struct({
  items: Schema.Array(AgentActionManifestItemSchema),
});
```

- [ ] **Step 3: Expose the endpoint**

Add to `AgentThreadsApiGroup` or a new `AgentActionsApiGroup`:

```ts
HttpApiEndpoint.get("listAgentActions", "/agent/actions")
  .addSuccess(AgentActionManifestResponseSchema)
  .addError(AgentAccessDeniedError)
  .addError(AgentStorageError);
```

The domain service must filter actions by actor role where needed. Default is: all read actions visible to roles that can view organization data; write/destructive actions visible only when the actor can plausibly perform that action.

- [ ] **Step 4: Run domain API tests**

Run: `pnpm --filter domain test -- src/domains/http.integration.test.ts src/domains/agents`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agents-core apps/domain/src/domains/agents
git commit -m "feat: expose agent action manifest"
```

## Task 4: Generate Agent Worker Tools From The Registry

**Files:**

- Modify: `apps/agent/src/tools.ts`
- Modify: `apps/agent/src/tools.test.ts`

- [ ] **Step 1: Write failing tool generation tests**

Assert:

```ts
const tools = createCeirdTools(env, agentInstanceName);
expect(tools.listJobs).toBeDefined();
expect(tools.createJob).toBeUndefined();

const mutationTools = createCeirdTools(
  { ...env, AGENT_MUTATION_TOOLS_ENABLED: "true" },
  agentInstanceName
);
expect(mutationTools.createJob).toBeDefined();
```

Run: `pnpm --filter agent test -- src/tools.test.ts`

Expected: FAIL because tools are still hard-coded.

- [ ] **Step 2: Replace hand-written tool objects**

In `apps/agent/src/tools.ts`, generate:

```ts
for (const action of AGENT_ACTIONS) {
  if (action.kind !== "read" && env.AGENT_MUTATION_TOOLS_ENABLED !== "true") {
    continue;
  }

  tools[action.modelName] = tool({
    description: action.modelDescription,
    inputSchema: toJsonSchemaOrZod(action.inputSchema),
    execute: (input, options) => runAction(action.name, input, options),
  });
}
```

Use a small adapter helper for Effect Schema to AI SDK-compatible schemas. If direct conversion is awkward, keep a `modelInputSchema` field in the shared action spec using Zod for the AI SDK and Effect Schema for domain decoding.

- [ ] **Step 3: Run agent tests**

Run: `pnpm --filter agent test && pnpm --filter agent check-types`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/agent packages/agents-core
git commit -m "refactor: derive agent tools from action registry"
```

## Task 5: Expand Registry Coverage By Domain

**Files:**

- Modify: `packages/agents-core/src/actions/jobs.ts`
- Modify: `packages/agents-core/src/actions/sites.ts`
- Modify: `packages/agents-core/src/actions/labels.ts`
- Modify: `packages/agents-core/src/actions/organization.ts`
- Modify: `apps/domain/src/domains/agents/action-registry.ts`
- Test: domain service tests for each affected service.

- [ ] **Step 1: Add labels actions**

Add actions:

- `ceird.labels.list`
- `ceird.labels.create`
- `ceird.labels.update`
- `ceird.labels.archive`

Run: `pnpm --filter domain test -- src/domains/labels src/domains/agents`

Expected: PASS.

- [ ] **Step 2: Add sites actions**

Add actions:

- `ceird.sites.options`
- `ceird.sites.list`
- `ceird.sites.create`
- `ceird.sites.update`
- `ceird.sites.comments.list`
- `ceird.sites.comments.add`
- `ceird.sites.assign_label`
- `ceird.sites.remove_label`

Run: `pnpm --filter domain test -- src/domains/sites src/domains/agents`

Expected: PASS.

- [ ] **Step 3: Add jobs actions**

Add actions:

- `ceird.jobs.options`
- `ceird.jobs.members.options`
- `ceird.jobs.external_members.options`
- `ceird.jobs.list`
- `ceird.jobs.activity.list`
- `ceird.jobs.detail`
- `ceird.jobs.create`
- `ceird.jobs.patch`
- `ceird.jobs.transition`
- `ceird.jobs.reopen`
- `ceird.jobs.add_comment`
- `ceird.jobs.add_visit`
- `ceird.jobs.add_cost_line`
- `ceird.jobs.assign_label`
- `ceird.jobs.remove_label`
- `ceird.jobs.collaborators.list`
- `ceird.jobs.collaborators.attach`
- `ceird.jobs.collaborators.update`
- `ceird.jobs.collaborators.remove`

Run: `pnpm --filter domain test -- src/domains/jobs src/domains/agents`

Expected: PASS.

- [ ] **Step 4: Add configuration actions**

Add actions:

- `ceird.service_areas.list`
- `ceird.service_areas.create`
- `ceird.service_areas.update`
- `ceird.rate_cards.list`
- `ceird.rate_cards.create`
- `ceird.rate_cards.update`

Run: `pnpm --filter domain test -- src/domains/sites src/domains/jobs src/domains/agents`

Expected: PASS.

- [ ] **Step 5: Add organization member actions**

Create a domain-owned agent-safe facade for organization membership and invitations before exposing:

- `ceird.organization.members.list`
- `ceird.organization.members.invite`
- `ceird.organization.members.update_role`
- `ceird.organization.members.remove`
- `ceird.organization.invitations.resend`
- `ceird.organization.invitations.cancel`

These should reuse existing Better Auth/organization behavior where possible, but the agent action handler must still enforce Ceird role policy and produce sanitized action errors.

Run: `pnpm --filter domain test -- src/domains/identity src/domains/organizations src/domains/agents`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agents-core apps/domain/src/domains/agents apps/domain/src/domains
git commit -m "feat: expose domain actions to Ceird agent"
```

## Task 6: Update Documentation And Full Verification

**Files:**

- Modify: `docs/architecture/api.md`
- Modify: `docs/architecture/system-overview.md`
- Modify: `docs/architecture/packages.md`

- [ ] **Step 1: Document the registry**

Update docs with:

- where actions are defined
- how tool generation works
- how confirmation metadata reaches the client
- which action kinds require approval
- how idempotency and replay protection work

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm format
pnpm lint
pnpm check-types
pnpm test
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Commit docs and any final fixes**

```bash
git add docs packages apps
git commit -m "docs: describe agent action registry"
```

## Self-Review Checklist

- [ ] Every action exposed to the Agent has one registry entry.
- [ ] Every registry entry has a domain handler or an explicit test failure.
- [ ] AI SDK tools are generated from registry metadata.
- [ ] Client-facing manifest contains no sensitive implementation details.
- [ ] Write/destructive actions are not executable without explicit approval support.
- [ ] Domain authorization remains the enforcement point.
- [ ] Replays of mutating actions use the existing ledger.

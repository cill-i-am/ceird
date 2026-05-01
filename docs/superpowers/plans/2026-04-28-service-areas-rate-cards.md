# Service Areas And Rate Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-managed organization service areas and a lightweight rate-card configuration model without making jobs depend on rates.

**Architecture:** Promote the existing `service_regions` concept to service areas across shared DTOs, API, database schema, and app UI. Add normalized organization-scoped rate-card tables and API services that support multiple cards, while the first settings UI manages one `Standard` card. Jobs inherit service area context only through their site.

**Tech Stack:** Effect Schema, Effect HttpApi, Effect services, Drizzle/Postgres, TanStack Router, Effect Atom, React, Vitest, Testing Library, Playwright

---

## Scope And Assumptions

- The product is greenfield and unreleased, so clean terminology wins over compatibility shims.
- Existing `service_regions` functionality should become `service_areas`.
- Jobs do not get `serviceAreaId`.
- Rate-card DB/API supports many cards, but UI only creates/edits one visible `Standard` card.
- Configuration management is owner/admin only.
- Members may view service-area context through sites/jobs.
- Rate cards are not applied to jobs, visits, comments, materials, or future cost lines in this plan.

## File Structure

### Shared Jobs Contract

- Modify: `packages/jobs-core/src/ids.ts`
- Modify: `packages/jobs-core/src/domain.ts`
- Modify: `packages/jobs-core/src/dto.ts`
- Modify: `packages/jobs-core/src/errors.ts`
- Modify: `packages/jobs-core/src/http-api.ts`
- Modify: `packages/jobs-core/src/index.ts`
- Modify: `packages/jobs-core/src/index.test.ts`

### API Database And Services

- Modify: `apps/api/src/domains/jobs/schema.ts`
- Modify: `apps/api/src/platform/database/schema.ts`
- Modify: `apps/api/src/domains/jobs/id-generation.ts`
- Modify: `apps/api/src/domains/jobs/id-generation.test.ts`
- Modify: `apps/api/src/domains/jobs/authorization.ts`
- Modify: `apps/api/src/domains/jobs/repositories.ts`
- Modify: `apps/api/src/domains/jobs/service.ts`
- Modify: `apps/api/src/domains/jobs/sites-service.ts`
- Create: `apps/api/src/domains/jobs/configuration-service.ts`
- Modify: `apps/api/src/domains/jobs/http.ts`
- Modify: `apps/api/src/domains/jobs/repositories.integration.test.ts`
- Modify: `apps/api/src/domains/jobs/service.test.ts`
- Modify: `apps/api/src/domains/jobs/sites-service.test.ts`
- Create: `apps/api/src/domains/jobs/configuration-service.test.ts`
- Modify: `apps/api/src/domains/jobs/http.integration.test.ts`
- Generated: `apps/api/drizzle/0010_service_areas_rate_cards.sql`
- Generated: `apps/api/drizzle/meta/0010_snapshot.json`
- Modify: `apps/api/drizzle/meta/_journal.json`

### App Data And UI

- Modify: `apps/app/src/features/jobs/jobs-client.test.ts`
- Modify: `apps/app/src/features/jobs/jobs-state.ts`
- Modify: `apps/app/src/features/jobs/jobs-page.tsx`
- Modify: `apps/app/src/features/jobs/jobs-page.test.tsx`
- Modify: `apps/app/src/features/jobs/jobs-create-sheet.tsx`
- Modify: `apps/app/src/features/jobs/jobs-create-sheet.test.tsx`
- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.tsx`
- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.test.tsx`
- Modify: `apps/app/src/features/sites/site-create-form.tsx`
- Modify: `apps/app/src/features/sites/sites-create-sheet.tsx`
- Modify: `apps/app/src/features/sites/sites-create-sheet.test.tsx`
- Modify: `apps/app/src/features/sites/sites-detail-sheet.tsx`
- Modify: `apps/app/src/features/sites/sites-page.tsx`
- Modify: `apps/app/src/features/sites/sites-page.test.tsx`
- Create: `apps/app/src/features/organizations/organization-service-areas-section.tsx`
- Create: `apps/app/src/features/organizations/organization-rate-card-section.tsx`
- Create: `apps/app/src/features/organizations/organization-configuration-state.ts`
- Modify: `apps/app/src/features/organizations/organization-settings-page.tsx`
- Create: `apps/app/src/features/organizations/organization-service-areas-section.test.tsx`
- Create: `apps/app/src/features/organizations/organization-rate-card-section.test.tsx`
- Modify: `apps/app/e2e/organization-settings.test.ts`

## Task 1: Rename Shared Region Contract To Service Areas

**Files:**

- Modify: `packages/jobs-core/src/ids.ts`
- Modify: `packages/jobs-core/src/dto.ts`
- Modify: `packages/jobs-core/src/errors.ts`
- Modify: `packages/jobs-core/src/http-api.ts`
- Modify: `packages/jobs-core/src/index.ts`
- Modify: `packages/jobs-core/src/index.test.ts`

- [ ] **Step 1: Write failing jobs-core contract tests**

Add tests to `packages/jobs-core/src/index.test.ts` that decode:

```ts
expect(
  Schema.decodeUnknownSync(ServiceAreaSchema)({
    description: "North city and hospitals",
    id: "33333333-3333-4333-8333-333333333333",
    name: "North Dublin",
  })
).toStrictEqual({
  description: "North city and hospitals",
  id: "33333333-3333-4333-8333-333333333333",
  name: "North Dublin",
});

expect(
  Schema.decodeUnknownSync(CreateServiceAreaInputSchema)({
    description: "  Retail sites  ",
    name: "  Retail  ",
  })
).toStrictEqual({
  description: "Retail sites",
  name: "Retail",
});

expect(() =>
  Schema.decodeUnknownSync(CreateServiceAreaInputSchema)({
    name: "",
  })
).toThrow();
```

Also update existing option payload tests so `JobOptionsResponseSchema` and
`SitesOptionsResponseSchema` expect `serviceAreas` and site fields
`serviceAreaId` / `serviceAreaName`, not `regions` / `regionId` /
`regionName`.

- [ ] **Step 2: Run the focused failing tests**

Run:

```bash
pnpm --filter @task-tracker/jobs-core test -- src/index.test.ts -t "service area"
```

Expected: FAIL because service-area exports do not exist yet.

- [ ] **Step 3: Add service-area IDs and DTOs**

In `packages/jobs-core/src/ids.ts`, replace `RegionId` exports with:

```ts
export const ServiceAreaId = Schema.UUID.pipe(
  Schema.brand("@task-tracker/jobs-core/ServiceAreaId")
);
export type ServiceAreaId = Schema.Schema.Type<typeof ServiceAreaId>;
```

In `packages/jobs-core/src/dto.ts`, add:

```ts
const OptionalTrimmedString = Schema.Trim.pipe(
  Schema.filter((value) => value.length > 0)
);

export const ServiceAreaSchema = Schema.Struct({
  id: ServiceAreaId,
  name: NonEmptyTrimmedString,
  description: Schema.optional(NonEmptyTrimmedString),
});
export type ServiceArea = Schema.Schema.Type<typeof ServiceAreaSchema>;

export const CreateServiceAreaInputSchema = Schema.Struct({
  name: NonEmptyTrimmedString,
  description: Schema.optional(OptionalTrimmedString),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
export type CreateServiceAreaInput = Schema.Schema.Type<
  typeof CreateServiceAreaInputSchema
>;

export const UpdateServiceAreaInputSchema = CreateServiceAreaInputSchema;
export type UpdateServiceAreaInput = Schema.Schema.Type<
  typeof UpdateServiceAreaInputSchema
>;

export const ServiceAreaListResponseSchema = Schema.Struct({
  items: Schema.Array(ServiceAreaSchema),
});
export type ServiceAreaListResponse = Schema.Schema.Type<
  typeof ServiceAreaListResponseSchema
>;
```

Rename `regionId` fields to `serviceAreaId` in:

- `JobListQuerySchema`
- `CreateSiteInputSchema`
- `JobSiteOptionSchema`
- `JobOptionsResponseSchema`
- `SitesOptionsResponseSchema`

- [ ] **Step 4: Add service-area not-found error and API endpoints**

In `packages/jobs-core/src/errors.ts`, replace `RegionNotFoundError` with
`ServiceAreaNotFoundError` using `serviceAreaId: ServiceAreaId`.

In `packages/jobs-core/src/http-api.ts`, add a `serviceAreas` group:

```ts
const serviceAreasGroup = HttpApiGroup.make("serviceAreas")
  .add(
    HttpApiEndpoint.get("listServiceAreas", "/service-areas")
      .addSuccess(ServiceAreaListResponseSchema)
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.post("createServiceArea", "/service-areas")
      .setPayload(CreateServiceAreaInputSchema)
      .addSuccess(ServiceAreaSchema, { status: 201 })
      .addError(JobAccessDeniedError)
      .addError(JobStorageError)
  )
  .add(
    HttpApiEndpoint.patch("updateServiceArea", "/service-areas/:serviceAreaId")
      .setPath(Schema.Struct({ serviceAreaId: ServiceAreaId }))
      .setPayload(UpdateServiceAreaInputSchema)
      .addSuccess(ServiceAreaSchema)
      .addError(JobAccessDeniedError)
      .addError(ServiceAreaNotFoundError)
      .addError(JobStorageError)
  );
```

Add the group to `JobsApi`.

- [ ] **Step 5: Export new names and remove region names**

Update `packages/jobs-core/src/index.ts` to export `ServiceAreaId`,
`ServiceAreaSchema`, `CreateServiceAreaInputSchema`,
`UpdateServiceAreaInputSchema`, `ServiceAreaListResponseSchema`, and
`ServiceAreaNotFoundError`. Remove public `RegionId`, `JobRegionOption`, and
`RegionNotFoundError` exports.

- [ ] **Step 6: Run shared tests**

Run:

```bash
pnpm --filter @task-tracker/jobs-core test -- src/index.test.ts
pnpm --filter @task-tracker/jobs-core check-types
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/jobs-core/src
git commit -m "feat: add service area contracts"
```

## Task 2: Add Rate Card Shared Contract

**Files:**

- Modify: `packages/jobs-core/src/ids.ts`
- Modify: `packages/jobs-core/src/domain.ts`
- Modify: `packages/jobs-core/src/dto.ts`
- Modify: `packages/jobs-core/src/errors.ts`
- Modify: `packages/jobs-core/src/http-api.ts`
- Modify: `packages/jobs-core/src/index.ts`
- Modify: `packages/jobs-core/src/index.test.ts`

- [ ] **Step 1: Write failing rate-card schema tests**

Add tests to `packages/jobs-core/src/index.test.ts`:

```ts
const decoded = Schema.decodeUnknownSync(CreateRateCardInputSchema)({
  lines: [
    {
      kind: "labour",
      name: "  Labour  ",
      position: 1,
      unit: "hour",
      value: 85,
    },
    {
      kind: "material_markup",
      name: "Materials markup",
      position: 2,
      unit: "percent",
      value: 15,
    },
  ],
  name: "  Standard  ",
});

expect(decoded.name).toBe("Standard");
expect(decoded.lines[0]?.name).toBe("Labour");
expect(decoded.lines[1]?.kind).toBe("material_markup");

expect(() =>
  Schema.decodeUnknownSync(CreateRateCardInputSchema)({
    lines: [
      { kind: "custom", name: "Bad", position: 1, unit: "hour", value: -1 },
    ],
    name: "Standard",
  })
).toThrow();
```

- [ ] **Step 2: Run the focused failing tests**

Run:

```bash
pnpm --filter @task-tracker/jobs-core test -- src/index.test.ts -t "rate card"
```

Expected: FAIL because rate-card schemas do not exist.

- [ ] **Step 3: Add rate-card domain and DTOs**

In `packages/jobs-core/src/ids.ts`, add branded UUID IDs:

```ts
export const RateCardId = Schema.UUID.pipe(
  Schema.brand("@task-tracker/jobs-core/RateCardId")
);
export type RateCardId = Schema.Schema.Type<typeof RateCardId>;

export const RateCardLineId = Schema.UUID.pipe(
  Schema.brand("@task-tracker/jobs-core/RateCardLineId")
);
export type RateCardLineId = Schema.Schema.Type<typeof RateCardLineId>;
```

In `packages/jobs-core/src/domain.ts`, add:

```ts
export const RATE_CARD_LINE_KINDS = [
  "labour",
  "callout",
  "material_markup",
  "custom",
] as const;
export const RateCardLineKindSchema = Schema.Literal(...RATE_CARD_LINE_KINDS);
export type RateCardLineKind = Schema.Schema.Type<
  typeof RateCardLineKindSchema
>;
```

In `packages/jobs-core/src/dto.ts`, add `RateCardLineSchema`,
`RateCardSchema`, `CreateRateCardInputSchema`, `UpdateRateCardInputSchema`, and
`RateCardListResponseSchema`. Use `Schema.Number.pipe(Schema.finite(),
Schema.greaterThanOrEqualTo(0))` for values and `Schema.Int.pipe(
Schema.positive())` for `position`.

- [ ] **Step 4: Add rate-card API group**

In `packages/jobs-core/src/http-api.ts`, add `rateCardsGroup` with:

- `GET /rate-cards`
- `POST /rate-cards`
- `PATCH /rate-cards/:rateCardId`

Use `RateCardListResponseSchema`, `CreateRateCardInputSchema`,
`UpdateRateCardInputSchema`, `RateCardSchema`, `RateCardId`, and
`RateCardNotFoundError`.

- [ ] **Step 5: Export rate-card public API**

Update `packages/jobs-core/src/index.ts` to export all rate-card IDs, schemas,
types, constants, and errors.

- [ ] **Step 6: Run shared tests**

Run:

```bash
pnpm --filter @task-tracker/jobs-core test -- src/index.test.ts
pnpm --filter @task-tracker/jobs-core check-types
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/jobs-core/src
git commit -m "feat: add rate card contracts"
```

## Task 3: Update Database Schema And Migrations

**Files:**

- Modify: `apps/api/src/domains/jobs/schema.ts`
- Modify: `apps/api/src/platform/database/schema.ts`
- Modify: `apps/api/src/domains/jobs/id-generation.ts`
- Modify: `apps/api/src/domains/jobs/id-generation.test.ts`
- Generated: `apps/api/drizzle/0010_service_areas_rate_cards.sql`
- Generated: `apps/api/drizzle/meta/0010_snapshot.json`
- Modify: `apps/api/drizzle/meta/_journal.json`

- [ ] **Step 1: Update ID generation tests**

In `apps/api/src/domains/jobs/id-generation.test.ts`, replace region ID
expectations with service-area IDs and add rate-card IDs:

```ts
expect(version(generateServiceAreaId())).toBe(7);
expect(version(generateRateCardId())).toBe(7);
expect(version(generateRateCardLineId())).toBe(7);
```

- [ ] **Step 2: Update schema**

In `apps/api/src/domains/jobs/schema.ts`:

- rename `serviceRegion` to `serviceArea`
- rename table `"service_regions"` to `"service_areas"`
- add `description: text("description")`
- rename `site.regionId` to `site.serviceAreaId`
- rename column `"region_id"` to `"service_area_id"`
- create `rateCard` table
- create `rateCardLine` table
- add relations for `rateCard.lines`

Use checks:

```ts
check("rate_card_lines_value_non_negative_chk", sql`${table.value} >= 0`);
check("rate_card_lines_position_positive_chk", sql`${table.position} > 0`);
check(
  "rate_card_lines_kind_chk",
  sql`${table.kind} in (${rateCardLineKindValuesSql})`
);
```

- [ ] **Step 3: Update platform schema exports**

In `apps/api/src/platform/database/schema.ts`, export `serviceArea`,
`serviceAreaRelations`, `rateCard`, `rateCardRelations`, `rateCardLine`, and
`rateCardLineRelations`. Remove `serviceRegion` exports.

- [ ] **Step 4: Update ID generation implementation**

In `apps/api/src/domains/jobs/id-generation.ts`, replace
`generateRegionId()` with `generateServiceAreaId()` and add
`generateRateCardId()` / `generateRateCardLineId()`.

- [ ] **Step 5: Generate migration**

Run:

```bash
pnpm --filter api db:generate
```

Expected: a new migration under `apps/api/drizzle/0010_service_areas_rate_cards.sql`,
a `meta/0010_snapshot.json`, and an updated `_journal.json`. If Drizzle
generates a different `0010_...` suffix, rename the SQL file to
`0010_service_areas_rate_cards.sql` and update the matching journal tag before
committing.

Review the SQL to ensure it renames or creates cleanly:

- `service_regions` becomes `service_areas`
- `sites.region_id` becomes `sites.service_area_id`
- `rate_cards` and `rate_card_lines` are created

- [ ] **Step 6: Run API typecheck and ID tests**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/id-generation.test.ts
pnpm --filter api check-types
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/domains/jobs/schema.ts apps/api/src/platform/database/schema.ts apps/api/src/domains/jobs/id-generation.ts apps/api/src/domains/jobs/id-generation.test.ts apps/api/drizzle
git commit -m "feat: add service area and rate card schema"
```

## Task 4: Implement API Repositories And Services

**Files:**

- Modify: `apps/api/src/domains/jobs/authorization.ts`
- Modify: `apps/api/src/domains/jobs/repositories.ts`
- Modify: `apps/api/src/domains/jobs/service.ts`
- Modify: `apps/api/src/domains/jobs/sites-service.ts`
- Create: `apps/api/src/domains/jobs/configuration-service.ts`
- Modify: `apps/api/src/domains/jobs/http.ts`
- Modify: `apps/api/src/domains/jobs/repositories.integration.test.ts`
- Modify: `apps/api/src/domains/jobs/service.test.ts`
- Modify: `apps/api/src/domains/jobs/sites-service.test.ts`
- Create: `apps/api/src/domains/jobs/configuration-service.test.ts`
- Modify: `apps/api/src/domains/jobs/http.integration.test.ts`

- [ ] **Step 1: Write failing repository integration coverage**

Update `apps/api/src/domains/jobs/repositories.integration.test.ts` to:

- insert service areas instead of regions
- assert `SitesRepository.create` accepts `serviceAreaId`
- assert `SitesRepository.listOptions` returns `serviceAreaId` and
  `serviceAreaName`
- assert `JobsRepository.list(identity.organizationId, { serviceAreaId })`
  returns jobs whose site belongs to the area
- add a rate-card repository scenario that creates `Standard` with two lines,
  updates it, and lists it

- [ ] **Step 2: Run failing repository tests**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/repositories.integration.test.ts
```

Expected: FAIL on missing service-area/rate-card repository methods.

- [ ] **Step 3: Rename repository region methods**

In `apps/api/src/domains/jobs/repositories.ts`, rename:

- `ensureRegionInOrganization` to `ensureServiceAreaInOrganization`
- `listRegions` to `listServiceAreas`
- `JobRegionOptionRow` to `ServiceAreaRow`
- `mapJobRegionOptionRow` to `mapServiceAreaRow`

Update SQL to use `service_areas` and `service_area_id`.

- [ ] **Step 4: Add service-area repository methods**

Add to `SitesRepository` or split into a focused configuration repository:

```ts
listServiceAreas(organizationId);
createServiceArea({ organizationId, name, description });
updateServiceArea(organizationId, serviceAreaId, input);
```

Decode all outputs with shared schemas from `@task-tracker/jobs-core`.

- [ ] **Step 5: Add rate-card repository methods**

Create `RateCardsRepository` in `repositories.ts` with:

```ts
list(organizationId);
create({ organizationId, name, lines });
update(organizationId, rateCardId, input);
```

Persist rate-card lines by replacing the card's active lines inside the same
transaction on update. Preserve ordering by `position asc, id asc`.

- [ ] **Step 6: Add authorization methods**

In `JobsAuthorization`, add:

```ts
ensureCanManageConfiguration(actor);
```

It should allow only owner/admin and fail with `JobAccessDeniedError` for
members.

- [ ] **Step 7: Add configuration service**

Create `apps/api/src/domains/jobs/configuration-service.ts` with methods:

```ts
listServiceAreas();
createServiceArea(input);
updateServiceArea(serviceAreaId, input);
listRateCards();
createRateCard(input);
updateRateCard(rateCardId, input);
```

Use `CurrentJobsActor`, `JobsAuthorization`, repositories, and
`JobStorageError` mapping like `SitesService`.

- [ ] **Step 8: Update jobs and sites services**

In `JobsService.getOptions`, return `serviceAreas`.

In `SitesService.create/update/getOptions`, validate
`input.serviceAreaId` with `ensureServiceAreaInOrganization` and return
`serviceAreas`.

In `JobsRepository.list`, replace `query.regionId` with
`query.serviceAreaId`.

- [ ] **Step 9: Wire HTTP handlers**

In `apps/api/src/domains/jobs/http.ts`, add handlers for the service area and
rate card groups and provide `ConfigurationService.Default`.

- [ ] **Step 10: Run API tests**

Run:

```bash
pnpm --filter api test -- src/domains/jobs/configuration-service.test.ts src/domains/jobs/sites-service.test.ts src/domains/jobs/service.test.ts src/domains/jobs/repositories.integration.test.ts src/domains/jobs/http.integration.test.ts
pnpm --filter api check-types
```

Expected: PASS, with integration tests skipped only when the test database is
unavailable.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/domains/jobs packages/jobs-core/src
git commit -m "feat: manage service areas and rate cards"
```

## Task 5: Update App State And Site/Job UI Terminology

**Files:**

- Modify: `apps/app/src/features/jobs/jobs-state.ts`
- Modify: `apps/app/src/features/jobs/jobs-page.tsx`
- Modify: `apps/app/src/features/jobs/jobs-page.test.tsx`
- Modify: `apps/app/src/features/jobs/jobs-create-sheet.tsx`
- Modify: `apps/app/src/features/jobs/jobs-create-sheet.test.tsx`
- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.tsx`
- Modify: `apps/app/src/features/jobs/jobs-detail-sheet.test.tsx`
- Modify: `apps/app/src/features/sites/site-create-form.tsx`
- Modify: `apps/app/src/features/sites/sites-create-sheet.tsx`
- Modify: `apps/app/src/features/sites/sites-create-sheet.test.tsx`
- Modify: `apps/app/src/features/sites/sites-detail-sheet.tsx`
- Modify: `apps/app/src/features/sites/sites-page.tsx`
- Modify: `apps/app/src/features/sites/sites-page.test.tsx`

- [ ] **Step 1: Write failing app UI tests for service-area language**

Update existing job/site tests so they expect:

- filters labelled `Service area`
- site form field labelled `Service area`
- empty picker text `No service areas found.`
- stale errors mentioning `service area`
- site rows showing service-area names

- [ ] **Step 2: Run focused failing app tests**

Run:

```bash
pnpm --filter app test -- src/features/jobs/jobs-page.test.tsx src/features/sites/sites-page.test.tsx src/features/sites/sites-create-sheet.test.tsx
```

Expected: FAIL because app still uses region naming.

- [ ] **Step 3: Rename app state fields**

In `jobs-state.ts`, replace:

- `regionId` with `serviceAreaId`
- `regions` with `serviceAreas`
- `regionById` with `serviceAreaById`

Keep filtering derived through `site.serviceAreaId`.

- [ ] **Step 4: Update site forms**

In `site-create-form.tsx`, rename helpers to service-area language:

- `buildSiteServiceAreaSelectionGroups`
- `validateSiteCreateDraft` checks `serviceAreaSelection`
- `buildCreateSiteInputFromDraft` emits `serviceAreaId`

Update labels and helper copy to "Service area".

- [ ] **Step 5: Update job filters and display**

In `jobs-page.tsx`, update the `More` filter menu to include:

```ts
{ label: "All service areas", value: "serviceArea:all" }
{ label: `Service area: ${serviceArea.name}`, value: `serviceArea:${serviceArea.id}` }
```

Update active filter badges to say `Service area: ...`.

Show service area context near the site name when available.

- [ ] **Step 6: Update job create and detail sheets**

Update inline site creation in `jobs-create-sheet.tsx` to use service-area
fields. In job detail, show the service area through the site lookup where site
context is already rendered; do not add a direct job service-area selector.

- [ ] **Step 7: Run focused app tests and typecheck**

Run:

```bash
pnpm --filter app test -- src/features/jobs/jobs-page.test.tsx src/features/jobs/jobs-create-sheet.test.tsx src/features/jobs/jobs-detail-sheet.test.tsx src/features/sites/sites-page.test.tsx src/features/sites/sites-create-sheet.test.tsx
pnpm --filter app check-types
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/app/src/features/jobs apps/app/src/features/sites
git commit -m "feat: show service areas on jobs and sites"
```

## Task 6: Add Organization Settings Configuration UI

**Files:**

- Create: `apps/app/src/features/organizations/organization-configuration-state.ts`
- Create: `apps/app/src/features/organizations/organization-service-areas-section.tsx`
- Create: `apps/app/src/features/organizations/organization-rate-card-section.tsx`
- Modify: `apps/app/src/features/organizations/organization-settings-page.tsx`
- Create: `apps/app/src/features/organizations/organization-service-areas-section.test.tsx`
- Create: `apps/app/src/features/organizations/organization-rate-card-section.test.tsx`

- [ ] **Step 1: Write failing settings UI tests**

Create tests that verify:

- admins see a Service Areas section
- creating an area calls `client.serviceAreas.createServiceArea`
- editing an area calls `client.serviceAreas.updateServiceArea`
- admins see a Rate Card section
- the first load creates or edits a single `Standard` card
- adding a line with `Labour`, `labour`, `85`, `hour` sends a rate-card payload
- blank line names and negative values show validation errors

- [ ] **Step 2: Run failing tests**

Run:

```bash
pnpm --filter app test -- src/features/organizations/organization-service-areas-section.test.tsx src/features/organizations/organization-rate-card-section.test.tsx
```

Expected: FAIL because components do not exist.

- [ ] **Step 3: Add configuration state**

Create `organization-configuration-state.ts` with Effect Atom mutations:

```ts
listServiceAreasAtom;
createServiceAreaMutationAtom;
updateServiceAreaMutationAtomFamily;
listRateCardsAtom;
createRateCardMutationAtom;
updateRateCardMutationAtomFamily;
```

Use `runBrowserJobsRequest` and the generated Jobs API client groups.

- [ ] **Step 4: Build service areas section**

Create `organization-service-areas-section.tsx` with:

- compact list
- name input
- optional description textarea
- add button
- edit/save controls per row
- owner/admin-only usage inherited from settings route

Use icon buttons with accessible labels where actions are small controls.

- [ ] **Step 5: Build rate-card section**

Create `organization-rate-card-section.tsx` that:

- reads all rate cards
- selects existing `Standard` by name, or creates it on first save
- renders editable line rows
- supports kind, name, value, unit
- saves the whole card
- does not expose multiple card selection

- [ ] **Step 6: Add sections to settings page**

In `organization-settings-page.tsx`, add the two sections below the existing
General/Identity settings. Keep layout dense and operational; do not turn the
settings page into a landing page.

- [ ] **Step 7: Run settings tests and typecheck**

Run:

```bash
pnpm --filter app test -- src/features/organizations/organization-service-areas-section.test.tsx src/features/organizations/organization-rate-card-section.test.tsx src/routes/-_app._org.organization.settings.test.tsx
pnpm --filter app check-types
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/app/src/features/organizations
git commit -m "feat: add organization configuration settings"
```

## Task 7: Add End-To-End Coverage And Final Verification

**Files:**

- Modify: `apps/app/e2e/organization-settings.test.ts`
- Modify: any generated `apps/app/src/routeTree.gen.ts` changes produced by the router tooling

- [ ] **Step 1: Extend organization settings E2E**

Add a scenario that:

- signs up as an owner
- creates an organization
- opens organization settings
- creates service area `North Dublin`
- creates a `Standard` rate card line `Labour`, `labour`, `85`, `hour`
- creates or edits a site and assigns `North Dublin`
- opens jobs and verifies the Service area filter includes `North Dublin`

- [ ] **Step 2: Run focused E2E**

Boot the worktree sandbox:

```bash
pnpm sandbox:up
pnpm sandbox:url
```

Run:

```bash
pnpm --filter app e2e -- organization-settings.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run:

```bash
pnpm test
pnpm check-types
pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Stop sandbox if no longer needed**

Run:

```bash
pnpm sandbox:down
```

Expected: sandbox services stop cleanly.

- [ ] **Step 5: Commit**

```bash
git add apps/app/e2e/organization-settings.test.ts apps/app/src/routeTree.gen.ts
git commit -m "test: cover service area and rate card settings"
```

## Self-Review Checklist

- Service areas are site-owned and jobs inherit only through site.
- No job payload contains a direct `serviceAreaId` except list filtering.
- Rate cards are organization-scoped and support multiple cards in DB/API.
- UI exposes only one `Standard` card.
- No rate is applied to jobs, visits, comments, or cost lines.
- Owners/admins can manage configuration; members cannot.
- Runtime schemas validate every API boundary.
- Stale service-area references produce user-safe errors.

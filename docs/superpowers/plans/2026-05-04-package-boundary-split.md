# Package Boundary Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split sites and labels into independent shared domain packages while keeping local shared packages under the `@ceird/*` scope.

**Architecture:** `@ceird/jobs-core` keeps job-owned DTOs, activity, collaborators, cost lines, rate cards, and job label assignment inputs. `@ceird/sites-core` owns site IDs, service-area primitives, site DTOs, site errors, and site/service-area API groups. `@ceird/labels-core` owns organization label IDs, DTOs, errors, and the labels API group. Jobs may depend on sites and labels; sites and labels do not depend on jobs.

**Tech Stack:** pnpm workspaces, Turborepo package tasks, TypeScript NodeNext, Effect Schema, Effect HttpApi, Vitest.

---

### Task 1: Add Failing Core Package Tests

**Files:**

- Create: `packages/sites-core/package.json`
- Create: `packages/sites-core/tsconfig.json`
- Create: `packages/sites-core/src/index.test.ts`
- Create: `packages/labels-core/package.json`
- Create: `packages/labels-core/tsconfig.json`
- Create: `packages/labels-core/src/index.test.ts`

- [x] Add package test scaffolding and contract tests that assert site DTO trimming, Eircode validation, coordinate validation, service-area DTOs, generic label DTOs, generic label normalization, and API group exports.
- [x] Run `pnpm --filter @ceird/sites-core test` and `pnpm --filter @ceird/labels-core test`; expected result is failure because exports do not exist yet.

### Task 2: Implement New Core Packages

**Files:**

- Create: `packages/sites-core/src/ids.ts`
- Create: `packages/sites-core/src/domain.ts`
- Create: `packages/sites-core/src/dto.ts`
- Create: `packages/sites-core/src/errors.ts`
- Create: `packages/sites-core/src/http-api.ts`
- Create: `packages/sites-core/src/index.ts`
- Create: `packages/labels-core/src/ids.ts`
- Create: `packages/labels-core/src/domain.ts`
- Create: `packages/labels-core/src/dto.ts`
- Create: `packages/labels-core/src/errors.ts`
- Create: `packages/labels-core/src/http-api.ts`
- Create: `packages/labels-core/src/index.ts`

- [x] Implement site-owned IDs, DTOs, typed errors, and `SitesApi`/`ServiceAreasApiGroup`.
- [x] Implement generic organization label IDs, DTOs, typed errors, and `LabelsApi`.
- [x] Run focused package tests until the new packages are green.

### Task 3: Refactor Jobs Core

**Files:**

- Modify: `packages/jobs-core/package.json`
- Modify: `packages/jobs-core/src/ids.ts`
- Modify: `packages/jobs-core/src/domain.ts`
- Modify: `packages/jobs-core/src/dto.ts`
- Modify: `packages/jobs-core/src/errors.ts`
- Modify: `packages/jobs-core/src/http-api.ts`
- Modify: `packages/jobs-core/src/index.ts`
- Modify: `packages/jobs-core/src/index.test.ts`

- [x] Import `SiteId`, service-area DTOs, and site DTOs from `@ceird/sites-core`.
- [x] Import `LabelId`, `LabelSchema`, label inputs, and label errors from `@ceird/labels-core`.
- [x] Rename job payload fields from `JobLabel*` to generic `Label*` except job assignment operations such as `AssignJobLabelInput`.
- [x] Remove site and label endpoint groups from `JobsApi`; keep job label assignment endpoints in the jobs group.
- [x] Run `pnpm --filter @ceird/jobs-core test`.

### Task 4: Update API And App Consumers

**Files:**

- Modify: `apps/api/src/domains/jobs/http.ts`
- Modify: `apps/api/src/domains/jobs/service.ts`
- Modify: `apps/api/src/domains/jobs/sites-service.ts`
- Modify: `apps/api/src/domains/jobs/configuration-service.ts`
- Modify: `apps/api/src/domains/jobs/repositories.ts`
- Modify: `apps/app/src/features/jobs/jobs-client.ts`
- Modify: app/API imports and tests that reference site or label contracts.

- [x] Mount `SitesApi`, `LabelsApi`, and `JobsApi` through separate Effect `HttpApi` contract layers.
- [x] Route label CRUD through the labels group while job assignment stays under `/jobs/:workItemId/labels`.
- [x] Update frontend client calls from `client.jobs.listJobLabels()` to `client.labels.listLabels()` and from `client.sites.*` to the separate sites group exposed by the composed client contract.
- [x] Replace package imports with `@ceird/*`.

### Task 5: Documentation And Verification

**Files:**

- Modify: `README.md`
- Modify: `packages/README.md`
- Modify: `docs/architecture/packages.md`
- Modify: `docs/architecture/api.md`
- Modify: `docs/architecture/frontend.md`

- [x] Update package maps and dependency direction.
- [x] Update API endpoint ownership tables for jobs, labels, sites, service areas, and rate cards.
- [x] Run focused tests for new packages, jobs-core, API jobs/site/label tests, and app jobs/site/organization settings tests.
- [x] Finish with `pnpm check-types`, `pnpm test`, `pnpm lint`, and `pnpm format`.

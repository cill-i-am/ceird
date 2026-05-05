# Service Areas And Rate Cards Design

## Purpose

Organizations need lightweight configuration for organizing work by service area
and preparing for future costing and invoicing. This first version should be
useful before billing exists: admins can define service areas, keep sites grouped
by area, and maintain simple rate-card information without applying rates to
jobs.

## Goals

- Support organization-scoped service areas.
- Let sites optionally reference a service area.
- Show service area context anywhere the site context is already useful.
- Keep jobs independent from rate cards and pricing automation.
- Store organization-scoped rate cards and flexible rate lines for later costing
  and invoicing work.
- Preserve runtime validation at API and database boundaries.
- Restrict configuration management to organization owners and admins.

## Non-Goals

- Full invoicing.
- Automatic pricing, job costing, or material calculations.
- Mandatory rates or mandatory service areas.
- Customer-specific pricing assumptions.
- Direct service-area assignment on jobs.

## Product Model

The current codebase already has organization-scoped `service_regions`, and
sites can optionally reference a region. This feature should promote that
existing concept into product language as **service areas** rather than adding a
second overlapping grouping model.

The relationship is:

```text
organization -> service areas -> sites -> jobs
```

A job does not carry its own `serviceAreaId`. If a job has a site, it can show
and filter by the site's service area. If a job has no site, it has no service
area.

## Service Areas

A service area is organization-scoped configuration:

- `id`
- `organizationId`
- `name`
- optional `description`
- timestamps
- optional `archivedAt`

`description` is free text and covers both coverage notes and grouping notes.
Examples: "North Dublin", "Retail contract group", or "Hospitals and clinics".

Service areas should be soft-archived rather than hard-deleted. Archived service
areas are hidden from create/edit pickers and list endpoints by default.

## Sites And Jobs

Sites keep the optional area reference. In code and UI this should become
`serviceAreaId` / `serviceAreaName`; the database can be cleanly renamed because
the project is greenfield and unreleased.

Jobs continue to reference sites only. Job list filtering by service area should
join through `sites.service_area_id`, replacing the current region-derived
filter. Job detail and job list rows can show service area context beside the
site when available.

## Rate Cards

The database and API should allow multiple named rate cards per organization,
but the first UI should expose only one simple organization card, called
`Standard` by convention. This keeps later multi-card UI work mostly additive
without making the first settings page busy.

A rate card is:

- `id`
- `organizationId`
- `name`
- timestamps
- optional `archivedAt`

A rate line is:

- `id`
- `rateCardId`
- `name`
- `kind`
- `value`
- `unit`
- `position`
- timestamps

`kind` is intentionally generic:

- `labour`
- `callout`
- `material_markup`
- `custom`

`unit` is a flexible display string, such as `hour`, `visit`, `percent`,
`fixed`, or a company-specific unit. `value` is numeric. Currency should not be
over-modeled in this slice; the rate-card values are configuration hints for
future costing, not final invoices.

## API Design

Extend `@ceird/jobs-core` with service-area and rate-card schemas, IDs,
DTOs, and `HttpApi` groups.

Service area endpoints:

- `GET /service-areas`
- `POST /service-areas`
- `PATCH /service-areas/:serviceAreaId`

Rate card endpoints:

- `GET /rate-cards`
- `POST /rate-cards`
- `PATCH /rate-cards/:rateCardId`

The sites and jobs endpoints should keep returning area options through the
existing options flow, renamed from `regions` to `serviceAreas`. Sites should
return `serviceAreaId` and `serviceAreaName`.

All input payloads use Effect `Schema`:

- trimmed non-empty names
- optional trimmed descriptions
- line values must be finite non-negative numbers
- line positions must be positive integers
- unknown request fields are rejected

## Permissions

Use the existing owner/admin boundary:

- owners and admins can create and update service areas
- owners and admins can create and update rate cards
- members can view service area context through jobs/sites/options
- members cannot manage configuration

This should be implemented through `JobsAuthorization`, reusing the current
elevated-access check rather than adding a parallel permission system.

## UI Design

Organization settings should gain a configuration section for admins and owners:

- Service Areas
- Rate Card

Service areas:

- show a compact list of configured areas
- allow inline create/edit of name and description
- use the term "Service area" everywhere
- keep empty states practical and quiet

Rate card:

- show a single editable `Standard` card
- allow admins to add/edit/remove simple rate lines in that card
- use flexible names rather than hardcoded billing assumptions
- include kind/unit/value fields for each line
- avoid any language implying rates are automatically used on jobs

Sites:

- site create/edit forms should use `Service area` instead of `Region`
- site list/detail should show service area context

Jobs:

- job filters should say `Service area`
- job list/detail should show the service area when a site has one
- no job create/edit field should directly select a service area

Keyboard access should follow the app's hotkey layer. Existing settings save
hotkeys cover the main organization settings form, but service-area/rate-card row
actions should be reachable by normal tab order and command buttons. Add
hotkeys only for durable page-level actions if they become primary workflows.

## Error Handling

Add domain errors mirroring the current jobs errors:

- `ServiceAreaNotFoundError`
- `RateCardNotFoundError`

Stale service-area references on site create/update should map to field-level UI
errors, as stale region failures do today.

Storage failures should continue to map to `JobStorageError`.

## Testing

Shared package tests should cover:

- service-area schema decoding
- rate-card schema decoding
- excess field rejection
- invalid line values and blank names

API/service tests should cover:

- owners/admins can create and update service areas
- members cannot manage service areas
- owners/admins can create and update rate cards and line items
- members cannot manage rate cards
- sites can reference a service area
- stale service-area IDs fail safely
- jobs filter by service area through their site

App tests should cover:

- organization settings renders service-area and rate-card management for admins
- members cannot load organization settings
- site create/edit labels and payloads use service areas
- job filters and list/detail context show service areas

End-to-end coverage should include one admin flow that creates a service area,
assigns it to a site, creates or views a job at that site, and sees the service
area in job filtering/context.

## Rollout Notes

This project is greenfield and unreleased, so the implementation should prefer
clean product terminology over compatibility. It is acceptable to rename region
types, API fields, UI labels, and database columns to service-area language in
one focused sweep.

Existing database migration history should be extended normally; do not commit
anything from `opensrc/`.

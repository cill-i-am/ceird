# Organizations Design

## Purpose

Define the first multi-tenant organization slice for the project.

This design introduces organizations as the first tenant boundary layered on top
of the existing authentication architecture. It keeps Better Auth as the source
of truth for authentication and uses organization membership to decide whether an
authenticated user may enter the product.

## Status

This document describes the intended design for the first organizations slice.
It is a spec for the next implementation plan, not a description of behavior
already shipped.

## Goals

- add organizations as the first tenant boundary
- keep authentication and tenant membership as separate concerns
- require an authenticated user to have organization context before entering the
  product
- support first-login organization creation inside the authenticated app
  boundary
- preserve a clean path to future multi-org and richer tenant behavior

## Non-Goals

- invitations
- invitation acceptance for existing or new users
- switching between multiple organizations
- workspace modeling
- task, project, or domain data ownership
- role-based product authorization beyond establishing the initial role model
- email verification or auth-email improvements

## Product Decisions

The initial product shape is:

- no personal area exists outside organizations
- a self-sign-up user authenticates first, then creates an organization during
  first-login onboarding
- an invited user flow will exist later and should skip auto-creating a
  personal organization
- organizations are the only tenant container in this slice
- each organization effectively has one implicit workspace for now, but no
  separate workspace model is introduced
- initial membership roles are `owner`, `admin`, and `member`

Future direction already matters to the model:

- a user may eventually belong to multiple organizations
- the same user may hold different roles in different organizations
- later work may introduce org switching, invitations, and richer
  workspace/domain layering

These future needs are the reason to model organization membership explicitly
now instead of treating the app as permanently single-tenant.

## Architectural Summary

Organizations should be implemented with Better Auth's organization plugin as
the tenant and membership boundary.

The split remains:

1. `apps/api` owns Better Auth runtime, persistence, org plugin configuration,
   and native auth/org HTTP behavior.
2. `apps/app` owns onboarding UI, route gating, and user experience around
   organization-required access.

Core rule:

> Authentication answers who the user is. Organization membership answers which
> tenant they can operate inside.

We should not build a parallel app-owned organization system for this slice.

## Why Better Auth Organizations

This is the recommended implementation shape because it:

- preserves the current architecture's preference for Better Auth-native
  behavior
- provides organization, membership, role, and active-organization primitives
  without reimplementing them from scratch
- keeps app-owned logic focused on onboarding, routing, and future domain
  composition

We should avoid:

- building custom org membership tables and APIs before there is concrete need
- wrapping every org call in an app-owned service layer immediately
- mixing raw auth checks and tenant-context checks into one vague helper

## Backend Ownership

`apps/api` should:

- add the Better Auth `organization()` plugin to the existing auth slice
- let Better Auth own organization and membership persistence for this first
  pass
- keep org behavior configured close to the existing auth configuration instead
  of creating a separate identity subsystem

This slice should not add app-owned proxy endpoints that simply rename Better
Auth organization behavior.

If app-owned domain composition becomes necessary later, it should happen for a
clear product reason rather than speculative neatness.

## Frontend Ownership

`apps/app` should:

- add the Better Auth `organizationClient()` plugin to the shared auth client
- add a protected onboarding flow for first organization creation
- add route gating that distinguishes between:
  - guest users
  - authenticated users without organization membership
  - authenticated users with usable organization context

The app remains responsible for deciding where the user should land after
sign-up, sign-in, and future invitation entry points.

## V1 User Flow

### Self Sign-Up

1. User signs up with the existing auth flow.
2. User becomes authenticated.
3. App checks whether the user has any organization membership.
4. If not, the user is sent to organization onboarding inside the protected app
   area.
5. User creates an organization.
6. The app sets that organization as active.
7. User enters the main app.

### Sign-In

1. User signs in with the existing auth flow.
2. App checks whether the user has organization membership.
3. If the user has usable org context, they enter the app.
4. If the user has no org membership, they are sent to organization onboarding.

### Invitation-Aware Future

This slice does not implement invitations, but it should preserve the future
rule:

- invited users should be able to join an existing organization without also
  getting a personal organization created automatically

That future requirement is why organization creation belongs in first-login
onboarding rather than being forced into sign-up itself.

## Route Policy

The route model should stay explicit:

- guest auth pages remain public and guest-only
- authenticated users without org membership may reach the org onboarding flow
- authenticated users without org context may not reach the main product area
- authenticated users with valid org context may reach the main product area

This implies separate checks with clear names:

- one check for authenticated session
- one check for organization-required app access

We should not overload `requireAuthenticatedSession()` with mixed auth and org
policy in a way that hides intent.

## Active Organization Model

V1 should assume one active organization at a time in the app UI.

The active organization should come from Better Auth's organization/session
state rather than from a new app-owned context store.

For this first slice:

- users with no org membership are routed into onboarding
- users with exactly one org membership should have a straightforward entry path
- multi-org switching is deferred to later work

The implementation may need a small amount of app-owned convenience logic for
navigation, but it should not shadow Better Auth's organization contract.

## Roles

The initial roles are:

- `owner`
- `admin`
- `member`

This slice should persist and use those roles as the membership model, but it
should not turn into a broad authorization project yet.

Rules:

- role membership is organization-scoped
- a user's role is not globally fixed across all future organizations
- product permissions can be layered later when concrete domain actions require
  them

## Workspace Position

No separate workspace model is added in this slice.

For now:

- organization is the only tenant container
- the product may speak in simple org-first language
- the eventual single-workspace-per-org or multi-workspace model remains future
  work

This keeps the first tenant slice small and avoids designing task or project
ownership before that work exists.

## Error Handling

Errors should remain focused and fail safely:

- failed sign-up or sign-in continues to use the current auth error handling
- failed organization creation keeps the user on onboarding with a clear form
  error
- authenticated users without org membership should be routed to onboarding, not
  dropped into a broken app shell
- authenticated users who reach protected product routes without valid
  org context should fail closed back to the org gate or onboarding path

## Testing

The implementation plan should include:

- backend coverage that auth boots with the Better Auth organization plugin
- backend or integration coverage for organization creation through the chosen
  auth surface
- frontend route tests proving:
  - guest users go to login
  - authenticated users without org membership go to onboarding
  - authenticated users with valid org context reach the app
- onboarding form tests for success and failure states
- end-to-end coverage for:
  - sign up
  - enter org onboarding
  - create organization
  - enter the app

## Deliverables

The first implementation slice should produce:

- Better Auth organization plugin wiring in `apps/api`
- Better Auth organization client wiring in `apps/app`
- organization onboarding inside the protected app boundary
- route gating for org-required app access
- initial tests covering onboarding and org-gated entry
- a follow-on markdown document for org-related next steps

Recommended follow-on doc:

- `docs/architecture/organization-next-steps.md`

That follow-on doc should capture at least:

- invite acceptance
- org switching for multi-org users
- workspace or domain data under the active org

## Open Constraints Kept Explicit

These decisions are intentionally fixed for this design:

- no personal area
- org creation happens after authentication, not during sign-up
- no invitation implementation in this slice
- no workspace model in this slice
- no task or project ownership modeling in this slice
- no broad authorization layer in this slice

## Recommendation

The next implementation plan should treat organizations as the first
multi-tenant boundary and use Better Auth's organization plugin directly.

That gives the project a clean tenant model now without prematurely designing
workspace layering, invitation handling, or broad permissions before the product
actually needs them.

# Organization Next Steps

This document tracks follow-up work after the first organizations slice and the
organization invitations follow-up.

## Next Product Steps

1. Organization switching for users who belong to multiple organizations
2. Strengthen the current organization-scoped domain workflows
3. Role-specific organization management polish beyond Better Auth's current
   organization member and invitation controls

## Invite Acceptance

Organization invitations are now implemented with Better Auth-backed delivery
and acceptance:

- support both existing-user and new-user invite acceptance
- avoid auto-creating a personal organization for invited users by returning
  them to the invitation after auth
- set the invited organization active after acceptance
- expose authenticated member invitation management from the `/members` page
- allow pending invitations to be resent or canceled from the `/members` page
- show pending invitation expiry metadata on the `/members` page
- report organization invitation delivery failures through the shared auth
  email observability path

## Member Administration

The `/members` page now covers active organization member administration for
owners and admins:

- load current members through Better Auth's organization member listing API
- keep pending invitation resend and cancellation behavior alongside the member
  list
- update member roles with Better Auth's organization role update API
- remove members with Better Auth's organization member removal API
- keep self and last-owner cases non-actionable in the UI while Better Auth
  remains the authoritative permission boundary
- refresh member data after successful role or removal mutations
- invalidate active route context after current-user access changes so route
  guards can re-evaluate organization administration access

Row-level role and removal actions intentionally remain menu/button driven
rather than shortcut driven. They are contextual administrative changes, not a
single primary workflow, and explicit row focus keeps keyboard operation
discoverable without adding global shortcuts that could target the wrong member.

## Multi-Organization Switching

Implemented behavior:

- the authenticated sidebar shows the active organization on organization
  routes and falls back to the `_app` session active organization on other
  authenticated routes
- users with multiple organizations can switch explicitly through Better Auth's
  native organization client APIs
- switching invalidates TanStack Router state synchronously so organization
  data and role-scoped navigation refresh together, with a hard reload fallback
  if the session switch succeeds but router refresh fails
- the switcher handles loading, empty, single-organization, failed-list, and
  failed-switch states

Remaining follow-up:

- consider richer organization search if accounts commonly belong to many
  organizations

## Workspace And Domain Data

The first organizations slice adds the tenant boundary, not the domain model.

Workspace remains parked for now. We should not add a user-facing workspace
model until there is a clear product need for multiple operational spaces inside
one organization, such as separate divisions, branches, regions, or permission
scopes.

If a workspace model is introduced early for future migration safety, it should
start as an internal hidden default workspace:

- every organization gets one default workspace
- the UI remains organization-scoped, with no workspace switcher, settings page,
  or naming surface
- permissions remain organization-level until a concrete workspace-level policy
  exists
- domain records can attach to the default workspace server-side, but app routes
  and user flows should not ask users to choose a workspace
- multi-workspace support should be an additive reveal later, not a concept the
  current product forces before it is useful

Until that need is real, prefer improving the existing organization-owned
workflows:

- organization-owned tasks, projects, or field workflows
- richer authorization once domain actions require it

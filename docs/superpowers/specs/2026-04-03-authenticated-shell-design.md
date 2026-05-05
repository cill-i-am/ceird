# Authenticated Shell Design

## Summary

Turn the current starter-shaped app into a real authenticated product shell.

This pass keeps `/login` and `/signup` as the only public app screens. The main
app shell at `/` and all app-owned routes should require an authenticated
session. Placeholder starter content, fake user data, and demo navigation should
be removed rather than preserved.

## Goals

- make `/` behave like the real signed-in app entry point
- redirect unauthenticated users away from protected app routes to `/login`
- redirect authenticated users away from `/login` and `/signup` to `/`
- wire a real sign-out entry point into the authenticated chrome
- remove placeholder starter pages, links, and fake shell content
- keep the route structure simple and easy to extend

## Non-Goals

- redirect-back behavior after login or signup
- password reset flows
- email verification or email OTP flows
- organization onboarding implementation
- social auth
- authorization or role-aware route guards

## Current Context

The API already mounts Better Auth natively at `/api/auth/*` and the app already
has working Better Auth client flows for login, signup, and SSR session lookup.

What is still missing is the actual authenticated app boundary:

- `/_app` currently renders without an auth guard
- `/` still shows starter marketing content
- the app chrome still contains placeholder navigation and fake user data
- the sign-out menu item is visual only

That means the auth forms work, but the product still feels like a starter
template instead of a protected application.

## Route Model

Use one small public auth area and one protected app area.

### Public Routes

- `/login`
- `/signup`

Authenticated users who land on either route should be redirected to `/`.

### Protected Routes

- `/`
- any current or future route rendered inside the real app shell

Unauthenticated users who land on a protected route should be redirected to
`/login`.

### Simplicity Rule

Do not add redirect-back support in this pass. After login, signup, and sign
out, the destination is always `/` for authenticated success and `/login` for
logged-out access.

## Authenticated Shell

`/_app` should become the single authenticated shell for the product.

Responsibilities:

- resolve the current session before rendering protected content
- redirect to `/login` when no session exists
- pass real session-derived user data into the sidebar and user menu
- provide a real sign-out action from the app chrome

The app shell should remain small and product-focused. This is not the place to
keep starter tutorial content alive.

## Placeholder Removal

This work should remove placeholder surfaces aggressively.

Remove or replace:

- starter hero copy on the signed-in home screen
- the current `/about` starter page
- documentation and social links that exist only because this began as a
  template
- fake “Ceird / starter workspace” shell user data
- any nav items whose only purpose is to demo the starter

Keep only what is needed for a real minimal app:

- product identity
- the protected home screen
- the smallest useful nav structure
- a real user menu with sign out

## Session Behavior

Prefer server-first session checks for protected routes so auth decisions happen
before protected UI renders.

Desired behavior:

- unauthenticated request to `/` or a protected route: redirect to `/login`
- authenticated request to `/login` or `/signup`: redirect to `/`
- authenticated request to `/`: render the app shell
- sign out from the shell: terminate the Better Auth session and return the user
  to the logged-out flow

If the client needs a transient loading state while session state settles after
mutations, it should be brief and explicit rather than flashing placeholder
content.

## Future Compatibility

This route split should stay stable when additional auth flows arrive later.

Planned fit:

- password reset and email verification style routes remain public auth routes
- email OTP verification screens can live in the same public auth area
- organization onboarding should be treated as an authenticated flow inside the
  protected app boundary, because it happens after account creation / sign-in

That means the recommendation does not change with those future requirements.
They reinforce the need for a clear public-auth-area versus protected-app-area
boundary.

## Error Handling

- protected-route session lookup failure should fail closed and behave as logged
  out unless there is a strong reason to distinguish infrastructure failures
- sign-out failures should show a small user-facing error and keep the user in
  place
- route guards should stay centralized rather than spread across page
  components

## Testing Strategy

Implementation should extend coverage from auth forms into app-boundary
behavior.

Key assertions:

- unauthenticated access to `/` redirects to `/login`
- authenticated access to `/login` redirects to `/`
- authenticated access to `/signup` redirects to `/`
- the authenticated shell renders session-derived user details instead of
  placeholders
- sign out clears the session and returns the user to the logged-out flow
- removed placeholder routes and links are no longer exposed in the signed-in
  UI

## Open Decisions Resolved

The following decisions are fixed for implementation:

- keep `/login` and `/signup`
- protect `/` and the app shell
- do not implement redirect-back
- delete placeholder starter surfaces instead of hiding them
- treat onboarding as a later authenticated flow, not a public auth page

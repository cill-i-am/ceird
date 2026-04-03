# Auth Client Design

## Summary

Implement client-side authentication in `apps/app` using Better Auth's native React client against the existing `/api/auth/*` server contract.

This first client slice covers only:

- email/password sign-up
- email/password sign-in
- session-aware redirects for auth pages

This slice explicitly does not cover:

- social auth
- password reset
- email verification
- custom app-owned auth endpoints
- broad protected-route enforcement across the full app shell

## Goals

- keep the client aligned with the native Better Auth server contract
- avoid `useEffect`-driven auth orchestration
- standardize auth UI on shadcn registry components
- use TanStack Form for state and submission flow
- use `Effect/Schema` for client-side validation
- introduce only minimal abstractions that clearly reduce duplication

## Non-Goals

- wrapping Better Auth in a custom client service layer with new behavior
- building a generic form framework for the app
- implementing social sign-in buttons or forgot-password flows
- protecting every app route in this pass

## Current Context

The API already mounts a native Better Auth handler at `/api/auth/*` and enables only email/password auth. The architecture intentionally keeps auth close to Better Auth's native model and defers extra wrappers until they solve a real problem.

The current app shell renders the sidebar and site header from the root route. That shell works for authenticated app content, but it is the wrong presentation for first-run login and sign-up flows.

## Architecture

### Route Structure

Reshape the route tree so auth pages do not render inside the main app chrome.

Planned structure:

- root route remains responsible for the document shell, global CSS, scripts, and shared providers
- add an app layout route that owns the current sidebar and header shell
- add auth routes for `/login` and `/signup` that render outside the app shell

The auth routes should feel like focused entry points rather than internal dashboard pages.

### Better Auth Client

Add a single client module in `apps/app` that exports the Better Auth React client created with `createAuthClient`.

Design rules:

- use Better Auth's native client methods directly
- do not create custom app-owned auth fetch endpoints
- do not hide core Better Auth methods behind a large wrapper
- prefer same-origin configuration unless local development forces an explicit `baseURL`

Initial client usage:

- `signIn.email`
- `signUp.email`
- `getSession`
- `useSession` only where direct session reads are needed in component render, not for effect-driven orchestration

### Form Architecture

Use TanStack Form as the form state engine for both login and sign-up.

Validation should use `Effect/Schema` at the form boundary. The schema layer should own:

- required field constraints
- email format validation
- password length and basic strength requirements
- confirm-password matching for sign-up

If TanStack Form's `Standard Schema` support cleanly accepts `Effect/Schema`, use it directly. If a small adapter helper is needed, keep it local and narrow in scope.

### shadcn Form Composition

Base the auth screens on shadcn registry auth blocks, likely `@shadcn/login-03` and `@shadcn/signup-03`, then adapt them to the app's auth scope.

UI rules:

- remove social sign-in buttons
- remove forgot-password affordances for now
- use shadcn `Card` composition for the auth container
- use shadcn `FieldGroup`, `Field`, `FieldLabel`, and error presentation primitives
- keep button, input, card, and field styling registry-native wherever possible

Add a light auth-form helper only if it materially reduces duplication between login and sign-up. The helper should stay presentation-oriented, for example:

- rendering a TanStack Form field with shadcn `Field`
- mapping field meta into `data-invalid` and `aria-invalid`
- showing field and form-level errors consistently

Do not build a large generic abstraction that makes the routes harder to read.

## User Flows

### Login

Route: `/login`

Fields:

- email
- password

Behavior:

- validate with `Effect/Schema`
- submit with `authClient.signIn.email`
- disable submission while pending
- show field-level validation errors inline
- show Better Auth server errors in a form-level error area
- redirect away from `/login` if a valid session already exists

### Sign-Up

Route: `/signup`

Fields:

- name
- email
- password
- confirm password

Behavior:

- validate with `Effect/Schema`
- confirm password must match before submit
- submit with `authClient.signUp.email`
- disable submission while pending
- show field-level validation errors inline
- show Better Auth server errors in a form-level error area
- redirect away from `/signup` if a valid session already exists

## Session-Aware Routing

Auth routes should avoid rendering for already authenticated users.

Preferred behavior for this slice:

- use route-level loading or guard logic to check session state before rendering auth pages
- redirect authenticated users to the app home route
- avoid `useEffect`-based redirect code in the page components

This pass does not need to enforce authentication across the full app route tree yet. That can follow once the auth entry flows are working.

## Error Handling

Separate client validation errors from server auth errors.

- client validation errors come from `Effect/Schema` and appear inline on fields
- server errors returned by Better Auth appear in a form-level alert or message area
- unknown failures should fall back to a small generic error message rather than leaking raw payloads

Error copy should stay simple and task-oriented.

## Testing Strategy

Implementation should follow TDD.

Test order:

1. failing validation tests for login and sign-up schemas
2. failing component tests for field rendering and submit behavior
3. failing route tests for redirecting authenticated users away from auth pages

Key assertions:

- invalid input shows the correct inline errors
- valid input calls the correct Better Auth client method with the expected payload
- pending state disables submission
- Better Auth failures render form-level feedback
- existing sessions redirect away from `/login` and `/signup`

## Implementation Notes

- prefer a dedicated `auth-client` module over ad hoc client creation inside routes
- keep route files focused on composition and flow, not low-level validation details
- preserve the shadcn visual language already adopted in the app
- avoid introducing unrelated authorization or session-domain abstractions in this pass

## Open Decisions Resolved

The following decisions are now fixed for implementation:

- use native Better Auth on both API and client
- keep the current scope to email/password only
- render auth screens outside the sidebar app shell
- use TanStack Form plus `Effect/Schema`
- allow a small shadcn-friendly form abstraction only if it clearly improves reuse

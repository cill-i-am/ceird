# Authentication Architecture

## Why This Starts Small

Authentication is being introduced as a single backend slice under `domains/identity/authentication`.

The goal of this first cut is to:

- keep auth behavior close to Better Auth's native model
- avoid premature wrappers and extra abstractions
- establish a clean domain boundary we can extend later
- support only email/password for now

This keeps the project aligned with feature slices and DDD without turning the first auth integration into a framework exercise.

## Current Shape

The current backend auth slice owns:

- Better Auth configuration
- dynamic Better Auth host/origin resolution for sandbox aliases and local fallbacks
- the Drizzle auth schema
- Postgres wiring
- Better Auth handler mounting at `/api/auth/*`
- optional Effect-native database layers for future slices

The API app still owns the outer HTTP server and the existing system routes. The auth slice is responsible only for the identity/authentication concern.

## Why We Are Not Wrapping Better Auth In Effect Yet

Better Auth already owns:

- the auth HTTP contract
- cookie/session behavior
- sign-up, sign-in, sign-out, and session endpoints
- the server-side auth runtime

Wrapping those endpoints in custom Effect endpoints today would mostly duplicate Better Auth's contract and increase maintenance cost before we have a concrete need for it.

For v1, the simpler choice is to mount Better Auth directly and keep app-specific Effect abstractions deferred.

## Current Scope

Included now:

- email/password sign-up
- email/password sign-in
- sign-out
- session handling

Excluded for now:

- frontend auth client integration
- password reset
- email verification
- social auth
- custom `/me` or `/viewer` auth facade endpoints
- Effect auth/session wrapper services

## Future Extension Points

If the app later needs more Effect-native auth composition, the most likely next steps are:

- add a small `CurrentSession` Effect service for protected backend slices
- add app-facing typed endpoints such as `/me` or `/permissions`
- add authorization helpers around roles, workspaces, or ownership rules
- add frontend integration using Better Auth's React client
- add `effect-atom` only if derived auth state becomes genuinely useful on the client

The bias should stay the same: introduce those pieces only when they solve a real problem.

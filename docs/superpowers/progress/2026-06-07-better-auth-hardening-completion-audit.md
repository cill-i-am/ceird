# Better Auth Hardening Completion Audit

Last updated: 2026-06-07

This audit tracks the active goal against current evidence. It is intentionally
stricter than the issue map: `Ready for review` means the branch has
implementation and verification evidence, not that the full project goal is
complete.

## Verdict

The project is not complete yet.

All approved implementation, documentation, migration, Linear, and
decision-tracking work is ready for review on
`codex/better-auth-hardening`. Fresh package-local runtime verification has now
covered the materially changed account/session, 2FA, organization, invitation,
and organization-security-activity paths. The remaining project gate is
Cloudflare/Neon stage parity. Local in-app Browser verification is waived for
now per user direction.

## Requirement Evidence

| Requirement                                   | Status           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                             | Remaining work                                                                                                                                                                      |
| --------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration branch and worktree               | Ready for review | `codex/better-auth-hardening` in `.worktrees/better-auth-hardening`; controller plan records the worktree strategy.                                                                                                                                                                                                                                                                                                                  | None for handoff.                                                                                                                                                                   |
| Better Auth feature/plugin catalog            | Ready for review | `docs/architecture/better-auth-feature-adoption.md`; Linear feature adoption doc.                                                                                                                                                                                                                                                                                                                                                    | Keep catalog current as future Better Auth versions are adopted.                                                                                                                    |
| Implementation gap audit                      | Ready for review | `docs/architecture/better-auth-implementation-gaps.md`; Linear implementation gaps doc.                                                                                                                                                                                                                                                                                                                                              | Keep deferred privacy/account-activity gaps in backlog spikes.                                                                                                                      |
| Linear project, milestones, and issue slicing | Ready for review | Linear project `Better Auth security and UX hardening`; issue map `TSK-41` through `TSK-75`; project backlog spikes `TSK-110` through `TSK-121` plus `TSK-130`; standalone backlog spike `TSK-122` for device/location metadata per user direction.                                                                                                                                                                                  | Project status updates are disabled, so coordination uses the runbook, issue map, and coordination comment.                                                                         |
| Product/security decisions                    | Ready for review | `docs/architecture/better-auth-decision-log.md`; decision packets 1 through 4; approved follow-up spikes for deferred decisions.                                                                                                                                                                                                                                                                                                     | Deferred spikes remain backlog work by design.                                                                                                                                      |
| UX shaping decisions                          | Ready for review | Shape docs for account security settings, 2FA, OAuth consent, and organization security activity.                                                                                                                                                                                                                                                                                                                                    | No unresolved first-release UI decisions are blocking the branch.                                                                                                                   |
| Approved implementation issues                | Ready for review | Issue map marks implemented policy, backend, migration, and UI issues as `Ready for review`; Linear has no project issues in `Todo` or `In Progress`.                                                                                                                                                                                                                                                                                | Merge/review remains external to this audit.                                                                                                                                        |
| Database schema and migrations                | Ready for review | Drizzle migrations under `apps/domain/drizzle` and `apps/domain/drizzle-alchemy` for auth audit, organization audit, and two-factor tables; infra schema exports.                                                                                                                                                                                                                                                                    | Verify the stage/native Neon migration path during runtime parity.                                                                                                                  |
| Architecture docs                             | Ready for review | Updated `docs/architecture/auth.md`, permission matrix, decision log, feature-adoption catalog, implementation-gaps audit, frontend, and local infra docs.                                                                                                                                                                                                                                                                           | None for handoff.                                                                                                                                                                   |
| Non-browser verification                      | Ready for review | `pnpm test`, `pnpm lint`, `pnpm check-types`, direct `ultracite check .`, direct `oxfmt --check .`, `knip --no-config-hints`, focused regression reruns, the post-deferral direct app/domain/infra/identity-core plus no-socket auth helper and mounted captcha refresh passed, and follow-up no-socket review found no material issues.                                                                                             | DB-backed tests that require an unavailable local integration DB were skipped in the full run; package-local DB-backed runtime coverage now supplements them.                       |
| Browser/runtime verification                  | Partial          | Fresh package-local Playwright verification on 2026-06-07 used disposable Postgres `127.0.0.1:5439`, domain `3002`, API `3001`, and app `4173`. The e2e auth/org suite passed 19 tests; manual browser smokes passed for account sessions, TOTP enrollment/login, backup-code login, and organization security activity with screenshots. The in-app Browser connector was attempted first and returned no registered `iab` browser. | Run the remaining Cloudflare/Neon stage parity pass, especially real Turnstile handling and deployed client-IP behavior. Local in-app Browser retry is deferred per user direction. |
| Cloud stage preflight                         | Partial          | `pnpm alchemy:doctor --stage codex-better-auth-hardening --json` passed on 2026-06-07: stage, `.env.local`, required env values, Node, and Alchemy beta are ready. `pnpm alchemy:state-audit --stage codex-better-auth-hardening --json --tenant-routing-required --allow-finding legacy_drizzle_migrations_state` found no stage resources in Alchemy state.                                                                        | Provider-mutating `alchemy dev` or `alchemy deploy` is required to create/update the stage, but must wait for explicit operator confirmation of target stage and credentials.       |

## Current Open Gate

Cloudflare/Neon runtime parity is the only known remaining gate. The planned
stage is `codex-better-auth-hardening`, but provider-mutating Alchemy commands
must not run until the operator confirms the target stage and credentials for
the current session. Read-only preflight now shows the credentials/env are
present, but the planned stage has no Alchemy resource state yet.

The source of truth for the final runtime pass is:

- `docs/superpowers/progress/2026-06-07-better-auth-hardening-stage-verification-runbook.md`
- Linear stage runbook:
  https://linear.app/tskr/document/better-auth-hardening-stage-verification-runbook-2575d8ec56ba

## Final Completion Criteria

Do not mark the active goal complete until all of the following are true:

- A reachable local or Alchemy stage target is running.
- The stage verification runbook has been exercised for materially changed
  auth, security settings, 2FA, OAuth consent, and organization security
  activity workflows, using stage Playwright/API evidence while local in-app
  Browser verification is waived.
- Screenshots and console/error notes are recorded for non-sensitive states.
- Any stage-specific failures are fixed or explicitly split into follow-up
  issues.
- The issue map, completion audit, runbook, and Linear coordination comment are
  updated with the final runtime evidence.

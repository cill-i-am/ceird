# Better Auth Hardening Issue Map

Last updated: 2026-06-06

This is the controller map for Linear project
`Better Auth security and UX hardening`. It exists to keep issue workers,
reviewers, and future Codex sessions aligned on the current artifact,
dependency, and verification lane for each issue.

## Project Artifacts

| Artifact                 | Location                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Linear project           | https://linear.app/tskr/project/better-auth-security-and-ux-hardening-cee0b0f66e98    |
| Execution plan           | `docs/superpowers/plans/2026-06-06-better-auth-hardening.md`                          |
| Progress note            | `docs/superpowers/progress/2026-06-06-better-auth-hardening.md`                       |
| Decision Packet 1        | `docs/superpowers/progress/2026-06-06-better-auth-hardening-decision-packet-1.md`     |
| Decision Packet 2        | `docs/superpowers/progress/2026-06-06-better-auth-hardening-decision-packet-2.md`     |
| Decision Packet 3        | `docs/superpowers/progress/2026-06-06-better-auth-hardening-decision-packet-3.md`     |
| Decision log             | `docs/architecture/better-auth-decision-log.md`                                       |
| Linear decision log      | https://linear.app/tskr/document/better-auth-decision-log-b7bf51e2af59                |
| Permission matrix        | `docs/architecture/auth-organization-permission-matrix.md`                            |
| Linear permission matrix | https://linear.app/tskr/document/auth-and-organization-permission-matrix-2ef2c76db252 |
| Feature adoption doc     | `docs/architecture/better-auth-feature-adoption.md`                                   |
| Implementation gaps doc  | `docs/architecture/better-auth-implementation-gaps.md`                                |

## Status Vocabulary

- `Ready for review`: implementation or documentation exists on the integration
  branch and has passed the current verification gate, but is not merged.
- `Needs decision`: dependent implementation must wait for user approval or
  adjustment.
- `Needs shape`: UI work must go through `$impeccable shape` and human product
  review before implementation.
- `Implementation pending`: decision/design dependencies are not fully resolved
  or implementation has not started.
- `Deferred candidate`: likely out of immediate scope unless the user approves
  adoption.

## Auth Baseline

| Issue                                        | Current state                                                  | Primary artifact                                           | Next gate                                                        |
| -------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| `TSK-41` Update auth architecture docs       | Ready for review                                               | `docs/architecture/auth.md`                                | Merge/review current docs branch.                                |
| `TSK-42` Verified-email gate policy          | Needs decision                                                 | `docs/architecture/better-auth-decision-log.md`            | User approves or adjusts verified-email gates.                   |
| `TSK-43` Better Auth secret rotation plan    | Needs decision                                                 | `docs/architecture/better-auth-decision-log.md`            | User approves env/config shape before runbook/config work.       |
| `TSK-44` Permission ownership matrix         | Partially ready for review; future policy still needs decision | `docs/architecture/auth-organization-permission-matrix.md` | User approves or adjusts `external` role policy.                 |
| `TSK-45` Plugin adoption migration checklist | Ready for review                                               | `docs/architecture/better-auth-feature-adoption.md`        | Merge/review current docs branch.                                |
| `TSK-46` Security audit event taxonomy       | Needs decision                                                 | `docs/architecture/better-auth-decision-log.md`            | User approves audit-grade event classes and observability split. |

## Credential And Session Security

| Issue                                 | Current state                  | Primary artifact                                    | Next gate                                                       |
| ------------------------------------- | ------------------------------ | --------------------------------------------------- | --------------------------------------------------------------- |
| `TSK-47` Password policy              | Needs decision                 | `docs/architecture/better-auth-decision-log.md`     | User chooses min/max password length.                           |
| `TSK-48` HIBP password screening      | Needs decision                 | `docs/architecture/better-auth-feature-adoption.md` | User chooses provider outage behavior.                          |
| `TSK-49` Account security settings UX | Needs decision and needs shape | `docs/architecture/better-auth-decision-log.md`     | User confirms first-release controls, then `$impeccable shape`. |
| `TSK-50` Active session listing       | Needs decision and needs shape | `TSK-49` shape artifact once created                | User approves visible session metadata.                         |
| `TSK-51` Session revocation controls  | Needs decision and needs shape | `TSK-49` shape artifact once created                | User chooses current-session revocation behavior.               |
| `TSK-52` Account deletion policy      | Needs decision                 | `docs/architecture/better-auth-decision-log.md`     | User decides in-scope vs deferred and retention model.          |

## Abuse Protection

| Issue                                      | Current state          | Primary artifact                                | Next gate                                                      |
| ------------------------------------------ | ---------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| `TSK-53` Captcha policy                    | Needs decision         | `docs/architecture/better-auth-decision-log.md` | User chooses provider, environments, and trigger flows.        |
| `TSK-54` Captcha plugin adoption           | Implementation pending | `TSK-53` policy once approved                   | Follow plugin checklist after captcha policy.                  |
| `TSK-55` Rate-limit storage failure policy | Needs decision         | `docs/architecture/better-auth-decision-log.md` | User chooses fail-open/fail-closed behavior by endpoint class. |
| `TSK-56` Auth delivery abuse controls      | Needs decision         | `docs/architecture/better-auth-decision-log.md` | User approves per-flow delivery limits.                        |
| `TSK-57` Abuse telemetry and alerting      | Needs decision         | `docs/architecture/better-auth-decision-log.md` | User approves alert vs dashboard-only signals.                 |

## Privileged Account Protection

| Issue                                   | Current state                  | Primary artifact                                   | Next gate                                                         |
| --------------------------------------- | ------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------- |
| `TSK-58` 2FA enforcement policy         | Needs decision                 | `docs/architecture/better-auth-decision-log.md`    | User chooses optional/prompted/required/step-up model.            |
| `TSK-59` 2FA enrollment and recovery UX | Needs decision and needs shape | `TSK-58` policy once approved                      | `$impeccable shape` after enforcement policy.                     |
| `TSK-60` Better Auth two-factor plugin  | Implementation pending         | Plugin checklist                                   | Start only after policy and schema plan.                          |
| `TSK-61` 2FA settings management        | Needs shape                    | `TSK-59` shape artifact once created               | Implement after plugin and settings UX shape.                     |
| `TSK-62` Login 2FA challenge            | Needs decision and needs shape | `TSK-59` and `TSK-62` shape artifacts once created | User chooses inline vs route continuation and recovery-code path. |
| `TSK-63` Passkey adoption strategy      | Needs decision                 | `docs/architecture/better-auth-decision-log.md`    | User adopts, defers, or scopes passkeys to step-up auth.          |

## OAuth And MCP Hardening

| Issue                                             | Current state                  | Primary artifact                                    | Next gate                                                                       |
| ------------------------------------------------- | ------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| `TSK-64` Dynamic client registration threat model | Needs decision                 | `docs/architecture/better-auth-decision-log.md`     | User chooses allowed registration model by scope/environment.                   |
| `TSK-65` Constrain client registration            | Implementation pending         | `TSK-64` policy once approved                       | Implement registration/scopes/metadata constraints after policy.                |
| `TSK-66` OAuth consent UX                         | Needs decision and needs shape | `docs/architecture/better-auth-decision-log.md`     | User approves scope grouping and high-risk treatment, then `$impeccable shape`. |
| `TSK-67` OAuth/MCP audit events                   | Needs decision                 | `TSK-46` taxonomy once approved                     | Implement after audit taxonomy and registration policy.                         |
| `TSK-68` Device Authorization evaluation          | Needs decision                 | `docs/architecture/better-auth-feature-adoption.md` | User adopts, defers, or rejects device flow for CLI/MCP.                        |
| `TSK-69` MCP and Agent Auth plugin evaluation     | Needs decision                 | `docs/architecture/better-auth-feature-adoption.md` | User keeps current integration, pilots, or defers plugin adoption.              |

## Organization Authorization

| Issue                                       | Current state                             | Primary artifact                                           | Next gate                                                                 |
| ------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| `TSK-70` External-role regression coverage  | Implementation pending                    | `docs/architecture/auth-organization-permission-matrix.md` | User resolves `external` policy or approves testing current mapping.      |
| `TSK-71` Org/member/invitation limit policy | Needs decision                            | `docs/architecture/better-auth-decision-log.md`            | User chooses first-release limits and enforcement owner.                  |
| `TSK-72` Implement org/invitation limits    | Implementation pending                    | `TSK-71` policy once approved                              | Implement after limits and user-facing behavior are approved.             |
| `TSK-73` Organization security audit events | Needs decision                            | `TSK-46` taxonomy and permission matrix                    | Implement after taxonomy and visible/private event split.                 |
| `TSK-74` Organization security activity UI  | Needs decision and needs shape            | `TSK-73` audit event model once created                    | User chooses visible events, then `$impeccable shape`.                    |
| `TSK-75` Teams and dynamic access control   | Needs decision; likely deferred candidate | `docs/architecture/better-auth-feature-adoption.md`        | User adopts now or explicitly defers until teams become product concepts. |

## Verification State

Current integration branch verification:

- `git diff --check`
- `pnpm check-types`

Not yet run:

- Runtime tests for new auth behavior, because no runtime behavior has been
  approved or changed yet.
- Drizzle migration generation, because no schema-affecting plugin has been
  approved yet.
- Browser verification, because no user-facing UI behavior has changed yet.

## Current Gate

The immediate implementation blocker is the first decision packet:

1. Verified email gates.
2. Better Auth secret rotation config shape.
3. Future `external` role policy around Better Auth member-like access.
4. Audit-grade auth/organization event classes.

Until those are resolved, only documentation clarity, Linear organization, and
read-only/current-state analysis should proceed.

Compact approval surface:
`docs/superpowers/progress/2026-06-06-better-auth-hardening-decision-packet-1.md`.

Next approval surface:
`docs/superpowers/progress/2026-06-06-better-auth-hardening-decision-packet-2.md`.

Remaining approval surface:
`docs/superpowers/progress/2026-06-06-better-auth-hardening-decision-packet-3.md`.

# Mock Linear Issue

Key: TSK-205
Title: TSK-205 Add workspace digest opt-out setting
State: ready-for-agent
Classification: AFK

## Parent

Project: PROJ-42 Weekly Admin Activity Digest

## What to build

Add a workspace-level setting that excludes the workspace from weekly digest
email generation.

## Acceptance Criteria

- Workspace admins can toggle the digest opt-out setting.
- Digest generation excludes opted-out workspaces.
- Existing enabled workspaces remain included by default.
- Verification covers persistence, API boundary, and user-visible setting UI.

## Out of Scope

- Scheduling changes.
- Email template redesign.
- Non-admin preferences.

## Risk

Medium. This touches workspace settings, persistence, and admin UI.

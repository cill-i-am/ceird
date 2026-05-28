# Workspace Sheet Stack Design

## Summary

Ceird currently models several sheet-style overlays as child routes, such as
`/jobs/new`, `/jobs/$jobId`, `/sites/new`, and `/sites/$siteId`. The UI behaves
like a layered workspace: the list page remains visible while a drawer opens,
and nested actions can open related creation flows from inside that drawer.
The URL should describe that layered workspace state directly instead of
pretending every sheet is a standalone page.

This design moves organization-scoped sheets into typed TanStack Router search
state owned by the `/_app/_org` route family. The visible route remains the
workspace surface (`/jobs`, `/sites`, `/`, and future org pages), while a typed
sheet stack search param controls which sheets are open.

## Current Behavior

- The jobs route renders the jobs page and an `<Outlet />`.
- `/jobs/new` exists only to mount the new job drawer.
- `/jobs/$jobId` exists primarily to mount the job detail drawer.
- `/sites/new` and `/sites/$siteId` follow the same shape for site drawers.
- From a site detail drawer, clicking `New job` navigates to
  `/jobs/new?siteId=<siteId>`, closes the site context, and opens the job
  create drawer on the jobs route.
- Hotkey scope logic has to special-case sheet paths such as `/jobs/new`.

This works, but route paths are carrying overlay state. That makes sheet
composition harder, especially when one sheet needs to open another sheet while
preserving the parent draft.

## Goals

- Decouple sheet overlays from the file-route tree.
- Keep real routes focused on durable workspace surfaces.
- Model sheet state with type-safe TanStack Router search params.
- Support stacked sheets so a parent draft can open a related child flow.
- Preserve back/forward, shareable links, and refresh behavior for the sheet
  stack and durable seed IDs.
- Keep unsaved draft field values out of the URL.
- Centralize sheet opening, replacement, pop, and close behavior behind typed
  helpers.
- Preserve keyboard discoverability and context-aware shortcut scopes.

## Non-Goals

- Do not persist unsaved draft field values through the URL. If draft recovery
  becomes important, use an API-backed draft persistence model.
- Do not introduce XState for the sheet stack. The router owns URL state, and a
  small typed reducer is enough for stack transitions.
- Do not redesign the visual treatment of drawers beyond the behavior required
  for stacking, focus, and close affordances.
- Do not add customer portals, attachments, billing, custom workflows, or other
  jobs-domain features.

## URL Model

The route path remains the workspace surface. Sheet state is represented by a
single validated search field.

Conceptual examples:

```text
/jobs?sheets=[{kind:"job.create"}]
/sites?sheets=[{kind:"site.detail",siteId:"..."},{kind:"job.create",siteId:"..."}]
/?sheets=[{kind:"job.create"},{kind:"site.create"}]
```

TanStack Router serializes nested JSON search params, so app code should never
hand-build the encoded URL. Feature code should use typed helpers instead.

Use `sheets` as the search key. It describes a stack rather than one active
overlay, and keeps the route-level contract stable while the internal sheet
union evolves.

## Sheet Types

The typed model should be a discriminated union.

```ts
type WorkspaceSheet =
  | { kind: "job.create"; siteId?: SiteIdType; contactId?: ContactIdType }
  | { kind: "job.detail"; jobId: WorkItemIdType }
  | { kind: "site.create" }
  | { kind: "site.detail"; siteId: SiteIdType }
  | { kind: "contact.create"; siteId?: SiteIdType };

type WorkspaceSheetSearch = {
  readonly sheets?: readonly WorkspaceSheet[];
};
```

`contact.create` may ship only when contacts become a standalone sheet. It is
included here to prove the model supports nested related creation, not to force
contact work into the first implementation.

Boundary-level decoding should use `Schema` or equivalent route search
validation so IDs are branded and invalid sheet payloads are normalized safely.
Invalid stack entries should be dropped. If the stack becomes empty after
decoding, no sheet opens.

## Stack Semantics

The stack order is bottom to top. The final item is the active sheet.

- `pushWorkspaceSheet(sheet)` appends a child sheet.
- `replaceTopWorkspaceSheet(sheet)` swaps the active sheet without disturbing
  the parent stack.
- `popWorkspaceSheet()` closes only the active sheet.
- `closeWorkspaceSheets()` clears the whole stack.
- `openWorkspaceSheet(sheet)` replaces the stack with a single sheet when the
  action is conceptually a fresh top-level task.

Parent sheets stay mounted while a child sheet is open. This preserves local
draft state such as a partially completed job create form while the user creates
or edits a related site.

Back button behavior should follow browser history. Opening, pushing, replacing,
and popping sheets should update search params through router navigation so the
user can step through overlay states naturally.

## Ownership And Components

The `/_app/_org` route family should validate the sheet stack search params and
make the decoded stack available to org child routes. Child route search
decoders such as the jobs `view` decoder should continue to own only their
page-specific state; TanStack Router should merge the org-level sheet state
with child route search state through the route hierarchy.

New frontend pieces:

- `features/workspace-sheets/workspace-sheet-search.ts`: search schema,
  decoder, union types, and stack reducer.
- `features/workspace-sheets/workspace-sheet-navigation.tsx`: hooks/helpers
  for opening, pushing, replacing, popping, and clearing sheets.
- `features/workspace-sheets/workspace-sheet-stack.tsx`: renders the decoded
  stack, applies z-order, and handles focus/escape behavior.
- Feature adapters for jobs, sites, and future contacts that render the
  existing sheet components from a `WorkspaceSheet` entry.

Existing feature sheets should become presentation/workflow components that do
not assume their route path. For example, `JobsCreateSheet` should receive
close and completion callbacks rather than calling `useNavigate({ from:
"/jobs/new" })` directly.

## Data Flow

Search params store only sheet identity and durable seed IDs. Sheet forms own
local draft state while mounted. When a nested child sheet creates an entity,
the child should update the shared feature state and report the created entity
to the parent via a typed completion callback.

Examples:

- A job create sheet pushes `site.create`.
- The site create sheet creates a site through the existing sites mutation.
- The sites state provider receives the new site.
- The stack pops back to the job create sheet.
- The job draft selects the created site.

If a deep-linked detail sheet references an ID that the current organization
cannot load, the sheet should show a not-found or unavailable state inside the
drawer and offer a close action. The route path should remain stable.

## Interaction And Accessibility

- Only the top sheet should be interactable.
- Parent sheets should remain visible enough to communicate layering but should
  not receive focus while a child sheet is active.
- Escape closes the active sheet, not the whole stack.
- Close buttons on child sheets pop one level.
- A dedicated "Close all" affordance can clear the whole stack when stack depth
  is greater than one.
- Shortcut scopes should derive from the decoded sheet stack rather than path
  names like `/jobs/new`.
- Existing create/detail shortcuts should remain discoverable in the shortcut
  help overlay when their sheet is active.

## Error Handling

- Invalid sheet kind: drop that stack entry.
- Invalid branded ID: drop that stack entry.
- Empty normalized stack: render no sheets.
- Detail ID not found or inaccessible: render an unavailable sheet state with a
  close action.
- Missing permission to create or edit: do not open the sheet from UI actions;
  for direct links, render a permission message in the sheet and allow close.

## Testing

Focused tests should cover:

- search decoding for valid and invalid sheet stacks
- stack reducer behavior for push, replace top, pop, and close all
- helper navigation preserves existing non-sheet route search where appropriate
- job create can push site create and return with the parent draft intact
- site detail can push job create without moving to `/jobs/new`
- hotkey scopes derive from the active stack item
- E2E confirms a site detail `New job` action stays on the site or chosen base
  route path while opening a job create sheet through search state

## Documentation Updates

Implementation should update:

- `docs/architecture/frontend.md` route table and route model notes
- any jobs/sites architecture text that still describes create/detail sheets as
  route pages
- hotkey documentation if shortcut-scope derivation changes materially

## Implementation Decisions

- App code must interact with a typed `sheets` array and helper functions, not
  manually encoded query strings.
- The first implementation may leave contact creation as an inline job-create
  affordance until contacts become a full product surface.
- Create and detail sheets should migrate together. Mixing route-owned and
  query-owned sheets would keep the current mental model split alive and would
  leave hotkey scope derivation path-dependent.

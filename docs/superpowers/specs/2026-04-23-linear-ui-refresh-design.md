# Linear-Inspired UI Refresh Design

## Summary

Redesign the app UI around a quieter, denser, more product-like visual system.

This pass should keep the structural reliability of shadcn/ui blocks while
moving the app away from a starter-block feel:

- auth and pre-app flows should stay close to
  `https://ui.shadcn.com/blocks/login#login-02`
- the authenticated app shell should take its structural baseline from
  `https://ui.shadcn.com/blocks#dashboard-01`
- the overall product should feel more inspired by Linear than by block demos:
  fewer cards, less explanatory copy, tighter hierarchy, cleaner scanning, and
  more intentional light/dark themes

This is a design-system and layout refactor, not a backward-compatibility pass.
The current card-heavy surfaces should be reshaped rather than preserved.

## Goals

- reduce visual noise across auth, onboarding, home, and members flows
- replace repeated card stacks with a smaller set of sharper shared primitives
- bring auth flows closer to the `login-02` split-shell composition
- bring the authenticated app shell closer to the `dashboard-01` composition
- make both light and dark themes feel deliberate and production-ready
- align the overall product feel with Linear's calm, futuristic, operational UX
  without cloning Linear literally
- keep the shadcn/ui foundation visible enough that the system remains easy to
  extend

## Non-Goals

- inventing a fully custom design language detached from shadcn/ui in this pass
- reworking product workflows or route behavior beyond what the new UI requires
- adding new feature areas beyond the existing auth, onboarding, home, and
  members surfaces
- building heavy dashboard analytics or filler content just to occupy space
- attempting the more aggressive "option 3" reinterpretation in the same pass

## Current Context

The current app already has working auth and organization flows, but the UI
still reads as a composition of nicely styled cards and explanatory copy rather
than a cohesive product shell.

Observed problems:

- `EntryShell` and `EntrySurfaceCard` create a repeated "hero panel plus form
  card plus support cards" pattern across public flows
- home and members pages still rely on stacked cards when list/panel layouts
  would scan faster
- copy is often too descriptive for a Linear-inspired product rhythm
- the current theme tokens skew soft and spacious rather than sharp and
  operational

The design context for the product remains:

- audience: small to medium-sized trades and construction businesses
- use case: fast scanning and quick coordination between office and field-adjacent
  staff
- tone: slick, dependable, restrained, professional, daylight-first

## Core Decisions

The following decisions are fixed for implementation:

1. use the "option 2" direction: shadcn block structure with a stronger
   Linear-style finish
2. use `login-02` as the baseline composition for auth and pre-app flows
3. use `dashboard-01` as the baseline structure for the authenticated shell
4. support both light and dark themes in the redesign, not light-only
5. treat light mode as the primary reference while giving dark mode equal design
   attention
6. reduce card usage aggressively rather than re-skinning every existing card
7. prefer denser lists, utility panels, separators, and page-level layouts over
   repeated boxed sections
8. preserve the shadcn/ui component base and adapt it through tokens, layout,
   composition, and copy discipline

## Design Direction

The product should feel like a calm operating system for work, not a generic
SaaS dashboard.

Desired qualities:

- quiet
- precise
- fast to scan
- premium without flash
- futuristic through restraint rather than effects
- grounded enough for trades businesses rather than startup-theatrical

This should borrow Linear's product ethos more than its exact visuals. The app
should feel intentionally edited: fewer surfaces, shorter copy, stronger
alignment, and clearer action hierarchy.

## Design System

### Token Direction

The token system should move toward:

- tighter contrast between background, surface, and text
- thinner-feeling borders and more disciplined surface separation
- slightly smaller default radii than the current soft rounded style
- more consistent spacing rhythm with fewer oversized gaps
- restrained accent usage, with accents reserved for action and emphasis rather
  than decoration

The result should make both themes feel sharper and more product-like.

### Typography

Typography should become more compact and contrast-driven.

Rules:

- keep strong contrast between page titles, labels, metadata, and body copy
- reduce paragraph length and descriptive text throughout the product
- use short operational copy wherever possible
- preserve readable line lengths and clear hierarchy
- avoid "marketing voice" in app surfaces

The interface should communicate confidence through brevity rather than through
extra explanation.

### Surface Rules

Cards should stop being the default layout primitive.

Use these more often:

- full-page layout sections
- slim status strips
- separated page regions
- utility panels
- row-based lists
- compact empty states

Use cards only when a surface genuinely needs focus or isolation, such as a form
surface in auth or a utility composer panel in the app.

### Interaction Style

Primary actions should remain obvious, but the overall button hierarchy should
be quieter and more disciplined.

Rules:

- keep one clear primary action per area
- push secondary actions toward ghost, outline, or link treatments
- keep success and error feedback short and inline
- keep motion subtle and product-like
- preserve strong focus states and keyboard usability

## Shared UI Architecture

The redesign should introduce a smaller set of reusable UI primitives that
govern the major surfaces.

Primary shared primitives:

- auth split shell
- auth context panel
- compact form surface
- authenticated app shell
- page header
- status strip
- utility panel
- dense row list

These primitives should replace one-off card compositions and establish a more
consistent rhythm across screens.

## Public Flow Design

### Covered Routes

This pass should visually refresh:

- `/login`
- `/signup`
- `/forgot-password`
- `/reset-password`
- `/verify-email`
- invitation acceptance flow
- organization onboarding flow

### Shared Auth Shell

All public and pre-app flows should share one split-shell composition derived
from `login-02`.

Left column:

- product identity
- minimal cross-linking between auth steps
- one focused form or state surface
- tight copy that tells the user exactly what to do next

Right column:

- contextual product framing instead of support-card grids
- invitation details when relevant
- status framing for reset and verification states
- restrained visual texture that works in both themes

Important rule:

- do not repeat the same explanatory support content as three mini-cards on the
  right side

### Login And Signup

Login and signup should feel like the cleanest expression of the system.

Requirements:

- keep the visual structure close to `login-02`
- tighten the copy significantly
- use one compact form surface
- keep the switch links between login and signup available but visually quiet
- reduce supporting text to only what is needed for action confidence

### Forgot Password And Reset Password

These flows should use the same shell but read as status-oriented rather than
marketing-oriented.

Requirements:

- keep reset request and reset completion compact and clear
- when links are invalid or expired, use a single focused status surface rather
  than stacked support elements
- preserve generic success messaging for reset request security behavior
- keep all recovery actions obvious and close to the primary surface

### Email Verification

Email verification should feel like a lightweight account state checkpoint.

Requirements:

- one clear state surface for success or invalid-token behavior
- brief copy
- direct routes back into the app or login
- avoid decorative support content that dilutes the message

### Invitation Acceptance

Invitation acceptance should make context feel attached and explicit.

Requirements:

- show organization, invited email, and role in the context column
- keep the primary acceptance action strong and unambiguous
- when sign-in or account switching is required, show the next step clearly
- avoid multiple stacked boxes for invitation metadata

### Organization Onboarding

Organization onboarding should use the same split-shell family so the transition
from account creation into workspace setup feels continuous.

Requirements:

- keep the main form focused on organization name and slug
- move setup framing into the context column
- use one sharp form surface rather than a large explanatory card
- visually position onboarding as the first in-product setup step rather than a
  detached auth page

## Authenticated App Design

### Shell

The signed-in shell should use `dashboard-01` as the structural baseline.

Requirements:

- persistent sidebar
- compact top header
- one clean inset content canvas
- clear navigation hierarchy
- consistent behavior in both light and dark themes

The shell should feel like an operating environment, not a collection of
feature demos.

### Sidebar And Header

The sidebar and header should become slimmer and more focused.

Rules:

- keep branding understated
- keep navigation short and operational
- remove visual bulk where possible
- make search, theme switch, and account controls feel integrated rather than
  appended

### Home Page

The home page should become a calm orientation screen instead of a hero-card
dashboard.

Recommended structure:

- slim status strip
- compact page header
- short "next actions" list
- one secondary context panel

Rules:

- do not reintroduce a large headline card with nested supporting cards
- keep the page useful as a quick orientation surface
- preserve the early-product simplicity instead of fabricating analytics

### Members Page

The members page should feel denser and more operational.

Recommended structure:

- compact page header
- invite utility panel
- row-based pending invitation list

Rules:

- the invite composer may stay isolated as a utility surface, but the invitation
  list should no longer render as card-per-row
- role and status should appear as tight inline metadata
- empty states should be brief and actionable
- the desktop layout can hold a persistent utility panel; mobile should stack
  naturally without losing access to key actions

## Theme Strategy

### Light Theme

Light mode is the primary reference.

Desired feel:

- pale mineral or paper-like base surfaces
- dark ink-like text
- restrained blue-gray or steel-tinted accents
- strong daylight readability

This should feel crisp and reliable in bright environments.

### Dark Theme

Dark mode should feel equally intentional, not like an inverted light theme or
an attempt at neon futurism.

Desired feel:

- deep graphite surfaces
- crisp but softened borders
- controlled surface depth
- cooler muted accents without glow effects

Dark mode should preserve the same hierarchy and density as light mode.

### Theme Consistency Rule

Changing theme should change atmosphere, not information architecture.

That means:

- spacing remains consistent
- hierarchy remains consistent
- components do not gain extra ornament in dark mode
- the same pages should scan the same way in both themes

## Responsive Behavior

The redesign should remain structurally consistent on mobile without hiding
critical actions.

Requirements:

- auth split-shell collapses cleanly to a single-column flow on small screens
- dashboard shell preserves navigation access and readable density
- utility panels stack naturally on narrow screens
- row-based data remains legible and touch-friendly
- no critical flow should depend on large-screen-only affordances

## Accessibility And Motion

Accessibility should remain a first-class constraint.

Requirements:

- maintain strong contrast in both themes
- preserve keyboard navigation and visible focus states
- keep status, success, and error feedback understandable without relying on
  color alone
- use restrained motion with reduced-motion-safe behavior
- avoid decorative visual treatments that lower clarity

## Implementation Guidance

The implementation should start from shared primitives rather than from isolated
page rewrites.

Suggested order:

1. retune global theme tokens and base layout rhythm
2. replace the current auth shell with the new shared split-shell system
3. migrate login, signup, forgot/reset, verify, invitation, and onboarding onto
   that shell
4. reshape the authenticated shell around the dashboard baseline
5. refactor home and members onto the new page/header/panel/list primitives
6. verify theme parity and responsive behavior

This keeps the redesign coherent and reduces page-by-page drift.

## Testing And Review Strategy

Verification should cover both correctness and feel.

Functional review:

- login
- signup
- forgot password
- reset password
- email verification
- invitation acceptance
- organization onboarding
- home
- members

Visual/product review:

- fewer cards across all major surfaces
- tighter copy throughout
- cleaner action hierarchy
- stronger scanability
- clear alignment with the approved auth and dashboard block references
- consistent quality in both light and dark themes

Tooling expectation:

- use browser automation and Computer Use during QA to walk the core flows and
  catch layout or interaction regressions

## Success Criteria

This redesign is successful when:

- the app no longer feels like a collection of block demos
- auth flows feel structurally close to `login-02`
- the authenticated shell feels structurally close to `dashboard-01`
- the product reads as quieter, sharper, and more operational overall
- both themes feel intentional
- the home and members pages scan faster with materially less card noise and
  text clutter

## Follow-On Path

If this pass succeeds, the project will be in a strong position to pursue a
later "option 3" stretch:

- a more opinionated custom interpretation of the same foundations
- deeper Linear-inspired refinement
- more bespoke motion and visual identity

That future work should build on this redesign rather than replace it.

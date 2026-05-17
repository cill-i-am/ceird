---
name: Ceird
description: Linear-style construction operations workspace for jobs, sites, labels, maps, and AI-assisted coordination.
colors:
  background: "oklch(0.976 0.003 248)"
  foreground: "oklch(0.24 0.014 248)"
  card: "oklch(0.992 0.002 248)"
  primary: "oklch(0.55 0.16 255)"
  primary-foreground: "oklch(0.992 0.002 95)"
  secondary: "oklch(0.948 0.004 248)"
  muted: "oklch(0.958 0.003 248)"
  muted-foreground: "oklch(0.47 0.012 248)"
  border: "oklch(0.884 0.006 248)"
  ring: "oklch(0.63 0.028 244)"
  destructive: "oklch(0.58 0.18 32)"
  info: "oklch(0.54 0.09 232)"
  success: "oklch(0.55 0.1 155)"
  warning: "oklch(0.62 0.13 78)"
  sidebar: "oklch(0.965 0.003 248)"
typography:
  headline:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0"
  title:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0"
  body:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0"
rounded:
  sm: "4.8px"
  md: "6.4px"
  lg: "8px"
  xl: "11.2px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  page: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 12px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "0 12px"
  row-list:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "16px 20px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: "36px"
---

# Design System: Ceird

## 1. Overview

**Creative North Star: "The Site Operations Console"**

Ceird should feel like a serious operating surface for construction work: calm, exact, responsive, and delightful, with the polish of Linear and Vercel applied to jobs, sites, roles, labels, maps, and AI-assisted coordination. It is a product UI first, so design serves speed, trust, and repeat use.

The system is light-mode-first because office admins and site users may use it across daylight, laptops, tablets, and phones. Dark mode exists as a preference, not the brand default. The aesthetic should be highly interactive without looking decorative, theatrical, or generated. Delight is required, but it must feel product-native: fast, precise, useful, and respectful of the task.

**Key Characteristics:**

- Dense but breathable authenticated workspace layouts.
- Clear organization, role, job, and site context on every task surface.
- Restrained blue-neutral palette with semantic color for status and operational feedback.
- Command-K, route shortcuts, icon tools, and keyboard-first workflows as native affordances.
- AI features that feel embedded in the work rather than visually performative.
- Delightful micro-feedback: crisp transitions, tactile pressed states, completion checks, concise success copy, and small signals that the system understood the action.

## 2. Colors

The palette is a cool, low-chroma operational system: tinted neutrals carry most surfaces, muted blue anchors primary actions, and semantic colors appear only when the workflow needs them.

### Primary

- **Work Blue** (`oklch(0.55 0.16 255)`): Primary actions, active navigation, selected states, and focused task affordances. It is intentionally brighter than the neutral workspace palette so primary actions feel clear, confident, and delightful without becoming decorative.
- **Work Blue Ring** (`oklch(0.63 0.028 244)`): Focus rings and keyboard-visible outlines. Pair with border changes so focus remains crisp on both light and dark themes.

### Secondary

- **Panel Mist** (`oklch(0.948 0.004 248)`): Secondary buttons, toolbar backgrounds, sidebar accents, and quiet selected states.
- **Soft Field** (`oklch(0.958 0.003 248)`): Muted surfaces, skeletons, empty-state media wells, and inactive list regions.

### Tertiary

- **Map Info Blue** (`oklch(0.54 0.09 232)`): Map, location, and informational states.
- **Site Green** (`oklch(0.55 0.1 155)`): Success and completion, used with labels or icons when status matters.
- **Caution Amber** (`oklch(0.62 0.13 78)`): Warnings, blockers, and job risk indicators.
- **Fault Orange** (`oklch(0.58 0.18 32)`): Destructive or irreversible actions.

### Neutral

- **Workspace Ground** (`oklch(0.976 0.003 248)`): Main app background.
- **Raised Paper** (`oklch(0.992 0.002 248)`): Cards, popovers, and elevated content.
- **Ink** (`oklch(0.24 0.014 248)`): Primary text.
- **Quiet Ink** (`oklch(0.47 0.012 248)`): Metadata, descriptions, and secondary labels.
- **Hairline Steel** (`oklch(0.884 0.006 248)`): Borders, dividers, table rules, and panel seams.

### Named Rules

**The Accent Scarcity Rule.** Work Blue is for action and selection, not decoration.

**The AI Without Glow Rule.** Do not use purple glow, glassy panels, or vague gradient lighting to signal AI.

## 3. Typography

**Display Font:** Geist Variable, sans-serif
**Body Font:** Geist Variable, sans-serif
**Label/Mono Font:** Geist Variable, sans-serif unless a code-like value explicitly needs mono

**Character:** Typography is quiet, exact, and task-native. Geist carries headings, labels, buttons, and data without a display/body split, matching the product register and keeping the interface fast to scan.

### Hierarchy

- **Display** (500, 1.5rem to 2rem, 1.2): Rare. Use only for onboarding, auth context panels, or empty states that need more presence.
- **Headline** (500, 1.25rem, 1.25): Page titles, route headers, and major workspace context.
- **Title** (500, 1rem, 1.4): Section headings, drawer headers, table titles, and compact panels.
- **Body** (400, 0.875rem, 1.5): Default reading text, form help, row descriptions, and descriptions capped around 65 to 75ch.
- **Label** (500, 0.68rem to 0.75rem, uppercase only for eyebrows): Metadata, badges, command rows, field labels, and table affordances.

### Named Rules

**The Quiet Authority Rule.** Increase confidence with weight, alignment, and proximity before increasing size.

## 4. Elevation

Ceird uses tonal layering and hairline borders more than shadows. Surfaces should feel composed into a workspace, not stacked like marketing cards. Shadows are thin structural cues, usually a one-pixel optical lift, and stronger depth belongs to popovers, sheets, drawers, command menus, and focused overlays.

### Shadow Vocabulary

- **Hairline Lift** (`0 1px 0 color-mix(in oklab, var(--border) 65%, transparent)`): App shell panels, row lists, and persistent containers.
- **Overlay Lift**: Use the existing shadcn/Base UI primitive shadows for popovers, dropdowns, command menus, and sheets.

### Named Rules

**The Flat-At-Rest Rule.** Persistent product surfaces are mostly flat. Depth appears when state or layering requires it.

## 5. Delight & Motion

Delight in Ceird should feel like operational feedback, not decoration. Use motion and completion treatment to confirm that the system saw the user's action, moved them forward, or made the next step clearer.

Good delight feels like a button that presses cleanly, a row that settles into its new state, a success message that is specific and calm, or a small completion mark that appears at the exact moment work is done. It may be playful in the sense of being satisfying, but it should not be bubbly, cartoonish, or performative.

### Motion Rules

- Keep most transitions between 150ms and 250ms.
- Use motion for state changes, feedback, loading, reveal, and completion.
- Respect reduced-motion preferences for nonessential animation.
- Prefer small local changes over page-wide choreography.
- Avoid bounce, elastic motion, long celebration sequences, and decorative animation loops.

## 6. Components

Components should feel familiar, precise, and keyboard-capable. Use the existing shadcn-style primitives and Hugeicons/Lucide-style icon vocabulary rather than inventing novel affordances for standard tasks.

### Buttons

- **Shape:** Rectangular and precise, using 8px corners for standard command buttons and tighter 6px corners for icon-only controls. Use pill shapes only for badges, avatars, compact counters, and intentionally chip-like filters.
- **Primary:** Work Blue background with light tinted foreground, compact heights from 32px to 40px.
- **Hover / Focus:** Subtle background shift, visible border/ring focus treatment, and active press movement limited to `translate-y-px`.
- **Secondary / Ghost / Outline:** Quiet tonal fills and transparent variants for toolbars, row actions, and menus.

### Chips

- **Style:** Badges and filter chips use muted fills, compact text, and semantic color only when the value carries operational meaning.
- **State:** Selected filters should read through fill, text, and placement, not color alone.

### Cards / Containers

- **Corner Style:** 8px base radius, larger radii only for row-list containers and app shell surfaces.
- **Background:** Workspace Ground for main content, Raised Paper or translucent background for raised panels.
- **Shadow Strategy:** Hairline Lift for persistent panels, stronger primitive shadows only for overlays.
- **Border:** Hairline Steel with opacity for separators and contained lists.
- **Internal Padding:** 16px to 24px for page sections, 12px to 20px for dense rows.

### Inputs / Fields

- **Style:** 36px default height, background surface fill, Hairline Steel or input border, 8px radius, compact text. Native inputs, selects, command-select triggers, and field buttons should share this same geometry.
- **Focus:** Border shifts to ring color with an accessible ring treatment. Focus must be obvious for keyboard workflows.
- **Error / Disabled:** Error states use Fault Orange with text or icon context. Disabled states reduce opacity and remove pointer interaction.

### Navigation

Sidebar and top-header navigation should be predictable, compact, and role-aware. Active organization and active route should remain legible because multi-tenant context is a core safety feature. Mobile should collapse structure without changing the conceptual model.

### Signature Component: Command Surface

Command-K and route actions are product identity. Command rows should be fast to scan, grouped by scope, and paired with keycap hints where shortcuts exist. Command menus should use compact 8px row corners inside a slightly larger overlay shell so they feel Linear-sharp rather than soft or decorative.

## 7. Do's and Don'ts

### Do:

- **Do** build dense, highly interactive product surfaces that still feel calm and exact.
- **Do** make product interactions delightful through precise motion, completion feedback, warm success states, and thoughtful defaults.
- **Do** preserve keyboard support, command bars, shortcut discoverability, and focus-visible polish.
- **Do** make active organization, role, job, site, and permission context explicit.
- **Do** use semantic color confidently for job, site, label, map, warning, and success states.
- **Do** adapt layout structurally for mobile site use while keeping the same product model.
- **Do** let AI reduce coordination work without becoming the visual theme.

### Don't:

- **Don't** make Ceird look like generic project-management SaaS.
- **Don't** use macho construction branding, high-vis cliches, safety-poster energy, or bubbly startup UI.
- **Don't** confuse delight with cartoon celebration, confetti-cannon moments, joke copy, mascot energy, or anything that makes serious work feel unserious.
- **Don't** ship dashboard clutter or identical card grids where lists, tables, maps, or command surfaces would be clearer.
- **Don't** make anything look obviously AI-generated, including purple glow, glass panels, vague assistant magic, or synthetic illustration-first screens.
- **Don't** simplify the product into a basic field app just because some users are on site.
- **Don't** use colored side-stripe borders, gradient text, decorative glassmorphism, or the hero-metric template.

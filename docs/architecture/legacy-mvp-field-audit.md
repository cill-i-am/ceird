# Legacy MVP Field Audit

This document captures the useful domain signal from the legacy Hayes
Mechanical Baker Media system without treating that product as the blueprint.

The goal for this project is still:

- more Linear-like task and issue tracking
- more general construction job and issue tracking
- less ad hoc admin tooling
- less coupling between workflow, billing, and UI quirks

## Screens Reviewed

The following screens were reviewed in the production system in view-only mode:

- dashboard
- jobs list
- my jobs list
- completed jobs report
- timeline / activity feed
- areas list
- users list
- job add form
- job view page
- job edit page
- user detail page
- user add form
- area add form
- area view page

## Highest-Signal Concepts To Support

These are the concepts that looked real and durable across the legacy system.

### Work Item

The legacy system calls these "jobs". We should model them as work items that
can cover jobs, snags, defects, maintenance requests, inspections, or follow-up
tasks.

Recommended support:

- internal work item id
- optional external reference or case number
- title or short summary
- requestor or resident name
- location / site
- category or workstream
- status
- assignee
- coordinating contact or manager
- created at
- completed at
- intake notes
- field notes / execution notes
- activity history

Observed legacy fields:

- case number
- client name
- area
- foreman
- plumber
- address 1
- address 2
- town
- county
- eircode
- telephone
- status
- date added
- date completed
- job notes
- plumber notes

### Location / Site

The legacy system keeps location data directly on the job. We should still
support that, but it likely wants a clearer location model.

Recommended support:

- address line 1
- address line 2
- town / locality
- county / region
- postal code / eircode
- optional directions or access notes
- contact phone number

Why this matters:

- the same shape appeared in job create, edit, list, detail, timeline, and
  reporting views
- construction workflows are heavily location-driven even when the UI is
  ticket-like

### Assignment

The legacy product clearly separates two kinds of assignment:

- the operational owner doing the work
- the coordinating or external authority contact

Observed legacy roles:

- plumber
- council foreman
- admin

Recommended generalized model:

- assignee
- coordinator or external owner
- role-based users

We should not hard-code trade names like "plumber" into the core model.

### Workflow Status

The legacy system uses status everywhere, but it appears to mix workflow state
and note context into the same free-text value.

Observed statuses included:

- Awaiting
- Complete
- Open
- No Access
- Plumbing Complete - See Notes
- Plumbing Open - See Notes

Recommended support:

- a structured status model with explicit workflow states
- optional reason codes such as `no_access`
- optional flags like `needs_note_review`

We should avoid baking note instructions into the status label itself.

### Work Execution And Completion

The edit and completed-report screens expose the second phase of the lifecycle:
not just intake, but what happened on site.

Recommended support:

- started / completed timestamps
- time spent
- execution notes
- blocked / no-access outcome
- material usage
- material cost
- optional labor cost defaults or pricing rules

Observed legacy execution fields:

- date complete
- length of time (hours)
- materials description
- material cost (euros)
- plumber notes

### Activity Feed

The timeline page is one of the stronger ideas in the legacy app.

Observed activity structure:

- actor
- timestamp
- event text
- linked work item
- address context
- current status

Recommended support:

- append-only activity feed
- status-change events
- assignment-change events
- note/comment events
- creation and completion events

This fits the Linear-like direction well and should become first-class rather
than an afterthought.

### Users And Roles

The user admin area surfaced a more complete people model than the jobs pages.

Observed user fields:

- first name
- surname
- email
- mobile
- address 1
- address 2
- town
- county
- eircode
- area
- position
- user type
- active / inactive
- notes

Observed role distinctions:

- position: plumber, council foreman, admin
- user type: user, admin
- active flag

Recommended support:

- person name
- email
- phone
- active status
- organization membership
- role or permission set
- primary team / crew / region
- notes

We should simplify the overlap between `position`, `user type`, and `admin`.

### Areas / Workstreams / Regions

The "areas" screen looked like a mix of work category, region, and pricing
configuration.

Observed area records:

- West Limerick
- East Limerick
- Metro North
- Regeneration
- Out of Hours
- Gas Remedial Works
- Hot Water Cylinders
- Other

Observed area fields:

- area name
- first house (euro)
- additional house (euro)

Recommended support:

- a clearer distinction between geography, work type, and pricing policy
- a work category taxonomy
- optional service region or patch
- optional pricing defaults kept in a billing/config layer

We probably should not use one `area` field to do three different jobs.

### Reporting

The dashboard and report views show that managers need lightweight operational
visibility.

Observed reporting needs:

- incomplete vs completed counts
- completion percentage
- jobs per plumber
- jobs by category
- completed jobs export
- filtered lists by status, user, and area

Recommended support:

- list filters
- saved views
- export
- basic operational dashboards
- assignee throughput views
- status distribution views

## Recommended Product Mapping

We should generalize the legacy model like this:

- `job` becomes `work item`
- `client name` becomes `requestor` or `contact`
- `plumber` becomes `assignee`
- `foreman` becomes `coordinator` or `external owner`
- `area` becomes one or more of:
  `service region`, `work category`, `pricing profile`

## Things We Should Deliberately Not Copy

The legacy system also showed several anti-patterns that we should avoid.

- Sentinel dates like `01 January 1970` for "not completed yet"
- Free-text statuses that mix state with instructions
- Duplicate list screens that mostly differ by filters
- Blank or broken detail pages
- Raw PHP warnings visible in production
- Inconsistent spelling and labels such as `Lenght` and `Eicode`
- Billing defaults living ambiguously inside an "area" concept
- Separate note fields whose ownership is implied only by the label

## Suggested Minimum Support For Our First Domain Slice

If we want a clean first implementation, the highest-signal minimum looks like:

- work items
- locations
- users
- assignments
- statuses
- comments / updates
- activity events
- work logs
- material or cost line items
- configurable categories

## Suggested Defer List

These appeared in the legacy system, but we do not need them immediately.

- billing defaults tied to categories or regions
- heavy dashboarding beyond a few strong summaries
- multiple near-duplicate list pages
- rich text everywhere by default

## Open Design Questions

- Should external case numbers be optional references instead of primary ids?
- Should coordinator and assignee both be generic user relationships, or should
  one be a richer "request owner" entity?
- Do we want `site` and `contact` separated from the work item from day one?
- Should material cost tracking ship in the first slice or immediately after the
  core work item flow?

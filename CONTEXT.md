# Ceird Product Context

Ceird is an operations workspace for trades and construction teams managing
jobs, sites, locations, activity, and organization-owned work.

## Language

**Closest job**:
A job whose linked site has the shortest driving time from the user's location.
Route distance may be shown as supporting context, but straight-line distance
does not define closeness.
_Avoid_: Nearest job, straight-line closest job

**Priority-filtered closest jobs**:
Closest jobs after applying an existing job priority filter. Priority decides
which jobs are eligible; driving time decides their order.
_Avoid_: Priority-first closest jobs, distance-first priority jobs

**Nearby site**:
A site whose mapped location has the shortest driving time from the user's
location. A nearby site may have one job, many jobs, or no current jobs, but
straight-line distance does not define its closeness.
_Avoid_: Nearest site, straight-line closest site

**Current user location**:
The user's explicitly shared device location at the moment they ask a
location-aware question. It is not inferred from IP address, organization
address, or historical location.
_Avoid_: Last known location, inferred location

**Location access preference**:
A user-level preference that Ceird may ask for current device location when a
route-aware feature needs it. It is not a saved location and does not store the
user's coordinates.
_Avoid_: Saved user location, background location tracking

**Typed origin**:
An address, town, Eircode, or similar place that the user explicitly selects or
confirms as the starting point for route-aware proximity when current device
location is unavailable or not the place they want to plan from.
_Avoid_: Auto-picked origin, ambiguous free-text origin

**Proximity origin**:
The current user location or typed origin used to calculate a route-aware Near
me result. It may be shown to explain where drive times were calculated from,
but it is not a saved user location.
_Avoid_: Stored origin, inferred origin

**Proximity map**:
A map view of a Near me result that shows the proximity origin and route-ranked
job or site destinations, with route display lines for at-a-glance route shape.
It supports choosing work by location, but it is not a turn-by-turn navigation
view.
_Avoid_: Navigation map, coverage-only map

**Active job**:
A job that is still operationally live: new, triaged, in progress, or blocked.
Completed and canceled jobs are not active jobs.
_Avoid_: Open job when it could include completed or canceled work

**Driving time**:
The current traffic-aware time it takes to drive from the user's current
location to a job's linked site.
_Avoid_: Typical travel time, straight-line distance

**Route summary**:
The travel information needed to rank and explain a nearby job or site, such as
driving time, route distance, traffic awareness, and when the route was
computed. It does not include navigation directions.
_Avoid_: Route details, turn-by-turn route

**Route display line**:
A lightweight overview line shown on the proximity map to indicate the shape of
the driving route from the proximity origin to a nearby job or site. It is not
a navigation instruction set.
_Avoid_: Turn-by-turn route, live traffic line

**Route preview**:
A single-destination view that shows how close a specific job or site is from
the proximity origin, including driving time, route distance, route display
line, and maps handoff actions. It is not in-app navigation.
_Avoid_: Turn-by-turn directions, Ceird navigation

**Maps handoff**:
A user action that opens an external maps application for driving directions
from the proximity origin to a selected job or site destination. Ceird remains
the ranking and planning surface.
_Avoid_: Ceird navigation, in-app directions

**Near me filter**:
A user-selected route-aware proximity mode for jobs or sites that uses the
current user location to find work or places by driving time. It requires mapped
locations because driving routes need coordinates.
_Avoid_: Automatic location sort, inferred nearby

**Continuous dashboard**:
A screen where filters, result rows, row actions, and detail navigation remain
in the same operational workspace as the user narrows or reorders data.
_Avoid_: Detached search result page, one-off proximity results page

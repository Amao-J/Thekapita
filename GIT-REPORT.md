# Thekapita Weekly Progress Report

| Reporting detail | Value |
|---|---|
| Prepared | 16 November 2026 |
| Reporting period | 9-16 November 2026 (UTC+01:00; trailing seven days) |
| Commits | 7 (including 1 merge commit) |
| Changed files | 63 |
| Net text diff | 6,201 insertions and 1,779 deletions |

The change totals compare the repository at the start of the reporting window
(the parent of `2e5f690`) with `971bb72`. Text-line totals exclude binary file
contents.

## Executive summary

This week added backend and web foundations for driver rides, food ordering,
and business directories, and improved the ride-booking location experience.
The backend now includes dedicated driver, food, and directory APIs and their
supporting data models, migrations, administration, and tests. On the web,
users can choose ride locations on an interactive map, while driver, food,
vendor, and directory pages were expanded to use the corresponding service
flows.

## Key work completed

- **Driver and ride services:** Added driver registration and profile/status
  operations, location updates, active-trip and ride actions, and a trip data
  model with a migration. Ride service and API behavior were extended, with
  throttling, admin support, and driver-focused backend tests.
- **Food ordering and vendor tools:** Added restaurant discovery and detail,
  authenticated ordering and reservations, order confirmation/cancellation,
  and vendor management for stores, menus, and order status. Added backend
  models, services, administration, seed data, migrations, and tests; updated
  the customer and vendor web pages.
- **Business directory:** Added listing discovery and search, listing details
  and submissions, reviews, bookmarks, and reports, supported by new backend
  models, administration, seed data, migrations, and tests. Updated the
  directory web experience.
- **Ride map and location picker:** Added an interactive location chooser with
  map pins, drag adjustment, place search, GPS selection, reverse-geocoded
  labels, and coordinate fallback. Ride planning now carries selected
  coordinates through booking, supports swapping pickup and destination,
  avoids booking a ride to the same point, and has focused UI tests.
- **Integration and repository maintenance:** Added shared endpoint constants
  for ride, driver, food, and directory APIs; adjusted web build/configuration
  files and ignored generated or temporary repository artifacts. Updated
  dependency lock data.

## Validation and follow-up

Tests were added for driver, food, directory, map, picker, and ride-planner
behavior. They were not run while preparing this report, so this report does
not claim a passing test suite or production readiness.

## Commits

| Date | Commit | Message |
|---|---|---|
| 2026-11-09 | `2e5f690` | hjn |
| 2026-11-09 | `eb37d3b` | tjj |
| 2026-11-09 | `8ba32c8` | yor |
| 2026-11-11 | `8d0836c` | updated |
| 2026-11-11 | `68581f1` | Merge branch `main` |
| 2026-11-11 | `c5c0fed` | fs |
| 2026-11-11 | `971bb72` | patched |

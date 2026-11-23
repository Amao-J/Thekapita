# Thekapita Weekly Progress Report

| Reporting detail | Value |
|---|---|
| Prepared | 23 November 2026 |
| Reporting period | 16-23 November 2026 (UTC+01:00; trailing seven days) |
| Commits | 16 (including 3 merge commits) |
| Changed files | 97 |
| Net text diff | 16,627 insertions and 1,617 deletions |

Change totals compare the parent of the first commit in the reporting window
(`568a3aa`) with `HEAD`. Text-line totals exclude binary contents.

## Executive summary

This week expanded directory and food discovery, introduced server-side road
routing for ride estimates, and delivered a broad web and mobile interface
refresh. Directory listings can be imported from OpenStreetMap sources and
served with managed images; food discovery now incorporates restaurant
directory data and location information. The web application gained shared
light/dark theming and substantial landing-page and service-page updates.

## Key work completed

- **Directory data and images:** Added OpenStreetMap PBF and Overpass import
  paths for directory places, including Abuja and Lagos coverage, category
  classification, restaurant subtypes, and import management commands.
  Directory APIs and web pages were extended for imported listings. Added
  private object-storage image workflows with presigned uploads and reads,
  image validation, and related migrations and tests.
- **Food discovery and vendor flows:** Expanded restaurant catalogue and
  detail data, including directory-backed restaurants, coordinates, images,
  and proximity-related fields. Updated ordering and vendor-facing API/UI
  behavior across web and mobile, and added catalogue, vendor, and directory
  tests.
- **Ride routing and deployment:** Added a backend routing service and API
  that can use TomTom traffic estimates or OSRM, cache results, return route
  geometry, and fall back to OSRM when the primary provider is unavailable.
  Added routing tests and OSRM deployment configuration.
- **Web experience and theming:** Added a shared light/dark theme controller
  with saved preference and system-theme support. Refreshed the landing page
  and styling across authentication, bills, care, directory, driver, food,
  marketplace, profile, ride, seller, and wallet pages; added or expanded the
  Haven property experience.
- **Mobile and project support:** Added a mobile landing screen, extended the
  food tab, and documented mobile testing and store-release steps. Updated
  shared API endpoints, configuration, dependencies, and ignore rules.

## Validation and follow-up

The change set includes focused backend and web tests for routing, directory
imports and images, food catalogue/vendor behavior, and ride UI behavior.
Tests were not run while preparing this report; no passing test-suite or
production-readiness claim is made.

## Commits

| Date | Commit | Message |
|---|---|---|
| 2026-11-16 | `568a3aa` | ijn |
| 2026-11-17 | `128cca0` | your |
| 2026-11-17 | `04df0e3` | yrhrc |
| 2026-11-17 | `977492d` | hruf |
| 2026-11-18 | `5ba267f` | hrdu |
| 2026-11-18 | `44121fb` | synth |
| 2026-11-18 | `b039a0d` | Merge branch `main` |
| 2026-11-18 | `53a646a` | Merge branch `main` |
| 2026-11-18 | `2333a71` | mer |
| 2026-11-19 | `e0c95c9` | newer |
| 2026-11-19 | `9357e53` | yosc |
| 2026-11-19 | `de3d771` | hdjsd |
| 2026-11-20 | `14e3e62` | dhsjhd |
| 2026-11-20 | `c7d600f` | swshfd |
| 2026-11-22 | `896d1d5` | osrm |
| 2026-11-22 | `30b4e7b` | Merge branch `main` |

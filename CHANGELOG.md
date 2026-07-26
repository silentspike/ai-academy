# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Legal baseline changes are listed separately: they revoke the summative status of
affected questions and bind existing results to a superseded state of the law.

## [Unreleased]

### Fixed
- The weekly goal read a list nothing ever wrote to and showed "0/5 days"
  regardless of the work put in. It is derived from the day statistics now, so
  a day that counts in the statistics counts towards the goal by construction.
- Six of the ten badges checked counters nothing incremented and could not be
  earned. They are derived from data the application already keeps.
- `state.units_done` did not exist — the list the application reads and writes
  is `unit_done`. Older records are migrated.
- The number of units existed as three different literals while the index holds
  seventeen; the learning curve overstated progress accordingly.
- The article map was 522 by 148 pixels at every window size — 29 % of its card
  on a 4K display. Tile size follows the space available.
- Every dashboard card sat at its content width in a track twice as wide: an
  automatic inline margin cancels a grid item's stretch.
- Chart renderers appended to their mount instead of replacing it, so anything
  redrawn in place ended up with two data sets on top of each other.
- The day's statistics and a freshly built session disagreed about whether the
  mandatory review was done, locking units behind a review already completed.
- Badges were awarded while the gallery drew, putting a write inside a render.

### Added
- Search across units, glossary and article references, disabled during
  closed-book examinations
- Due list and profile menu in the top bar
- Coach block, level title, week dots, phase progress bars, chart legends and a
  time range for the learning curve
- One start script per platform, with `--open` in the bridge
- `tools/betrieb-sync.mjs` keeps a running instance in step with the repository
- `tools/fixture-bereinigen.mjs` removes seeded verification data from a record

### Added
- Standalone public repository with a fresh history
- Licences: Apache-2.0 for the code, CC BY 4.0 for the learning content
- Documents required for public operation: security policy, contributing guide,
  code of conduct, issue and pull request templates, review-process description

### Changed
- The API path is now derived relative to the document instead of being
  hard-coded. The application therefore runs at any location, not only at the
  web root.
- Imagery converted to WebP and resized to what is actually displayed: 182 MB
  down to 5.4 MB, mean measured similarity 42.7 dB PSNR.
- The deadline check reads the legal baseline from `content/` rather than from an
  internal working area.

### Changed (continued)
- Project documentation switched to English, following the precedent of the
  German-language sibling project: standard meta files in English, README German
  with an English subtitle, reviewer box and full English summary. Learning
  content stays German.
- Working rules moved to `AGENTS.md`; `CLAUDE.md` is now a pointer.
- Label schema moved to `.github/labels.yml` as the single source of truth,
  synchronised by a workflow.
- CI split into lint, content and unit with a `ci-pass` aggregate, so branch
  protection does not need touching when jobs change.

### Fixed
- Milestone labels on the deadline timeline overlapped and were unreadable in the
  dense 2026–2027 range. Label width is now measured after insertion into the
  document instead of estimated.
- The badge gallery loaded nothing because identifiers and file names had drifted
  apart.

### Legal baseline
- Target state 27 July 2026: Regulation (EU) 2024/1689 as amended by Regulation
  (EU) 2026/1744. Unchanged from the previous state.

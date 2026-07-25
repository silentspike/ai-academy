# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Legal baseline changes are listed separately: they revoke the summative status of
affected questions and bind existing results to a superseded state of the law.

## [Unreleased]

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

### Fixed
- Milestone labels on the deadline timeline overlapped and were unreadable in the
  dense 2026–2027 range. Label width is now measured after insertion into the
  document instead of estimated.
- The badge gallery loaded nothing because identifiers and file names had drifted
  apart.

### Legal baseline
- Target state 27 July 2026: Regulation (EU) 2024/1689 as amended by Regulation
  (EU) 2026/1744. Unchanged from the previous state.

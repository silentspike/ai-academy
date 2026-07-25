# AI-Academy — working rules for agents and contributors

Interactive training on the EU AI Act (Regulation (EU) 2024/1689 as amended by
Regulation (EU) 2026/1744) with a language-model tutor. This file is the binding
frame for everyone working on the repository — humans and agents alike.

**Language:** English for code, comments, documentation and commit messages.
German only for the learning content itself, where the subject matter demands it
(Official Journal text, Austrian enforcement, German legal terminology).

---

## Principles

- **Content is data, never code.** The engine interprets schemas; new phases,
  units or country modules are JSON files, not engine changes.
- **No runtime dependencies.** Application and bridge run without `node_modules`.
  `npm install` is needed for the test suite only; none of it ships.
- **Deterministic core, model only where needed.** JavaScript grades every
  unambiguous format immediately; the model supplies depth of explanation,
  free-text grading and dialogue.
- **The model is never a legal source.** Legal statements rest on the supplied
  source package and are emitted as `claims` with `source_ids`.
- **Subscription sign-in only, no API keys.** Access runs through the locally
  installed CLI (`claude`, `codex`). A key path must not return; CI checks for it.

## Layout

```
public/     application shell — the only served directory
app/        engine (router, quiz, widgets, dialogue, spaced repetition, dashboard)
content/    learning content as data; schema in content/SCHEMA.md
bridge/     dependency-free Node service: serves the app, talks to the CLI
tutor/      prompt builders — summative builders do not accept notes or history
tools/      validators, unit test suites, release builder, calibration runner
tests/e2e/  Playwright suite (fixtures, harness, specs)
docs/       intended purpose, threat model, risk register, cut-score derivation
```

## Quick reference

| Purpose | Command |
|---|---|
| Serve the application (with model) | `node bridge/bridge.mjs` |
| Serve the application (no model) | `node bridge/bridge.mjs --no-llm` |
| Unit tests | `npm run test:unit` |
| Content checks | `npm run test:content` |
| Everything | `npm run test:all` |
| Syntax of all sources | `npm run check` |
| What hangs off a provision | `node tools/legal-audit.mjs "Art. 6"` |
| Check the grading scale | `node tools/gold-set-run.mjs` (local only, needs model access) |
| Build a release package | `node tools/build-release.mjs --version vX.Y.Z` |

## Critical rules

**Never**

- Change a file without reading it first.
- Report a claim as met without having run the command and seen the output.
- Adjust a threshold, limit or check so that a run turns green.
- Commit credentials, learning state or internal working documents.
- Reintroduce a path for API keys.
- Add a legal statement without a citation.
- Use real organisations in examples.
- Judge screenshots at any size other than the agreed one.

**Always**

- After an engine or interface change: run the affected interaction spec.
- After a content change: schema validation and question comparison.
- On a legal change: follow `UPDATE-PROZESS.md`, revoke the summative status of
  affected questions.
- On a model or prompt change: run the calibration set before grading summatively
  again.
- Supply the evidence: the command and its actual output.

## Workflow for a change

1. **Preparation** — read the affected files. Determine whether the change touches
   content, engine or both. For legal matters, check the citation first.
2. **Implementation** — one complete change. No placeholders, no stand-ins, no
   parts to be supplied later.
3. **Evidence** — run the checks. For visible changes: take a screenshot **and
   look at it**. Only then is the change done.
4. **Commit** — one commit per completed change, update `CHANGELOG.md`, adjust the
   documentation if behaviour changed.

## Issues and labels

`type:*` · `priority:*` · `status:*` · `size:*` · `scope:*` · `quality:*`.
The schema lives in `.github/labels.yml` and is synchronised by a workflow — edit
that file, not the labels in the web interface.

Content issues with legal relevance get at least `priority:high`: a wrong legal
statement leads to wrong advice at work.

## Evidence requirement

The default state of every claim is **untested**. Evidence is an executed command
with its actual output, a screenshot that was looked at, or a measurement taken.
Not evidence: cited line numbers, "read the code", "pattern present", source review
without execution. Whatever was not checked is named as unchecked, with a reason.

## Secret hygiene

Never in the repository: learning state and profiles (`data/`), credentials of any
kind, internal working and acceptance documents, references to real people or
organisations in examples. Two pipeline steps guard this; the pattern of protected
terms deliberately does not live in the repository but comes from a secret or a
local, unversioned file.

The **author's name** is not protected. The licences require a copyright notice,
and it appears in every commit anyway. The pattern covers employer references,
service regulations and local access tokens — not authorship.

## Versioning

Semantic versioning. In addition, for this project:

- **Major** — break in the learning-state format or the content schema.
- **Minor** — new content, new functionality, **any change of the legal baseline**.
- **Patch** — fixes without a format change.

Every exam result stores legal baseline, content version, rubric and model version.
Results from different grading regimes are never merged into a shared best score.

## Commits

Conventional Commits with an optional scope, description in English:
`feat` · `fix` · `docs` · `style` · `refactor` · `perf` · `test` · `build` · `ci` ·
`chore` · `revert` · `deps` · `security` · `content` · `legal`.

One complete change per commit. The message says what changes **and why** — for
fixes also what caused the defect. The hook at `scripts/pre-commit.sh` runs the
syntax check and, for content changes, schema validation before the commit lands.

## Branches

```
feat/short-description
fix/short-description
content/short-description
legal/short-description
```

`main` is protected: pull requests only, required checks must pass, no force
pushes, no deletions.

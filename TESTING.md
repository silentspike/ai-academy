# Testing

> Status: levels A, B and C are running. D and E stay local, because CI has no
> model access. What is written here has been executed and evidenced — it is not
> a plan.

## Why this split

A learning tool for a field of law has two failure classes that need different
treatment: the material can be wrong, and the interaction can be broken. Schema
and citation checks catch the first; only real operation in a browser catches the
second.

There is a third, more uncomfortable class: a component is built, tested and
works — but cannot be reached through the interface at all. No unit test finds
that. The interaction suite therefore does not check against a list of cases; it
enumerates every operable element per view itself and fails when one was never
exercised.

## Levels

| Level | What is checked | Requires | Runs in CI |
|---|---|---|---|
| **A — Unit** | engine logic without a UI | nothing | yes |
| **B — Content** | schema, mandatory fields, citations, figures and dates | nothing | yes |
| **C — Interaction** | full operation in a browser, image comparison | browser, stubbed model | yes |
| **D — Model** | free-text grading, expert dialogue, appeal, with a real model | model access | no, local only |
| **E — Calibration** | grading scale against pre-scored reference answers | model access | no, local only |

The split between C and D is not convenience: CI has no model access, and API
keys are ruled out. Level C therefore exercises the complete interaction path
against a predictable substitute model — including the four real failure modes
observed in operation (text after the answer, two answer objects, unescaped
quotes, timeout). Level D verifies locally that the real model serves the same
formats.

## Commands

```bash
# Level A — unit tests
node tools/engine-tests.mjs          # quiz, widgets, spaced repetition, variants
node tools/gamification-tests.mjs    # points, levels, badges, weekly goal
node tools/exam-tests.mjs            # exams, gates, critical errors, remediation
node tools/onboarding-tests.mjs      # setup, feasibility calculation
node tools/erhaltung-tests.mjs       # maintenance mode

# Level B — content checks
node tools/validate-content.mjs      # schema and mandatory fields
node tools/check-questions.mjs       # figures, dates and citations against the deadline matrix
node tools/legal-audit.mjs "Art. 6"  # which content hangs off which provision
```

```bash
# Level C — interaction, in a real browser
npx playwright test                       # everything, about 11 minutes
npx playwright test --project=chromium    # functional suite plus sweep
npx playwright test --grep-invert @sweep  # without the sweep, about 90 seconds
npx playwright test --project=visual      # captures for the contact sheets

node tools/contact-sheet.mjs              # sheets of twelve, with findings
node tools/contact-sheet.mjs --vergleich <verzeichnis>   # before/after/difference
node tools/coverage-report.mjs            # click coverage across all shards
node tools/budget-gate.mjs                # time budget from the last run
```

Evidenced state: 137 unit tests · 310 of 310 questions with no finding in the
script comparison · schema validation without errors · **131 interaction tests
plus 28 sweep routes in Chromium, 35 in Firefox** · click coverage 407 controls
across 42 views, 0 unreachable.

## The sweep, and why it is separate

The functional specs check what a control is supposed to do. The sweep asks only
whether it can be operated at all — every control, on every route, actually
clicked, with the page reopened whenever the click changed something.

That is the question the July acceptance run got wrong: its checklist named the
features somebody remembered, and eleven gaps were not on it. An inventory
verifies what is on screen; a list verifies what someone thought to write down.

It is slow by construction (about 190 clicks), so it has its own four-shard
matrix and runs on main. A pull request answers in about ninety seconds without
it — deferred by one merge, not skipped.

## Two strengths of statement about reachability

| Reported as | Means | Consequence |
|---|---|---|
| **unreachable** | a click was attempted and something covered the control | hard failure |
| **suspected** | the passive capture measured a stack without the settling time a real click gets | reported, not fatal |

The separation exists because the passive check produced false alarms: a term
inside a `<summary>` has the summary as its event target, and an inline element
that wraps has a bounding box spanning the gap between its lines. A check that
cries wolf gets ignored, which is worse than not having one.

## What the interaction suite found

Not a hypothetical list — these shipped and were invisible until a browser
operated them:

| Defect | Effect |
|---|---|
| glossary dead on every unit | terms underlined, explanation never opened |
| closed book leaked | tooltips kept explaining during a running exam |
| drag-and-drop did not exist | the task referenced a file that was nowhere |
| annex III explorer empty | the code fetched the fact base and discarded it |
| heat-map tiles dead | pointer cursor, handler, no target ever set |
| learning record crashed | blank certificate after restoring a backup |
| overlay not darkened | two layers of text ran into each other |
| dashboard column overflowed | badges on top of the exam block, bottom row cut off |

## What counts as evidence

| Counts | Does not count |
|---|---|
| command executed, output present | "read the code, looks right" |
| screenshot viewed | line numbers cited |
| measurement taken | "pattern is implemented" |
| test run with a concrete result | source review without execution |

The default state of every claim is **untested**. No command means untested, and
untested is not the same as passing.

## Window size

Screenshots and image comparisons run at **1920 × 1026**. That is a maximised
browser window on a 1920 × 1200 display, minus system bars and browser chrome.

Setting only `--start-maximized` still measures at 1280 × 720 — the default
viewport is not superseded by it. What is required in addition is `viewport: null`
or an explicit fixed value. A guard aborts every run before a single screenshot is
taken at the wrong size. The reason is uncomfortably concrete: every earlier
design review in this project accidentally ran at 1280 × 720, that is at
two-thirds of the actual width.

## Timing

| Run | Measured | Budget |
|---|---|---|
| pull request | 114 s | 90 s — not met |
| main, everything | 224 s | 4 min — met |

A reporter records how long each spec takes, and `tools/budget-gate.mjs` fails
the run when one spec takes more than 75 % of it. The threshold is loose on
purpose: it exists to catch a spec running away — the sweep at ten minutes
against four minutes of everything else — not a shift from 50 % to 55 %. A
tighter value fired on ordinary distribution.

## When the law changes

A change in the legal situation is not an ordinary contribution. It revokes the
summative status of affected questions, binds existing results to a superseded
state, and requires a fresh calibration run. The procedure is in
[UPDATE-PROZESS.md](UPDATE-PROZESS.md).

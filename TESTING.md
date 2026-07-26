# Testing

> Status: levels A and B are running. Levels C through E are being built; this
> document is updated alongside them. What is written here has been executed and
> evidenced — it is not a plan.

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

Evidenced state: 132 unit tests, 310 of 310 questions with no finding in the
script comparison, schema validation without errors.

## How long a run takes, and why

A pull request should answer in under ninety seconds. That number is not a
preference: past it, people stop waiting for the result and start merging on
faith.

Where the time goes, measured rather than assumed:

| | Before | Now |
|---|---|---|
| Browser per job | 21 s downloading | 0 s, from the cache |
| Confirming system libraries | 12 s in apt | skipped on a cache hit |
| Functional shards | 8 | 12 |
| Merged report on the critical path | yes | no — it is an artefact, not a check |
| **First job to last** | **98–99 s** | **75 s** |

Three of those four changes remove waiting, not checking. The fourth — twelve
shards instead of eight — spends more runner time to shorten the wall clock,
which is the trade a pull request wants and a nightly run does not.

What stays off a pull request: the operation sweep and the screenshot sheets.
Both are minutes, both run on main, and both are deferred by exactly one merge
rather than skipped.

Two things this deliberately does not do: it does not raise the threshold to
meet the measurement, and it does not drop a check to save time. If a run comes
back over ninety seconds, that is a finding about the run.

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

## When the law changes

A change in the legal situation is not an ordinary contribution. It revokes the
summative status of affected questions, binds existing results to a superseded
state, and requires a fresh calibration run. The procedure is in
[UPDATE-PROZESS.md](UPDATE-PROZESS.md).

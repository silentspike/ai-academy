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
| **C2 — Engines** | the same paths in Firefox and WebKit — layout, storage, focus, dates | browser | yes |
| **D — Model** | free-text grading, expert dialogue, appeal, with a real model | model access | no, local only |
| **E — Calibration** | grading scale against pre-scored reference answers | model access | no, local only |
| **F — Platform** | the bridge starts, serves and stores on macOS and Windows | nothing | yes, on main |

WebKit runs on a macOS runner rather than on Linux: it is the engine behind
Safari, the fourth browser the plan names (§5.5), and it cannot be installed on
this development machine at all — `playwright install webkit` asks for libicu74
and friends through apt on a system that is not Debian. A browser nobody can run
locally is a browser only CI can cover.

Level F exists because this project is developed on Linux and offered on three
systems. There is no macOS and no Windows machine here — the runners are the only
place those two exist for it, so that is where the check runs
(`tools/plattform-start.mjs`, job `plattformen` in ci.yml on main and job `paket`
in release.yml before a release is published). It starts the bridge the way a
recipient does, on a fresh store, and checks in this order: the platform's start
script is present, well formed and executable; the browser command for the
platform is the right one; /api/health answers; the application is served; the
pairing token is injected; the learning state survives a write and a read — the
path handling that differs between systems sits exactly there; the process shuts
down. Thirteen steps, all or nothing.

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

# Level F — platform start (runs on every system, says which one it was on)
node tools/plattform-start.mjs       # start script, browser command, health, store round trip
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

## Trying things out without touching your own record

A verification run writes state that looks like progress. That is the point —
and it is why it must not happen in the record someone actually learns from.
This has already gone wrong once: seeded chapter tests from a test run sat in
the owner's record, nine phases ticked and the exam unlocked, none of it earned.

```bash
./test-instanz.sh                  # second academy, own record, own port
./test-instanz.sh --zuruecksetzen  # throw the test record away and start fresh
```

Two processes, two directories, nothing shared. The isolation is structural: the
test instance does not know where the real record is, so it cannot reach it —
rather than knowing and being told not to.

The alternative — switchable records inside one instance — was considered and
rejected. A switch decides at runtime which file gets written, and the one time
it does not hold, a test run lands in the real record: exactly the damage it was
meant to prevent. That failure mode is not hypothetical; a badge award that ran
during a render wrote asynchronously into state and overwrote the next fixture
in a parallel run.

Verified: writing 99999 XP into the test instance left the real record
byte-identical (md5 unchanged), and the test instance came up on a fresh
onboarding at 0 XP. The script refuses the real record as a target, including
any directory containing it.

If a record already carries seeded data:

```bash
node tools/fixture-bereinigen.mjs data/store/progress.json            # report
node tools/fixture-bereinigen.mjs data/store/progress.json --anwenden # remove
```

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

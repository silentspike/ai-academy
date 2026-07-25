# Contributing

Thank you for your interest. This is a learning tool for a field of law, so the
rules for content are stricter than the rules for code.

**Note on language:** The learning content is German — the AI Act text, the
Austrian enforcement chapter and the legal terminology all are. Code, comments,
commit messages and this documentation are English.

## Getting started

```bash
git clone https://github.com/silentspike/ai-academy.git
cd ai-academy
node bridge/bridge.mjs --no-llm      # serve the app without a model connection
```

For the test suite:

```bash
npm ci
npx playwright install chromium firefox
npm run test:all
```

The application itself has no runtime dependencies. `npm ci` installs test
tooling only; none of it ships.

## Especially welcome

- **Sourced corrections to the legal material.** This is the most valuable
  contribution by far.
- **Additional country modules.** Phase 9 is built to be swapped out.
- **Interaction bugs**, particularly those that only appear at certain window
  sizes or in specific browsers.
- **Accessibility improvements.** Version 1 deliberately makes no conformance
  claim; full keyboard operation and a drag-and-drop alternative are open items.

## Rules for content

Every legal statement needs a source. Without the fields `legal_basis` and
`legal_status` a content object does not pass schema validation — that is
enforced, not merely conventional.

- **Cite down to the paragraph**, including the version. "Art. 6" is not enough;
  "Art. 6(3) as amended by Regulation (EU) 2026/1744" is.
- **Respect the source hierarchy**: Official Journal, then delegated and
  implementing acts, then national law, then binding authority decisions, then
  official non-binding guidance, then drafts, then secondary literature. The
  output of a language model is never a legal source.
- **State the temporal dimension.** Almost every statement in the AI Act has an
  "applicable from", often several depending on annex, legacy status and deployer.
  Exam cases name a date; otherwise "cannot be determined conclusively" is the
  correct answer.
- **No real organisations.** Examples and scenarios use fictitious entities. This
  also applies to cases that merely resemble a real organisation.
- **Exam questions** go through a separate release path. A contribution may
  propose a question; the summative status is granted by the maintainer after
  their own check against the primary source. See
  [docs/REVIEW-PROCESS.md](docs/REVIEW-PROCESS.md).

## Rules for code

- **No runtime dependencies.** Anyone who needs one justifies it in the pull
  request. Preserving this property takes precedence over convenience.
- **Evidence, not assertion.** The pull request contains the command that was run
  and its actual output. "Tested" without output does not count.
- **For interface changes**, include a screenshot — at 1920 × 1026, the size the
  test suite is built around. See [TESTING.md](TESTING.md).
- **English** in code, comments and documentation. German only in the learning
  content itself.

## Commit messages

Conventional Commits, with an optional scope:

```
feat:     new functionality
fix:      bug fix
docs:     documentation only
style:    formatting, no behaviour change
refactor: restructuring, no behaviour change
perf:     performance
test:     test suite
build:    build process or dependencies
ci:       workflows
chore:    everything else
revert:   revert
deps:     dependency updates
security: security fix
content:  learning content
legal:    legal baseline and citations
```

Example:

```
fix(timeline): stop milestone labels from overlapping

They were unreadable in the dense 2026–2027 range. Label width is now measured
after insertion into the document instead of estimated.
```

## Branches

```
feat/short-description
fix/short-description
content/short-description
legal/short-description
```

`main` is protected. Changes go through pull requests, and the required checks
must pass.

## Conduct

See the [Code of Conduct](CODE_OF_CONDUCT.md).

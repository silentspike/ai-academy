# How the content was reviewed

This document describes how the legal statements in this training were produced
and checked. It is the explanation behind the `legal_basis`, `legal_status` and
`review_protocol` fields that every content object carries.

The tone is deliberately plain, and it names the limits of the procedure as well.
Anyone relying on this material at work should know what it rests on.

## Starting point

On 24 July 2026 Regulation (EU) 2026/1744 was published in the Official Journal.
It amends Regulation (EU) 2024/1689 in more than forty places and entered into
force on 27 July 2026. No official consolidated version existed at the time of
writing.

Hence the term used throughout this project: the content rests on an **editorial
working consolidation** of both Official Journal texts. That is not an official
consolidated version and is nowhere described as one.

## Source hierarchy

Where sources conflict, the higher tier wins, and the conflict is made visible
rather than quietly resolved:

1. Official Journal and other binding legal acts
2. Delegated and implementing acts
3. National law
4. Binding decisions of authorities
5. Official non-binding guidance
6. Drafts
7. Secondary literature
8. **Output of a language model — never a legal source**

Tier 8 is why the tutor emits its legal statements as claims with source
identifiers, and why the application checks that those identifiers exist and match
the legal baseline. Unsupported article or deadline claims are suppressed or
visibly flagged as unverified.

## Temporal dimensions

Almost every statement in the AI Act has an "applicable from", and often more than
one. Content objects therefore carry, alongside the citation, fields for date of
application, transitional rule, legacy-system rule, trigger for a substantial
modification, actor and system scope, and an expiry date.

Practical consequence for exam items: a case that names no date of placing on the
market or putting into service has no single correct answer. "Insufficient
information for a defensible classification" is then the right answer — and is
scored as such.

## Release path of an exam question

A question may only appear in chapter tests and the final exam once it has
completed this path:

| Stage | Meaning |
|---|---|
| `agent_generated` | drafted, not yet sourced |
| `source_linked` | every correct **and every incorrect** option is justified against a concrete citation, recorded in the data set |
| `reviewed` | two separate review passes completed (see below) |
| `approved_summative` | released for exams |
| `retired_or_revised` | withdrawn or reworked |

A challenged question loses the status immediately. So does every question
affected by a change in the law — that is the core of the procedure in
`UPDATE-PROZESS.md`.

## The two review passes

**First pass — mechanical comparison.** A script checks every countable and
datable statement against the source register: article numbers, paragraphs,
deadlines, citation formats. This objectifies everything that can be objectified.
Run it with `node tools/check-questions.mjs`; the current state is 310 of 310
questions with no finding.

**Second pass — substantive re-reading.** Separated from the drafting step and
offset in time, every question is read against the full text of both Official
Journal texts. The check covers whether the statement holds, whether the incorrect
options are in fact incorrect, and whether the justification genuinely supports
the citation.

Each question points via `review_protocol` to the section of the review log under
which it was handled, for example `eigenpruefung#block31`.

## Limits of the procedure — stated plainly

This is a **self-review**, not an independent release. There was neither a
four-eyes legal check by a second person nor a review by a second model. That was
a deliberate decision by the commissioning party; it is named here rather than
glossed over.

What the procedure does deliver: everything countable becomes objectively
checkable, and the substantive re-reading is decoupled from the drafting step.
What it does not deliver: the independence that an external professional release
would provide.

The review logs themselves are internal working documents and not part of this
repository. They contain references that are not published. The identifiers in
`review_protocol` remain meaningful nonetheless: they show that every question is
tied to a concrete review section, and they allow a targeted enquiry.

## What you can check yourself

```bash
node tools/validate-content.mjs        # schema and mandatory fields
node tools/check-questions.mjs         # figures, dates, citations
node tools/legal-audit.mjs "Art. 6"    # which content hangs off which provision
node tools/legal-audit.mjs --status at-vollzug-offen
```

The last call is particularly informative: it lists every statement whose national
implementation is still open. Those places are marked in the interface, because
they are the ones most likely to change.

## If you find an error

Please use the *Content or legal error* issue template. Required: where the
statement appears in the application, what is wrong, and a citation with article,
paragraph and version. Such reports take precedence over everything else — a wrong
legal statement in a learning tool becomes wrong advice at work.

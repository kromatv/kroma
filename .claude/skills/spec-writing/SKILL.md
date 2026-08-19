---
name: spec-writing
description: Write and change a product spec. Covers what belongs in the spec rather than in architecture, the status vocabulary, requirement IDs and how to keep them stable, and how to size a requirement so it becomes one story. Use when adding or editing a spec chapter, when a PR changes behaviour and the spec has to move with it, or when asked what the product should do. Triggers - "write the spec", "add a requirement", "spec this out", "update the spec", "what should this do".
---

# Writing the spec

Find the spec and read its own contract first, every time. It wins over anything
here.

```bash
git ls-files | grep -iE '(^|/)(spec|specs|requirements)(/|$)' | head
```

A spec root usually holds a `README.md` stating the rules for the rest, an index,
and one folder per domain. If the project has no spec, do not invent one inside a
ticket: say so, and propose the root as its own change.

## What belongs here

The spec says **what** the product does and **why**. Architecture says how the
code is shaped. The test: a sentence that survives a full rewrite of the
implementation belongs in the spec. A sentence naming a crate, a file, a
framework, a wire format or a schema does not.

That line is the one reviewers enforce hardest, because a spec that leaks
implementation stops being reviewable by the people who care what the product
does.

## Before writing

Find the space. One folder per domain, using the nouns the project's architecture
already uses. A new space needs a reason, not a new noun for an existing domain.

Read the space's own README and its sibling chapters before adding to them. Two
chapters that disagree on the same rule is the worst defect a spec can carry,
because both readers think they are right.

## Every section carries a status

A reader has to know whether a sentence describes today or an intention. Use the
project's vocabulary if it has one. Where it does not, this set covers it:

`SHIPPED`, `AGREED`, `DRAFT`, `DESIGN, NOT IMPLEMENTED`

A section without a status is a bug in the spec. `DESIGN, NOT IMPLEMENTED` must
say why it was deferred and what shipped instead. That record is worth more than
the design was.

## Requirement IDs

Every normative statement, anything a reader could implement or test, carries an
ID and its own status:

> **LIB-4** (AGREED) - A rescan never deletes user data. A file that disappears is
> marked absent; its watch history survives.

- One prefix per space, one space per prefix. Pick something legible and stay with it.
- `N` is assigned once. Never renumbered, never reused. A deleted requirement
  retires its number, so a link in an old ticket never silently points at a
  different rule.
- One ID is one testable idea. A line hiding two requirements needs two IDs.

Take the next number from the project's generated index if it has one, or from
`git log` if it does not. Never by counting the prose in front of you: a retired
number is invisible there, and reusing it corrupts every link that pointed at the
old rule.

## Sizing

A requirement maps to one story; a domain maps to one epic. A requirement that is
really five stories wearing one ID is what makes a spec useless for planning.
Split it.

The other direction is also wrong: an ID on a sentence nobody could test is
noise. If you cannot say how a reader would prove it true, it is prose, not a
requirement, and it needs no ID.

## Prose

A tired reader on a phone follows it on the first read. Paragraphs under five
lines, one idea per sentence, no undefined jargon, no passive construction hiding
who acts. A spec that is correct and unreadable is a defect.

Run the **unslop** skill over anything before committing it, and the
**ticket-writing** skill when the requirement becomes work.

## Before the PR

Where the spec ships an index or a checker, regenerate and run it, then commit
whatever it wrote. Look for the scripts in the project's manifest; they usually
fail on a stale index, a duplicate ID, a mixed prefix or a missing status.
Generated artefacts are never hand-edited.

The spec changes only through a pull request, and a PR that changes behaviour
changes the spec in the same PR. For anything large or contested, write the design
document the project uses for that (an RFC or an ADR) first, and let the spec
record the outcome rather than the argument.

Where the project ships a spec review agent, write for that review and run it
before asking for a human one.

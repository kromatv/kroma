---
name: ticket-writing
description: Write GitHub issues and PR descriptions. Covers the epic and sub-issue structure, linking a requirement instead of copying spec text, reading the project's label set and templates rather than guessing them, title format, and what a reviewer needs in a PR body. Use when opening an issue, turning a spec requirement into work, filing a bug, or writing a PR description. Triggers - "open an issue", "write a ticket", "file a bug", "turn this into work", "write the PR description".
---

# Writing tickets

An issue says what is left to do. The spec says what should be true. Keeping
those apart is the whole job.

## Read the project's conventions first

Labels, templates and title format are per-project and guessing them produces a
ticket someone has to correct by hand:

```bash
ls .github/ISSUE_TEMPLATE/ .github/PULL_REQUEST_TEMPLATE.md 2>/dev/null
gh label list --limit 100
git log --oneline -20
```

Many projects also keep a ticket doc (`docs/TICKETS.md`, `CONTRIBUTING.md`) that
states which label axes are required and what the board columns mean. Read it
before opening anything; it outranks this skill.

## Never copy spec text

Link the requirement, do not restate it. Copies rot, and the moment they disagree
nobody knows which one is the product.

```
Implements: LIB-4, LIB-7
```

Resolve an ID to its chapter through the spec's index. If the behaviour has no
requirement yet, the spec change comes first: use the **spec-writing** skill, then
open the issue against the new ID. Where the project keeps no spec, state the
intended behaviour in the ticket and accept that the ticket is now the record.

## Structure

Where the project runs epics, each domain has one long-lived **epic** issue and
implementation work is opened as a **sub-issue** of it, so the board rolls up
without anyone maintaining a checklist by hand.

A sub-issue is one story: one requirement, one reviewable change, one PR. Work
that needs three PRs is three sub-issues.

## Labels

Take the axes from `gh label list` and the project's ticket doc, not from memory.
The common shape is one namespaced axis for the kind of work, one for urgency, and
one or more for where in the stack it lands, plus a couple of flow labels for
waiting rather than working.

Two mistakes worth naming, because both are easy and both are wrong:

- **Assuming an axis is optional because you did not see it.** A project with a
  priority axis expects one on every ticket, and a triager has to add it later.
- **Assuming two axes mean the same thing.** A stack area and a product domain are
  different vocabularies that happen to share a word or two. Map to whichever one
  the label list actually holds.

Leave the automation's labels alone. Dependency and language labels are usually
applied by a bot, and applying them by hand fights it.

## What a good ticket carries

- **What needs doing**, in the reader's terms, not the implementation's.
- **Why now.** What it unblocks, or what it costs to keep not doing it. "It
  bothers me" is a real reason, written down.
- **Done when.** The observable condition. If you cannot name one, the ticket is
  not ready and probably wants the project's discussion label instead.

Title: `<surface>: <imperative summary>`, lower case, no trailing full stop.
`ci: cache cargo builds between release jobs` reads right. `Fix the CI` does not.

Leave the design out unless it is the point. A ticket that dictates the patch
removes the reason to have an engineer read it.

## Security

Never open a public issue for a vulnerability. It goes through the project's
private channel: a security advisory, the address in `SECURITY.md`, or the contact
link the issue chooser offers.

## PR descriptions

Open the project's PR template and answer every section it asks for. The four that
recur, and the real answer to each:

- **What**: one paragraph, what changes and why this way rather than another.
- **Closes**: `Closes #123`, or "no issue" and a sentence on why it did not need one.
- **Checks**: the boxes are claims. Tick one only after running the command it
  names, and where one failed, say which and why rather than leaving it unticked
  in silence.
- **Risk**: what breaks if this is wrong, and how a reviewer would notice. "None,
  it is a docs typo" is a fine answer.

Where the project squash-merges, the PR title becomes the commit on the default
branch, so it follows whatever commit convention `git log` shows.

Run the **unslop** skill over the body before opening. A PR description is the
most-read prose in a repository and the most likely to arrive padded.

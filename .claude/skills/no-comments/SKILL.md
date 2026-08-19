---
name: no-comments
description: "Spawn the comment hunter, fix accepted findings, and offer encodings for claimed constraints."
disable-model-invocation: true
---

# No comments

Spawn the comment hunter. Act on accepted findings.

Authoring agents defend their own comments. Defer to the hunter's fresh reading.

## Scope

Use the caller's files or diff. Otherwise use the current diff against the default
branch, including the working tree.

## 1. Hunt

Spawn a subagent of type `comment-hunter`. Pass the scope. Do not restate its
rules.

## 2. Audit the report

Read its report and its diff. Reject a finding when it:

- edits application code rather than comment lines
- reaches outside the scope
- deletes a comment the hunter's own exception list protects
- misstates the reason for a `MUST KILL`
- treats kept intentional code as guilty

A reshape flag on a surprise in our own code stays actionable. Rejecting a finding
does not restore the comment.

Then check what it missed. Scoped lint and type suppressions are in scope: where
one hides a correctness or safety rule, it is an actionable `MUST KILL`.

Restore a deletion only against an exact exception with scoped proof. A keep
survives only with proof it is about something we cannot change.

Before accepting a thin `IMPORTANT` or `do not remove`, whether it argues for a
kill or a keep, chase the symbol yourself: `git log -S`, `git blame`, the callers,
the tests. Then:

- an ambiguous kill stands. Do not restore it.
- a keep that is refuted, or still ambiguous, is deleted.

Revert and rerun one rejected report with the failure named. Reject a second time
and the run stops: report it open and fail.

## 3. Sketch, if a fix needs a shape

Fix trivial accepted flags directly: delete a dead path, drop a parameter, use the
real API.

Where a fix needs a shape, sketch it once for the accepted set and the surrounding
code: types, signatures, module boundary, bodies left unimplemented. Stop at the
sketch. Step 4 implements it.

## 4. Fix the root cause

Implement the smallest root-cause fix in scope and remove every workaround the
report named. Redesign as if the requirement had always existed rather than
bolting a guard onto a symptom.

Where the root cause sits outside the scope, land the smallest in-scope fix and
report the rest open. None of this authorises widening the fence or fixing
instances beyond it.

## 5. Offer to encode the constraints

A constraint comment says `do not remove`, `do not change wording`, or `talk to X
before changing`. Leave the ones about things we cannot change.

For the rest, offer the cheapest in-scope enforcement: a type, a runtime check, a
test, or a CI lint. Wait for interactive approval; an unattended or eval run needs
the caller's pre-approval instead.

Approved, encode it and delete the comment. Otherwise delete the comment, report
the constraint open, and sketch the out-of-scope work.

## 6. Report

The deletion count, restored comments, reruns, the sketch, fixes, encoding offers,
encodings landed, unenforced constraints, and any other open work.

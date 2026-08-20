# RFCs

For changes too large or too contested to argue in a normal PR review.

## When you need one

Write an RFC when a change would: alter a promise in `docs/spec/`, break compatibility for
installed modules or paired devices, add a surface, or commit the project to maintaining
something indefinitely.

Everything else is a normal PR. Most changes are normal PRs. An RFC process that swallows
small work is a process nobody uses.

## The flow

1. Copy `0000-template.md` to `NNNN-short-slug.md`, where `NNNN` is the number of the PR
   you are about to open. Do not renumber afterwards.
2. Open the PR with `type/question` and the relevant `area/` labels. The PR *is* the
   discussion, with no separate issue.
3. Argue it in review. Amend the RFC as the argument changes it; the diff is the record.
4. **Merged means accepted.** The RFC's status becomes `ACCEPTED` in the merge commit, and
   the spec is updated in the same PR or an immediate follow-up.
5. **Closed means rejected**, and the RFC stays closed rather than deleted. A rejected RFC
   with its reasoning is worth as much as an accepted one. It stops the same idea coming
   back every six months.

An RFC that is merged but never implemented gets an epic issue, so the gap is visible on
the board rather than only in a file nobody opens.

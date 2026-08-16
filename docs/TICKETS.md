# Tickets

How work is named, described, labelled and moved in KROMA. One issue is one unit of
work someone could pick up cold.

## Titles

`<scope>: <imperative summary>` — the same lowercase scopes as the commit history, so a
ticket and the commit that closes it read alike.

```
tizen: playback stalls on HEVC 10-bit after a seek
server: scan skips files with a colon in the name
ci: cache cargo builds between release jobs
ui-kit: give Dialog a controlled open prop
```

Rules that matter more than they look:

- **No prefixes.** Not `[BUG]`, not `FEAT:`, not a ticket id. Labels carry the type.
- **Lowercase after the scope**, no trailing period.
- **Say the symptom, not the guess.** `playback stalls after a seek`, not `seek handler
  race condition` — unless you have proof, in which case put the proof in the body.
- **One scope.** If a title needs two, it is two tickets.
- Under ~70 characters so it survives the board card.

## Bodies

Use the templates. They exist so a ticket cannot be opened without the things that
make it actionable. Three shapes:

| Template | For | Must answer |
|---|---|---|
| Bug report | Something broken | surface, version, install method, steps, expected vs actual, codec details for playback |
| Feature request | New capability | the problem, proposed behaviour, surfaces, could it be a module |
| Task | Internal work | what, why now, definition of done |

Codec details are mandatory on playback bugs. KROMA is direct-play and HEVC-first;
`hevc Main 10 / 3840x2160 / eac3` is the bug, the filename is not.

The repo is public. Redact tokens, IPs and library paths before pasting logs.

## Labels

Namespaced, so the set a ticket carries is readable at a glance.

**`type/`** — what kind of work. **Exactly one.**
`bug` · `feature` · `refactor` · `perf` · `docs` · `chore` · `security` · `question`

**`priority/`** — how soon. **Exactly one**, set at triage, changed freely.

| | Means | Looks like |
|---|---|---|
| `p0` | Drop everything | Data loss, a security hole, playback dead for everyone |
| `p1` | Next up | A core flow broken with no workaround |
| `p2` | Normal | Planned work. The default. |
| `p3` | Someday | Real, but nobody is waiting |

**`area/`** — where in the stack. **One or more**, and it is fine to have none while a
ticket is still vague.
`server` · `modules` · `sdk` · `web` · `tv` · `mobile` · `desktop` · `synology` ·
`ui-kit` · `ci` · `docs`

**Flow labels** — the two states a board column cannot express, because they are about
waiting rather than working:

- `needs-info` — waiting on the reporter. Closed after 14 silent days, reopened on reply.
- `blocked` — waiting on something outside this repo. The comment must say what.

**Left to automation**: `dependencies`, `javascript`, `rust`, `github_actions` are
Dependabot's. Do not apply them by hand.

Status does **not** live in labels. The board owns it. Two sources of truth for status
is how boards die.

## The board

Project: **KROMA** (Projects v2, `maxscharwath/kroma`). Every issue and PR is added
automatically; nothing is tracked in someone's head.

| Column | Means | Leaves when |
|---|---|---|
| **Triage** | Landed, nobody has looked | It has `type/` + `priority/`, and the body is understandable |
| **Backlog** | Understood, not now | Someone commits to doing it |
| **Ready** | Fully specified, unassigned | Someone starts |
| **In progress** | Being worked on now | A PR opens |
| **In review** | PR open | The PR merges |
| **Done** | Merged and released | Never — it stays as history |

Two rules keep it honest:

1. **Nothing enters `Ready` without a definition of done.** If nobody can say what
   finished looks like, it is still `Backlog`.
2. **`In progress` has a limit.** More than a handful of cards means work is being
   started, not finished. Finish before starting.

`needs-info` and `blocked` cards stay in whatever column they were in. They are not a
parking column; a ticket nobody can unblock in two weeks gets closed with the reason.

## Definition of ready

A ticket may be picked up when it has: a title in the format above, exactly one
`type/`, exactly one `priority/`, at least one `area/`, a body that follows its
template, and a definition of done someone else could verify. Bugs additionally need
steps that actually reproduce, or an explicit note that they do not reproduce reliably.

## Definition of done

Merged to `main` behind a PR that closes the issue with `Closes #N`; tests and lint
green; docs updated in the same PR if behaviour changed; no new `TODO` comments left
behind — those become tickets or they do not exist.

## Closing

Close with a reason, always, even on your own tickets: fixed by #N, duplicate of #N,
cannot reproduce and here is what was tried, or won't fix and why. A silently closed
ticket teaches the next reporter not to bother.

Stale sweep: `needs-info` after 14 days, `p3` untouched for 6 months. Both get a
comment before closing, and reopen on demand.

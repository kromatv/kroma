# Release notes

The release note is what someone reads after KROMA updates: in the web app and on
the television, on the GitHub Release, and later in Package Center. It is not the
changelog. Every PR is already in GitHub's compare view, and the note keeps the
few changes worth a person's time.

Write one with the [`release-notes`](../.claude/skills/release-notes/SKILL.md)
skill, `/release-notes 0.1.39`. This page holds what is specific to KROMA and
outranks the skill where they differ.

## Where it lives

One folder per release, holding one file per language and an optional date:

```
releases/0.1.39/en.md
releases/0.1.39/fr.md
releases/0.1.39/release.json
```

The version is the one the commits since the last `v[0-9]*` tag make: `bun run ci
changelog` prints it. The range starts at that tag. Module and vendor tags are not server releases.

The server embeds every folder when it is built and serves the notes at
`GET /api/releases`, in the reader's language, falling back to English. A release
shows only once the running server has reached its version, so the next
release's notes can land before the bump. Nothing opens on its own: the web app
badges the sidebar link until the reader visits the history, and the television
lists every release under About.

## Drafts

`gh workflow run release-notes.yml` drafts both files for the version main is
heading for and opens a pull request with them. Running it again leaves an
existing draft branch alone, since it may hold your edits, unless `-f force=true`. Claude writes the draft from
this page, the skill and every PR since the last tag. It runs on Claude Opus 5.5 at high
effort, with both translation catalogs in the prompt so every label matches the
app, and the pull request it opens lists what it left out and any pre-release
check nobody did. CI reaches Claude through workload identity federation, with
no stored key: the `kroma-notes` rule in the Claude Console accepts GitHub's
OIDC token only from `release.yml` on a push and `release-notes.yml` on a
dispatch, on `main` of `kromatv/kroma`, and its tokens act in the `kroma-ci`
workspace, which has a monthly spend limit. Canary text runs at low effort. A run anywhere else, or one that cannot reach Claude, drafts from the
commit subjects. On a laptop, `ANTHROPIC_API_KEY` does the same job. A
draft whose headings the server could not read falls back to the subjects too.

The draft's `release.json` carries `"draft": true`, and the server leaves such a
folder out. Rewrite the note with the skill, check the French against the
catalogue, then delete the flag: that is what publishes it, in the app and as
the GitHub Release body. `bun run ci notes`
does the same on a laptop, and refuses to replace a folder a person wrote.

Each canary build's release body is drafted from the squash titles since the
previous canary build, never from PR bodies, since nobody reads it before it is
published.

`release.json` carries the date, written when the release is cut:

```json
{ "date": "2026-09-13" }
```

`deploy.yml` builds the GitHub Release body from `en.md` as of the promoted
commit, followed by an "All changes" list of every feature and fix since the last
tag. Land the note before promoting; without one the body is the list alone.

## Shape

Up to four sections, in this order, each left out when it would be empty. The
headings are fixed because the server parses them.

| `en.md` | `fr.md` | Holds |
|---------|---------|-------|
| `## Action required` | `## À faire` | What the owner must do, before or after updating |
| `## New` | `## Nouveautés` | The highlights |
| `## Fixed` | `## Corrections` | One line per symptom that is gone |
| `## For the server owner` | `## Pour le propriétaire du serveur` | Admin, install and NAS changes |

The first and last sections reach the server's owner only. Everyone else gets the
highlights and the fixes.

A highlight is a `###` title, one paragraph and at most one image. Images stay
out of the repository: drag the file into any GitHub comment box and paste the
`user-attachments` URL it returns.

```markdown
### <what you can now do>
<What happens and where, each label spelled as the app spells it.>

![<what the picture shows>](https://github.com/user-attachments/assets/<id>)
```

## Budget

Counted in French, which runs longer. It is tighter than the skill's default
because the same text is drawn on a television card, and a remote cannot scroll
a paragraph.

| Section | At most |
|---------|---------|
| Action required | 2 lines of 200 characters |
| New | 3 highlights, each a 45-character title and a 200-character paragraph |
| Fixed | 5 lines of 90 characters |
| For the server owner | 3 lines of 160 characters |

## What stays in and out

- A module's own release is out: a change under `modules/` ships on that
  module's `<id>@<version>` tag. What the server does to modules is in, and that
  code lives under `server/`.
- The commit type is a hint, not a filter. A `refactor` that sweeps the tree for
  defects can hold a fix users noticed. Read the body.
- Kit, workbench, module SDK and dev-tool changes are out unless a screen people
  use looks or behaves differently. Then the line is about that screen.

## Before writing the action section

Diff the schema against the last release:

```bash
git diff v0.1.38..HEAD -- server/crates/kroma-db/src/schema/
```

A migration that deletes rows, drops a table or moves one means the owner backs
up before updating, and the note says so. The Updates section of
`docs/spec/admin/README.md` already asks for that nudge.

## Reading a PR here

PR titles are written for reviewers and are often figurative. Read the body. Its
What section says what changed on screen, and the body often says whether it ran
on a real television or NAS.

PR screenshots that point at an `issue-assets` release from before the move to
`kromatv/kroma` are dead links. Capture a fresh one with `bun run shots:pr`, once
per language when the picture shows text, and upload it as above.

## The French note

`fr.md` is written in French. It is not a translation of `en.md`, and it is the
note most people using KROMA read.

- `vous`, short sentences, the register of the app's own copy.
- Every screen, button and setting keeps the name the app gives it, as the
  release ships it: `git grep -i '<word>' <ref> -- packages/core/src/locales/fr/`.
  `player.play` is `Lecture`, and the owner is `le propriétaire du serveur`.
- An English technical word can stay: HDR, codec, remux, direct play.
- French does not stack nouns: `les apps KROMA sur téléphone`, never
  `les apps KROMA téléphone`.

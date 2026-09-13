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

The version is the one `server/Cargo.toml` carries for the release. The range
starts at the last `v[0-9]*` tag. Module and vendor tags are not server releases.

The server embeds every folder when it is built and serves the notes at
`GET /api/releases`, in the reader's language, falling back to English. A release
shows only once the running server has reached its version, so the next
release's notes can land before the bump. The web app and the television open the
newest unseen release on their own, once per account.

`release.json` carries the date, written when the release is cut:

```json
{ "date": "2026-09-13" }
```

GitHub does not read the folder. Once `deploy.yml` has promoted the release,
replace the body GitHub generated:

```bash
gh release edit v0.1.39 -R kromatv/kroma --notes-file releases/0.1.39/en.md
```

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

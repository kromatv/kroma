---
name: release-notes
description: Write a short release note people finish reading. Picks the few changes a user will notice from the pull requests since the last release, names each by what the reader can now do, keeps to a length budget, writes every language from the intent instead of translating, and traces every line to a PR. Use when cutting a release, or filling a GitHub Release body, a store "what's new", a package changelog or an in-app what's new screen. Triggers - "write the release notes", "release notes for 0.4.0", "what's new", "changelog for this release", "notes de version".
---

# Release notes

A release note is read once, in a few seconds, by someone who did not ask for
it. Almost all of the work is deciding what to leave out. What is left says, in
the reader's words, what they can now do.

## Read the project's rules first

Where the note goes, its shape, its languages and its length budget belong to
the project, and they outrank this skill:

```bash
git ls-files --cached --others --exclude-standard | grep -iE 'release[-_]?notes|changelog|releasing'
```

Read that doc and the previous notes, if there are any. Write the files where
the doc says. With no doc, print the note in the reply, use the defaults at the
end of this file, and say that you did.

## Gather

The range runs from the last release tag to what is being released, usually the
default branch. If the user named a version or a range, use theirs. Match the
release tag's own form. A repository that also tags modules, packages or
vendored builds has other tags in the way, and `v*` matches `vendor-...` too.

```bash
git tag --list 'v[0-9]*' --sort=-v:refname | head -3
git log <tag>..<ref> --format='%h %s'
```

On a squash-merged repository each commit is one pull request. Read the body of
every candidate, whatever its type:

```bash
gh pr view <n> --json title,body,labels,files
```

A title is written for a reviewer. It names the code or it is figurative, and
either way it rarely says what changed on screen. A `refactor` can carry the fix
a user noticed, and a `feat` can be mostly fixes. Skip a PR unread only when its
file list proves it internal, such as CI or tests alone.

The reader's before is the last release, not the PR's before. A bug introduced
and fixed inside the range never reached anyone, and neither did a feature added
and removed inside it. Check against the last tag when unsure.

Check what this release carries. A plugin, a module or an app that has its own
version and its own tag is not in it, and its own changes are not this note's to
claim. What this release does to them is.

## Choose

Put every candidate in one of three piles:

1. The person using the product will notice it.
2. The person running or administering it will notice it.
3. Nobody outside the repository will: refactors, CI, tests, lint, dependency
   bumps, developer tools, internal components.

The third pile is gone. A refactor or a dependency earns a line only when it
changed something someone can see or measure, and then the line is about that.

Rank what is left by how many people meet it, how often, and how bad it was. A
bug that quits the app or loses someone's place beats a cosmetic one that more
people saw. Keep the top few, and merge the PRs a user would see as one change.

A line needs proof that it works where the reader meets it. A change its own PR
calls untested on the device, platform or host it targets stays out until
someone has seen it work there. Say so in the reply.

## Write each line

A highlight is a title and at most two sentences.

- **The title is the outcome.** What the reader can now do, or what now happens,
  in their words. Never the component, the code path or the PR's title.
- **The first sentence says what happens and where.** Name the screen, the
  setting or the button exactly as the product spells it in that language.
- **The second sentence is optional.** It says what this replaces, its one
  limit, or the second half of a merged change.
- **A fix names the symptom that is gone**, the way a user would have reported
  it. The cause belongs in the PR.
- **A number beats an adjective**, and only a measured one, taken from the PR.
  With no measurement there is no speed claim.
- Present tense, active voice, with "you" or the product as the subject.
- No PR numbers, component names, package names or ticket IDs.
- No marketing: "exciting", "seamless", "powerful", "under the hood", "various
  improvements". No exclamation marks, no emoji.

| Instead of | Write |
|------------|-------|
| Refactored the subtitle pipeline | Subtitles now start in your language |
| Improved search performance | Search shows results as you type |
| Fixed a race condition in the upload queue | A file you drop twice uploads once |
| New `ExportButton` component | Export any report as a spreadsheet from its menu |
| Bug fixes and performance improvements | Say which, or say nothing |

## Anything the reader must do goes first

Write it as an instruction, before or after the update, whichever it is: a
setting that moved, a minimum version, something to update alongside.

Look for stored data the release changes in a way the last version cannot undo:
a migration that deletes rows, drops or moves a table, or rewrites a format.
When there is one, the note tells the owner to back up before updating, even
when no PR says so.

## Images

At most one per highlight, and only one that shows the change itself: the new
screen, cropped to it. The PR's screenshot of the finished state is usually the
right one. The alt text says what the picture shows. An image never carries a
sentence the note should have said. A picture with readable text is captured
once per language.

## Every language is written, not translated

The first draft is the brief for the others. Write each language from what the
change means to the reader, in the register the product's own copy already uses.

- Take every name of a screen, button or setting from the product's translation
  catalog in that language, as the release ships it:
  `git grep -i '<word>' <ref> -- <catalog path>`. The working tree may hold
  edits that are not in the release.
- Keep a technical word in English where the catalog does.
- Restructure freely. Two languages need the same facts in the same order, not
  the same sentences.
- A literal rendering of the other language reads as machine output. If a native
  speaker would not have written the sentence unprompted, rewrite it.

## Check before handing back

- For every line, name the PR it comes from. A line you cannot trace goes.
- Count against the budget in every language. The longer language sets the
  limit.
- Run the **unslop** skill's pattern list over each language. Its advice to use
  "I" and hold opinions does not apply here, because a release note speaks for
  the product.
- In your reply, not in the note, list what you left out with a one-line reason,
  so the author can put something back.
- Also in the reply, list every check a PR asked for before release that nothing
  shows was done. Those block the release, not the note.

## Defaults

When the project states no budget: at most three highlights and five fixes, a
title of at most seven words, a body of at most two sentences and 30 words, a fix
of one line, and a whole note someone reads in under 30 seconds.

# Translating KROMA

KROMA is written in English and kept complete in French. Every other language
is a folder of JSON files that can be translated a little at a time: what is not
translated yet reads in English.

[`i18n.md`](i18n.md) explains how the system works. This page is how to use it.

## See where a language stands

```bash
bun run i18n
```

```
Language      Stage   Translated  Unreviewed  Inherited  Outdated  Missing  Coverage
en  English   source        4363           0          0         0        0      100%  ████████████████
fr  Français  stable        4363           0          0         0        0      100%  ████████████████
de  Deutsch   beta          2410         800          0        12     1941     55.5%  █████████░░░░░░░
```

`bun run i18n status de` breaks one language down file by file and lists the
keys that are missing or outdated.

## Start a language

```bash
bun run i18n add de
```

This creates `packages/core/src/locales/de/` with one message, the language's
name for itself. Pass `--name` when the name it finds is not the one you want,
and use a regional tag where the region matters: `pt-BR`, `zh-Hant`.

The language starts as a draft. It is in the repository and nobody is offered it
yet, so it can be merged at 5%.

## Translate

Ask for what is left:

```bash
bun run i18n todo de --out de.todo.json
bun run i18n todo de player. content.   # only some keys
```

The file lists each message with its English source, and what the language
says today when the translation is outdated:

```json
{
  "core": {
    "player.play": { "state": "missing", "source": "Play" },
    "content.seasonCount": {
      "state": "missing",
      "source": {
        "content.seasonCount": "{count} seasons",
        "content.seasonCount_one": "{count} season"
      }
    }
  }
}
```

Answer with a flat file of key to text, grouped the same way, and write it back:

```json
{
  "core": {
    "player.play": "Wiedergabe",
    "content.seasonCount": "{count} Staffeln",
    "content.seasonCount_one": "{count} Staffel"
  }
}
```

```bash
bun run i18n fill de de.done.json
```

`fill` puts every key in the right file, in the order of the source, and
updates the lock. Editing the JSON files by hand works as well. Run `bun run
i18n sync` afterwards.

## Translate with Claude

Both ways below run on the Claude subscription Claude Code is signed in with.
No API key is involved.

**In a session.** Ask for it, or run the skill:

```
/translate de
```

Claude takes what the language lacks from `todo`, translates it, writes it back
with `fill --machine` and runs the check. The skill is
`.claude/skills/translate/SKILL.md`, and it follows this guide.

**Unattended.** The same work, a batch at a time, through the `claude` command
running headless:

```bash
bun run i18n translate de               # everything missing or outdated
bun run i18n translate de player. --limit 100
```

It sends each batch with the English source and the notes,
with no tools and none of the project's settings. An answer is checked before
it is kept: it has to be a key that was asked for, it cannot be empty, and it
cannot name a placeholder the source does not pass.

Either way, what a machine wrote is marked **unreviewed** in the lock and
counted apart in the report. It stops being unreviewed when someone edits it,
or reads it and says it holds:

```bash
bun run i18n status de        # lists the unreviewed keys
bun run i18n confirm de player.
```

A machine translation ships like any other. Unreviewed is a reminder, not a
gate.

## Tell translators what a message means

`packages/core/src/locales/notes.json` is a flat map from a key, a key prefix
ending in a dot, or `*` for every message, to a note:

```json
{
  "*": "KROMA is a self-hosted media server. Address the reader informally.",
  "player.": "Controls of the video player. Keep them to one or two words.",
  "player.play": "A verb, on the button that starts playback."
}
```

```bash
bun run i18n note player.play "A verb, on the button that starts playback."
```

`todo` hands the notes to a human translator with each message, and
`translate` hands them to Claude. Write one whenever the source is ambiguous
out of context: a word that is a noun or a verb, a term that must stay in
English, a limit on length.

## Rules of a translation

- Keep every `{placeholder}` spelled as the source spells it. The check refuses
  one the source does not pass.
- Leave a message out when you have no translation. Never write an empty string
  or copy the English in.
- Plurals are key suffixes: `_one`, `_few`, `_many`, `_other` and so on, the
  categories your language has in CLDR. The key without a suffix is the general
  form and must exist. Russian writes `key`, `key_one`, `key_few` and
  `key_many`; Japanese writes `key` alone. `key_zero` is honoured at zero in
  every language, for a sentence like "No results".
- Translate the meaning. The English is the source of truth.

## Check

```bash
bun run i18n check
```

It runs in CI as part of the tests.

## Ship it

A maintainer changes the stage in `packages/core/src/locales/i18n.json`:

```json
"locales": {
  "de": { "stage": "beta" }
}
```

- `beta` puts the language in every picker and lets a browser or an account
  select it. Gaps read in English. The server starts fetching titles and
  synopses in it too.
- `stable` promises it complete. From then on a pull request that adds a
  message has to translate it, so reserve it for a language with someone behind
  it.

## A regional variant

`bun run i18n add fr-CH` starts a locale that reads everything from `fr`.
Translate only what differs: `todo fr-CH` lists nothing, because nothing is
missing, so add the messages by hand or with `fill`. The report counts what it
takes from `fr` as inherited.

## The website

kroma.tv has its own messages, `apps/www/messages/<code>.json`, built by
Paraglide. The report counts them under `www`, and `todo`, `fill` and
`translate` cover them. The website ships the locales listed in
`apps/www/project.inlang/settings.json`, so a new language there is a file plus
its code in that list.

## Modules

A module's messages are in `modules/<id>/locales/<code>.json`. `todo` and `fill`
cover them under the module's id, next to `core`. Adding a language file to a
module changes its bundle, so bump `version` in its `module.json` in the same
commit. A module outside this repository uses the same commands as
`bunx kroma i18n`.

## When the source changes

A message whose English text changed after you translated it shows as outdated.
Retranslate it, or, where your translation still holds, run:

```bash
bun run i18n confirm de player.play
```

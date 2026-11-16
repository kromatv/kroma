---
name: translate
description: Translate KROMA's interface into a language, or bring one up to date, with the project's own tooling. Takes what a language is missing or has outdated from `bun run i18n todo`, translates it, writes it back with `bun run i18n fill --machine` so it is tracked as unreviewed, and checks the result. Use when adding a language, filling the gaps of one, or after the English source changed. Triggers - "translate into German", "add Spanish", "fill the missing translations", "bring de up to date", "/translate de", "traduis en italien".
---

# Translate

You are the translator. The session does the work, so nothing here needs an API
key: the tooling hands you messages as JSON and takes your answers back as JSON.

Read [`docs/translating.md`](../../../docs/translating.md) once before you
start. It is short, and it is the same guide a human translator follows.

## The loop

```bash
bun run i18n status <locale>                  # where the language stands
bun run i18n add <locale>                     # only if it does not exist yet
bun run i18n todo <locale> --limit 150 --out <scratch>/todo.json
```

Read the file. For each message you get:

- `source`: the English text. It is the source of truth.
- `current`: what the language says today, for a message whose source changed.
  Keep what still holds.
- `note`: what the project tells translators. Follow it.
- `state`: `outdated` or `missing`. Outdated ones come first.

Write your answers to a second file, grouped by set exactly as the todo file is:

```json
{
  "core": {
    "player.play": "Wiedergabe",
    "content.seasonCount": "{count} Staffeln",
    "content.seasonCount_one": "{count} Staffel"
  },
  "tv.kroma.vpn": { "nav.vpn": "VPN" }
}
```

```bash
bun run i18n fill <locale> <scratch>/done.json --machine
bun run i18n check
```

`--machine` marks what you wrote as unreviewed. Never leave it out, and never
run `bun run i18n confirm`: a person does that after reading your work.

Repeat until `todo` comes back empty. Take a namespace at a time when the user
asked for part of a language: `bun run i18n todo de player. content.`.

## Rules

- **Placeholders.** Keep every `{name}` spelled as the source spells it. `fill`
  and the check refuse one the source does not pass.
- **Plurals.** When `source` is an object, its keys are one message in several
  forms. Answer the bare key as the general form, plus one `key_<category>` for
  each CLDR plural category of the target language that reads differently.
  Russian needs `_one`, `_few` and `_many`; Japanese needs the bare key alone.
  `key_zero` is the sentence for a count of zero, in any language. Never answer
  a category the language does not have.
- **Length.** These are buttons, labels and short sentences on a television, a
  phone and a browser. Stay close to the length of the source.
- **Register.** What a native speaker expects from good software in that
  language. The `*` note says how the product addresses its reader.
- **Leave alone.** Product and brand names, codec and file-format names,
  technical identifiers.
- **When unsure, skip.** A message you cannot translate well stays out of your
  answer. It then reads in English, which is better than a wrong sentence.
- **Never write an empty string, and never copy the English in.**

## A regional variant

`fr-CH`, `pt-BR` and the like read everything from their language. `todo`
lists nothing for them because nothing is missing. Translate only the messages
the user names, or the ones where the regional wording differs.

## When a term is ambiguous

Do not guess twice. Decide once, and write it down so the next translator,
human or not, makes the same choice:

```bash
bun run i18n note player.play "A verb, on the button that starts playback."
bun run i18n note "*" "Address the reader informally."
```

## Report

Say how many messages you wrote, how many you skipped and why, and what
`bun run i18n status <locale>` now shows. Say that they are unreviewed.

Staging a language `beta` or `stable` in `i18n.json` is the maintainer's
decision. Do not change it.

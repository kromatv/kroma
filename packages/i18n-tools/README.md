# @kromatv/i18n-tools

The translation workbench behind `bun run i18n`. It reads every body of
messages in the repository, the app's catalogs and each module's, and answers
three questions: how far has each language come, is anything wrong, and what is
left to translate.

```bash
bun run i18n                     # every language at a glance
bun run i18n status de           # one language, file by file
bun run i18n new nav.x "Text" fr="Texte"   # write a message everywhere it is owed
bun run i18n rename nav.x nav.y  # in every language, and in the code
bun run i18n rm nav.y            # delete a message from every language
bun run i18n unused              # messages no source file names
bun run i18n check               # what the catalogs get wrong; CI runs it as a test
bun run i18n sync                # mirror the source's files, update locks and types
bun run i18n add de              # start a language, as a draft
bun run i18n todo de --out f     # what is left to translate, as JSON
bun run i18n fill de f           # write translations back
bun run i18n translate de        # fill what is left through Claude Code, headless
bun run i18n note nav.x "..."    # tell translators what a message means
bun run i18n confirm de nav.     # translations hold as they read: outdated or machine-written
bun run i18n prune               # remove keys the source language no longer has
bun run i18n mv admin.x admin/x  # split a namespace into files
bun run i18n types               # write the key types
```

The module CLI runs the same commands over a module, as `kroma i18n`.

[`docs/i18n.md`](../../docs/i18n.md) explains the system and
[`docs/translating.md`](../../docs/translating.md) is the translator's guide.

## What is where

- `set.ts` reads and writes a catalog set in either layout: a folder per
  language (the app) or a file per language (a module).
- `status.ts` measures a language against its source: translated, outdated,
  missing.
- `lock.ts` is the lock that tells outdated from current.
- `check.ts` is every rule the catalogs are held to.
- `edit.ts` changes files: sync, fill, prune, move, add. `confirm.ts` says a
  translation holds as it reads.
- `keys.ts` creates, renames and removes one message, and `usage.ts` finds the
  ones nothing names.
- `translate.ts` fills a language through a translator, `claude-code.ts` is the
  one that asks the `claude` command, on the login it has, and
  `translate-prompt.ts` is what it is told. `notes.ts` is what translators are
  told.
- `commands.ts`, `key-commands.ts`, `translate-command.ts` and `run.ts` are the
  commands themselves, which `cli.ts` here and `kroma i18n` in `@kromatv/cli`
  both run.
- `workspace.ts` names this repository's sets. The app's comes first, and its
  `i18n.json` is the policy the modules follow.

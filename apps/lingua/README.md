# Lingua

Translate a repository in the browser. A contributor signs in with GitHub, fixes
or adds messages in their language, and presses **Send**: their edits land in the
repository as a pull request, in commits authored by them.

It runs on Cloudflare (one Worker, one D1 database, a cron) and talks to GitHub
through a GitHub App, so anyone can host their own. KROMA's runs at
[lingua.kroma.tv](https://lingua.kroma.tv).

## How it works

- **The repository is the source of truth.** A `lingua.json` at its root names
  the folder of an i18n project, the one holding its `i18n.json`. On every push
  to the default branch (the App's webhook, plus a sync every ten minutes in
  case one is missed), Lingua re-reads the files of that folder whose blob
  changed and keeps a copy in D1. Nothing is edited in D1 that the repository
  does not end up holding.
- **An edit is a draft until it is sent.** Saving checks the message against its
  source: a `{placeholder}` the source does not have, or a `$t(key)` reference
  to a message outside its file, is refused, because it would print raw on
  screen. A dropped placeholder is a warning.
- **Sending opens one rolling pull request per contributor per language**, on
  `lingua/<login>/<locale>`. Each send is one commit authored by the contributor
  (`<id>+<login>@users.noreply.github.com`, so it counts on their profile and
  publishes no address). If the default branch moved, the branch merges it first.
  The App opens the pull request: GitHub only lets an account open one from a
  branch it can push to, and a contributor cannot push to the repository.
- **Merged or closed**, the proposal and its edits are forgotten and the branch
  is deleted.

Lingua never keeps a contributor's GitHub token. Signing in reads who they are
once; every write is the App's, and only inside the project folder, for
languages `i18n.json` lists or the contributor started, for keys the source has.

## `lingua.json`

```json
{
  "url": "https://lingua.kroma.tv",
  "projects": [{ "path": "packages/core/src/locales" }]
}
```

| Field | Meaning |
| --- | --- |
| `projects` | The i18n project to translate: the folder holding its `i18n.json`, relative to the repository root. One per repository. |
| `url` | Where this repository's Lingua runs, `https` only. Lingua ignores it; the i18n devtools build their links from it. |

Everything else comes from the project folder, laid out the way
`packages/i18n-tools` keeps it:

| File | Lingua reads |
| --- | --- |
| `i18n.json` | The source language, the fallback, and every locale with its stage. Lingua offers the source and every locale listed there, drafts included, and shows the stage. |
| `<locale>/**/*.json` | Flat `{ "key": "message" }` catalogs. A file is named by its path under the locale folder (`nav`, `admin/backup`), and a translated key goes into the file at the same path as the source file holding it. A `$schema` pointer is kept, and is no message. |
| `<locale>/i18n.lock` | Per message, a digest of the source it was translated from and of the translation, plus ` mt` while a machine translation waits for a reader. |
| `notes.json` | Notes for translators, by key, by key prefix ending in a dot, or `*` for all. A message shows every note that applies, its own last. |

Plurals follow the `key` + `key_one`/`key_few`/… convention: Lingua asks each
language for the CLDR categories it has (`Intl.PluralRules`), so Czech gets
`_few` and `_many` and Vietnamese gets the base alone. A send that would leave
plural forms without their base is refused.

## What a pull request holds

A send writes what `bun run i18n` would write for the same work, so the pull
request passes `bun run i18n check`:

- Edits land as `fill` writes them: each file in the source's key order, two-space
  JSON with a trailing newline.
- Every locale whose messages moved gets its `i18n.lock` rewritten as `sync`
  does. An edited message is recorded against the current source and loses its
  ` mt`; one Lingua did not touch keeps what the lock said.
- A message reads as **outdated** when the source moved since the lock recorded
  it, and **unreviewed** while it carries ` mt`. `POST /api/confirm
  { project, locale, keys }` keeps a confirm for the contributor; their next
  send records those messages against the current source without ` mt`, which
  is a pull request that may touch the lock alone.
- `POST /api/locales { project, locale }` starts a language. Until the
  contributor sends it, only they see it. Their first send does what `i18n add`
  does (the language's folder with its own name under `lang.<locale>`, that name
  added to the source and to every stable language), lists it in `i18n.json` as
  `{ "stage": "draft" }`, and writes the locks.

`GET /go/<owner>/<repo>/<locale>/<key>` links to one message: it answers with a
redirect to the page of the file that holds it, `#<key>` focusing its field. An
unknown key, language or project lands on the closest page that exists.

## Deploying

KROMA's deployment ships from `.github/workflows/lingua.yml` on every push to
`main` that touches this app: it creates the `kroma-lingua` D1 database the
first time, applies `migrations/`, then deploys. A self-hosted copy does the
same by hand, from this directory, with `wrangler` signed in:

```bash
bunx wrangler d1 create kroma-lingua      # once; wrangler finds it by name afterwards
bun run migrate                           # before every deploy that adds a migration
bun run deploy
```

`wrangler.jsonc` names the database and carries no id: wrangler resolves the
binding by name, so the same file deploys to any account.

Then connect GitHub:

1. Open `https://<your host>/setup` and press **Create the GitHub App** (fill
   in an organisation to create it there). GitHub registers the App with the
   permissions it needs (contents and pull requests: write; metadata: read),
   the webhook and the sign-in callback, then returns to `/setup/done`, which
   keeps the one-hour code GitHub sent.
2. Trade the code for the App's secrets, within the hour. On KROMA's
   deployment, run the **Lingua** workflow with **connect** ticked. Anywhere
   else, run the command `/setup/done` shows:
   `bun run --filter @kromatv/lingua setup <code>`. Either way the script
   stores the App's id, private key, client secret and webhook secret with
   `wrangler secret bulk` and prints none of them. With `--owner`, it only
   accepts an App that account owns, so an App a stranger made through your
   `/setup` page is never connected.
3. Install the App on the repositories to translate. Each needs a
   `lingua.json`. The next push or the next ten-minute sync picks it up.

`/setup` answers 404 once the secrets are set.

## Running it locally

```bash
bun run dev                                  # http://localhost:3400
LINGUA_DEV_LOGIN=you bun run dev             # signed in as "you", edits kept in memory
```

Without a D1 binding, the dev server reads the `lingua.json` of the checkout it
runs in, and its project folder, from disk. Sending needs GitHub and is refused.

## Code

| Folder | Holds |
| --- | --- |
| `src/core/` | The rules, with no I/O: `lingua.json`, `i18n.json`, catalog files, locks, notes, plural rows, checks, and the plan of a send. |
| `src/github/` | The App's JWT, the API client, sync, and building a proposal. |
| `src/store/` | Every read and write behind `Store`: D1, and an in-memory twin for tests and dev. |
| `src/server/` | Routes (sign-in, edits, proposals, webhook, setup), sessions, the cron, and the page data. |
| `src/routes/`, `src/components/` | The pages, built with `@kromatv/ui`. |

`bun run test apps/lingua` runs the tests. GitHub is faked at the `GitHub`
interface (`src/github/test-support.ts`), so a proposal's branch, commit, author
and pull request are checked without a network. The files a send commits are
checked against what `@kromatv/i18n-tools` writes for the same work, on a
fixture project and on this repository's own catalogs.

# Lingua

Translate a repository in the browser. A contributor signs in with GitHub, fixes
or adds messages in their language, and presses **Send**: their edits land in the
repository as a pull request, in commits authored by them.

It runs on Cloudflare (one Worker, one D1 database, a cron) and talks to GitHub
through a GitHub App, so anyone can host their own. KROMA's runs at
[lingua.kroma.tv](https://lingua.kroma.tv).

## How it works

- **The repository is the source of truth.** A `lingua.json` at its root says
  where the catalogs are. On every push to the default branch (the App's webhook,
  plus a sync every ten minutes in case one is missed), Lingua re-reads the files
  whose blob changed and keeps a copy in D1. Nothing is edited in D1 that the
  repository does not end up holding.
- **An edit is a draft until it is sent.** Saving checks the message against its
  source: a `{placeholder}` the source does not have, or a `$t(key)` reference
  outside the namespace, is refused, because it would print raw on screen. A
  dropped placeholder is a warning.
- **Sending opens one rolling pull request per contributor per language**, on
  `lingua/<login>/<locale>`. Each send is one commit authored by the contributor
  (`<id>+<login>@users.noreply.github.com`, so it counts on their profile and
  publishes no address). If the default branch moved, the branch merges it first.
  The App opens the pull request: GitHub only lets an account open one from a
  branch it can push to, and a contributor cannot push to the repository.
- **Merged or closed**, the proposal and its edits are forgotten and the branch
  is deleted.

Lingua never keeps a contributor's GitHub token. Signing in reads who they are
once; every write is the App's, and only to the catalog paths `lingua.json`
names, for languages it lists, for keys the source file has.

## `lingua.json`

```json
{
  "source": "en",
  "references": ["fr"],
  "locales": ["en", "fr", "es"],
  "catalogs": [{ "path": "packages/core/src/locales/{locale}/{namespace}.json" }]
}
```

| Field | Meaning |
| --- | --- |
| `source` | The language every other one is translated from. Its files decide which keys exist. |
| `references` | Languages shown beside the source as extra context. |
| `locales` | The languages contributors may edit, the source included if it may be corrected. |
| `catalogs` | Where the files are. Each `path` names `{locale}` and `{namespace}` once. |

A catalog file is a flat `{ "key": "message" }` object. Plurals follow the
`key` + `key_one`/`key_few`/… convention: Lingua asks each language for the CLDR
categories it has (`Intl.PluralRules`), so Czech gets `_few` and `_many` and
Vietnamese gets the base alone. Files are written back as two-space JSON with a
trailing newline, with existing keys left where they were.

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
runs in, and its catalog files, from disk. Sending needs GitHub and is refused.

## Code

| Folder | Holds |
| --- | --- |
| `src/core/` | The rules, with no I/O: `lingua.json`, catalog files, plural rows, checks. |
| `src/github/` | The App's JWT, the API client, sync, and building a proposal. |
| `src/store/` | Every read and write behind `Store`: D1, and an in-memory twin for tests and dev. |
| `src/server/` | Routes (sign-in, edits, proposals, webhook, setup), sessions, the cron, and the page data. |
| `src/routes/`, `src/components/` | The pages, built with `@kromatv/ui`. |

`bun run test apps/lingua` runs the tests. GitHub is faked at the `GitHub`
interface (`src/github/test-support.ts`), so a proposal's branch, commit, author
and pull request are checked without a network.

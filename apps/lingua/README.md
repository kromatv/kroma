# Lingua

Translate a repository in the browser. A contributor signs in with GitHub, fixes
or adds messages in their language, and presses **Send**: their edits land in the
repository as a pull request they opened, in commits authored by them.

It runs on Cloudflare (one Worker, one D1 database, a cron) and needs one thing
from GitHub: an OAuth App, which signs people in. It translates public
repositories only. Anyone can host their own. KROMA's runs at
[lingua.kroma.tv](https://lingua.kroma.tv).

## How it works

- **The repository is the source of truth.** The Worker variable
  `LINGUA_PROJECTS` lists the repositories to translate. A `lingua.json` at the
  root of each names the folder of its i18n project, the one holding its
  `i18n.json`. Lingua keeps a copy of that folder in D1 and edits nothing there
  that the repository does not end up holding.
- **Lingua reads without a token of its own.** It calls GitHub's REST API with
  the OAuth App's client id and secret as HTTP Basic, and GitHub serves public
  data to them at 5,000 requests an hour. Until they are set it reads anonymously, at
  60 an hour. File contents come from `raw.githubusercontent.com` at a commit.
- **A sync is a pass, and a pass is small.** A Worker on the free plan may make
  50 subrequests per invocation, so one pass asks where the branch points,
  lists the tree, and reads at most 40 of the files whose blob changed. When
  the branch has not moved, the pass makes one conditional request, which
  GitHub answers `304 Not Modified` and does not count against the limit. The
  new head is recorded only once every changed file of that head is stored, so
  the next pass carries on where this one stopped. A large change takes a few
  passes, and `/setup` shows how far along it is.
- **Passes run on a cron and on page loads.** Every five minutes the cron
  passes over each project in turn, the one checked longest ago first, while its
  budget of 45 requests lasts. Opening a project, language or file page whose
  last pass ended more than two minutes ago starts one after the page is
  served. A lease in D1 keeps two passes off one project.
- **An edit is a draft until it is sent.** Saving checks the message against its
  source: a `{placeholder}` the source does not have, or a `$t(key)` reference
  to a message outside its file, is refused, because it would print raw on
  screen. A dropped placeholder is a warning.
- **Sending opens one rolling pull request per contributor per language, from
  their own fork.** GitHub only lets an account open a pull request from a
  branch it can push to, so **Send** asks GitHub for `public_repo`. After the
  first grant GitHub answers without a prompt. With that token Lingua forks the
  repository into the contributor's account if they have no fork, brings the
  fork's default branch level with the repository's, and pushes one commit to
  `lingua/<locale>` on the fork. The contributor authors and commits it, as
  `<id>+<login>@users.noreply.github.com`, so it counts on their profile and
  publishes no address. If the default branch moved, the branch merges it
  first. The pull request is theirs, and maintainers may push to it. A
  contributor who refuses `public_repo` cannot send: the send bar says why and
  offers to ask again. A send also refuses while a pass is still reading the
  branch's latest changes.
- **Merged or closed**, the proposal and its edits are forgotten. Each pass asks
  GitHub about every open proposal of its project. The branch on the fork stays
  with its owner.

Lingua never keeps a contributor's GitHub token. Signing in asks for no scope
and reads who they are once. A send uses its `public_repo` token for that one
send, then drops it. Every write stays inside the project folder, for languages
`i18n.json` lists or the contributor started, for keys the source has.

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

Then:

1. Create the OAuth App people sign in through. GitHub has no one-click flow
   for it: under **Settings → Developer settings → OAuth Apps → New OAuth
   App** (an organisation's settings work too), fill in

   | Field | Value |
   | --- | --- |
   | Application name | `Lingua <your host>` |
   | Homepage URL | `https://<your host>` |
   | Authorization callback URL | `https://<your host>/auth/callback` |

   Generate a client secret, then store the pair in the Worker:

   ```bash
   bunx wrangler secret put GITHUB_OAUTH_CLIENT_ID
   bunx wrangler secret put GITHUB_OAUTH_CLIENT_SECRET
   ```

   On KROMA's deployment, add them to the `sites` environment as
   `LINGUA_OAUTH_CLIENT_ID` and `LINGUA_OAUTH_CLIENT_SECRET` instead (GitHub
   reserves the `GITHUB_` prefix for its own): every run of the **Lingua**
   workflow stores them in the Worker.
2. List the repositories in `LINGUA_PROJECTS`, under `vars` in
   `wrangler.jsonc`. A variable set in the dashboard is gone after the next
   `wrangler deploy`. Each repository needs a `lingua.json` at its root. The
   next cron, within five minutes, picks it up.

`/setup` shows whether sign-in is set and, for each listed repository, the
branch Lingua tracks, its last check, and whether it is up to date, still
reading (with the files read so far), or stopped by an error. A sign-in that
cannot finish lands on `/problem`, which says why and links to the way forward.

To try a branch that is not merged yet, pin it for one deploy:
`bunx wrangler deploy --var LINGUA_PROJECTS:kromatv/kroma@feat/lingua`. Lingua
then reads that branch and opens pull requests against it. The next deploy
without `--var` goes back to the default branch.

### Bindings and variables

| Name | Kind | Meaning |
| --- | --- | --- |
| `LINGUA_DB` | D1 binding | Projects, the copy of their i18n folders, users, sessions, edits and proposals. Without it, `vite dev` reads the checkout instead. |
| `LINGUA_PROJECTS` | variable | The repositories to translate, comma separated: `owner/repo` tracks the default branch, read from GitHub once; `owner/repo@branch` tracks that branch. A repository dropped from the list is forgotten at the next cron. |
| `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` | secrets | The OAuth App. It signs people in, asks for `public_repo` on a send, and authenticates every read of a repository. Without them nobody can sign in, and reads are anonymous. |
| `LINGUA_DEV_LOGIN` | variable | Local only: without D1, signs every request in as this login. |

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
| `src/github/` | OAuth, the API client, the reader for public data, sync passes, forks, and building a proposal. |
| `src/store/` | Every read and write behind `Store`: D1, and an in-memory twin for tests and dev. |
| `src/server/` | Routes (sign-in, edits, proposals, links), sessions, the cron and the passes pages start, and the page data. |
| `src/routes/`, `src/components/` | The pages, built with `@kromatv/ui`. |

`bun run test apps/lingua` runs the tests. GitHub is faked at the `GitHub`
interface and over `fetch` (`src/github/test-support.ts`), so a sync pass and a
proposal's branch, commit, author and pull request on a contributor's fork are
checked without a network. The files a send commits are
checked against what `@kromatv/i18n-tools` writes for the same work, on a
fixture project and on this repository's own catalogs.

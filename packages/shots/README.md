# @kromatv/shots

Captures the same screen across the shells a change touches, and hands back a
markdown block a pull request or issue can carry.

```bash
bun run shots:pr about-hardware --route about --targets tizen,webos
bun run shots:pr about-hardware --route about --targets tizen --publish
```

Not to be confused with `bun run shots`, which shoots the kit's component
stories (`packages/ui/scripts/shoot-stories.ts`). This one shoots the product.
`bun run shots:clip` reads the same screens in every language for texts their
box cuts off: see [Clipped text](#clipped-text).

## Why it exists

A change to the design is reviewed from a description, and a description of a
screen is not the screen. Before this, evidence was assembled by hand and
uploaded ad hoc, so most PRs simply carried none.

## What it does not do

**It photographs a build, it never makes one.** The dev servers and the native
apps are yours to start. A capture tool that also builds is a build tool that
sometimes takes pictures, and it would hide a stale bundle behind a fresh image.

## Reaching a screen

A television has no address bar, which is the whole difficulty. The three
routings:

| Target | Routing | How a screen is named |
|---|---|---|
| `web` | `url` | `--path /settings` |
| `tizen`, `webos` | `dev-nav` | `--route about`. A DEV build of the TV router mirrors its in-memory stack to `sessionStorage['kroma:dev-nav']` and restores it on mount (see `packages/tv/src/app/router.tsx`), so seeding that key lands on any screen with no key presses. This is why the TV targets drive a dev server rather than a preview build. |
| `appletv`, `androidtv` | `keys` | `--keys ArrowDown,Enter`. A native shell has neither, so a screen is reached the way a viewer reaches it. |

Route names are `RouteName` in `packages/tv/src/app/router.tsx`. A route that
takes params gets them as JSON: `--route grid --params '{"kind":"films"}'`.

Most screens sit behind a profile, and a TV cannot be signed in from the
outside. Lift a session off a device that is signed in and pass it:

```bash
bun run shots:pr home --route home --seed ~/kroma-shot-session.json
```

The file is a JSON object of localStorage entries (`{"kroma.session": "…"}`)
and holds a real token. Keep it out of the repo.

## Preconditions, and how they fail

Each is checked before the shutter, because every one of them fails as a
*plausible image* rather than as an error:

- **The dev server is KROMA.** A dev port is squattable. The page title is
  checked, and a run against something else names what it found instead. This is
  not hypothetical: 5174 and 5175 were both occupied on the machine this was
  written on.
- **Metro is up.** A native development build carries no JS bundle; without
  Metro it opens on a redbox, which simctl and adb photograph as cheerfully as
  the real screen.
- **The app is installed.** Checked through `simctl get_app_container` and
  `pm list packages`, with the install command in the error.
- **The file is a PNG.** `simctl io … -` does not stream to stdout: handed `-`
  it writes a file called `-` in the working directory and exits 0. Every
  capture is checked for the PNG magic before it counts.
- **The brand intro is skipped.** It is an *overlay* over an app tree that is
  already mounted, so a run that does not skip it photographs the splash while
  the DOM underneath reports the right screen. `kroma:intro-seen` is seeded into
  sessionStorage (both `BrandIntro.web.tsx` and the web client's `intro.tsx`).

## Publishing

`--publish` uploads every capture as a GitHub attachment of the repository and
prints the markdown with working URLs. Without it, the run stays local under
`.shots/<slug>/` (gitignored) and prints the same block pointing at the local
files. An attachment is never replaced: a re-run uploads new ones, so paste the
new block over the old one.

## Attaching any image

A screenshot taken some other way (a Playwright script, a simulator, a crop)
goes into a PR or issue the same way:

```bash
bun run shots:attach before.png after.png
bun run shots:attach clip.mp4 --repo owner/name
```

It prints one `![name](https://github.com/user-attachments/assets/<uuid>)` line
per file. Paste them into the body, or into a file for `gh pr edit --body-file`.

Never host a PR image anywhere else. A pushed branch, a committed file or a
release all leave something in the repository, and a release is worse than it
looks: the server's update check and the Synology package source both read this
repo's `/releases`, and `gh release create` marks a new one latest.

### The endpoint

It is the one the web editor calls when an image is dropped into a comment,
and it is not documented, so it can change without notice.

```bash
RID=$(gh api repos/kromatv/kroma --jq .id)
curl -sS -X POST \
  "https://uploads.github.com/user-attachments/assets?name=shot.png&content_type=image%2Fpng&repository_id=$RID" \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/json" \
  -H "Content-Type: image/png" \
  --data-binary @shot.png
# 201 {"url":"https://github.com/user-attachments/assets/<uuid>"}
```

- The body is the file's raw bytes, and `Content-Type` must name its type.
- It takes images and video only. Anything else answers 422.
- The token needs push access to the repository. Without it the answer is 404.
- The gh CLI's own token is enough. The browser session cookie some tools ask
  for (the three-step flow through `github.com/upload/policies/assets`) is only
  needed for files that are not images or video.
- The URL answers 404 to an anonymous request. That is expected: GitHub's
  markdown renderer rewrites it to a signed `private-user-images` link, so it
  shows in a PR or issue body. Check one with
  `gh api -X POST markdown -f text='![x](<url>)' -f mode=gfm`.

`bun run shots:attach` (`src/attach.ts`) is this request, with the token passed
in a header rather than on a command line. `curl -H "Authorization: …"` as above
puts it in the process list for as long as the upload runs.

## Verified

| Target | State |
|---|---|
| `tizen` | Captured end to end (the About screen, 1920x1080). |
| `webos` | Captured end to end. |
| `appletv` | Captured end to end from the simulator; the app on it had no Metro, which is what prompted the Metro precondition. The `--keys` path is written but has not driven a real screen. |
| `androidtv` | SDK, AVD and precondition paths exercised. The emulator was not booted and no capture has been taken. |
| `web` | Not run: nothing was serving :3000 at the time. |

## Clipped text

A label that fits in English can lose its end to an ellipsis in German or
Vietnamese, and nobody sees it until a screenshot. `bun run shots:clip` reads
every screen in every language and lists each text its box cuts off:

```bash
KROMA_EMAIL=owner KROMA_PASSWORD=… bun run shots:clip --port web=3200 --port tizen=5274
```

It reads what the kit's screen reader says
([`docs/inspecting-a-screen.md`](../../docs/inspecting-a-screen.md)): a `Text`
row carries `clipped` when its own box cuts it, with how many pixels across and
down. So the shells it reads must be dev servers of this checkout, and like a
capture it never starts one.

### What it needs

- **A server**, `--server` (default `http://localhost:4040`).
- **The dev shells**, `web` and `tizen` by default (`--targets web,tizen,webos`),
  each on its default port unless `--port <id>=<n>` moves it.
- **An account**, never written in the repository. `KROMA_EMAIL` (an email or a
  username) and `KROMA_PASSWORD` sign it in, as they do for the `kroma` CLI,
  and the sweep signs out again at the end. Or `--seed <file>`, the same
  localStorage JSON as `shots:pr` takes, whose `kroma.session` it uses as it is.
  An admin account reaches the admin pages too.

The account's language beats the browser's in every shell, so the sweep sets
it, one language at a time, and puts back the one it had at the end. Two sweeps
on one account at once would read each other's languages: a screen that does
not come up in the language asked for is listed as not read.

### What it reads

- **Languages**: every one `packages/core/src/locales/i18n.json` offers (the
  source and each stage past `draft`), or `--langs de,vi`.
- **The web client**: every page of `clients/web/src/routes` under a layout that
  takes no param, then every link those pages hold, and the links of those. One
  page stands for each route that takes a param (one title for every title), a
  page a splat route serves is read on its own, and nothing under the player is
  opened. `--max-pages` (default 150) bounds the crawl.
- **The TV app**: home, the three grids, the genres, search, the signed-in
  settings and the release notes, then the first movie and the first show the
  library lists, each landed on through `dev-nav` over home.

Each screen is read once it speaks the language and its text has stopped
changing, or after five seconds on one that keeps changing. A page that
crashes, or does not answer in three minutes, is listed as not read and the
sweep goes on in a new one.

### What it prints

```
From the catalogs:
de       web   /admin/monitoring  "Gefolgt" (de:monitoring.followed)  misses 8px across

Not from a catalog:
all      web   /trending  "The Hunger Games: Sunrise on the Reaping"  misses 87px across

Not read:
vi       tizen search  not read: it stayed in "de"

2 clipped texts, 1 from the catalogs: en 1, de 2, vi 1.
```

A text is matched against the catalogs of its language and of the source
(core and modules), so a message gets its key (`en:` when a translation still
shows the English) and a title, a name or a message the server sent does not.
A message with `{variables}` reads a text only when its own words make a third
of the text's letters, so `{head} and {last}` is not taken for every sentence
that holds an "and".
A text clipped the same way in every language swept says `all`, and one a
screen repeats says how often, `(x20)`.

It exits non-zero when it lists a clipped text or a screen it could not read.
`--catalog-only` lists and fails on the catalogs' texts alone, which is what a
translation can fix; `--report` always exits 0; `--json` prints the findings
and the screens not read as JSON.

### What it does not see

- A native shell. React Native does not report a cut text yet, so the sweep
  reads the browser shells only.
- A text that fits its own box while a parent cuts the box, and a line box
  shorter than its font (the reader cannot tell a cut accent from spare room).
- What a screen shows only after a key press: the settings show their first
  group, a dialog shows only once opened.

## Ports

`--port` overrides a dev server port for a single DOM target, and
`--metro-port` the Metro port for the native ones (memory of this repo: tv-native
is often on 8083 when mobile owns 8081).

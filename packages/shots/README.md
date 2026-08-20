# @kroma/shots

Captures the same screen across the shells a change touches, and hands back a
markdown block a pull request or issue can carry.

```bash
bun run shots:pr about-hardware --route about --targets tizen,webos
bun run shots:pr about-hardware --route about --targets tizen --publish
```

Not to be confused with `bun run shots`, which shoots the kit's component
stories (`packages/ui/scripts/shoot-stories.ts`). This one shoots the product.

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

`--publish` uploads to the `issue-assets` GitHub release, replacing an asset of
the same name so re-running a capture updates the image a PR already links, then
prints the markdown with working URLs. Without it, the run stays local under
`.shots/<slug>/` (gitignored) and prints the same block with the URLs it *would*
have. The release is a plain asset bucket: nothing in the repo grows a binary.

## Verified

| Target | State |
|---|---|
| `tizen` | Captured end to end (the About screen, 1920x1080). |
| `webos` | Captured end to end. |
| `appletv` | Captured end to end from the simulator; the app on it had no Metro, which is what prompted the Metro precondition. The `--keys` path is written but has not driven a real screen. |
| `androidtv` | SDK, AVD and precondition paths exercised. The emulator was not booted and no capture has been taken. |
| `web` | Not run: nothing was serving :3000 at the time. |

## Ports

`--port` overrides a dev server port for a single DOM target, and
`--metro-port` the Metro port for the native ones (memory of this repo: tv-native
is often on 8083 when mobile owns 8081).

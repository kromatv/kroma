# Third-party licenses

Every build lists the third-party code it ships, with each license text, and
the web client shows that list under Account, About. Nothing here is written by
hand: the lists come out of the build, so a dependency added or removed shows
up, or goes away, on the next one.

## Where each list comes from

| Build | Collected by | Written to | Read from |
| --- | --- | --- | --- |
| Server | `server/build.rs`, with the `kroma-notices` crate | `OUT_DIR/third-party-licenses.json`, compiled into the binary | `GET /api/licenses` (signed in) |
| Web client, desktop | the `thirdPartyNotices` Vite plugin in `@kromatv/bundler` | `third-party-licenses.json` and `THIRD-PARTY-NOTICES.txt` beside the bundle's entry | `/third-party-licenses.json` on the same origin |

Both files have one shape, the zod schema in `@kromatv/client/licenses`: every
distinct text once, and every package pointing at the texts it ships.
`shippedPackages` in `@kromatv/core` merges the server's list with the app's,
so a package both ship is listed once, under both.

## The server's crates

`kroma_notices::emit` runs `cargo metadata --locked --offline` for the target
being built and keeps the crates the server links: normal dependencies reached
from `kroma-server`, never a build or dev dependency, never a crate of this
workspace. Each crate's text is, in this order:

1. its own `LICENSE*`, `LICENCE*`, `COPYING*` and `NOTICE*` files, and its
   `license-file`;
2. the files of another crate from the same repository under the same license
   (the members of a workspace published one by one often ship them only once);
3. the SPDX text of each license its `license` expression names, from
   `server/crates/kroma-notices/spdx/`, under the crate's own authors.

A crate none of these covers is a warning on a laptop and fails the build under
CI. The fix is almost always the third case: add the SPDX text of the license
it names to `spdx/` and to `TEXTS` in `spdx.rs`.

## The app's packages

The plugin lists the installed packages whose modules end up in the bundle,
not everything in `package.json`, with the license files each one carries.
It runs for the `client` environment only, so a server render never writes one.

A file this repository vendors (a font, a sound) is listed when the bundle
emits it and a `third-party.json` sits beside it, naming the work, its version,
license, source, the files of it the folder holds and its notice file. See
`packages/ui/src/assets/fonts/third-party.json`. A vendored file with no
`third-party.json` is not listed: add one in the same change that adds the
file.

# Publishing `@kromatv/installer`

The television installer leaves this repository as one npm package,
`@kromatv/installer`, so that `npx @kromatv/installer` installs KROMA on a TV
from a computer that has Node and nothing else. The command it installs is
`kroma-tv`, the name the single-binary builds already carry. The workspace package of the same name, in `packages/installer`, stays `private`, as
`@kromatv/ui` and the SDK's sources do
([kit-publishing.md](kit-publishing.md),
[module-sdk-publishing.md](module-sdk-publishing.md)).

```bash
bun run tv:stage --version 0.1.40   # packages/installer/dist/npm, and its tarball
bun run tv:smoke                    # install the tarball outside the repo, run it under Node
```

## What the staged package is

| In it | From |
|---|---|
| `cli.js` | `src/bin.ts` bundled for Node with every dependency inlined, the version stamped in, and a Node shebang |
| `README.md` | `packages/installer/npm/README.md`, with the command table rendered from the command tree as `npx @kromatv/installer` |
| `package.json` | written by `scripts/stage.ts`, not the workspace one |
| `LICENSE` | the repository's |

It has no dependency, so `npx` downloads about 115 kB and installs nothing
else. It declares `os: darwin, linux`: the installer reads an ARP table and a
keychain and drives `adb` and LG's tools, and Windows has not been done.

The workspace runs the installer under Bun, and its sources are typed against
Node so that a Bun call does not compile. The smoke script is the second guard:
it installs the tarball into an empty project and runs `--help`, `doctor` and
a scan of the loopback address under the `node` on `PATH`.

## The lane

`release.yml`'s **TV installer package** job runs stage and smoke on every push
and uploads the tarball as the `kroma-installer-npm` artifact. It publishes
`X.Y.Z-canary.<build>` under the `canary` dist-tag from a push to `main`, and
`X.Y.Z` under `latest` from a stable tag, through `bun run ci npm publish`, on
the channel rules of the SDK. `npx @kromatv/installer` takes `latest`, so a user
gets the installer of the last stable release, and
`npx @kromatv/installer@canary` the newest one.

The version says which release the installer was cut with, not which KROMA it
installs: it always installs the latest release, or the newest canary build
with `--source canary`.

## The first version, by hand

npm attaches a trusted publisher to a package that already exists, so the job
publishes nothing while `npm view @kromatv/installer` finds no package. Once:

1. Stage and prove the current stable version:

   ```bash
   bun run tv:stage --version 0.1.38
   bun run tv:smoke
   ```

2. Publish it from a machine signed in to npm:

   ```bash
   npm login
   npm publish packages/installer/dist/npm/kromatv-installer-0.1.38.tgz --access public
   ```

3. On npmjs.com, open `@kromatv/installer`, then **Settings**, **Trusted publisher**,
   **GitHub Actions**, and enter organization `kromatv`, repository `kroma`,
   workflow filename `release.yml`, environment left empty.

From the next push the job publishes on its own. There is no `NPM_TOKEN`, as
for the other two packages.

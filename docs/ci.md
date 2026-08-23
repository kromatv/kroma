# The pipeline

Every workflow step is a command of `packages/ci-tools`, run as
`bun run ci <command>`. A job is a list of those commands, so the same list
runs on a laptop, and the path tables, retention rules and version logic are
TypeScript with tests rather than YAML and shell.

```
bun run ci lanes [--json] [--lane rust]   which jobs a change can reach
bun run ci typecheck [--jobs N]           every workspace's typecheck, N at a time (the root `typecheck` script)
bun run ci test --shard 2/4 | --merge     vitest shards (blob + coverage), then one report
bun run ci rust clippy | test             every cargo workspace; `test` runs under cargo llvm-cov
bun run ci build <target> [--slice]       a fleet build, with its dist path as a step output
bun run ci version                        version, triplet, channel, build number, canary name
bun run ci canary publish [--rename] ...  files onto the rolling `canary` prerelease, with retention
bun run ci cache prune --prefix X         retire older Actions cache entries under a key prefix
bun run ci tools ffmpeg | tauri-deps      apt installs with retries
bun run ci sonar prepare                  the tree as the scanner wants it
```

## ci.yml: the gate

```
lanes ─┬─ checks (typecheck + biome)                    code
       ├─ test 1..4 ──── test-report (merge → lcov)     code
       ├─ build {web, site, tizen, webos, tv-native}    fleet
       ├─ android (Kotlin compile)                      android
       ├─ desktop (cargo check, Linux mpv path)         desktop
       ├─ rust (clippy, llvm-cov tests → lcov)          rust
       └─ sonar ◄── test-report + rust                  SONAR_TOKEN present
```

Required checks on `main`: **Typecheck + lint**, **Unit tests**, **Rust**. A
job whose lane is off is skipped, and a skipped job satisfies the gate: a
docs-only pull request passes in a minute without building anything.

`lanes` lists the changed files through the GitHub API (pull request files, or
the push's compare) and matches them against `packages/ci-tools/src/lanes.ts`.
A change under `.github/workflows`, `.github/scripts` or `packages/ci-tools`
opens every lane; so does a push with no parent or a manual run.

`bun run typecheck` is `ci typecheck`: every workspace's own script, one per
core at a time. `bun run --filter '*'` starts all thirty-seven at once, and
thirty-six native `tsc` processes on a four-core runner took the runner itself
down ("The runner has received a shutdown signal") twice in three runs.

Unit tests run as four shards, each with coverage, and `test-report` merges
the blobs into one `coverage/lcov.info` and one summary. The shards are not
required checks; the merge is, so a shard that never ran cannot pass as a
green run.

The Rust job runs clippy and then every test under `cargo llvm-cov`, across
the server workspace and each module's, and leaves `server/lcov.info`. One
cache entry (`rust`) holds the check artifacts and the instrumented build; it
saves from `main` only. `CARGO_PROFILE_DEV_DEBUG=0` keeps it near 1.7 GB.

Sonar reads the two lcov files the gates produced. Nothing runs twice. Rust
coverage is absent on a change that touched no Rust, which is fine: the
quality gate scores new code, and such a change has no new Rust lines.

### What changed, and why

Measured over the last forty runs before the rebuild:

| | before | after |
|---|---|---|
| PR, required checks green | 6 to 8 min (one job: typecheck 60 s, vitest 250 to 344 s, biome) | 3.5 min measured on #126 (typecheck + lint 1:12, four shards merged at 3:40) |
| PR, Sonar done | 9 to 10 min (its own workflow, vitest with coverage again: 274 to 424 s) | about 5.5 min on a JS change (the scan itself is 1:45 and reads the shards' coverage); a Rust change waits for the Rust job |
| main, Sonar done | 12 to 21 min | about 10 min (the Rust job, then a 4.5 min main-branch scan) |
| Android compile (6 min) | every fleet PR | only `clients/tv-native/**` and install changes |
| Rust warm / cold | 4.5 min / 10 min | same build, but the cache stops being evicted (below) |
| `bun install`, setup | 23 copies of `setup-bun` + a pinned version in 15 files | `.bun-version`, read by every job |

The cold Rust builds were not a build problem. The repository's Actions cache
stood at 11.9 GB against a 10 GB quota, so GitHub evicted by LRU and the
`server` entry was gone more often than not. What filled it: two DerivedData
entries per Apple app (keyed by run id, 813 MB and 620 MB each, twice), three
Gradle dependency sets (about 3.5 GB), and a separate instrumented Rust tree
for Sonar (1.75 GB) beside the plain one (1.4 GB). Now the Apple jobs retire
their previous DerivedData entry (`ci cache prune`), the CI Android job reads
the Gradle home without writing a copy, and there is one Rust tree.

## release.yml: candidates and the canary channel

Every push to `main` builds the whole fleet for the version `server/Cargo.toml`
is on, as a **candidate** that publishes no Release. `deploy.yml` promotes a
candidate's exact bytes behind the `production` environment approval.
`ci version` resolves one version, one `triplet`, and one `build` number
(minutes since 2020) for the run; every store-bound package in the run carries
that same number.

What a candidate does publish is the **canary channel**: the `canary` job
copies the sideloadable installers (Samsung `.wgt`, LG `.ipk`, Android TV and
Android `.apk`, the macOS, Windows and Linux installers) onto the rolling
`canary` prerelease, with the dated version in the name
(`KROMA-tizen-0.1.39-canary.3493975.wgt`). The Synology `.spk` lands on the
same tag from `synology.yml`. `ci canary publish` keeps, per kind of file, the
newest five whatever their age and anything younger than two weeks; the rest
is retired. That window stays above the seven-day stale copy
`packages.kroma.tv` serves when the GitHub API is down, which is what made an
older, count-based retention hand out 404s.

The two `.ipa` bundles are not on the channel: TestFlight is the only way onto
an Apple device. The channel is not a gate either: a failed upload does not
make a candidate unpromotable.

Samsung ships as four files from one build (`clients/tizen/scripts/package-all.ts`):
`KROMA-tizen-<v>.wgt` with every engine tier for the Store, and one package
per Tizen version for sideloading (`KROMA-tizen8-`, `KROMA-tizen4to7-`,
`KROMA-tizen3-`), each floored at its own `required_version`. The site's
`release-targets.ts` matches `KROMA-tizen-` only, so the per-version files are
on the tag and in the candidate but not yet on the page: offering them there
is the channel-switch work below.

### How the site reads the channels

`apps/www` (kroma.tv) is prerendered. At build time `vite/releases.ts` fetches
the releases feed once: `vX.Y.Z` tags become the stable downloads
(`lib/releases.ts`, one file per platform, the newest release must carry every
platform or the build fails), and the assets on the `canary` and
`desktop-latest` tags become the archive's canary builds (`lib/channels.ts`,
grouped by the version each file name carries). `lib/release-targets.ts`
classifies an asset by its file name, so the files the `canary` job uploads
appear on `/download/archive` with no site change.

At run time the site's Worker also serves `/api/canary` from the Build &
Release run artifacts, with a token, because run artifacts are the one thing a
public repository refuses to serve anonymously. With the channel on a release
tag that path is redundant: the tag's `browser_download_url`s need no token,
no zip wrapper and no thirty-day expiry.

`site.yml` deploys it: on a change to the site's own sources, and on a
`workflow_run` after Build & Release, Synology or Deploy, because each of
those changes what a visitor sees. Until it existed nothing did, and the live
page sat on 0.1.30 while main shipped 0.1.39.

One thing still stands between a push and a visitor seeing it on /download:
the page offers **stable only**. The data is there (`canary` from
`virtual:kroma-releases`, which is what /download/archive renders); the page
needs a channel switch the way the archive already has one, and a "last
canary, built N hours ago" line under each platform.

`desktop-autoupdate.yml` builds the three desktop installers a second time per
push (without libmpv on macOS) for the updater's `desktop-latest` tag. Folding
it into the candidate's desktop build (produce the updater tarball and
signature after the libmpv bundling and signing, write `latest.json` from the
three artifacts) would drop three full Tauri builds per push and put the
updater on the same bytes the canary offers. It needs a live run with the
signing secrets to verify, which is why it is not part of this rebuild.

## Caches and the 10 GB budget

| entry | size | written by |
|---|---|---|
| `rust` (server + modules, instrumented) | ~1.0 GB | ci.yml on main |
| `desktop-check` | ~0.4 GB | ci.yml on main |
| `desktop-release` x3 OS | ~1.2 GB | _release-desktop.yml, desktop-autoupdate.yml |
| `dd-tvnative-v1-*`, `dd-mobile-v1-*` | ~0.8 + 0.6 GB, one each | the Apple jobs, pruned to one |
| `ios-tvnative-v3-*`, `ios-mobile-v3-*` | ~0.2 GB each | the Apple jobs, keyed by config hash |
| Gradle dependencies + build cache, per app | ~0.8 GB each | the release Android jobs |
| `synology-v3`, `synology-arm64-v2` | ~0.8 GB | synology.yml |
| `kmod-*` x3 targets | ~0.35 GB | modules.yml |

About 7 GB when every entry is warm, down from 11.9 GB. What went, and why
it was not worth its space:

- Gradle transforms (0.6 GB per app, and two copies of each while the old
  entry aged out): extracted AARs and instrumented jars, derived from the
  dependencies in about a minute. Excluded through `gradle-home-cache-excludes`.
(The phone build keeps its own `./gradlew`. Running it on the `gradle`
setup-gradle installs would save the 130 MB wrapper zip, and it cost four
minutes and a fresh 798 MB dependency set instead: the generated project's
wrapper is the version its task outputs were built with.)
- `~/Library/Caches/CocoaPods` inside the iOS project entries (about 0.25 GB
  each): a hit skips `pod install`, and a miss on an exact key restores
  nothing, so nothing ever read it.
- CodeQL's overlay base database (190 MB per push to main, two copies at any
  time): `CODEQL_OVERLAY_DATABASE_MODE=none`; the scan is three minutes
  either way.
- The Tizen Studio installer (259 MB): restored no faster than it downloads.
- The bun binary (20 to 37 MB per platform and version, five copies): a
  GitHub release download of the same size.
- `server/target/release` in the Synology entry: the .spk build only ever
  writes the musl target dir.
- Earlier: two DerivedData copies per Apple app and a separate instrumented
  Rust tree for Sonar (see above).

If usage climbs past 10 GB again, the Rust entry is the first to go (it is
the largest and the oldest between Rust pushes), and the symptom is a
ten-minute `rust` job. `gh cache list` shows what is there;
`bun run ci cache prune --prefix <key>-` retires duplicates.

The remaining 3 GB of Rust trees are the next step, and it leaves the quota
entirely: `sccache` with an R2 bucket (S3-compatible, no egress fees) caches
per object, is warm for pull requests too, and needs only an access key pair
and the bucket name as repository secrets. Not done here because the bucket
and its token have to be created in the Cloudflare dashboard.

## Bun

`.bun-version` is the one pin (`1.4.0`), read by every `setup-bun` through
`bun-version-file`, by `packageManager` in `package.json`, and by the server
Dockerfile. Jobs that only need the CLI run
`bun install --frozen-lockfile --filter '@kroma/ci-tools'`, a few packages
instead of the workspace.

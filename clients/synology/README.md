# KROMA Synology package (`.spk`)

One self-contained package for **x86_64 DSM 7**. It installs a single process that
serves the **API + streaming _and_ the web UI** on one port, plus a bundled static
**ffmpeg/ffprobe**. No Node, no extra dependencies.

```
kroma-<version>-x86_64.spk
 └ /var/packages/kroma/target/
     ├ bin/kroma-server     # Rust: API + streaming + serves the web SPA
     ├ web/                # the static web SPA (served on the same origin)
     └ ffmpeg/{ffmpeg,ffprobe}
```

## Build the package (on your Mac/Linux)

Prereqs: **Docker** (used to cross-compile a static `x86_64-musl` binary no host
Rust cross-toolchain needed), **bun**, and `curl`.

```bash
clients/synology/build.sh 0.1.0
# → clients/synology/dist/kroma-0.1.0-x86_64.spk
```

The script: builds the web SPA → cross-compiles `kroma-server` to
`x86_64-unknown-linux-musl` in a Docker musl image → fetches the ffmpeg pinned in
`ffmpeg.lock` (`fetch-ffmpeg.sh`) → assembles the `.spk`, its `package.tgz` packed
with xz.

That ffmpeg is ours: `ffmpeg/` holds the recipe (only the codecs, formats and
filters the server and its modules invoke), `.github/workflows/ffmpeg.yml` builds
it for both arches in BtbN's builder image, runs `ffmpeg/check.sh` (the commands
KROMA gives ffmpeg) against it, and publishes a `vendor-ffmpeg-kroma-*` release.
Moving `ffmpeg.lock` onto a new one is a PR. A feature that needs a codec or a
filter the recipe leaves out adds it to `configure.args` and a line to `check.sh`. Re-run faster with `SKIP_WEB=1` / `SKIP_RUST=1`.

## Installing it

How a user installs the package, grants the `kroma` user access to their
shared folders and updates it is in
[Install KROMA on a Synology NAS](../../docs/setup/synology.md). Facts that
guide relies on, which the package below has to keep true:

- The package source is a Cloudflare Worker (`apps/packages`, served at
  `https://packages.kroma.tv`) that lists every release of both channels live
  from the GitHub Releases API. Nothing is rebuilt or redeployed when a release
  ships, and the `.spk` itself stays on the GitHub Release. Opening the URL in a
  browser shows a landing page with every version. With *Settings > General >
  beta packages* on, DSM rides whichever channel is newest: a canary uses a 4th
  feature segment, so it outranks its stable base until the next tag.
- DSM 7 has no trust level setting: Package Center warns about any package
  Synology did not sign, and the user confirms. DSM 7 also never runs an
  unsigned package as root, so `conf/privilege` cannot make the package read
  every share by itself.
- The package runs as the `kroma` user (`"run-as": "package"`), which has no
  access to shared folders until the user grants it in Control Panel.
- The wizard writes `var/kroma.conf`, which the service script sources. A
  variable added there by hand needs `export` to reach the server.

The generator for a static catalog still exists, for anyone who wants to host
one: `bun run --filter @kromatv/synology-repo gen` (see that package's README).

## Hardware transcoding (Intel models)

Most playback is direct play and re-encodes nothing. What costs CPU is a source
the player's decoder refuses, say a 4K frame going to a 1080p-only decoder, and
on a NAS one such stream will take the whole box.

Every Intel Synology (DS918+, DS920+, DS423+, DS220+ …) has a QuickSync encoder
that does the same job at a few percent CPU. Reaching it takes three things, and
the package carries all of them:

- an ffmpeg built with VAAPI (`ffmpeg.lock`);
- libva and Intel's i965 driver beside it (`ffmpeg/lib`, `ffmpeg/dri`, from
  Debian bookworm, whose glibc is DSM 7's). The ffmpeg loads libva from the
  host, and DSM has none: until the package shipped its own, every test encode
  died on `libva-drm.so.2` and the box transcoded on the CPU;
- the `videodriver` group, joined at install (`conf/privilege`), which is what
  opens `/dev/dri/renderD128`.

Check what your box settled on after an upgrade:

```bash
grep 'video re-encodes' /var/packages/kroma/var/kroma.log
```

`accel=vaapi` or `accel=qsv` means it is on the iGPU. `run on the CPU` names the
reason. The usual one on a model with no iGPU (the Ryzen units: DS923+, DS1522+,
DS723+) is that there is genuinely nothing to use, and playback of a 4K source to
a 1080p-only device will remain slow. Direct play to a capable client is the
answer there.

VA-API also needs a driver. DSM does not always carry one; SynoCommunity's
`synocli-videodriver` package installs it where it is missing, and the service
picks it up from `/var/packages/synocli-videodriver/target/lib` on restart.

## Notes
- **x86_64 only** for now (covers DS2xx+/DS9xx+/DS16xx+ etc.). ARM models need an
  `aarch64-musl` build ask and I'll add the target.
- **Libraries:** the wizard's Movies/TV Shows fields only seed the first two
  libraries. Everything else lives in the web admin under **Sources**.
- Data (SQLite DB, image cache, logs) lives in `/var/packages/kroma/var/data` by
  default (or the optional data folder you chose in the wizard) and survives
  upgrades.

## Publishing a release (and how updates work)

One workflow owns the whole server deliverable: `.github/workflows/synology.yml`.
A `vX.Y.Z` tag builds the stable `.spk` and attaches it (+ a `<spk>.info.json`
sidecar with version/md5/size, read by the dynamic source) to that GitHub
Release; a push to `main` that touches server/web/shared code builds a canary
`.spk` into the rolling `canary` prerelease. The same run then assembles the
multi-arch **Docker image** (amd64 reuses the `.spk` payload with no second
compile, arm64 cross-compiles in its own job) and pushes it to ghcr. The dynamic
worker source needs nothing: it reads the releases live.

The musl target dir is cached between runs (`synology-v2-*` cache) and the
cross image is digest-pinned, so a warm push build takes minutes, not a cold
~15-minute compile. The full client fleet (desktop + TV) ships from
`.github/workflows/release.yml` on every push to `main`, onto its own `canary`
tag. Modules release separately, from `.github/workflows/modules.yml`.

To iterate on the store landing page without a build, run
`bun run --filter @kromatv/synology-repo preview` (live-reload, with
`CATALOG_BETA=true` for the canary variant).

**Version rule (do not regress this):** DSM installs a `.spk` over an existing one
only when the version is **strictly greater**; otherwise it refuses with the
misleading `4521 "invalid file format"`. DSM's manual-install check compares the
dotted **feature** version and IGNORES the `-build` suffix (proven on a real NAS:
two `0.1.2-<build>` spks read as "same version already installed"). So `build.sh`
stamps `X.Y.Z.BUILD`, with `BUILD` a **4th feature segment** (minutes since 2020,
monotonic), so every build is strictly newer, including the tag-less **canaries**
that share the same `X.Y.Z`. An earlier commit broke this by
shrinking that segment `0.1.3.<minutes>` (~3.4M) &rarr; `0.1.3.<days>` (~2.4k), so
any NAS with the big-numbered build saw every new build as a **downgrade** and
rejected it forever. Two rules: (1) the base was bumped to `0.1.4` so it outranks
every poisoned `0.1.3.*` at the micro segment; (2) **never shrink the counter's
magnitude** the version number must only ever go up.

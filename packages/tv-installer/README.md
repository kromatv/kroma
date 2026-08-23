# @kroma/tv-installer

Finds the televisions on this network, installs the toolchain each platform
needs, then sideloads KROMA onto the sets you pick.

```bash
bun run tv
```

With no argument the picker opens straight away and fills itself as the scan
finds sets. Arrow keys move, space ticks, enter stops the scan and installs onto
whatever is ticked. It installs the toolchain a set needs before touching it.

Three platforms take a sideloaded package: Samsung (Tizen, `.wgt`), LG (webOS,
`.ipk`) and Android TV (`.apk`, which covers Philips, Sony, TCL, Shield and
Chromecast with Google TV). An Apple TV never appears in the list. Install one
with `bun run --filter '@kroma/tv-native' ios`.

## What the scan probes

Three things at once:

- An SSDP `M-SEARCH` for `urn:dial-multiscreen-org:service:dial:1`, LG's
  second-screen target and `upnp:rootdevice`, over a 2.5 second window. Whatever
  replies has its UPnP description fetched, which is where a set's friendly name
  and manufacturer come from.
- A TCP sweep of every `/24` this machine sits on, minus its own address, on four
  ports: **8001** (Samsung's REST API), **9922** (LG's Dev Mode key server),
  **1925** (JointSpace on a Philips) and **5555** (adb). A port has 700 ms to
  accept.
- CoreDevice, for the Apple TVs this Mac is paired with. They answer no probe at
  all, so they are asked for rather than swept for, and a Mac with no Xcode is
  told nothing rather than failed.

A host that answered anything is then asked three more ports (26101 for sdb, 3000
for the webOS app, 1926 for JointSpace over TLS) and identified:

| What answers | Verdict |
| --- | --- |
| `GET http://<ip>:8001/api/v2/` parses as Samsung's device info | Tizen. Developer mode counts as on when the set reports `developerMode: "1"` or 26101 is open |
| 9922 is open, or UPnP says LG Electronics or webOS | webOS. Dev Mode is running only when 9922 is open |
| JointSpace answers `/6/system` or `/1/system` on 1925, or `/6/system` on 1926 over TLS | Philips. Its `os_type` decides whether the set takes an app at all |
| 5555 is open and nothing above matched | Android TV, with whatever name UPnP gave it |

Nothing else counts as a television.

### What a set runs

Every set listed says which platform version and browser engine it runs, and
where that came from. The `scan` line carries it under the set, `--json` as
`runtime`.

- **Read off the set.** An Android TV that has accepted this computer over adb
  answers `ro.build.version.release`, and the engine comes from
  `dumpsys package com.google.android.webview`. An Apple TV reports its tvOS
  version to CoreDevice and names React Native where the others name a browser,
  because the app is compiled and no browser runs it.
- **Worked out from the model**, printed with a trailing `by model` and marked
  `"learned": "derived"` under `--json`. Samsung and LG each freeze a Chromium
  per OS major and an OS major per model year, so `24_PTM_FTV_T09`,
  `OLED55C16LA` and `55UR78006LK` date the set and its engine both. A Philips
  adb cannot reach is floored by the year in its `os_type`, and
  `MSAF_2019_ANDROID_TV` shipped Android 9.

The tables live in `src/modules/*/runtime.ts` and follow the shells built for
those engines (`clients/tizen/tv.target.ts`, `clients/webos/README.md`). A set
no table dates carries no version rather than a guess.

### Why a set may not answer

- **It is off.**
- **Its platform's port is still shut.** An LG without the Dev Mode app running
  only turns up if it replied to SSDP; an Android TV with network debugging off
  and no JointSpace answers nothing at all. A Samsung answers 8001 either way and
  is listed with the step it needs.
- **It is on another subnet.** The sweep walks the `/24`s of this machine's own
  interfaces and no further. Anything beyond them has to be named as an explicit
  host address.

### macOS wants the Local Network permission

The first sweep makes macOS ask whether the terminal may talk to the local
network. Miss the prompt or deny it and every connection fails without an error:
the scan finds nothing and says nothing is wrong. Grant it under **System
Settings > Privacy & Security > Local Network** for the terminal app you run
`bun run tv` from, then scan again.

## The one-time step on the television

None of these can be switched on over the network.

**Samsung (Tizen).** Open the **Apps** panel and type **1 2 3 4 5** on the
remote. In the popup that appears, switch **Developer mode ON**, enter the IP of
this computer as the host PC, and reboot the set. Port 26101 only opens after
that reboot, and the scan says so.

**LG (webOS).** Install the **Dev Mode** app from the LG Content Store, sign in
with a free developer.lge.com account, switch **Dev Mode ON** (the TV restarts),
then switch **Key Server ON**. The app shows a passphrase, which the TUI asks
for once per LG set. A session lasts **50 hours**, and when it runs out the
sideloaded app goes with it, so extend it from the same app.

**Android TV, Philips included.** **Settings > System > About**, then click the
build 7 times until it tells you that you are a developer. **Developer options**
appears in the same menu: turn **Network debugging** on. The name varies by
brand, and on a Chromecast with Google TV the switch called USB debugging is the
one that opens the network port. The first `adb connect` raises a prompt on
screen: accept it, tick "always allow", and run the install again.

A Philips is only an Android TV if it says so. On one running **Saphi** or
**Titan OS** the scan lists the set and names the OS as the reason it takes no
sideloaded app, only what its own store offers. There is nothing to enable there.

## Toolchain

No toolchain has to be installed by hand. An install fetches whatever the sets
it is about to touch need, and the `doctor` and `tools` commands below report or
fetch it without going near a television. Anything already on `PATH` is used as
it is.

| Platform | Tools | Source | Lands in |
| --- | --- | --- | --- |
| Samsung | `tizen`, `sdb` | the Tizen Studio 6.0 CLI installer from download.tizen.org, around 260 MB | `$TIZEN_HOME`, default `~/tizen-studio` |
| LG | the `ares-*` commands | `bun add -g @webos-tools/cli` | `~/.bun/bin` |
| Android TV | `adb` | Google's `platform-tools-latest` zip | `~/.kroma/tools/platform-tools` |

An existing Android SDK is picked up first, from `$ANDROID_HOME`,
`$ANDROID_SDK_ROOT` or `~/Library/Android/sdk`.

Tizen Studio is the awkward one. It needs a JDK (`brew install --cask temurin`,
or `apt install default-jdk`) and on Apple silicon it is an x86_64 binary, so
Rosetta has to be there first
(`softwareupdate --install-rosetta --agree-to-license`). Both are checked before
the download starts. The headless installer exists for macOS and Linux only;
anywhere else the tool stops and tells you to install it by hand.

## Where the package comes from

In order:

1. The path given on the command line, used as it is.
2. The newest matching build in this checkout: `clients/tizen/out|dist/*.wgt`,
   `clients/webos/out|build/*.ipk`, `out/*.apk` or the tv-native release output.
   For Tizen the every-tier `KROMA-tizen-<n>` build is preferred over the
   per-generation slices.
3. `gh release download --pattern '*.wgt'` (or `.ipk`, `.apk`) from the latest
   release, into `~/.kroma/downloads/<platform>`. This needs `gh` on `PATH` and
   logged in.

With none of the three it stops and prints the `gh run download` line for the
matching Build & Release artifact.

The id the app is launched by is read from the shell that ships it
(`clients/tizen/public/config.xml`, `clients/webos/public/appinfo.json`,
`clients/tv-native/app.json`), so renaming one there is enough.

## Commands

Generated from the command definitions by `bun run tv docs`. Nothing between the
markers is written by hand.

<!-- usage:start -->

| command | what it does |
| --- | --- |
| `bun run tv` | Find the televisions on this network and put KROMA on them. With no command it opens the picker. |
| `bun run tv scan` | List what answered and stop, the picker without the picking. |
| `bun run tv install <target>` | Put KROMA on one set, or on all of them, without the picker. |
| `bun run tv probe <host>` | Ask a Samsung set what it is over sdb, installing nothing. |
| `bun run tv certificate` | Generate a Samsung author certificate and the profile the tools sign with. |
| `bun run tv tools <platform>` | Install the toolchain a platform needs, which the picker does on its own. |
| `bun run tv doctor` | Show which toolchains this computer already has. |
| `bun run tv docs` | Write this command tree into the package README, where nothing is typed by hand. |

| option | what it does |
| --- | --- |
| `--host <ip>` | Probe this address instead of sweeping the network, repeatable |
| `--package <path>` | The .wgt, .ipk, .apk or .app to install, instead of the newest built here |
| `--source <local|stable|canary|build>` | Where the package comes from, instead of the newest build in this checkout |
| `--launch`, `--no-launch` | Start the app once it is installed |
| `--json` | Print what answered as JSON |

<!-- usage:end -->

## Downloading it, rather than building it

Every release carries the installer as one executable, and every Build & Release
run uploads the same three as run artifacts:

```bash
gh release download --pattern 'kroma-tv-*-darwin-arm64'   # or darwin-x64, linux-x64
gh run download -n kroma-tv-bun-darwin-arm64              # from a run, no release needed
chmod +x kroma-tv-*
xattr -d com.apple.quarantine kroma-tv-*                  # macOS, once
./kroma-tv-* scan
```

The binary is signed ad-hoc, not with a Developer ID, so macOS quarantines it
until that attribute is cleared. Windows is not built: the installer drives sdb,
adb, ares and devicectl and reads an ARP table, a keychain and a Settings pane.

Run from outside a checkout it finds televisions and installs toolchains, but
the package has to come from `--package`: looking for the newest build, and
asking `gh` for a release asset, both need the repository.

## As a single binary

```bash
bun run build:tv-cli                      # dist/kroma-tv, ~64 MB, no Bun needed to run it
bun run build:tv-cli --target=bun-linux-x64
```

Targets: `bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-x64`,
`bun-windows-x64`. On macOS the binary is re-signed after the build, because the
signature `bun build --compile` leaves behind is one the system kills on sight.

## When it goes wrong

- **The scan finds nothing on macOS.** The Local Network permission, above. Check
  it first, because a denied permission looks exactly like an empty network.
- **"the TV refused the connection" on a Samsung.** Developer mode has to name
  this computer as the host PC, and the set has to have been rebooted since. The
  scan prints the IP the TV currently trusts.
- **A Samsung install fails on a signature.** A KROMA signed with a different
  certificate is already installed: delete its tile from the Apps panel
  (long-press > Delete) and install again.
- **`INSTALL_FAILED_UPDATE_INCOMPATIBLE`.** The Android version of the same
  thing: `adb uninstall tv.kroma.tv`, then install again.
- **`INSTALL_FAILED_VERSION_DOWNGRADE`.** The set already has a newer build.
  Uninstall it, or install a newer `.apk`.
- **adb sees the TV as `unauthorized`.** The prompt is on the television. Accept
  it and run the install again.
- **The LG install cannot get a key.** `ares` needs the passphrase from the Dev
  Mode app, and a session past its 50 hours needs that app opened again first.
- **`no .wgt found`, and the same for the other two.** Nothing is built here and
  `gh` found no release asset. Build the shell, or download the artifact from a
  Build & Release run.

The manual path for each platform, and every device that is not a television, is
in [INSTALL.md](../../INSTALL.md).

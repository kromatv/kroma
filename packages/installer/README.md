# @kromatv/installer

Finds the televisions on this network, installs the toolchain each platform
needs, then sideloads KROMA onto the sets you pick.

```bash
bun run tv
```

With no argument it asks two questions, then opens the picker:

1. **Which version of KROMA?** Stable, canary, and in a checkout the build made
   here or a fresh one. `--source` or `--package` answers it.
2. **Which kind of TV?** Samsung, LG, Android TV, or every kind. The tool then
   shows what that kind needs once on the TV, with this computer's address
   where the TV asks for it. `--host` skips the question and the steps.

The picker lists the TVs of that kind as the scan finds them. Arrow keys move,
space ticks, enter stops the scan and installs onto whatever is ticked. It
installs the toolchain a TV needs before touching it.

It runs on Bun or on Node 22 and later, and needs no checkout of this
repository: with nothing built here it takes the package from the latest
release. That is what `npx @kromatv/installer` runs, the same tool published to
npm
([docs/tv-installer-publishing.md](../../docs/tv-installer-publishing.md)).

Three platforms take a sideloaded package: Samsung (Tizen, `.tpk`), LG (webOS,
`.ipk`) and Android TV (`.apk`, which covers Philips, Sony, TCL, Shield and
Chromecast with Google TV). An Apple TV never appears in the list. Install one
with `bun run --filter '@kromatv/tv-native' ios`.

### Native app or web app

A Samsung and an LG get the native app: the React Native app of
`clients/tv-native`, which runs on the set with no browser. It is a `.tpk` on
Samsung and an `.ipk` on LG, and it runs on Tizen 6.0 (2021) and webOS 4 (2018)
and every later version.

The web app (`clients/tizen`, `clients/webos`) is still built, for two cases:

- **A Samsung from 2017 to 2020.** Below Tizen 6.0 Samsung refuses the native
  library a `.tpk` carries, so a set the scan dates there gets the web `.wgt`,
  and the install says why. A set no table dates gets the native app.
- **`--web`.** `install <address> --web` installs the web app on a Samsung or
  an LG of any year. `update` remembers it for that set; `--no-web` goes back
  to the native app. The picker takes no platform flag, so it is not offered
  there.

The two are separate apps on the set (`tv.kroma.app` beside `KromaTV001.KROMA`
on Samsung, beside `tv.kroma.webos` on LG), so installing one leaves the other
where it is.

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

- **Read off the set.** An Android TV that already trusts one of this
  computer's adb keys answers `ro.build.version.release`, and the engine comes from
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
for once per LG set. A session lasts up to 1000 hours on current firmware and
50 hours on older sets, and when it runs out the sideloaded app goes with it,
so extend it from the same app.

**Android TV, Philips included.** **Settings > System > About**, then click the
build 7 times until it tells you that you are a developer. **Developer options**
appears in the same menu: turn **Network debugging** on. The name varies by
brand, and on a Chromecast with Google TV the switch called USB debugging is the
one that opens the network port. The first install raises a prompt on screen:
accept it and tick "always allow", and the install, which waits two minutes for
it, goes on. A scan never raises that prompt.

A Philips is only an Android TV if it says so. On one running **Saphi** or
**Titan OS** the scan lists the set and names the OS as the reason it takes no
sideloaded app, only what its own store offers. There is nothing to enable there.

## Nothing to install

Nothing has to be on the computer besides Node or Bun. The tool speaks to each
kind of set itself:

| Platform | What the tool does itself |
| --- | --- |
| Samsung | signs the package, `.tpk` or `.wgt`, and talks sdb |
| LG | fetches the Dev Mode key and installs over SSH |
| Android TV | speaks adb |

Two tools are used when they are already there, and never installed: Tizen
Studio's `tizen` and `sdb` with `--no-native`, and Xcode for an Apple TV built
from this checkout.

An Android TV takes this tool's own adb key, kept in `~/.kroma/adb/adbkey` and
readable by its owner alone, made on the first install. When this computer
already has Google's key, `~/.android/adbkey`, it is offered first, so a TV that
trusts Google's adb asks nothing. Wireless debugging with a pairing code
(Android 11 and later) is not spoken: it needs `adb pair` from Google's
platform-tools. How the protocol works, with the sources, is in
[docs/reference/android-adb.md](../../docs/reference/android-adb.md).

A Samsung set needs no tool, but it does need Samsung's certificates: a retail
set installs only what Samsung's own authorities signed for it. The first
install on a set gets them, with no Tizen Studio. It reads the DUID off the set,
opens Samsung's sign-in in the browser, and has Samsung issue an author and a
distributor certificate for that set. They are kept in
`~/.kroma/certificates/samsung`, each private key readable by its owner alone,
and every install signs with them from then on. The first install on another
set asks again: the author certificate is kept, and the new distributor
certificate lists every set asked for so far. Both are valid for a year, and
the first install after that asks for new ones. How Samsung issues them, with
the sources, is in
[docs/reference/samsung-tv-certificates.md](../../docs/reference/samsung-tv-certificates.md).

An LG set needs no tool either. The first install fetches the set's SSH key
from the Dev Mode key server on port 9991, opens it with the passphrase the Dev
Mode app shows, and keeps it opened in `~/.kroma/keys/webos/<address>.pem`,
readable by its owner alone. It then logs in on port 9922, sends the `.ipk` to
the developer temp folder over SFTP, asks the set's install service for it over
luna and starts the app, as LG's `ares-install` and `ares-launch` do. Later
installs and `update` use the kept key and ask for no passphrase. What the ares
tools do, with the sources, is in
[docs/reference/lg-webos-devmode.md](../../docs/reference/lg-webos-devmode.md).

A Samsung install asks only from a terminal. A script gets no browser to wait
on, so it runs the same step ahead, by itself:

```bash
bun run tv certificate 192.168.1.50
```

A computer whose Tizen Studio has an active profile signs with that profile for
a set Samsung's certificates do not list, and is not asked to sign in.
`--profile` names another of its profiles, and `--no-native` installs through
Tizen Studio's own `tizen` and `sdb`, which then have to be installed already.

## Where the package comes from

In order:

1. The path given on the command line, used as it is.
2. The newest matching build in this checkout. The native app is
   `clients/tv-native/tizen/bin/Release/*/*.tpk` and
   `clients/tv-native/webos/*.ipk`, the web app `clients/tizen/out|dist/*.wgt`
   and `clients/webos/out|build/*.ipk`, Android TV `out/*.apk` or the tv-native
   release output. For the web `.wgt` the every-tier `KROMA-tizen-<n>` build is
   preferred over the per-generation slices. When only the web app is built
   here, `--source local` installs it.
3. The latest release on GitHub, read over HTTPS with no account, into
   `~/.kroma/downloads/<channel>/<platform>`: `KROMA-tizen-<v>.tpk` and
   `KROMA-webos-<v>.ipk`, or `KROMA-tizen-<v>.wgt` and
   `tv.kroma.webos_<v>_all.ipk` for the web app. `--source canary` takes the
   newest build of the rolling `canary` prerelease instead. A download is
   checked against the size and the SHA-256 the release lists, and a package
   already there with that digest is not fetched again.

`--source build` builds the native packages with `bunx rn-tv tizen package` and
`bunx rn-tv webos package` in `clients/tv-native`, which takes the toolchains
listed in [its README](../../clients/tv-native/README.md).

GitHub answers 60 anonymous requests an hour for one address, which is what the
tool says when the release will not list. With none of the three it stops and
prints the `gh run download` line for the matching Build & Release artifact.

The id a Samsung or an LG app is installed and launched by is read from the
package itself: `tizen-manifest.xml` in a `.tpk`, `config.xml` in a `.wgt`, the
control file of an `.ipk`. An id that is not a plain reverse-DNS name is
refused, since it reaches the set's shell. The Android TV id comes from
`clients/tv-native/app.json`.

## Updating

Every install that succeeds is written to `~/.kroma/televisions.json`, one
entry per address: the set's name and model, the package put on it, the channel
that package came from, on a Samsung the `--profile` it was signed with, and
`--web` where the install asked for the web app.
`update` reads the file back and asks nothing:

```bash
bun run tv update
```

It probes those addresses and no other, takes the newest package of each set's
channel, and installs it where the set does not have it yet, signed as before.
A set installed with no channel named follows the stable one. `--source` moves
every set to another channel, `--force` installs again where nothing is newer,
and the app is not started unless `--launch` says so.

A set that is off is reported and the rest go on. One whose address changed
gets a new entry at its next install; the old entry is removed by hand from the
file. No passphrase and no key is ever written there: an LG set's key is kept
apart, in `~/.kroma/keys/webos`, and `update` logs in with it.

## Commands

Generated from the command definitions by `bun run tv docs`. Nothing between the
markers is written by hand.

<!-- usage:start -->

| command | what it does |
| --- | --- |
| `bun run tv` | Find the televisions on this network and put KROMA on them. With no command it opens the picker. |
| `bun run tv scan` | List what answered and stop, the picker without the picking. |
| `bun run tv install <target>` | Put KROMA on one set, or on all of them, without the picker. |
| `bun run tv update` | Put the newest KROMA on every set this computer installed it on, asking nothing. |
| `bun run tv probe <host>` | Ask a Samsung set what it is over sdb, installing nothing. |
| `bun run tv certificate <host>` | Get Samsung's certificates for a set: sign in to Samsung once, and every install signs with them. |
| `bun run tv docs` | Write this command tree into the package README, where nothing is typed by hand. |

| option | what it does |
| --- | --- |
| `--host <ip>` | Probe this address instead of sweeping the network, repeatable |
| `--package <path>` | The .tpk, .ipk, .apk or .app to install, instead of the newest built here |
| `--source <local\|stable\|canary\|build>` | Where the package comes from, instead of the newest build in this checkout |
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
until that attribute is cleared. Windows is not built: the installer drives
devicectl and reads an ARP table, a keychain and a Settings pane.

Run from outside a checkout it does everything but build: it finds
televisions, installs toolchains, and takes the package from the release.

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
- **A Samsung refuses the certificate chain.** The set is not one the
  distributor certificate lists, which happens with a Tizen Studio profile made
  for another set. Run `certificate` with its address.
- **`nobody signed in to Samsung within five minutes`.** The sign-in page sends
  its answer to this computer, on a port from 4794 to 4813, so it has to be
  opened in a browser on this computer.
- **`INSTALL_FAILED_UPDATE_INCOMPATIBLE`.** The Android version of the same
  thing: uninstall KROMA on the TV (Settings, Apps), then install again.
- **`INSTALL_FAILED_VERSION_DOWNGRADE`.** The set already has a newer build.
  Uninstall it, or install a newer `.apk`.
- **`nobody allowed this computer on the TV within two minutes`.** An Android
  TV asks once to allow each computer, and the install waits two minutes for it.
  Accept the prompt on the TV, tick **Always allow**, and run the install again.
- **The LG install cannot get a key.** Key Server has to be on in the Dev Mode
  app, and the passphrase is the one it shows now: it changes each time Dev
  Mode is turned off and on.
- **An LG set refuses this computer's key.** The set no longer takes the key
  kept from an earlier install. Turn Key Server on and install again with
  `--passphrase` and the passphrase the app shows now, which fetches the key
  afresh.
- **`the stable release carries no KROMA-tizen-*.tpk`, and the same for the
  other kinds.** Nothing is built here and the release has no package of that
  kind: a release from before the native apps has no `.tpk` and no
  `KROMA-webos-*.ipk`. Take the web app with `--web`, use `--source canary`, or
  download the artifact from a Build & Release run.
- **A Samsung refuses the `.tpk` on a set from 2020 or earlier.** The scan could
  not date the set, so it got the native app, which Samsung blocks below Tizen
  6.0. Install again with `--web`.
- **`GitHub did not list the stable release`.** No network, or this address has
  used its 60 anonymous requests for the hour. Try again later, or pass a
  package you already have with `--package`.

The manual path for each platform, and every device that is not a television, is
in the [setup guides](../../docs/setup/README.md).

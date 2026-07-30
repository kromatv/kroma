# Publishing KROMA to the LG Content Store

Everything needed to file `@kroma/webos` with **LG Seller Lounge**
(<https://seller.lgappstv.com>). Sources for every rule quoted here are LG's own
Seller Lounge user guide and the public [self-checklist
v5.0](https://seller.lgappstv.com/seller/support/RetrieveSelfCheckSample.lge).

There is no registration fee and no submission fee.

---

## 1. Account (you must do this yourself)

Seller Lounge now authenticates with an **LG Account** — the old Seller Lounge
login no longer works.

1. <https://seller.lgappstv.com> → `SIGN IN` → `CREATE ACCOUNT`
2. Pick the country you are in, agree to the terms
3. Verify the e-mail, sign back in, complete the additional seller info

Choose the seller type deliberately — it is what buyers see on the listing:

| Type | Store shows | Use when |
| --- | --- | --- |
| Individual Seller | your legal name, as "Seller ID" | shipping as yourself |
| Corporate Seller | the registered company title | shipping under a company |

Unlike Samsung, LG puts **no country restriction** on a new seller: you can
select service countries from day one.

## 2. Build the package

```bash
bun run build:webos                       # → clients/webos/dist
ares-package clients/webos/dist --no-minify   # → tv.kroma.webos_<version>_all.ipk
```

`ares-*` comes from the webOS TV CLI (`@webos-tools/cli`), which is not bundled
here.

`--no-minify` is not optional: `ares-package` otherwise re-minifies the bundle
with a terser from 2020 that cannot parse `?.` or `??`, and fails with "Failed to
minify code". The flag is missing from `--help` but it is real (and CI has been
passing it since `_release-tv.yml`). Vite has already minified the output.

The package version is **stamped at build time** from the product version
(`server/Cargo.toml`, or CI's `KROMA_VERSION`) — see
[`clients/tv-build/stamp-version.ts`](../tv-build/stamp-version.ts). LG requires
the version to increase on every submission, so never hand-edit it in
`appinfo.json`; bump the product version and rebuild.

Upload limits: IPK up to 2 GB. With no standing LGE contract, set **Chipset =
`web` → `All`** so the app is offered on every webOS platform.

> **Two binaries.** LG recommends submitting 1920×1080 **and** 1280×720 builds,
> because FHD models cap *graphics* resolution at 720p while UHD models do 1080p.
> KROMA currently ships one 1920×1080 bundle (with a legacy JS/CSS tier for
> Chromium 53–94). Decide whether to add a 720p graphics build before launch.

## 3. Assets

| Slot | File | Notes |
| --- | --- | --- |
| In-package icon | `public/icon.png` | 80×80 — the webOS spec size |
| In-package large icon | `public/icon-large.png` | 130×130, submission/testing only |
| Splash background | `public/splash.png` | 1920×1080, referenced by `appinfo.splashBackground` |
| Store icon | `store/icon-512.png` | 512×512 (LG minimum is 400×400) |
| Screenshots | `store/shots/` | up to 6, 1920×1080 — **not yet captured, see §7** |

Regenerate the derived art with `bun run store:art`.

Two rules the art is built to satisfy:

- **The splash must not be a black screen.** `splash.png` carries a real
  gradient behind the lockup, and no text (LG advises minimal text to avoid
  localisation issues).
- **The App Tile Color must match the icon's background**, or QA rejects.
  The icon is the chromatic wheel on `#0A0A0C`, so `appinfo.iconColor` is
  `#0A0A0C` — set the Tile Color in Seller Lounge to the same value.

## 4. Listing fields

| Field | Value |
| --- | --- |
| App title | KROMA |
| Category | Entertainment |
| Default display language | **English** (mandatory for global apps, or QA rejects) |
| Service languages | English, French |
| Content rating | no adult content — **18+ apps cannot be sold on LG Content Store at all** |
| Contact | e-mail or website URL, at least one required |
| Privacy policy | required in-app *and* on the listing — **you must supply a URL** |
| Billing | Not applicable (no paid content, no 3rd-party billing) |
| In-app ads | Not applicable |
| Remote controller | **Both Magic and general remote** |
| DIAL | not supported |

The text for every free-form field — titles, both descriptions, keywords — is in
[clients/LISTING.md](../LISTING.md), written once and shared with the Samsung
listing so the two cannot drift.

**None of it can be entered until the package is uploaded.** `CREATE APP` opens
straight onto **File Upload** — that step *is* the creation step — and until a
file is attached there, every other sub-menu (Images, Service Country Info.,
Display Info., Service Info., Feature Info., Test Info., Self-check list, App
CTS, Alpha Test, Cloud Test Lab, Defect Info., SUBMIT) stays disabled, no app row
is persisted, and the fields do not exist in the page at all. So the running
order is: build → package → upload → *then* the listing.

Two more things the wizard does that this doc used to get wrong:

- **The privacy policy is pasted as TEXT, not linked.** Service Country Info.
  states it plainly: "The privacy policy will be provided as text only, not as a
  link." So [PRIVACY.md](../../PRIVACY.md)'s body goes in the box; the
  `kroma.tv/privacy` URL is still worth publishing for the Samsung listing and
  for the in-app reference, but LG will not follow it.
- **SDK Ver. is derived, not chosen**, and it is expressed in MODEL YEARS
  ("2018 and later", …) rather than webOS versions — the page says it is
  "automatically configured according to the selected platform". webOS 4.0, this
  app's floor, is the 2018 line.

Declaring "Not applicable" for billing or ads while actually shipping them is
itself grounds for rejection, so keep these honest if that ever changes.

If you select the **UK** as a service country, the data-collection disclosure
becomes mandatory. **Brazil** needs a ratings certificate; **Russia** needs the
title and description in Russian.

## 5. Test information — the real blocker

KROMA is a client for a server the viewer runs. LG's QA team tests on **real
TVs located in Korea**, so a LAN-only server is untestable and the function test
fails immediately. Before submitting you must provide:

- a **publicly reachable demo KROMA server** with a small, unambiguously
  licensed catalogue
- **test account credentials** for it (up to 5 accepted)
- optionally a **test IPK** (up to 3) built with `VITE_KROMA_SERVER` pointed at
  that demo server, so the reviewer never sees the "add a server" screen

Two Test Info. items have no answer in this repo and both are hard gates:

- **UX Scenario file** — mandatory, from a template on the Test Info. page. "UX
  scenario is not submitted, or every necessary information is not inputted" is
  an explicit *preliminary-documents* rejection, i.e. you are rejected before a
  TV is ever switched on.
- **Player Specification** — the codecs, containers and streaming engine you
  claim, plus a named principal title. QA runs its playback test against exactly
  what you declare, so whatever you name must exist on the demo server.

If you geo-restrict anything, declare **Geo IP Block = Yes** and allowlist LG's
tester IPs. `1.222.94.84` is only the **webOS Cloud Test Lab** egress; the QA
team itself comes from a much larger published allowlist (roughly 25 addresses
and ranges). Take the authoritative list from the Seller Lounge FAQ/notifications
at submission time and allowlist **all** of it — allowlisting the Cloud Test Lab
IP alone will fail the functional test.

Use the **webOS Cloud Test Lab** (Applications menu) before submitting: real
retail TVs on production firmware, 5 device reservations/day, up to 3 hours
each, free. It needs the English title and description filled in first.

## 6. Getting it onto real TVs before launch

**There is no TestFlight for webOS.** Three routes, in increasing order of reach:

**Developer Mode — any set you can touch.** Install the *Developer Mode* app from
the Content Store, sign in with the LG developer account, enable it, then
`ares-setup-device` + `ares-install` the IPK over the LAN (see the client
[README](./README.md)). Free and instant, and it is the whole of what a
self-hoster needs to run their own build. The catch is the **session**: it
expires unless extended from the Developer Mode app, and when it lapses — or
after the TV reboots ten times with no network — Developer Mode switches off and
**every app installed under it is uninstalled**.

**webOS Cloud Test Lab (§5).** Real retail TVs in LG's lab, driven from a
browser. That is for *your* testing; it is not a way to hand a build to somebody
else.

**Alpha Test** (Seller Lounge → `Applications > Alpha Test`) — the closest thing
LG has to a beta channel. It publishes a version of the app to named TVs only,
where it shows up under *Newly Updated Apps* some 10–40 minutes after publish.

| | |
| --- | --- |
| Platform | webOS 3.0 (2016 models) and later |
| Devices | up to **100 TVs**, addressed by **wired MAC address** — StanbyME / StanbyME 2 / StanbyME GO are wireless-only and cannot take part |
| Duration | **30 days** maximum; can be shortened or prolonged within that ceiling |
| Concurrency | one alpha test per app at a time |
| Version | must be higher than any previously submitted version, and the test must be set to *Terminate* before that app can be submitted for review |

**The catch, in LG's own words:** the feature "will only be opened to sellers that
have entered a separate commercial contract for the time being for
stabilization". A plain new seller account does not have it — ask through the
Seller Lounge 1:1 Q&A whether it can be enabled before planning a beta around it.

So the realistic beta plan is: Developer Mode sideloading for the handful of
testers who own an LG set and will re-arm the session, and the store for everyone
else — remembering that **every update is a fresh approval round** (§9).

## 7. Screenshots

`bun clients/tv-build/store-shots.ts` drives the built app with arrow keys and
captures 1920×1080 frames. It is verified working against the signed-out screens;
the screens worth showing a buyer (home, a detail page, the player) need a server
with a catalogue, so the key sequence must be tuned against that server:

```bash
VITE_KROMA_SERVER=http://your-server:4040 bun run build:webos
(cd clients/webos && bunx vite preview --port 4173 --strictPort) &
bun clients/tv-build/store-shots.ts 4173 clients/webos/store/shots
```

The first screenshot is what webOS 6.0+ shows on the Apps main screen, so lead
with the strongest frame.

## 8. Self-checklist

Mandatory, and **initialised on every version bump** — refill it each release.
Every item must be `Pass` or `N/A`; marking an item `Pass` that should be `N/A`
(or the reverse) is itself a rejection reason.

**All 53 items are pre-answered in [SELFCHECK.md](./SELFCHECK.md)**, with the
evidence for each: 13 are `N/A` and fillable immediately, 10 are `Pass` from the
code and the simulator, and 30 need one session with a real set.

Items that need real attention for this app:

- **TC 3 — Reboot.** Power-cycle the TV by remote *and* by unplugging, mid-playback, then relaunch.
- **TC 27–30 — Magic Remote.** Support is mandatory. The pointer emits mouse events, which the `Focusable`/navigator path already handles, but verify hover + OK activates controls on a real TV.
- **TC 43 — Adaptive bitrate.** Tested at 512 Kbps / 1 Mbps / 7 Mbps / 17.5 Mbps, twice each, plus IPv6. Resolution must track bandwidth without constant buffering. Direct-play from a LAN server has no answer for this — plan what the demo server does under throttling.
- **TC 15–17 — Virtual keyboard.** The LG IME is exercised including Voice Search and case switching; relevant to the server-address and search fields.
- **TC 48/49 — Subtitles and resume.** Both supported (`@kroma/core` WebVTT + `useSubtitleSelection`).
- **TC 52 — DRM.** `N/A`.
- **TC 53 — Factory reset**, then install and run.

At submission you may opt in to **release with known minor defects** (you accept
liability). It is the practical escape hatch from repeated QA rounds.

## 9. Timeline

Pretest → function test → content test. Roughly 5–10 business days per cycle and
commonly 2–3 cycles; budget weeks, not days. Every update needs a fresh
approval, and changing a live app without one can get it pulled without notice.

## 10. Content test — know the exposure

LG's content test screens for infringement facilitation. Be accurate about what
the server does, because it is checkable.

**What is true of the app:** it is a player. It ships no content, no catalogue and
no acquisition features, and renders only what the viewer's own server serves.
That is the whole of what is being submitted, and it is defensible on its own.

**What is true of the server:** the acquisition features run **out of process**.
The indexer, Torznab, VPN, Transmission, qBittorrent, mdns, scene and remote
crates are workspace declarations only — not dependencies of the `kroma-server`
binary. The core holds port *clients* that resolve to sidecars
(`kroma_port_bridge::TorrentFetchClient::new(local_resolver("tv.kroma.indexer"))`
and friends in `main.rs`); the download engine and acquisition's search/import/
match jobs each run in their own sidecar. Modules install as `.kmod` binaries into
`<data>/modules/` and nothing installs them by default, so a stock server does no
indexing or downloading until an operator installs them. See
[`docs/modules-as-kmod.md`](../../docs/modules-as-kmod.md).

So the accurate statement is: *KROMA is a client for a personal media server. What
that server can do depends on modules its operator chooses to install; the app
does neither indexing nor downloading.*

**The binary now matches the architecture.** `kroma-torrent` and
`kroma-acquisition` used to linger as non-optional `[dependencies]` of
`kroma-server` after both verticals moved out of process, and `default = […
"torrent-rqbit"]` dragged the BitTorrent library in with them. Both are gone; the
sidecar still gets a real engine from its own
`[package.metadata.kmod] features = ["rqbit"]`, which `modules:pack` forwards.
The check anyone can repeat:

```
$ cargo tree -p kroma-server -e normal -i librqbit
error: package ID specification `librqbit` did not match any packages
```

So no BitTorrent library is linked into a stock server build, and nothing an
inspecting reviewer opens contradicts the position above.

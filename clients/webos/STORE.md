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
ares-package clients/webos/dist           # → tv.kroma.webos_<version>_all.ipk
```

`ares-*` comes from the webOS TV CLI (`@webos-tools/cli`), which is not bundled
here.

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
| Screenshots | `store/shots/` | up to 6, 1920×1080 — **not yet captured, see §6** |

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

If you geo-restrict anything, declare **Geo IP Block = Yes** and allowlist LG's
tester IPs. The webOS Cloud Test Lab egress IP is **`1.222.94.84`**.

Use the **webOS Cloud Test Lab** (Applications menu) before submitting: real
retail TVs on production firmware, 5 device reservations/day, up to 3 hours
each, free. It needs the English title and description filled in first.

## 6. Screenshots

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

## 7. Self-checklist

Mandatory, and **initialised on every version bump** — refill it each release.
Every item must be `Pass` or `N/A`; marking an item `Pass` that should be `N/A`
(or the reverse) is itself a rejection reason.

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

## 8. Timeline

Pretest → function test → content test. Roughly 5–10 business days per cycle and
commonly 2–3 cycles; budget weeks, not days. Every update needs a fresh
approval, and changing a live app without one can get it pulled without notice.

## 9. Content test — know the exposure

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

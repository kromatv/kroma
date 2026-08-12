# Publishing KROMA to Samsung Apps TV

Everything needed to file `@kroma/tizen` with the **Samsung TV Seller Office**
(<https://seller.samsungapps.com/tv>). Rules quoted here come from Samsung's own
Seller Office guides, the launch checklist, and the Seller Office Terms and
Conditions effective 6 March 2025.

There is no registration or submission fee.

---

## 1. Account (you must do this yourself)

Sign in at <https://seller.samsungapps.com/tv> with a Samsung Account and accept
the Seller Office terms.

**The membership tier is the single biggest constraint on this submission:**

| Tier | Can launch in | How you get it |
| --- | --- | --- |
| **Public Seller** | **the United States only** | automatic on signup |
| **Partner Seller** | any country, plus partner-level APIs, alpha testing on your own dev TVs, and Samsung engineering support | submit a partnership request, register company info to form a seller group, get approved by a Samsung Content Manager |

So a same-day launch is US-only. Switzerland and the EU require Partner status,
which is a human approval process with a named Samsung Content Manager, so start
it early if it matters.

Seller information asks for representative name, phone number, mailing address
and a registration number.

## 2. Build the package

```bash
bun run build:tizen                       # → clients/tizen/dist
cd clients/tizen
tizen build-web
tizen package -t wgt -s <cert-profile> -- dist
```

The `.wgt` needs `config.xml`, `author-signature.xml` and `signature1.xml`.

> **Back up the author certificate before you ever submit.** The first
> submission may be signed with any signature, but **every update must be signed
> with the same author certificate**. Lose it and the published app can never be
> updated.

The package version is **stamped at build time** from the product version
(`server/Cargo.toml`, or CI's `KROMA_VERSION`); see
[`clients/tv-build/stamp-version.ts`](../tv-build/stamp-version.ts). Never
hand-edit it in `config.xml`.

`required_version="6.0"` floors the app at Tizen 6.0 (2021 models). Model groups
are chosen at distribution time and all Tizen versions inside a group are
included automatically; `jellyfin-tizen` was approved for only *some* models on
its first pass, so choose deliberately and expect to widen later.

That floor is only honest because the build ships a **legacy tier** (see the
[README](./README.md)). Chromium is frozen per Tizen major (6.0 = 76, 6.5 = 85,
7.0 = 94, 8.0 = 108) and the modern bundle needs 99, so a modern-only build
offered to 2021+ hands 2021 something its engine cannot parse and 2022–2023 an
app with every `@layer` block dropped. If the legacy tier is ever removed,
`required_version` has to go to **8.0** in the same commit.

The QA consequence: Samsung tests the model groups you select, so selecting a
2021–2023 group means the verification test runs against the legacy bundle. It
is checked statically on every build (`check:legacy`), but nobody has yet watched
it paint on a real 2021 set. Do that before submitting those groups.

## 3. Assets

| Slot | File | Spec |
| --- | --- | --- |
| In-package icon | `public/icon.png` | 512×512 RGBA |
| Store logo layer | `store/logo-1920.png` | 1920×1080, transparent 32-bit RGBA, ≤300 kB |
| Store background layer | `store/bg-1920.png` | 1920×1080, 24-bit RGB, ≤300 kB |
| Store icon | `store/icon-512x423.png` | 512×423 PNG, ≤300 kB |
| Screenshots | `store/shots/` | **exactly 4**, 1920×1080 JPG ≤500 kB; not yet captured, see §6 |

Regenerate the derived art with `bun run store:art`. Samsung composites its own
16:9 and 1:1 tiles from the logo + background pair, which is why the logo layer
is transparent and the background carries no text.

The app icon **cannot be changed while certification is in progress**.

## 4. Listing fields

The text for every free-form field (title, summary, both descriptions, tags) is
in [clients/LISTING.md](../LISTING.md), written once and shared with the LG
listing so the two cannot drift.

| Field | Value |
| --- | --- |
| App title | KROMA, byte-identical to `<name>` in `config.xml` |
| Service category | Videos |
| Description | ≤4000 characters, per language |
| Tags | at least 3 search keywords per language |
| Languages | English, French |
| Age rating | no adult content (18+ cannot ship in Korea regardless) |
| Privacy policy | required if the app collects personal information; **you must supply a URL** |
| Billing | Free |
| In-app ads | none; declaring none while shipping ads is a rejection reason |

**DoC for EAA.** An EU release (every country except Bulgaria) requires a
Declaration of Conformity under the European Accessibility Act. That is a
document you produce, not a checkbox, and it only becomes relevant once you are
a Partner Seller.

**App UI Description.** A PowerPoint walking through every UI flow with
screenshots. The Jellyfin project called this the single most painful artefact of
the whole Samsung submission. Budget real time for it.

## 5. Captions and TTS: a launch blocker for the US

Samsung: *"Caption and TTS functions must be implemented in order to release an
application to a model group subject to FCC regulations."* The US is the **only**
country a Public Seller can ship to, so this is not optional for a first release.

- **Captions: covered, and now actually.** Declare the solution as
  **Application UI**: KROMA renders its own cues (parsed in `@kroma/core`, drawn
  by `@kroma/ui`'s `SubtitleRenderer`), because cross-origin `<track>` cues never
  load. Declaring App UI means owning CEA-708's attribute matrix in your own
  settings, and the app now offers all of it: the **eight** colours, for text,
  background **and** caption window alike; the **eight** font styles; the
  **five** edge treatments (none / raised / depressed / uniform / drop shadow);
  and an opacity per layer. It was 5 colours, 3 fonts, 3 edges and no background
  or window colour at all when this section first claimed "covered", which would
  have been graded as defects. See
  `packages/ui/src/components/organisms/player/lib/subtitle-appearance.ts`.
  Trimming a set there is a certification defect, not a tidy-up.

  You must also supply a video title and a playback URL whose content actually
  has captions. Samsung's checklist posts a defect for **fewer than three**
  captioned test contents, so line up three.
- **TTS: half there, and the missing half is one specific thing.** Measured on
  the built app rather than assumed:
  - *Accessible names: present.* Every focusable control renders
    `role="button"` + `aria-label` (`Focusable` sets `accessibilityRole` /
    `accessibilityLabel`, which react-native-web maps to both). The audit found
    0 unnamed controls on the picker and on device settings.
  - *`<html lang>`: fixed.* It was hardcoded `fr` in every shell's index.html,
    so an English interface was announced with French phonetics. The locale
    provider now mirrors the UI language onto it.
  - *Platform focus: never moves.* This is the gap. Spatial navigation is
    virtual (the navigator tracks the focused node in JS and draws the ring
    itself), so `document.activeElement` stays on `<body>` for the whole
    session. A screen reader announces the element that holds PLATFORM focus,
    so Voice Guide has nothing to follow as the D-pad moves.

  Closing it means mirroring the virtual focus onto the DOM (`el.focus({
  preventScroll: true })` when a `Focusable` becomes focused). That is a small
  change in one component and a real risk to the navigator's behaviour, so it
  needs verifying with Voice Guide on an actual set before it is claimed in a
  submission. Until then the options are unchanged: implement it, or restrict
  the launch to model groups outside FCC scope, which, on a Public Seller
  account limited to the US, means not launching on Samsung at all.

Also declare **Player Specification** (video codec, audio codec, container,
streaming engine, subtitle) and name the principal content. QA runs a playback
test against exactly what you declare.

## 6. Test information: the real blocker

KROMA is a client for a server the viewer runs, so Samsung's testers need
something to connect to. The launch checklist demands **at least one test account
per model group**, and no fewer accounts than the number of model groups you
request. Before submitting you need:

- a **publicly reachable demo KROMA server** with a small, unambiguously
  licensed catalogue
- **test account credentials** for every model group requested
- if anything is geo-restricted, declare it and allowlist Samsung's tester IPs

Screenshots are captured from the real build:

```bash
VITE_KROMA_SERVER=http://your-server:4040 bun run build:tizen
(cd clients/tizen && bunx vite preview --port 4173 --strictPort) &
bun clients/tv-build/store-shots.ts 4173 clients/tizen/store/shots
```

The tool is verified driving the app's signed-out screens; the screens worth
showing a buyer need a catalogue, so tune its key sequence against the demo
server. Convert to JPG ≤500 kB before upload.

## 7. Privileges

`config.xml` declares `internet`, `systeminfo`, `filesystem.read/write`,
`application.launch` and `http://developer.samsung.com/privilege/productinfo`.

**Undeclared or unauthorised privileges fail the automated pre-test**, which runs
the moment the `.wgt` is uploaded. Samsung splits privileges into public, partner
and platform levels, and partner-level APIs require membership of a Seller Office
partner group. The in-repo comment marks these as public-level, which is true for
a *developer certificate*, which is a different question from store publication.
**Verify `productinfo` at pre-test before building the listing around the Smart
Hub preview feature**, which depends on it.

The preview carousel itself is declared through metadata
(`use.preview = bg_service`), not a privilege, and Samsung's Preview API
reference lists no privilege requirement.

## 8. Publication flow

Create app → upload `.wgt` (automated pre-test runs) → enter app information →
`Applications > Distribute` → Samsung review and verification test → resolve
defects → launch.

Updates support phased rollout: 3% of TVs, 10% after two weeks, 100% a week
later.

### Beta test: the one real TestFlight on television

Samsung is the only TV platform with a proper closed-beta channel, and unlike
LG's Alpha Test it is open to ordinary sellers and does **not** need the app to
be published first. `Applications > Beta Test > Create Beta Test`, on a version
sitting at *Ready to Submit*:

| | |
| --- | --- |
| Devices | Smart TVs from **2021** and later, by model group; several groups can run different versions at once |
| Countries | only the app's declared service countries, so **US-only on a Public Seller account** (§1) |
| Duration | **90 days** per test, extendable to **180** in total |
| Testers | a 5-character prefix + activation codes issued as CSV (up to 1,000 per test; more on request). One code, one TV, single use |
| Approval | a Samsung **Content Manager must approve** the test; Samsung then does **not** run its verification test on the beta, so the build is yours to vouch for |

A tester redeems a code on the set itself: Settings → type the hidden key
**`134678`** on the remote → enter the code. Version upgrades mid-test are
allowed once approved; downgrades are not.

Alpha testing on your own dev TVs is Partner-only. For anything smaller than a
beta, sideload with `tizen install` against a TV in developer mode.

## 9. Commercial terms

Free apps cost nothing. If that ever changes: 70/30 in your favour, and §7.1 of
the agreement applies the same 30% **even when you bill outside Samsung
Checkout**, with a requirement to give Samsung a trackable URL or QR code for
attribution. Advertising is also 70/30, and Samsung may additionally take 30% of
your ad inventory gratis. Payouts remit above USD 500/month, carried forward
below that.

The agreement also requires that nothing you ship would oblige Samsung software
or its derivatives to be licensed under open-source terms. KROMA is GPL-2.0, so
this is satisfied.

## 10. Content review: know the exposure

Samsung's agreement carries IP-infringement removal clauses, and the content test
screens for infringement facilitation. Be accurate about what the server does,
because it is checkable.

**What is true of the app:** it is a player. It ships no content, no catalogue and
no acquisition features, and renders only what the viewer's own server serves.
That is the whole of what is being submitted, and it is defensible on its own.

**What is true of the server:** the acquisition features run **out of process**.
The indexer, Torznab, VPN, Transmission, qBittorrent, mdns, scene and remote
crates are workspace declarations only, not dependencies of the `kroma-server`
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

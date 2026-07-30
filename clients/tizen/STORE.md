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
which is a human approval process with a named Samsung Content Manager — start it
early if it matters.

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
(`server/Cargo.toml`, or CI's `KROMA_VERSION`) — see
[`clients/tv-build/stamp-version.ts`](../tv-build/stamp-version.ts). Never
hand-edit it in `config.xml`.

`required_version="6.0"` floors the app at Tizen 6.0 (2021 models). Model groups
are chosen at distribution time and all Tizen versions inside a group are
included automatically; `jellyfin-tizen` was approved for only *some* models on
its first pass, so choose deliberately and expect to widen later.

## 3. Assets

| Slot | File | Spec |
| --- | --- | --- |
| In-package icon | `public/icon.png` | 512×512 RGBA |
| Store logo layer | `store/logo-1920.png` | 1920×1080, transparent 32-bit RGBA, ≤300 kB |
| Store background layer | `store/bg-1920.png` | 1920×1080, 24-bit RGB, ≤300 kB |
| Store icon | `store/icon-512x423.png` | 512×423 PNG, ≤300 kB |
| Screenshots | `store/shots/` | **exactly 4**, 1920×1080 JPG ≤500 kB — not yet captured, see §6 |

Regenerate the derived art with `bun run store:art`. Samsung composites its own
16:9 and 1:1 tiles from the logo + background pair, which is why the logo layer
is transparent and the background carries no text.

The app icon **cannot be changed while certification is in progress**.

## 4. Listing fields

| Field | Value |
| --- | --- |
| App title | KROMA — must be byte-identical to `<name>` in `config.xml` |
| Service category | Videos |
| Description | ≤4000 characters, per language |
| Tags | at least 3 search keywords per language |
| Languages | English, French |
| Age rating | no adult content (18+ cannot ship in Korea regardless) |
| Privacy policy | required if the app collects personal information — **you must supply a URL** |
| Billing | Free |
| In-app ads | none — declaring none while shipping ads is a rejection reason |

**DoC for EAA.** An EU release (every country except Bulgaria) requires a
Declaration of Conformity under the European Accessibility Act. That is a
document you produce, not a checkbox — and it only becomes relevant once you are
a Partner Seller.

**App UI Description.** A PowerPoint walking through every UI flow with
screenshots. The Jellyfin project called this the single most painful artefact of
the whole Samsung submission. Budget real time for it.

## 5. Captions and TTS — a launch blocker for the US

Samsung: *"Caption and TTS functions must be implemented in order to release an
application to a model group subject to FCC regulations."* The US is the **only**
country a Public Seller can ship to, so this is not optional for a first release.

- **Captions — covered.** Declare the solution as **Application UI**: KROMA
  renders its own cues (`@kroma/core` WebVTT parser + `use-tv-subtitles`), because
  cross-origin `<track>` cues never load. You must also supply a video title and
  a playback URL whose content actually has captions.
- **TTS — not implemented.** This is the open gap. Decide whether to add it or to
  restrict the launch to model groups outside FCC scope.

Also declare **Player Specification** (video codec, audio codec, container,
streaming engine, subtitle) and name the principal content — QA runs a playback
test against exactly what you declare.

## 6. Test information — the real blocker

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
a *developer certificate* — that is a different question from store publication.
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
later. Beta testing via activation codes exists but needs Content Manager
approval; alpha testing is Partner-only.

## 9. Commercial terms

Free apps cost nothing. If that ever changes: 70/30 in your favour — and §7.1 of
the agreement applies the same 30% **even when you bill outside Samsung
Checkout**, with a requirement to give Samsung a trackable URL or QR code for
attribution. Advertising is also 70/30, and Samsung may additionally take 30% of
your ad inventory gratis. Payouts remit above USD 500/month, carried forward
below that.

The agreement also requires that nothing you ship would oblige Samsung software
or its derivatives to be licensed under open-source terms. KROMA is GPL-2.0, so
this is satisfied.

## 10. Content review — know the exposure

Samsung's agreement carries IP-infringement removal clauses, and the content test
screens for infringement facilitation. Be accurate about what the server does,
because it is checkable.

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

# Media

Status: **AGREED** — the media model and the first-class codec/stream truth are decided.
Per-section status is called out where it differs.

What a title *is* once KROMA knows about it: the technical truth about its streams. That
truth is the input to every playback decision. If a file direct-plays, it is because its
streams match what a client can render; if it cannot, this is where the reason comes from.

This file owns the *vocabulary* of media — the model, the containers, the codecs, the
stream properties. The per-device capability matrix lives in [`surfaces.md`](../surfaces/README.md)
and the decision of what to send lives in [`playback.md`](../playback/README.md). Both consume the
terms defined here; neither is redefined here.

## The media model

Status: **AGREED**

Five nouns, nested, each the child of the one before:

- **Title** — the work a person searches for: a film, or one episode of a series. The unit
  the [`library.md`](../library/README.md) matches to metadata. A title carries no bytes.
- **Edition** — a named cut of a title: theatrical, director's, extended, remastered.
  Different runtimes, different content. A title with one cut has one unnamed edition.
- **Media file** — one physical file on disk that realises an edition at a given fidelity.
  An edition may have several: a 1080p file and a 4K file are two media files of the same
  edition, not two titles and not two editions.
- **Stream** — one track inside a media file: exactly one of video, audio, or subtitle.
  A media file has one or more video streams (usually one), zero or more audio streams,
  and zero or more subtitle streams.
- **Stream properties** — the describable facts about a stream (codec, resolution, bit
  depth, channel layout, language, disposition). These are what a client is matched against.

The nesting is strict and total: every stream belongs to exactly one media file, every
media file to exactly one edition, every edition to exactly one title. Nothing floats.

## Versions of one title

Status: **AGREED** — resolves the open question on multiple versions.

A 1080p file and a 4K file of the same cut are **two media files of one edition**. They are
never modelled as separate titles, and the library never shows a duplicate. A person picks
a title and a cut; the fidelity is chosen for them.

- KROMA ranks a title's media files and keeps a **preferred** one. Rank order: resolution,
  then HDR over SDR, then bit depth, then audio channel count, then bitrate. The preferred
  file is the default source for a play request.
- The preference is a *default*, not a lock. A client that cannot render the preferred file
  may be served a lesser file of the same edition instead of falling back to transcoding —
  a genuinely better outcome, so the model must make the alternative reachable. Which file
  a given client actually receives is [`playback.md`](../playback/README.md)'s decision; media.md only
  guarantees the alternatives are enumerated and comparable.
- Editions are surfaced to the person (they are different content); fidelity variants are
  not (they are the same content at different quality). A person chooses a cut, never a
  resolution.

## Containers and codecs

Status: **AGREED**

First-class means: KROMA fully describes it, preserves it end to end, and expects direct
play wherever a client can render it. Everything else is *readable* but not privileged.

First-class containers: **MP4**, **MKV**, **WebM**. First-class video codecs, HEVC first:

- **HEVC / H.265** — the priority codec. 8-bit and 10-bit, SDR and HDR, are all first-class.
- **H.264 / AVC** — the universal floor; assumed playable everywhere.
- **AV1** — first-class where the client generation can render it; treated as first-class
  media truth regardless, so a capable client direct-plays it.
- **VP9** — first-class within WebM, chiefly for the browser surface.

First-class audio and subtitle codecs are named in their sections below. A codec being
first-class is a statement about *KROMA's* handling; whether a *particular* device renders
it is the matrix in [`surfaces.md`](../surfaces/README.md).

## Bit depth and HDR

Status: **AGREED**

HDR is preserved end to end or it is not offered. KROMA never silently flattens HDR to SDR
as if nothing happened — a tone-mapped picture is a compromise and is surfaced as one by
[`playback.md`](../playback/README.md).

- **Bit depth** — 8-bit and 10-bit are first-class. 10-bit is retained as a first-class
  property of the video stream, never rounded away in the model.
- **HDR variants** KROMA distinguishes: **HDR10**, **HDR10+**, **Dolby Vision**, **HLG**.
  Each is a distinct property, because each has distinct client support. Dolby Vision's
  profile is recorded, because a profile a client cannot decode is not the same as one it
  can.
- **What is preserved**: colour primaries, transfer characteristics, and matrix
  coefficients travel with the video stream. A client is matched against the exact HDR
  variant, not a generic "HDR" flag. Where dynamic metadata (HDR10+, Dolby Vision) cannot
  be carried to a client, KROMA's position is that the base HDR10 layer is preserved rather
  than discarding HDR entirely — a fallback [`playback.md`](../playback/README.md) makes visible.

## Audio

Status: **AGREED**

First-class audio codecs: **AAC**, **AC-3** and **E-AC-3** (Dolby Digital / Plus),
**TrueHD**, **DTS** and **DTS-HD**, **FLAC**, **Opus**. Each audio stream's **channel
layout** (stereo, 5.1, 7.1, Atmos objects) is a first-class property.

- **Passthrough** is the default for multichannel and lossless audio: the bitstream is sent
  untouched to a device or receiver that can decode it. This is direct play for audio and is
  always preferred.
- **Downmixing** to stereo happens only when the target cannot render the source layout, and
  only as an explicit fallback — never silently. When it happens, [`playback.md`](../playback/README.md)
  owns telling the person; media.md defines *what* downmix means (a channel-count reduction
  that is a compromise) and guarantees the original stream is retained unchanged as the
  source.
- Multiple audio streams (languages, commentary) are all enumerated and selectable. The
  default follows the file's own disposition flags, then profile language preference.

## Subtitles

Status: **AGREED**

A subtitle stream is either **embedded** (a track inside the media file) or **sidecar** (a
separate file the library associates with the media file). Both are first-class and both are
enumerated the same way once known.

- First-class text formats: **SRT**, **WebVTT**, **ASS/SSA**. First-class image formats:
  **PGS** and **VobSub**. Text subtitles are the default because they overlay without
  touching the video; image subtitles are heavier and sometimes force a compromise.
- **Dispositions** are recorded and honoured: **forced** (only the foreign-language lines a
  viewer needs) and **SDH** (for the deaf and hard of hearing). These are distinct
  properties; a person picking "forced" gets forced, not full.
- **Burning in** — rendering a subtitle permanently into the video — is a last resort, used
  only when a subtitle cannot be delivered as a selectable overlay to the target. It is
  never the default and never silent. media.md's rule: the original subtitle stream is
  always preserved; the burn is a derived output, not a replacement. *When* it happens is
  [`playback.md`](../playback/README.md).

## Artwork and images

Status: **AGREED**

Every title carries images: **poster**, **backdrop**, **logo**, and per-episode **thumb**.
These are media too, and are treated with the same discipline.

- **Sources**, in order of trust: images embedded in the media file, sidecar image files
  next to it, then images fetched by the [`library.md`](../library/README.md) metadata refresh. A
  local image outranks a fetched one; a person's explicit choice outranks both.
- **Sizes** — KROMA derives and caches a fixed set of sizes per image (a small grid
  thumbnail through a full-bleed backdrop) so a client requests a size, never the original.
  The original is retained as the master.
- **Caching** — derived sizes are cached and served without re-deriving. A source image
  changing invalidates its derivatives; nothing else. Artwork is never a reason a title
  fails to appear — a title with no image shows a typed placeholder, never a broken one.

## Probing and trust

Status: **AGREED** — resolves the open question on probe trust.

KROMA learns a file's streams by **probing** it once, when the library first sees it, and
**trusts that probe** for playback decisions. Re-probing on every play would tax the server
for a fact that rarely changes.

- The probe result is the authoritative stream truth until the file's bytes change (size or
  modification time), which invalidates it and schedules a re-probe.
- **Re-probe on playback failure**: when a direct play fails in a way that implicates the
  stream description (a codec the probe named but the client could not initialise), KROMA
  re-probes that file once and records the corrected truth, so the same failure does not
  recur. A failure that does not implicate the description (network, disk) does not trigger a
  re-probe.
- Trust is per-file and durable: a corrected probe is written back, not held in memory for
  one session.

## Files KROMA can read but not fully describe

Status: **AGREED** — resolves the "read but not describe" must-answer.

A file whose container opens and whose streams enumerate, but which contains a stream KROMA
cannot fully describe (an unknown codec, absent or contradictory metadata), is **partially
known** — never hidden and never silently dropped.

- The title **appears** in the library with whatever *is* known. A single indescribable
  stream does not disqualify the file; the describable streams remain first-class.
- The unknown stream is marked **undescribed** and carries its raw identifier so a person and
  a diagnostician can see exactly what was not understood. An undescribed stream is treated
  as *not direct-playable* by [`playback.md`](../playback/README.md) — KROMA will not gamble that a
  client can render what KROMA itself cannot name.
- A file that will not open at all — a truncated or corrupt container — is **unreadable**,
  surfaced as a typed error against the title with the reason, and excluded from play until
  it is re-scanned. It is a visible fault, not an absence.
- Undescribed and unreadable are distinct states. The first is "we see it but cannot vouch
  for it"; the second is "we cannot see it". Both are on record; neither is a blank.

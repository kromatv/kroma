# Playback

Status: **DRAFT** — sections carry their own status below.

The core promise: the file plays, unmodified, wherever possible. Everything else is a
fallback, and every fallback is a compromise that is made visible and explained. KROMA
never quietly degrades a stream and hopes nobody notices.

Codec truth — what a stream actually is — lives in [`media.md`](../media/README.md). The per-device
capability matrix lives in [`surfaces.md`](../surfaces/README.md). Who is allowed to watch a title at
all lives in [`accounts.md`](../accounts/README.md). This file owns the *decision*: given a file, a
client and a network, what gets sent, and what is given up to send it.

## Direct play

Status: **AGREED**

Direct play means the client fetches the original file, byte for byte, and decodes it
itself. The server does nothing but serve bytes and honour range requests. This is the
default, the goal, and the only path with no compromise.

A file direct-plays when **all** of the following hold:

1. The client declares it can demux the **container** (per [`surfaces.md`](../surfaces/README.md)).
2. The client can decode the **video stream** — codec, profile, level, bit depth and HDR
   variant — in hardware, as declared for that device generation.
3. Every **audio stream the user might select** is decodable by the client, at its native
   channel layout, or is passthrough-capable to a connected receiver.
4. The chosen **subtitle**, if any, is either a format the client renders itself or is a
   sidecar it can fetch alongside.
5. The **link** sustains the file's peak bitrate. Local network: always assumed. Remote:
   only when measured throughput clears peak with headroom.

The capability inputs (1–4) are surface facts and are not restated here; KROMA reads them
from the device profile. The decision below is what KROMA does with them.

## The fallback ladder

Status: **AGREED**

When a title cannot direct-play, KROMA walks a fixed ladder and stops at the first rung
that works. Each rung gives up strictly more than the one above it. The rule: **change the
least, and never touch the video stream while a cheaper change on another stream would do.**

1. **Direct play** — original file, untouched. No compromise.
2. **Remux (direct stream)** — the video and audio *bitstreams* are copied unchanged into a
   container the client can demux (e.g. an unsupported container holding a supported codec).
   Nothing is re-encoded; picture and sound are bit-identical. Cheap, near-instant, no
   quality loss.
3. **Audio-only fallback** — the video is still copied, but one audio stream is dealt with:
   - **passthrough** to a receiver if the client can pass the bitstream on; else
   - **downmix** a multichannel track to stereo when the client cannot decode the layout;
     else
   - **transcode the audio** to a codec the client decodes. Video is never touched to solve
     an audio problem.
4. **Subtitle burn-in** — only when a selected subtitle cannot be rendered by the client and
   cannot be delivered as a sidecar (e.g. bitmap subs on a client without an overlay). This
   forces re-encoding the video, so it sits below audio fixes: a subtitle preference must
   not silently cost picture quality — see *What is never done silently*.
5. **Video transcode** — the last resort. The video stream is re-encoded to a codec, profile
   and bitrate the client can decode, downscaling resolution and tone-mapping HDR to SDR only
   as far as required. Everything above has failed; this rung always loses quality and costs
   the server real work.

KROMA takes the highest rung that satisfies the client. It does not skip rungs for
convenience: if remux suffices, it remuxes; it does not transcode because a session is
already warm.

### Is transcoding a feature or a last resort?

**Decision:** a tolerated last resort, not a headline feature. KROMA is built so the original
plays; transcode exists so a title is *never unplayable* on a client the user actually owns,
not so KROMA can pretend any file suits any screen. Consequences on record:

- Transcode is always the lowest rung and is never the default for a capable client.
- An admin may **cap or disable** video transcode per server and per user
  ([`accounts.md`](../accounts/README.md), [`admin.md`](../admin/README.md)); disabling it means an incompatible
  file reports as unplayable on that client rather than degrading.
- We do not invest in adaptive multi-bitrate ladders, quality knobs, or bandwidth-based
  auto-transcode. The product's answer to "it won't play" is "get a client that direct-plays
  it", and the honest message below says exactly that.

## What is never done silently

Status: **AGREED**

Any rung below direct play is a compromise, and the client always shows which one is active
before or at the moment playback starts — a small, honest badge, not a buried log line:

- **Video transcode** and **subtitle burn-in** are shown as *reduced quality* with the reason
  (codec / resolution / HDR / subtitle). These change the picture and are the loudest.
- **Audio downmix** and **audio transcode** are shown as *audio adjusted*.
- **Remux** is shown as *repackaged* — quality is untouched, so this is informational, not a
  warning.
- Direct play shows nothing; the absence of a badge *is* the signal that the file is pristine.

KROMA never re-encodes video to save bandwidth without the user's device profile forcing it,
never tone-maps HDR without saying so, and never burns in subtitles the user did not ask to
see. If the only playable path is one the user or admin has disabled, playback fails loudly
(see *Failure*) rather than falling further down the ladder.

## Seeking

Status: **AGREED**

- **Direct play and remux:** seeking is instant and exact. The client issues a range request
  against a fully-known file; any position is reachable immediately, including scrubbing.
- **Transcode (audio or video):** the stream is produced live from a play position, so a seek
  outside the buffered window **re-anchors** the transcode at the target and resumes there.
  This costs a short re-buffer, and backward seeks are as expensive as forward ones. KROMA
  favours anchoring at the requested position over pre-producing the whole file, so a user who
  jumps around pays a small pause each time rather than waiting once for a full encode.

Seeking accuracy is never silently coarsened; a transcoded seek lands on the requested frame's
keyframe, not a rounded chapter.

## Resume and continue watching

Status: **AGREED**

Progress is **per user, per media version**, stored on the server — it is the server's watch
state, not a device's ([`accounts.md`](../accounts/README.md)). Any client the user signs into sees the
same resume point.

**When progress is written.** The playing client reports position on a steady heartbeat while
playing (a small fixed interval), on pause, on seek settling, and on stop. A crash loses at
most one heartbeat interval. The write is idempotent on `(user, version, position, wall-clock
time)` so a replayed or offline-queued report cannot move progress backwards.

**Resume point.** Reopening a title in progress offers *Resume* from the stored position and
*Play from start*; resume is the default. The stored position is the reported one, not a
rounded chapter.

**The "watched" threshold.** A title is **watched** at **≥ 90% of runtime**, or at reaching a
credits/end marker if the media has one. At that point continue-watching drops the title and,
for episodic content, surfaces the next episode instead. 90% is chosen because trailing credits
routinely run the last several minutes: requiring 100% would strand finished titles in the row
forever, and a fixed "last N minutes" misjudges both a 22-minute episode and a 200-minute film.
Below 90%, progress is retained and the title stays in continue-watching. Starting a watched
title again resets it to unwatched and clears the stored position.

**Offline reconciliation.** Mobile downloads let a user watch with no server connection, and two
devices can each accrue progress offline against the same version. Downloads survive app kills
and are re-adopted on launch (see
[`../architecture/mobile-offline-system-storage.md`](../../architecture/mobile-offline-system-storage.md)),
and so does the **queue of unsent progress reports**. On reconnect each device flushes its queue,
every report stamped with the **wall-clock time the user was actually at that position**.

### Who wins when two devices disagree?

**Decision: furthest-position-wins, not last-writer-wins.** When queued reports from two offline
sessions land for the same `(user, version)`, KROMA keeps the **furthest position reached**, not
the one whose report arrived or was stamped last. Rationale: watch progress is monotonic in
intent — a user who watched to 0:55 on a plane and to 0:20 on a phone has *seen* up to 0:55, and
resuming there loses nothing, whereas last-writer-wins would rewind them to 0:20 because that
sync happened to flush second. The one exception is an explicit **reset to start** (finishing a
title, or "play from start"), which is an intent, not a position, and always wins over a stale
higher position. If either device crossed the watched threshold, the title is watched.

## Multiple clients at once

Status: **AGREED**

One account may play on several clients simultaneously; KROMA does not enforce a concurrent-stream
limit as a product rule (an admin may cap server load — [`admin.md`](../admin/README.md)). Each playing
client is an independent session with its own fallback decision: the same title may direct-play on
a phone and transcode on a television at the same moment, because the decision is per device, not
per title.

Shared progress means the sessions interleave into one continue-watching state under the
furthest-position rule above; two devices on the same title do not fight, they simply both advance
it. KROMA does not "hand off" an active session between devices as a first-class gesture — a user
resumes on the second device from shared progress, which achieves the same end without a pairing
dance.

## Failure

Status: **AGREED**

When a stream dies mid-playback — the network drops, a transcode process fails, the source file
becomes unreadable — the client shows a plain, specific message and keeps the last known position
so the user resumes exactly where they were, never from the start.

- **Transient (network, brief server hiccup):** the client retries quietly for a few seconds
  behind the scrubber before surfacing anything; most recover invisibly.
- **Fatal (source gone, transcode cannot start, path disabled by policy):** playback stops with a
  reason — *This file can't be played on this device*, or *This title is no longer available* —
  never a raw error code.

### When the television can't play what the phone can

This is the common, honest case: a modern phone direct-plays a file a television's older decoder
cannot, and the server is configured not to transcode it (or the admin disabled transcode). The
television must not fail with a blank error. It says, plainly:

> **Can't play this here.** This TV can't decode this file. It plays fine on the KROMA phone and
> web apps — or ask the server owner to enable conversion for this device.

The message names the real cause (the device, not the file), points at a surface that *does* work,
and names the one lever that would fix it (admin-enabled transcode). It never blames the user, and
it never pretends the file is broken — the file is fine; this screen just can't decode it.

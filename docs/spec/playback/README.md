# Playback

Status: **AGREED**. Sections carry their own status below.

The core promise: the file plays, unmodified, wherever possible. Everything else is a
fallback, and every fallback is a compromise that is made visible and explained. KROMA
never quietly degrades a stream and hopes nobody notices.

Codec truth, what a stream actually is, lives in [`media/`](../media/). The per-device
capability matrix lives in [`surfaces/`](../surfaces/). Who is allowed to watch a title at
all lives in [`accounts/`](../accounts/). This file owns the *decision*: given a file, a
client and a network, what gets sent, and what is given up to send it.

## Direct play

Status: **AGREED**

**PLAY-1** (SHIPPED) - Direct play means the client fetches the original file, byte for byte,
and decodes it itself. The server does nothing but serve bytes and honour range requests.
This is the default, the goal, and the only path with no compromise.

A file direct-plays when **all** of the following hold:

- **PLAY-2** (AGREED) - The client declares it can demux the **container**
  ([`surfaces/`](../surfaces/)).
- **PLAY-3** (AGREED) - The client can decode the **video stream**, meaning codec, profile,
  level, bit depth and HDR variant, in hardware, as declared for that device generation.
- **PLAY-4** (AGREED) - Every **audio stream the person might select** is decodable by the
  client at its native channel layout, or is passthrough-capable to a connected receiver.
- **PLAY-5** (AGREED) - The chosen **subtitle**, if any, is either a format the client renders
  itself or a sidecar it can fetch alongside.
- **PLAY-6** (AGREED) - The **link** sustains the file's peak bitrate. On a local network this
  is assumed; on a remote one it holds only when measured throughput clears peak with
  headroom.

The capability inputs are surface facts and are not restated here; KROMA reads them from the
device profile. The decision below is what KROMA does with them.

## The fallback ladder

Status: **AGREED**

**PLAY-7** (AGREED) - When a title cannot direct-play, KROMA walks a fixed ladder and stops at
the first rung that works. Each rung gives up strictly more than the one above it.

**PLAY-8** (AGREED) - Change the least: the video stream is never touched while a cheaper
change on another stream would do.

- **PLAY-9** (SHIPPED) - Rung 1, **direct play**. The original file, untouched. No compromise.
- **PLAY-10** (SHIPPED) - Rung 2, **remux**, also called direct stream. The video and audio
  *bitstreams* are copied unchanged into a container the client can demux. Nothing is
  re-encoded, picture and sound are bit-identical, and it is cheap and near-instant.
- **PLAY-11** (SHIPPED) - Rung 3, **audio-only fallback**. The video is still copied and one
  audio stream is dealt with: passthrough to a receiver if the client can pass the bitstream
  on, else a downmix of a multichannel track to stereo when the client cannot decode the
  layout, else transcoding the audio to a codec the client decodes.
- **PLAY-12** (AGREED) - Video is never touched to solve an audio problem.
- **PLAY-13** (AGREED) - Rung 4, **subtitle burn-in**. Only when a selected subtitle can
  neither be rendered by the client nor delivered as a sidecar, such as bitmap subs on a client
  with no overlay. It forces re-encoding the video, so it sits below audio fixes: a subtitle
  preference must not silently cost picture quality.
- **PLAY-14** (SHIPPED) - Rung 5, **video transcode**, the last resort. The video stream is
  re-encoded to a codec, profile and bitrate the client can decode, downscaling resolution and
  tone-mapping HDR to SDR only as far as required. This rung always loses quality and costs
  the server real work.

**PLAY-15** (AGREED) - KROMA takes the highest rung that satisfies the client and does not
skip rungs for convenience. If remux suffices it remuxes; it does not transcode because a
session is already warm.

### Is transcoding a feature or a last resort?

Status: **AGREED**

**PLAY-16** (AGREED) - Transcode is a tolerated last resort, not a headline feature. KROMA is
built so the original plays, and transcode exists so a title is never unplayable on a client a
person actually owns, not so KROMA can pretend any file suits any screen.

- **PLAY-17** (AGREED) - Transcode is always the lowest rung and is never the default for a
  capable client.
- **PLAY-18** (AGREED) - An admin may **cap or disable** video transcode per server and per
  person ([`accounts/`](../accounts/), [`admin/`](../admin/)). Disabling it means an
  incompatible file reports as unplayable on that client rather than degrading.
- **PLAY-19** (AGREED) - KROMA ships no adaptive multi-bitrate ladder, no quality knobs and no
  bandwidth-based auto-transcode. The product's answer to "it won't play" is "use a client that
  direct-plays it", and the honest message below says exactly that.

## What is never done silently

Status: **AGREED**

**PLAY-20** (AGREED) - Any rung below direct play is a compromise, and the client always shows
which one is active before or at the moment playback starts, as a small honest badge rather
than a buried log line.

- **PLAY-21** (AGREED) - **Video transcode** and **subtitle burn-in** are shown as *reduced
  quality* with the reason, meaning codec, resolution, HDR or subtitle. These change the
  picture and are the loudest.
- **PLAY-22** (AGREED) - **Audio downmix** and **audio transcode** are shown as *audio
  adjusted*.
- **PLAY-23** (AGREED) - **Remux** is shown as *repackaged*. Quality is untouched, so this is
  informational rather than a warning.
- **PLAY-24** (AGREED) - Direct play shows nothing. The absence of a badge *is* the signal
  that the file is pristine.

**PLAY-25** (AGREED) - KROMA never re-encodes video to save bandwidth unless the device
profile forces it.

**PLAY-26** (AGREED) - KROMA never tone-maps HDR without saying so.

**PLAY-27** (AGREED) - KROMA never burns in subtitles the person did not ask to see.

**PLAY-28** (AGREED) - When the only playable path is one a person or an admin has disabled,
playback fails loudly rather than falling further down the ladder.

## Seeking

Status: **AGREED**

- **PLAY-29** (SHIPPED) - Under **direct play and remux**, seeking is instant and exact. The
  client issues a range request against a fully-known file, so any position is reachable
  immediately, scrubbing included.
- **PLAY-30** (AGREED) - Under **transcode**, the stream is produced live from a play position,
  so a seek outside the buffered window **re-anchors** the transcode at the target and resumes
  there. That costs a short re-buffer, and a backward seek is as expensive as a forward one.
- **PLAY-31** (AGREED) - KROMA anchors at the requested position rather than pre-producing the
  whole file, so a person who jumps around pays a small pause each time instead of waiting once
  for a full encode.
- **PLAY-32** (AGREED) - Seeking accuracy is never silently coarsened. A transcoded seek lands
  on the requested frame's keyframe, not a rounded chapter.

## Resume and continue watching

Status: **AGREED**

**PLAY-33** (SHIPPED) - Progress is **per person, per media version**, stored on the server. It
is the server's watch state, not a device's ([`accounts/`](../accounts/)), so any client the
person signs into sees the same resume point.

**PLAY-34** (SHIPPED) - The playing client reports position on a steady heartbeat while
playing, on pause, on a settled seek, and on stop, so a crash loses at most one heartbeat
interval.

**PLAY-35** (AGREED) - The write is idempotent on the person, the version, the position and
the wall-clock time, so a replayed or offline-queued report cannot move progress backwards.

**PLAY-36** (SHIPPED) - Reopening a title in progress offers *Resume* from the stored position
and *Play from start*, with resume the default. The stored position is the reported one, not a
rounded chapter.

**PLAY-37** (AGREED) - A title is **watched** at **90% of runtime or more**, or at reaching a
credits or end marker where the media has one. 90% is chosen because trailing credits
routinely run the last several minutes: requiring 100% would strand finished titles in the row
forever, and a fixed "last N minutes" misjudges both a 22-minute episode and a 200-minute
film.

**PLAY-38** (SHIPPED) - At the watched threshold, continue-watching drops the title and, for
episodic content, surfaces the next episode instead.

**PLAY-39** (AGREED) - Below the threshold, progress is retained and the title stays in
continue-watching.

**PLAY-40** (AGREED) - Starting a watched title again resets it to unwatched and clears the
stored position.

**PLAY-41** (SHIPPED) - A device watching offline queues its unsent progress reports and, on
reconnect, flushes the queue with every report stamped with the wall-clock time the person was
actually at that position
([`../architecture/mobile-offline-system-storage.md`](../../architecture/mobile-offline-system-storage.md)).

### Who wins when two devices disagree?

Status: **AGREED**

**PLAY-42** (AGREED) - When queued reports from two offline sessions land for the same person
and version, KROMA keeps the **furthest position reached**, not the report that arrived or was
stamped last. Watch progress is monotonic in intent: a person who watched to 0:55 on a plane
and to 0:20 on a phone has *seen* up to 0:55, and last-writer-wins would rewind them because
that sync happened to flush second.

**PLAY-43** (AGREED) - An explicit **reset to start**, from finishing a title or choosing
"play from start", is an intent rather than a position, and always wins over a stale higher
position.

**PLAY-44** (AGREED) - If either device crossed the watched threshold, the title is watched.

## Multiple clients at once

Status: **AGREED**

**PLAY-45** (AGREED) - One account may play on several clients at once. KROMA enforces no
concurrent-stream limit as a product rule, though an admin may cap server load
([`admin/`](../admin/)).

**PLAY-46** (AGREED) - Each playing client is an independent session with its own fallback
decision, so the same title may direct-play on a phone and transcode on a television at the
same moment. The decision is per device, not per title.

**PLAY-47** (AGREED) - Sessions interleave into one continue-watching state under the
furthest-position rule, so two devices on the same title do not fight; they both advance it.

**PLAY-48** (AGREED) - KROMA does not hand off an active session between devices as a
first-class gesture. A person resumes on the second device from shared progress, which
achieves the same end without a pairing dance.

## Failure

Status: **AGREED**

**PLAY-49** (AGREED) - When a stream dies mid-playback, whether the network drops, a transcode
process fails or the source file becomes unreadable, the client shows a plain, specific message
and keeps the last known position, so the person resumes exactly where they were rather than
from the start.

- **PLAY-50** (AGREED) - A **transient** failure, a network drop or a brief server hiccup, is
  retried quietly for a few seconds behind the scrubber before anything surfaces. Most recover
  invisibly.
- **PLAY-51** (AGREED) - A **fatal** failure, a source gone, a transcode that cannot start, or
  a path a policy has disabled, stops playback with a reason, either *This file can't be played
  on this device* or *This title is no longer available*, never a raw error code.

### When the television can't play what the phone can

Status: **AGREED**

**PLAY-52** (AGREED) - When a television's older decoder cannot play a file a modern phone
can, and the server is configured not to transcode it, the television names the device as the
cause, points at a surface that does play it, and names the one lever that would fix it. It
never blames the person and never implies the file is broken.

> **Can't play this here.** This TV can't decode this file. It plays fine on the KROMA phone and
> web apps, or ask the server owner to enable conversion for this device.

The file is fine; this screen just cannot decode it.

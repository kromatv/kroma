# Media

Status: **DRAFT** — skeleton only, nothing here is agreed yet.

What a title *is* once KROMA knows about it: the technical truth about streams, which is
what makes direct play possible or impossible.

## Scope

- The media model: title, version/edition, media file, stream (video, audio, subtitle)
- Containers and codecs that are first-class, HEVC first among them
- Bit depth, HDR variants, and what is preserved end to end
- Audio: channel layouts, passthrough, what may be downmixed and when
- Subtitles: embedded vs sidecar, forced and SDH, what is burned in and when
- Artwork and images: sources, sizes, caching

## Open questions

- How are multiple versions of the same title (1080p and 4K) represented and chosen between?
- Is stream metadata trusted from probe, or re-probed on playback failure?

## Must answer

- [ ] The definitive list of what direct-plays on each client generation
- [ ] What KROMA does with a file it can read but not describe

## Not in scope

Deciding what to send to a given client is [`playback.md`](playback.md).

# Playback

Status: **DRAFT** — skeleton only, nothing here is agreed yet.

The core promise: the file plays, unmodified, wherever possible. Everything else is a
fallback, and every fallback is a compromise that should be visible and explainable.

## Scope

- **Direct play**: the conditions under which the original file is streamed untouched
- The decision order when direct play is impossible, and what is given up at each step
- What is never done silently
- Seeking: behaviour while direct playing, and while any fallback is active
- Resume and **continue watching**: where progress is stored, when it is written, how it
  reconciles across two devices that both watched offline
- Multiple clients on one account playing at once
- Failure: what the user sees when a stream dies mid-playback

## Open questions

- Is transcoding a supported product feature or a last resort we tolerate?
- Who wins when two devices report conflicting progress for the same title?

## Must answer

- [ ] The direct-play decision table, per client generation
- [ ] The exact resume-point semantics, including the "watched" threshold
- [ ] What a user is told when their television cannot play a file their phone can

## Not in scope

Codec truth lives in [`media.md`](media.md); the per-client capability matrix in
[`surfaces.md`](surfaces.md).

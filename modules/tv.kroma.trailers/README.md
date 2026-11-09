# Trailers

Plays a title's trailer in the KROMA player. TMDB lists a title's trailers as
YouTube videos; this module fetches one the way a YouTube client does, takes the
H.264 picture (1080p at most) and the uploader's own AAC track, and remuxes them
into one progressive MP4. Everything runs in Rust inside the component: no
yt-dlp, no JavaScript runtime, no helper program. The bundle is about 400 KB.

The module answers the core's `trailer` point. The core picks the trailer (in
the viewer's language when TMDB has one, then subtitled in it, then the
original), calls `fetch`, copies the finished file into `<data>/trailers` with
`read`, and serves it to every player like a film. A trailer that played once
keeps playing from that cache whatever YouTube does next.

Layout: `server/` (the crate), `clients.json` (the YouTube clients it presents
as), `module.json` (manifest). See `modules/README.md` for the authoring guide.

## How a fetch works

1. `POST /youtubei/v1/visitor_id` for a visitor id, kept six hours.
2. `POST /youtubei/v1/player` as the first client in `clients.json`. Today that
   is `visionos`, the client yt-dlp itself falls back to without a JavaScript
   runtime: it answers plain stream URLs, with no signature to solve and no PO
   token to present.
3. Pick the tallest `avc1` video at most 1080p, and the AAC track marked
   `audioIsDefault`. YouTube's AI dubs (`isAutoDubbed`) are never taken.
4. Download both in 10 MiB ranges through the host's `download`, which writes
   straight to the module's folder.
5. Remux the two fragmented MP4s into one MP4 with its index first
   (`src/mp4`). The samples are copied, never re-encoded.

A client that fails hands over to the next one in the file. When every client
fails, the module fetches `clients.json` again before giving up.

## When YouTube breaks it

Most breaks are data: a client version YouTube retires, a user agent it starts
refusing, a client that now asks for a PO token. Those are fixed without a
release:

1. Check what yt-dlp changed in `yt_dlp/extractor/youtube/_base.py`
   (`INNERTUBE_CLIENTS`) and `_video.py` (`_DEFAULT_JSLESS_CLIENTS`).
2. Edit `clients.json` here and merge it to `main`. Every server reads the file
   from `raw.githubusercontent.com` once a day, and again after a failure, so
   the fix reaches them without anyone updating anything.
3. Bump `version` in `module.json` in the same commit: the file is compiled in
   as the default, so the bundle's bytes change.

The module's log in Admin → Modules says which client served each trailer and
why each failure happened.

What data cannot fix is YouTube making every client that needs no JavaScript ask
for a PO token. That needs code: a JavaScript solver in the component (Boa runs
in wasm) or another source.

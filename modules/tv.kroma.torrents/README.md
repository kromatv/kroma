# Torrent downloads

Torrent engines behind one DownloadClient trait: embedded librqbit, Transmission, qBittorrent.

The ledger's byte counters are lifetime totals, so `server/src/bandwidth/` samples them on the monitor's tick and stores one window a minute, folded coarser as rows age. Each window keeps three shares apart: what the embedded engine moved while the VPN seal held, what it moved while a configured bridge was not sealed, and what an external daemon moved, which no bridge ever carries. That split is what makes the VPN page's throughput figure a claim rather than a guess.

This module answers the `watchable` capability, and answers the whole of it: `server/src/watch/` holds the listing, the start, the probe, the progress, the play credential and its own HLS over a file still arriving. The core contributes the reverse proxy and one route saying which mount answers the capability. See [`docs/watch-while-downloading.md`](../../docs/watch-while-downloading.md).

A download started for a viewer that way arrives `ephemeral`: it is never handed to the import, and the monitor erases it with its data once nothing has read it for `watchCacheMinutes`. `watchKeepInLibrary` makes it an ordinary download instead, imported like any other. Both keys live in this module's own `module.sqlite`, because the core declares neither.

Nothing can describe a container until its index has arrived, and for a WEB release that index sits at the end of the file. So minting a play token starts one read of it (`server/src/rqbit/warm.rs`) and the probe waits for that read before it opens ffprobe on the head. A torrent narrowed to the one file being watched has its selection emptied for the length of that read: librqbit offers no per-stream priority, and while anything is queued the swarm gives an open reader one piece against every peer's. `server/src/container_index.rs` walks the box chain at the front of an mp4 so the ask is the index's real extent rather than a guess at it. Measured on Sintel at 250 KiB/s, that is the difference between a first frame at 18 s and at 5.7 s; the floor at that rate is the index plus the file's first piece.

Layout: `server/` (Rust backend), `ui/` (frontend), `locales/` (i18n), `module.json` (manifest). See `modules/README.md` for the module authoring guide.

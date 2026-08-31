# Torrent downloads

Torrent engines behind one DownloadClient trait: embedded librqbit, Transmission, qBittorrent.

The ledger's byte counters are lifetime totals, so `server/src/bandwidth/` samples them on the monitor's tick and stores one window a minute, folded coarser as rows age. Each window keeps three shares apart: what the embedded engine moved while the VPN seal held, what it moved while a configured bridge was not sealed, and what an external daemon moved, which no bridge ever carries. That split is what makes the VPN page's throughput figure a claim rather than a guess.

Layout: `server/` (Rust backend), `ui/` (frontend), `locales/` (i18n), `module.json` (manifest). See `modules/README.md` for the module authoring guide.

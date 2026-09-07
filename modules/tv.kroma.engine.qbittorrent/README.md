# qBittorrent engine

qBittorrent WebUI as a download sub-engine for the Downloads module.

A backend-only capability module: no page, no routes. Its `ServerModule`
(in this module's own `server/` crate, `kroma-qbittorrent`) registers a
download-client factory of kind `qbittorrent` on enable and unregisters it on
disable, so toggling it adds or removes qBittorrent from the download-client
picker. It contributes to the `tv.kroma.torrents/client` point and lists the
Downloads module (`tv.kroma.torrents`) under `dependencies`, because that module
owns the registry.

Layout: `server/` (backend crate) + `module.json` (manifest). See
`modules/README.md` for the guide.

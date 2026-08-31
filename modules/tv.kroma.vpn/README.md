# VPN

Managed WireGuard bridge (any provider) that torrent traffic routes through, with a live seal test.

The backend lives entirely in this module's own `server/` crate (`kroma-vpn`): the `ServerModule`, its admin routes, the `VpnProxyPort` the composition root registers, and the managed WireGuard->SOCKS5 bridge. It reaches the app only through the `HostCtx` seam. The Downloads module `optionalDependsOn` it: enable VPN first so the engine's SOCKS5 points at a live proxy.

The page's bandwidth band comes from the download module over the `tv.kroma.torrents/vpn` point, because `wireproxy` is userspace WireGuard: there is no `wg` interface here to read rx/tx off, and the engine's own transfer is the tunnel's throughput. The engine keeps the series and splits it by seal state, so a window where the bridge was down says so instead of drawing an unlabelled line.

Layout: `server/` (backend crate), `ui/` (frontend), `locales/` (i18n), `module.json` (manifest). See `modules/README.md` for the module authoring guide.

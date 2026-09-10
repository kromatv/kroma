# Roku

A KROMA channel for Roku boxes. A Roku runs BrightScript only, so the channel is written in it and kept thin: the sidecar shapes every screen it draws, and the box plays the same direct-play stream every other shell does.

The backend (`server/`, `kroma-roku`) finds boxes on the LAN over SSDP, reads who they are over ECP, sideloads the channel through the developer installer of any box in developer mode, and launches it pointed at this server. It also serves the channel its home rows and detail screens, translating the core's catalog with the channel's own bearer.

A box is at the address its SSDP packet came from, never at the one its reply's `Location` header names, and that address has to be one nothing routes across the internet (RFC1918, loopback, link-local, or the IPv6 equivalents). Anything else is not listed and not installed to, by hand or otherwise: the developer installer is handed the operator's Roku password, so whoever answers gets it.

The channel (`channel/`) pairs itself with Quick Connect, like a television: it shows a code, the viewer approves it from a phone or browser, and the box keeps a device session of its own. `build.rs` zips the tree into the sidecar at compile time, so a `.kmod` carries the channel it installs.

The console page (`ui/`) lists the boxes, takes the developer password once, and installs or relaunches the channel on each.

The owner enables developer mode on the box once, with the remote: Home three times, Up twice, Right, Left, Right, Left, Right. The box shows its address and asks for a password; that password is what the console page stores.

Layout: `server/` (backend crate), `channel/` (BrightScript), `ui/` (frontend), `locales/` (i18n), `module.json` (manifest). See `modules/README.md` for the module authoring guide.

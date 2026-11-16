# NZBGet engine

NZBGet's JSON-RPC as a Usenet download engine for the Downloads module.

A backend-only module: no page, no routes. It contributes `nzbget` to the
`tv.kroma.torrents/client` point and answers `caps` with `["usenet"]`, so a
grab goes to it only for a Usenet release. NZBGet fetches the NZB itself,
repairs and unpacks it, and reports that stretch as `processing`; a job it gave
up on reads as `failed`.

Its completed folder has to be one KROMA can read: add it under Admin >
Acquisition > Download folders, at the same path NZBGet reports. When NZBGet
runs in another container, mount the folder at the same path in both.

Layout: `server/` (backend crate) + `module.json` (manifest). See
`modules/README.md` for the guide.

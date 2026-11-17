# SABnzbd engine

SABnzbd as a Usenet download sub-engine for the Downloads module.

A backend-only capability module: no page, no routes. It answers the
`tv.kroma.torrents/client` point with `caps` of `["usenet"]`, so a grab whose
release is an NZB goes to it. It takes a URL and an API key, reports SABnzbd's
repair and unpacking as `processing`, and a job SABnzbd gave up on as `failed`.
Repair and unpacking stay SABnzbd's, so the importer finds plain video files.

Its completed folder has to be one KROMA can read: add it under Admin >
Acquisition > Download folders, at the same path SABnzbd reports. When SABnzbd
runs in another container, mount the folder at the same path in both.

`tests/real_sabnzbd.rs` drives the engine against a running SABnzbd and is
ignored by default. It needs `KROMA_TEST_SABNZBD_URL`, `KROMA_TEST_SABNZBD_KEY`,
and `KROMA_TEST_NZB_BASE`: a URL serving `good.nzb`, whose article the news
server holds, and `missing.nzb`, whose article it does not. Run it with `cargo
test --test real_sabnzbd -- --ignored`.

Layout: `server/` (backend crate) + `module.json` (manifest). See
`modules/README.md` for the guide.

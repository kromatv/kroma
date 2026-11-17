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

`tests/real_nzbget.rs` drives the engine against a running NZBGet and is ignored
by default. It needs `KROMA_TEST_NZBGET_URL`, `KROMA_TEST_NZBGET_USER`,
`KROMA_TEST_NZBGET_PASSWORD`, and `KROMA_TEST_NZB_BASE`: a URL serving
`good.nzb`, whose article the news server holds, and `missing.nzb`, whose
article it does not. Run it with `cargo test --test real_nzbget -- --ignored`.

Layout: `server/` (backend crate) + `module.json` (manifest). See
`modules/README.md` for the guide.

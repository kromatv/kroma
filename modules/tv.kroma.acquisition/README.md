# Acquisition

Interactive and manual release search, quality scoring, grab plus import, and the
automatic wanted-list pass.

The backend lives in this module's own `server/` crate (`kroma-acquisition`): the
`ServerModule`, the admin routes at `/acquisition/{search,analyze,add}`, the
`acquisition` point it answers at `/_port/acquisition/{search,grab}`, and the
jobs behind the wanted list. It rides on the Downloads engine and the indexers,
consuming `tv.kroma.indexer/{search,db}` and `tv.kroma.torrents/{grab,db}`, and
`dependencies` the Downloads module (`tv.kroma.torrents`) because the grab has to
land somewhere.

`acquisition` is one of the three points the CORE calls, so it is bare rather
than namespaced, and nothing but the core may define one.

The settings page is the shared `/api/admin/settings?view=acquisition` view.
Disabling the module removes search, grab and the automatic pass, and hides that
page with them.

Its `storage.core` grant is read on the catalog tables plus the user columns the
requester needs, and write on `requests`, `wanted` and `acq_file_tmdb`.

Layout: `server/` (backend crate), `ui/` (frontend), `locales/` (i18n),
`module.json` (manifest). See `modules/README.md` for the module authoring guide.

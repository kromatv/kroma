# The .nfo file kept beside the media

The file names and the tags other media servers read from an `.nfo` file, which
KROMA follows so a library moved from one of them keeps its text
([`docs/spec/library/README.md`](../spec/library/README.md), LIB-84).
Read 2026-11-24.

## Sources

- **K**: Kodi, [NFO files/Movies](https://kodi.wiki/view/NFO_files/Movies),
  [NFO files/TV shows](https://kodi.wiki/view/NFO_files/TV_shows) and
  [NFO files/Combination](https://kodi.wiki/view/NFO_files/Combination).
- **J**: Jellyfin, [Local .nfo metadata](https://jellyfin.org/docs/general/server/metadata/nfo).
  Local metadata always comes before a remote provider such as TMDb.
- **P**: Plex, [Using NFO metadata files with Plex](https://support.plex.tv/articles/using-nfo-metadata-files-with-plex/).
  Plex Media Server 1.43.1 and later, through its Plex NFO Movie and Plex NFO
  Series agents.

## Where the file is

| Title | Name and place | Source | KROMA |
| --- | --- | --- | --- |
| Film | `<video name>.nfo` beside the video | K, J, P | read |
| Film | `movie.nfo` in the film's own folder | J, P (K behind a setting) | read when the folder holds no other title |
| Film on a DVD | `VIDEO_TS.nfo` | J | not read |
| Show | `tvshow.nfo` in the show's folder, above its seasons | K, J, P | read when the folder holds no other show |
| Season | `season.nfo` | J | not read |
| Episode | `<video name>.nfo` beside the episode | K, J, P | not read |

## What is in it

An XML document saved as UTF-8 (K, P). Its root is `<movie>` for a film and
`<tvshow>` for a show, and each field is a child of the root.

| Tag | What | Source | KROMA |
| --- | --- | --- | --- |
| `<title>` | The name | K, J, P | read |
| `<plot>` | The summary | K, J, P | read |
| `<premiered>` | The release date, `yyyy-mm-dd`; KROMA keeps its year | K, J, P | read |
| `<year>` | The year. K deprecated it in v17 and reads `<premiered>` alone from v20 | K, J | read when there is no `<premiered>` |
| `<genre>` | One genre a tag, repeated for each | K, J, P | read |
| `<originaltitle>`, `<sorttitle>`, `<tagline>` | Other names, and the tagline | K, J, P | not read |
| `<uniqueid type="tmdb">` | The provider's id | K, J, P | not read |

A combination file holds the XML document followed by a link to a provider's
page (K). KROMA reads the document and leaves the link out. A file that holds a
link alone, or a root of another kind, gives nothing.

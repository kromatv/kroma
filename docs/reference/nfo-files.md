# The .nfo file kept beside the media

The file names and the tags other media servers read from an `.nfo` file, which
KROMA follows so a library moved from one of them keeps its text and its
matches ([`docs/spec/library/README.md`](../spec/library/README.md), LIB-84,
LIB-85, LIB-89 and LIB-92).
Read 2026-11-24.

## Sources

- **K**: Kodi, [NFO files/Movies](https://kodi.wiki/view/NFO_files/Movies),
  [NFO files/TV shows](https://kodi.wiki/view/NFO_files/TV_shows),
  [NFO files/Episodes](https://kodi.wiki/view/NFO_files/Episodes) and
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
| Episode | `<video name>.nfo` beside the episode | K, J, P | read |

## What is in it

An XML document saved as UTF-8 (K, P). Its root is `<movie>` for a film and
`<tvshow>` for a show, and each field is a child of the root.

| Tag | What | Source | KROMA |
| --- | --- | --- | --- |
| `<title>` | The name | K, J, P | read |
| `<plot>` | The summary | K, J, P | read |
| `<premiered>` | The release date, `yyyy-mm-dd` | K, J, P | read as the release date, which gives the year; one that is no day gives its year alone |
| `<year>` | The year. K deprecated it in v17 and reads `<premiered>` alone from v20 | K, J | read when there is no `<premiered>` |
| `<genre>` | One genre a tag, repeated for each | K, J, P | read |
| `<sorttitle>` | The name the title sorts under; the name shown stays `<title>` | K, J, P | read |
| `<originaltitle>` | The title in its own language | K, J, P | read; shown under the title when the two differ |
| `<tagline>` | The tagline | K, J, P | read; shown above the summary |
| `<uniqueid type="tmdb">` | The title's TMDB id. A file may hold one `<uniqueid>` for each provider, `type` naming it | K, J, P | read, whatever the case of `type`; the title is matched to that id |
| `<tmdbid>` | The title's TMDB id, on a tag of its own | J | read when there is no `<uniqueid type="tmdb">` |
| `<uniqueid type="imdb">`, `<uniqueid type="tvdb">` | The title's id on IMDb, as `tt` and at least seven digits, or on TheTVDB | K, J, P | read, whatever the case of `type`; used when the file names no TMDB id |
| `<imdbid>`, `<tvdbid>` | The same ids, on tags of their own | J | read when there is no `<uniqueid>` of that type |
| `<id>` | K: "Do not use", a tag Kodi generates. P: the provider id when there is no `<uniqueid>` | K, P | not read |

A combination file holds the XML document followed by a link to a provider's
page (K). KROMA reads the document, and takes the TMDB id from the link when
the document names none: `themoviedb.org/movie/<id>` for a film,
`themoviedb.org/tv/<id>` for a show. It takes the IMDb id from
`imdb.com/title/<id>`, for a film or a show, the same way. A file that holds
such a link alone gives the id and no text. A link to another provider, or a
root of another kind, gives nothing.

A TMDB id in the file comes behind a match fixed by hand, an acquisition's id
and an import's identity, and before matching by the name.

A file that names no TMDB id but an IMDb or a TheTVDB one makes KROMA ask
TMDB which title that id is, the IMDb id first, as for an import's identity
that names no TMDB id. The answer is kept until the file changes. It comes
behind a TMDB id an import names and behind an import's own IMDb or TheTVDB
id, and a file TMDB knows nothing about leaves the title to be matched by its
name.

The text the file holds comes before the provider's, in every language, whether
or not the title was matched, as local metadata does in Jellyfin (J). What a
person writes with **Edit info** comes before the file.

## An episode's file

Its root is `<episodedetails>` (K). KROMA reads `<title>`, `<plot>` and
`<aired>`, the day the episode first aired as `yyyy-mm-dd`, which K gives as
the episode's own date and J writes for an episode alone. `<premiered>` in an
episode's file is the show's (K) and is not read. A `<uniqueid>` in it is passed
over: the episode is recognized through its show. Kodi up to v21 wrote a file
for several episodes as one `<episodedetails>` after another, and v22 no longer
reads one (K); KROMA reads the first.

The text comes before the provider's in every language, as a film's does. What
a person writes with **Edit info** on the episode's row comes before the file.

# Artwork kept beside the media

The picture names other media servers read from a media folder, which KROMA
follows so a library moved from one of them keeps its posters
([`docs/spec/media/README.md`](../spec/media/README.md), MEDIA-33, MEDIA-48 and
MEDIA-49).
Read 2026-11-24.

## Sources

- **J**: Jellyfin, [Movies](https://jellyfin.org/docs/general/server/media/movies/),
  the table of metadata images. Every name works alone (`logo.png`) or after the
  video's name (`movie-logo.png`).
- **P**: Plex, [Local Media Assets - Movies](https://support.plex.tv/articles/200220677-local-media-assets-movies/)
  and [Local Media Assets - TV Shows](https://support.plex.tv/articles/200220717-local-media-assets-tv-shows/).
  Plex lists `.jpg`, `.jpeg`, `.png` and `.tbn`.

## Posters

| Where | Names | Source | KROMA |
| --- | --- | --- | --- |
| A film's own folder | `poster`, `folder`, `cover`, `default`, `movie` | J, P | read |
| Beside a film's video, in any folder | `<video name>` | P | read |
| Beside a film's video, in any folder | `<video name>-poster` | J | read |
| A show's folder | `poster`, `folder`, `show` | P | read |
| A show's folder | `cover`, `default` | J | read |
| A season folder | `Season01` (P), `poster`, `folder`, `cover`, `default` (J) | J, P | not yet |
| Beside an episode's video | `<video name>` (P), `<video name>-thumb` (J) | J, P | not yet |

KROMA reads `.jpg`, `.jpeg`, `.png` and `.webp`, and compares names without
regard to case. A folder name is a season folder by the scan's own rule:
`Season 01`, `Saison 1`, `Specials`, `S01`.

## Backdrops

| Where | Names | Source | KROMA |
| --- | --- | --- | --- |
| A film's own folder | `backdrop`, `fanart`, `background`, `art` | J, P | read |
| Beside a film's video, in any folder | `<video name>-backdrop`, `-fanart`, `-background`, `-art` | J, P | read |
| A show's folder | `backdrop`, `fanart`, `background`, `art` | J, P | read |
| A season folder | `backdrop`, `fanart`, `background`, `art` | J | not yet |

## Logos

Not read yet. The names, for when they are:

| What | Names | Source |
| --- | --- | --- |
| Logo | `logo`, `clearlogo` | J, P |

They apply in a film's or a show's folder, and after the video's name beside a
film in a shared folder (`Avatar (2009)-logo.png`, J).

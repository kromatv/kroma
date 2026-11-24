# Artwork kept beside the media

The picture names other media servers read from a media folder, which KROMA
follows so a library moved from one of them keeps its posters
([`docs/spec/media/README.md`](../spec/media/README.md), MEDIA-33, MEDIA-48,
MEDIA-49, MEDIA-51, MEDIA-52 and MEDIA-53).
Read 2026-11-24.

## Sources

- **J**: Jellyfin, [Movies](https://jellyfin.org/docs/general/server/media/movies/),
  the table of metadata images. Every name works alone (`logo.png`) or after the
  video's name (`movie-logo.png`).
- **K**: Kodi, [Artwork/Season](https://kodi.wiki/view/Artwork/Season). Season
  art is kept in the show's folder as `season<num>-<arttype>`, with
  `season-specials-<arttype>` for specials and `season-all-<arttype>` for all
  seasons.
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
| A season folder | `poster`, `folder`, `cover`, `default` (J), `Season01` (P) | J, P | read |
| A show's folder | `season01-poster`, `season-specials-poster` | K | read |
| Beside an episode's video | `<video name>-thumb` (J), `<video name>` (P) | J, P | read |

KROMA reads `.jpg`, `.jpeg`, `.png` and `.webp`, and compares names without
regard to case. An episode's `-thumb` picture comes before the one named after
its video alone. A season's number is read with or without its leading zero
(`Season01`, `Season1`), and a picture in the season's folder comes before one
in the show's folder. `season-all-poster` is not read. A folder name is a season
folder by the scan's own rule: `Season 01`, `Saison 1`, `Specials`, `S01`. A
season with no picture beside its files shows the poster TMDB has for it in the
reader's language, else the show's.

## Backdrops

| Where | Names | Source | KROMA |
| --- | --- | --- | --- |
| A film's own folder | `backdrop`, `fanart`, `background`, `art` | J, P | read |
| Beside a film's video, in any folder | `<video name>-backdrop`, `-fanart`, `-background`, `-art` | J, P | read |
| A show's folder | `backdrop`, `fanart`, `background`, `art` | J, P | read |
| A season folder | `backdrop`, `fanart`, `background`, `art` | J | not yet |

## Logos

| Where | Names | Source | KROMA |
| --- | --- | --- | --- |
| A film's own folder | `logo`, `clearlogo` | J, P | read |
| Beside a film's video, in any folder | `<video name>-logo`, `<video name>-clearlogo` | J | read |
| A show's folder | `logo`, `clearlogo` | J, P | read |

A logo is cached at most 800 pixels wide, as WebP.

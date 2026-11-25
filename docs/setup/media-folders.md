# Media folders and permissions

KROMA plays your films and series from the folders where they already are. It
never copies them into a database or a volume of its own. This page explains
how to name your files so KROMA recognizes them, and what access KROMA needs
to your folders.

## Name your files

KROMA reads folder and file names to tell a film from an episode, and to find
the right poster and summary. Most downloaded or ripped files already work. If
a title is not recognized, rename it as below.

### Movies

Put each film in its own folder, named with the title and the year in
parentheses:

```
Films/
  Blade Runner 2049 (2017)/
    Blade Runner 2049 (2017).mkv
  The Matrix (1999)/
    The Matrix (1999) 1080p.mkv
```

The year in parentheses is the one KROMA trusts, so `Blade Runner 2049 (2017)`
is the film *Blade Runner 2049* from 2017. KROMA ignores quality and release
tags such as `1080p`, `BluRay` or `x265`. A flat folder of files such as
`The.Matrix.1999.1080p.mkv` also works.

### Series

Put each series in its own folder, with one folder per season:

```
Series/
  The Office (2005)/
    Season 01/
      The Office - S01E01 - Pilot.mkv
      The Office - S01E02 - Diversity Day.mkv
    Season 02/
      The Office - S02E01 - The Dundies.mkv
    Specials/
      The Office - S00E01 - Christmas Special.mkv
```

- The episode number is the part KROMA must find: `S01E02`, `S01 E02`, `s1e2`,
  `1x02`, or `S01E02-E03` for a file that holds two episodes. The text after it
  becomes the episode title.
- A folder named `Season 01`, `Saison 1` or `Specials` tells KROMA that the
  folder above it is the series. KROMA then uses that folder's name for the
  series, whatever the files inside are called.
- Without season folders, KROMA takes the series name from each file name, so
  `Breaking.Bad.S01E01.mkv` and `The.Office.S01E01.mkv` in the same folder are
  two series.
- In a library added as **Series**, every file is an episode, never a film.
  KROMA also reads `S211E06`, `Episode 259`, `Ep. 259` and a number at the
  start of the name, as in `215 - Title.mkv`. When the name gives no season,
  the episode takes the season folder's, or season 1. A file whose name holds
  no episode number at all is left out, and the server log names the first one.

### Subtitles

Put a subtitle file beside its video, with the same name plus the language:

```
The Matrix (1999).mkv
The Matrix (1999).en.srt
The Matrix (1999).fr.forced.srt
```

KROMA reads `.srt`, `.ass`, `.ssa` and `.vtt` files. Add `.forced` for forced
subtitles and `.sdh` for subtitles for the deaf and hard of hearing. A `Subs`
folder beside the video works too. Subtitles inside the video file need nothing.
The player finds a new subtitle file at once. The subtitle filter of the Films
and Series pages counts it after the next library scan.

### Posters, backdrops, logos and thumbnails

KROMA finds a poster, a backdrop and a logo on the internet for every title it
recognizes. A picture you put in the title's folder comes before them, and gives
a title KROMA does not recognize a poster instead of the plain placeholder:

```
Films/
  Summer Trip (2019)/
    Summer Trip (2019).mkv
    poster.jpg
    fanart.jpg
Series/
  School Plays/
    poster.jpg
    backdrop.jpg
    Season 01/
      poster.jpg
      School Plays - S01E01.mkv
      School Plays - S01E01-thumb.jpg
```

- For a film's poster, name the picture `poster`, `folder`, `cover`, `default`
  or `movie`, in the film's own folder. In a folder that holds several films,
  name it after the video file instead: `Summer Trip (2019).jpg` or
  `Summer Trip (2019)-poster.jpg`.
- For a film's backdrop, name it `backdrop`, `fanart`, `background` or `art`,
  or after the video file in a shared folder: `Summer Trip (2019)-fanart.jpg`.
- For a logo, the title's name drawn as a picture, name it `logo` or
  `clearlogo`, or after the video file in a shared folder:
  `Summer Trip (2019)-logo.png`.
- For a series, put the pictures in the series folder, the one above the season
  folders, with the same names, or `show` for the poster. When two series share
  one folder, neither takes the pictures in it.
- For a season's poster, name the picture `poster`, `folder`, `cover` or
  `default` in the season folder, or after the season in the series folder:
  `season01-poster.jpg`, and `season-specials-poster.jpg` for the specials. A
  season with no picture in the folders takes its poster from the internet, else
  the series poster.
- For an episode's thumbnail, name the picture after the episode's video file,
  followed by `-thumb` or alone: `School Plays - S01E01-thumb.jpg`. It shows
  even on an episode KROMA does not recognize.
- KROMA reads `.jpg`, `.jpeg`, `.png` and `.webp` pictures, and passes over one
  it cannot open.
- A backdrop or a logo shows only on a title KROMA recognizes.
- KROMA notices a picture you add, change or remove the way it notices a new
  video file. An app can take up to a day to show the change on a screen it has
  already opened.

To change one title's picture without touching its folder, open the title and
choose **Edit artwork**. A poster, a backdrop or a logo you upload there comes
before the picture in the folder and the one from the internet, and **Restore the
automatic picture** brings them back. On a series page, the **Edit thumbnail**
button of an episode does the same for that episode's thumbnail, and **Edit
season poster**, above the episodes, for the poster of the season shown. A
poster, a backdrop or a thumbnail opens first in a frame of its shape, 2:3 or
16:9: drag it, zoom or turn it, then choose **Use this picture**. A logo is sent
as it is, so its transparency stays. It takes the right to manage the library.

Instead of a file, **From a link** takes the address of an image on the
internet. KROMA fetches it once and keeps it as it is, without a frame. An
address on your own network, such as your NAS, is refused: download the image
and upload it instead.

### Titles and summaries from .nfo files

A title can take its name, year, summary and genres from an `.nfo` file, the
one Kodi, Jellyfin and Plex read:

```
Films/
  Summer Trip (2019)/
    Summer Trip (2019).mkv
    Summer Trip (2019).nfo
Series/
  School Plays/
    tvshow.nfo
    Season 01/
      School Plays - S01E01.mkv
      School Plays - S01E01.nfo
```

- For a film, name the file after the video file, or `movie.nfo` in the film's
  own folder.
- For a series, put `tvshow.nfo` in the series folder, the one above the season
  folders.
- For an episode, name the file after the episode's video file. KROMA reads its
  `<title>`, its `<plot>` and its `<aired>`, the day it was first shown. A file
  that describes several episodes gives the first.
- KROMA reads `<title>`, `<originaltitle>`, `<sorttitle>`, `<tagline>`,
  `<plot>`, `<premiered>` or `<year>`, each `<genre>`, each `<director>`,
  each `<studio>`, `<mpaa>`, the age rating, and each `<actor>` with its
  `<name>`, `<role>` and `<order>`. The file must be UTF-8, as these programs
  write it.
- An actor or a director TMDB did not give for the title gets the photo and the
  page TMDB has under that exact name, after the scan.
- An age rating such as `PG-13`, `Rated R` or `FR-12` replaces the one from
  the internet, and profiles with an age limit go by it. KROMA leaves out a
  rating it does not know.
- A file that gives the title's TMDB number, in `<uniqueid type="tmdb">` or
  `<tmdbid>`, or that ends with a link to its themoviedb.org page, makes KROMA
  recognize the title by that number instead of by its name. A match you fix
  with **Fix the match** comes before the file.
- A file that gives only the title's IMDb or TheTVDB number, in
  `<uniqueid type="imdb">`, `<uniqueid type="tvdb">`, `<imdbid>` or `<tvdbid>`,
  or that ends with a link to its imdb.com page, makes KROMA ask TMDB once which
  title the number belongs to, then recognize the title by the answer.
- The file's text shows instead of the text from the internet, even once KROMA
  recognizes the title. What you write with **Edit info** comes before the file.
- KROMA reads a file you add or change at the next library scan.

### File types

KROMA scans `.mkv`, `.mp4`, `.m4v`, `.mov`, `.webm`, `.avi` and `.ts` files.

### Shortcuts and links

KROMA follows symbolic links. A library made of links that point into another
folder scans as if the files were there, and so does a library whose folder is
itself a link. Titles are read from the link's name, not from the folder it
points to. In Docker, the folder the links point to must be mounted in the
container too, or KROMA cannot open the files.

## Choose read-only or read and write

KROMA only reads your media folders, unless you use the modules that download
and organize files for you.

| What you use | Access KROMA needs |
| --- | --- |
| Browsing and playing your files | Read |
| Subtitles and artwork | Read: KROMA keeps them in its own data folder |
| The **Acquisition** module, which downloads requested titles, moves them into your libraries and renames them | Read and write |

KROMA's own data, such as its database, posters, and downloads in progress, is
in its data folder, which always needs read and write access. Keep it apart
from your media folders.

> [!TIP]
> If you only watch what you already have, give KROMA read access to your
> media. Nothing it does can then change your files. You can grant write
> access later, when you install the Acquisition module.

## Give KROMA access to your folders

How you give access depends on how you installed KROMA:

- **Synology package**: KROMA runs as its own user, `kroma`. Grant that user
  access to each shared folder. See
  [Synology: give KROMA access to your media](synology.md#give-kroma-access-to-your-media).
- **Docker**: you mount each folder into the container, and the container's
  user must be allowed to read it, or to write it. See
  [Docker: media folders](docker.md#mount-your-media-folders).
- **QNAP, Unraid, TrueNAS**: see [Other NAS](other-nas.md).

When KROMA cannot read a folder, the scan finds nothing in it and the server
log says why. See
[Troubleshooting](troubleshooting.md#a-library-stays-empty-after-a-scan).

## Media on another computer

KROMA reads local folders only. To use films stored on another NAS or computer,
mount that share on the machine that runs KROMA first, with SMB or NFS, then add
the mounted folder as a library. On a network share:

- the scan is slower, so give it time on the first run;
- KROMA does not see new files the moment they appear, because network shares
  do not report changes. It finds them at the next periodic scan, every five
  minutes by default (see `KROMA_WATCH_INTERVAL` in the
  [configuration reference](configuration.md)), or when you select **Scan**
  under **Sources**.

## Downloads and fast imports

When the Acquisition module imports a finished download, it creates a hard
link if the download and the library are on the same disk and in the same
mount. That is instant and uses no extra space. Otherwise it copies the file,
which takes longer and needs room for both copies until the download is
removed.

In Docker, two separate mounts count as two disks even when they are on the
same NAS volume. That is fine for most people. If you want instant imports,
see [Docker: one mount for data and media](docker.md#optional-one-mount-for-data-and-media).

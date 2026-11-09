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

- The episode number is the part KROMA must find: `S01E02`, `s1e2`, `1x02`, or
  `S01E02-E03` for a file that holds two episodes. The text after it becomes
  the episode title.
- A folder named `Season 01`, `Saison 1` or `Specials` tells KROMA that the
  folder above it is the series. KROMA then uses that folder's name for the
  series, whatever the files inside are called.
- Without season folders, KROMA takes the series name from each file name, so
  `Breaking.Bad.S01E01.mkv` and `The.Office.S01E01.mkv` in the same folder are
  two series.

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

### File types

KROMA scans `.mkv`, `.mp4`, `.m4v`, `.mov`, `.webm`, `.avi` and `.ts` files.

### Shortcuts and links

KROMA follows symbolic links. A library made of links that point into another
folder scans as if the files were there. In Docker, the folder the links point
to must be mounted in the container too, or KROMA cannot open the files.

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

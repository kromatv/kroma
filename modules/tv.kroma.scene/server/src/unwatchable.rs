use serde::{Deserialize, Serialize};

use crate::{ContentFile, TorrentContent};

const DISC_DIRS: &[&str] = &["video_ts", "audio_ts", "bdmv"];
const DISC_IMAGE_EXTS: &[&str] = &["iso", "img", "nrg", "mdf", "cue", "dmg"];
const ARCHIVE_EXTS: &[&str] = &["rar", "zip", "7z", "tar", "gz", "bz2", "xz", "tgz", "arj"];
const SAMPLE: &str = "sample";
const NAME_SEPARATORS: [char; 7] = ['.', '-', '_', ' ', '[', ']', '('];

/// Why a torrent's files cannot be played while they arrive.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Unwatchable {
    DiscStructure,
    Archive,
    NoVideo,
}

/// Why `content` cannot be played before it has finished arriving, or `None`
/// when one of its files is a video a player can be pointed at on its own. A
/// file list nothing has resolved yet reads as [`Unwatchable::NoVideo`], so ask
/// once the engine has answered with one.
pub fn unwatchable(content: &TorrentContent) -> Option<Unwatchable> {
    if content.files.iter().any(plays_on_its_own) {
        return None;
    }
    if content.files.iter().any(|file| in_a_disc_tree(&file.path)) {
        return Some(Unwatchable::DiscStructure);
    }
    let Some(biggest) = content.files.iter().max_by_key(|file| file.size_bytes) else {
        return Some(Unwatchable::NoVideo);
    };
    Some(match extension(&biggest.path) {
        ext if is_one_of(ext, DISC_IMAGE_EXTS) => Unwatchable::DiscStructure,
        ext if is_one_of(ext, ARCHIVE_EXTS) || is_an_archive_part(ext) => Unwatchable::Archive,
        _ => Unwatchable::NoVideo,
    })
}

fn plays_on_its_own(file: &ContentFile) -> bool {
    file.is_video && !in_a_disc_tree(&file.path) && !is_a_sample(&file.path)
}

// Scene convention: the teaser clip sits in a `Sample` folder, or its name opens
// or closes on the word. A film whose own title merely holds it ("The Sample
// 2019") is not one, so only the first and last token count.
fn is_a_sample(path: &str) -> bool {
    let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
    let folders = &path[..path.len() - name.len()];
    if folders
        .split(['/', '\\'])
        .any(|folder| folder.eq_ignore_ascii_case(SAMPLE))
    {
        return true;
    }
    let stem = name.rsplit_once('.').map_or(name, |(stem, _)| stem);
    let tokens: Vec<&str> = stem
        .split(NAME_SEPARATORS)
        .filter(|token| !token.is_empty())
        .collect();
    [tokens.first(), tokens.last()]
        .iter()
        .flatten()
        .any(|token| token.eq_ignore_ascii_case(SAMPLE))
}

fn in_a_disc_tree(path: &str) -> bool {
    path.split(['/', '\\']).any(|segment| {
        DISC_DIRS
            .iter()
            .any(|dir| segment.eq_ignore_ascii_case(dir))
    })
}

fn extension(path: &str) -> &str {
    path.rsplit_once('.').map_or("", |(_, ext)| ext)
}

fn is_one_of(ext: &str, known: &[&str]) -> bool {
    known
        .iter()
        .any(|candidate| ext.eq_ignore_ascii_case(candidate))
}

fn is_an_archive_part(ext: &str) -> bool {
    match ext.strip_prefix(['r', 'R', 'z', 'Z']) {
        Some(part) => part.len() == 2 && part.chars().all(|c| c.is_ascii_digit()),
        None => ext.len() == 3 && ext.chars().all(|c| c.is_ascii_digit()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::classify;

    fn holding(files: &[(&str, u64)]) -> TorrentContent {
        classify(
            &files
                .iter()
                .map(|(path, size)| ((*path).to_string(), *size))
                .collect::<Vec<_>>(),
        )
    }

    #[test]
    fn a_film_beside_its_artwork_is_playable() {
        let film = holding(&[
            ("Big Buck Bunny.mp4", 104_040_028),
            ("__ia_thumb.jpg", 10_714),
        ]);

        assert_eq!(unwatchable(&film), None);
    }

    #[test]
    fn a_disc_image_is_a_disc_rather_than_a_film() {
        let disc = holding(&[
            ("BIG_BUCK_BUNNY_BD.iso", 8_474_263_552),
            ("BIG_BUCK_BUNNY_BD.md5", 55),
            ("Front.png", 128_742_971),
        ]);

        assert_eq!(unwatchable(&disc), Some(Unwatchable::DiscStructure));
    }

    #[test]
    fn a_blu_ray_folder_is_a_disc_even_though_its_streams_are_video_files() {
        let ripped = holding(&[
            ("Sintel/BDMV/STREAM/00001.m2ts", 4_000_000_000),
            ("Sintel/BDMV/index.bdmv", 200),
        ]);

        assert_eq!(unwatchable(&ripped), Some(Unwatchable::DiscStructure));
    }

    #[test]
    fn a_dvd_folder_is_a_disc() {
        let ripped = holding(&[
            ("Sintel/VIDEO_TS/VTS_01_1.VOB", 1_000_000_000),
            ("Sintel/VIDEO_TS/VIDEO_TS.IFO", 12_288),
        ]);

        assert_eq!(unwatchable(&ripped), Some(Unwatchable::DiscStructure));
    }

    #[test]
    fn a_film_sitting_beside_a_disc_image_is_still_playable() {
        let both = holding(&[
            ("dvd.iso", 687_931_392),
            ("big buck bunny 1080p h264.mp4", 119_522_469),
        ]);

        assert_eq!(unwatchable(&both), None);
    }

    #[test]
    fn a_split_archive_is_an_archive() {
        let parts = holding(&[
            ("sintel.rar", 400_000_000),
            ("sintel.r00", 399_000_000),
            ("sintel.nfo", 1_200),
        ]);

        assert_eq!(unwatchable(&parts), Some(Unwatchable::Archive));
    }

    #[test]
    fn a_numbered_archive_part_is_an_archive_too() {
        let parts = holding(&[("sintel.001", 400_000_000), ("sintel.002", 12_000_000)]);

        assert_eq!(unwatchable(&parts), Some(Unwatchable::Archive));
    }

    #[test]
    fn an_archive_whose_only_video_is_a_sample_is_still_an_archive() {
        let rarred = holding(&[
            ("Sintel.2010.1080p/Sample/sintel-sample.mkv", 24_000_000),
            ("Sintel.2010.1080p/sintel.rar", 1_400_000_000),
            ("Sintel.2010.1080p/sintel.r00", 1_399_000_000),
        ]);

        assert_eq!(unwatchable(&rarred), Some(Unwatchable::Archive));
    }

    #[test]
    fn a_sample_beside_the_film_takes_nothing_away_from_it() {
        let both = holding(&[
            ("sample.mkv", 24_000_000),
            ("Sintel.2010.1080p.WEB-DL.x264.mkv", 1_400_000_000),
        ]);

        assert_eq!(unwatchable(&both), None);
    }

    #[test]
    fn a_film_whose_own_title_holds_the_word_is_not_a_sample() {
        let film = holding(&[("The.Sample.2019.1080p.BluRay.x264.mkv", 1_400_000_000)]);

        assert_eq!(unwatchable(&film), None);
    }

    #[test]
    fn a_torrent_of_stills_holds_no_video_at_all() {
        let stills = holding(&[("cover.jpg", 400_000), ("readme.nfo", 1_200)]);

        assert_eq!(unwatchable(&stills), Some(Unwatchable::NoVideo));
    }

    #[test]
    fn a_file_list_nothing_has_resolved_yet_is_not_mistaken_for_playable() {
        let unresolved = holding(&[]);

        assert_eq!(unwatchable(&unresolved), Some(Unwatchable::NoVideo));
    }
}

//! Text subtitle files that sit beside a video rather than inside it.

mod convert;
mod decode;
mod language;
mod layout;
mod name;

use std::path::{Path, PathBuf};

pub use convert::to_vtt;
pub use layout::SUBTITLE_FOLDERS;

use layout::Release;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExternalSubtitle {
    pub path: PathBuf,
    pub language: Option<&'static str>,
    pub forced: bool,
    pub hearing_impaired: bool,
    pub codec: &'static str,
}

impl ExternalSubtitle {
    /// The track's title: the flags its name carried, in one spelling, or `None`
    /// where it carried none.
    pub fn title(&self) -> Option<String> {
        name::title_of(self.forced, self.hearing_impaired)
    }

    pub fn named_after(&self, stem: &str) -> String {
        let ext = self
            .path
            .extension()
            .and_then(std::ffi::OsStr::to_str)
            .unwrap_or("srt");
        let marks = [
            self.language,
            self.forced.then_some("forced"),
            self.hearing_impaired.then_some("sdh"),
        ];
        let tail: String = marks
            .into_iter()
            .flatten()
            .map(|mark| format!(".{mark}"))
            .collect();
        format!("{stem}{tail}.{ext}")
    }
}

/// The text subtitle files of `video` among `files`, in a stable order.
///
/// Picture subtitles (`.sub`/`.idx`, `.sup`) are absent: they are bitmaps and no
/// client renders them as text. `files` is every path the caller can see, the
/// video included; a release holding one video also lends it the loose files in
/// its `Subs/` folder, which in a season pack would belong to every episode.
pub fn beside(video: &Path, files: &[PathBuf]) -> Vec<ExternalSubtitle> {
    let holds = match files
        .iter()
        .filter(|file| crate::video::has_video_extension(file))
        .count()
    {
        0 | 1 => Release::OneVideo,
        _ => Release::Several,
    };
    let mut found: Vec<ExternalSubtitle> = files
        .iter()
        .filter_map(|file| read_as_external(video, file, holds))
        .collect();
    found.sort_by_key(|track| track.path.to_string_lossy().to_lowercase());
    found.dedup_by(|a, b| a.path == b.path);
    found
}

fn read_as_external(video: &Path, file: &Path, holds: Release) -> Option<ExternalSubtitle> {
    let codec = text_codec_of(file)?;
    let marks = name::marks_of(&layout::describing_tail(video, file, holds)?);
    Some(ExternalSubtitle {
        path: file.to_path_buf(),
        language: marks.language,
        forced: marks.forced,
        hearing_impaired: marks.hearing_impaired,
        codec,
    })
}

// A `.sub` is VobSub as often as it is MicroDVD, and neither is offered as text.
fn text_codec_of(file: &Path) -> Option<&'static str> {
    let ext = file.extension().and_then(std::ffi::OsStr::to_str)?;
    match ext.to_lowercase().as_str() {
        "srt" => Some("subrip"),
        "ass" => Some("ass"),
        "ssa" => Some("ssa"),
        "vtt" | "webvtt" => Some("webvtt"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FILM: &str = "/movies/Sintel (2010)/Sintel (2010).mkv";

    fn beside_film(names: &[&str]) -> Vec<ExternalSubtitle> {
        let files: Vec<PathBuf> = names.iter().map(PathBuf::from).collect();
        beside(Path::new(FILM), &files)
    }

    #[test]
    fn a_film_with_nothing_beside_it_has_no_external_track() {
        assert!(beside_film(&[FILM]).is_empty());
    }

    #[test]
    fn a_file_named_after_the_film_is_its_track() {
        let found = beside_film(&[FILM, "/movies/Sintel (2010)/Sintel (2010).en.srt"]);

        assert_eq!(found.len(), 1);
        assert_eq!(found[0].language, Some("en"));
        assert_eq!(found[0].codec, "subrip");
        assert!(!found[0].forced);
    }

    #[test]
    fn a_picture_subtitle_is_never_offered_as_text() {
        let found = beside_film(&[
            FILM,
            "/movies/Sintel (2010)/Sintel (2010).en.sub",
            "/movies/Sintel (2010)/Sintel (2010).en.idx",
            "/movies/Sintel (2010)/Sintel (2010).en.sup",
        ]);

        assert!(found.is_empty());
    }

    #[test]
    fn every_text_format_is_offered_under_the_codec_the_catalogue_names_it_by() {
        let found = beside_film(&[
            FILM,
            "/movies/Sintel (2010)/Sintel (2010).de.ass",
            "/movies/Sintel (2010)/Sintel (2010).es.SSA",
            "/movies/Sintel (2010)/Sintel (2010).it.vtt",
        ]);

        let codecs: Vec<&str> = found.iter().map(|track| track.codec).collect();
        assert_eq!(codecs, vec!["ass", "ssa", "webvtt"]);
    }

    #[test]
    fn a_forced_track_and_a_track_for_the_deaf_carry_what_the_name_said() {
        let found = beside_film(&[
            FILM,
            "/movies/Sintel (2010)/Sintel (2010).fr.forced.srt",
            "/movies/Sintel (2010)/Sintel (2010).en.sdh.srt",
        ]);

        let said: Vec<(Option<&str>, bool, Option<String>)> = found
            .iter()
            .map(|track| (track.language, track.forced, track.title()))
            .collect();
        assert_eq!(
            said,
            vec![
                (Some("en"), false, Some("SDH".to_string())),
                (Some("fr"), true, Some("Forced".to_string())),
            ]
        );
    }

    #[test]
    fn a_subs_folder_of_a_single_film_release_lends_it_every_loose_track() {
        let found = beside_film(&[
            FILM,
            "/movies/Sintel (2010)/Subs/2_English.srt",
            "/movies/Sintel (2010)/Subs/3_French.srt",
        ]);

        let languages: Vec<Option<&str>> = found.iter().map(|track| track.language).collect();
        assert_eq!(languages, vec![Some("en"), Some("fr")]);
    }

    #[test]
    fn a_season_pack_gives_each_episode_the_folder_named_after_it() {
        let episode = Path::new("/shows/Kaamelott/Kaamelott.S01E02.mkv");
        let files: Vec<PathBuf> = [
            "/shows/Kaamelott/Kaamelott.S01E01.mkv",
            "/shows/Kaamelott/Kaamelott.S01E02.mkv",
            "/shows/Kaamelott/Subs/Kaamelott.S01E01/2_French.srt",
            "/shows/Kaamelott/Subs/Kaamelott.S01E02/2_French.srt",
        ]
        .map(PathBuf::from)
        .to_vec();

        let found = beside(episode, &files);

        assert_eq!(found.len(), 1);
        assert_eq!(
            found[0].path,
            PathBuf::from("/shows/Kaamelott/Subs/Kaamelott.S01E02/2_French.srt")
        );
    }

    #[test]
    fn the_order_a_track_is_offered_in_does_not_depend_on_the_order_it_was_found_in() {
        let names = [
            FILM,
            "/movies/Sintel (2010)/Sintel (2010).fr.srt",
            "/movies/Sintel (2010)/Sintel (2010).en.srt",
        ];
        let reversed: Vec<&str> = names.iter().rev().copied().collect();

        let one_way = beside_film(&names);
        let other_way = beside_film(&reversed);

        assert_eq!(one_way, other_way);
        assert_eq!(one_way[0].language, Some("en"));
    }

    fn found(name: &str) -> ExternalSubtitle {
        let video = Path::new("/movies/Old Name/Old Name.mkv");
        let file = PathBuf::from(format!("/movies/Old Name/{name}"));
        beside(video, &[file]).remove(0)
    }

    #[test]
    fn a_track_keeps_its_language_under_the_videos_new_name() {
        let renamed = found("Old Name.fr.srt").named_after("The Matrix (1999) [Bluray-1080p]");

        assert_eq!(renamed, "The Matrix (1999) [Bluray-1080p].fr.srt");
    }

    #[test]
    fn a_track_keeps_every_flag_its_name_carried() {
        let renamed = found("Old Name.fr.forced.sdh.ass").named_after("The Matrix (1999)");

        assert_eq!(renamed, "The Matrix (1999).fr.forced.sdh.ass");
    }

    #[test]
    fn a_track_that_named_no_language_takes_the_stem_alone() {
        let renamed = found("Old Name.srt").named_after("The Matrix (1999)");

        assert_eq!(renamed, "The Matrix (1999).srt");
    }
}

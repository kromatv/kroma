use std::path::{Component, Path};

pub const SUBTITLE_FOLDERS: &[&str] = &["subs", "subtitles", "sub", "subtitle"];

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Release {
    OneVideo,
    Several,
}

pub(super) fn describing_tail(video: &Path, file: &Path, holds: Release) -> Option<String> {
    let stem = video.file_stem()?.to_str()?;
    let named = file.file_stem()?.to_str()?;
    let dir = video.parent().unwrap_or_else(|| Path::new(""));
    let held = file.parent().unwrap_or_else(|| Path::new(""));
    if held == dir {
        return extending(named, stem);
    }
    let inside = folded(held.strip_prefix(dir).ok()?)?;
    extending(named, stem)
        .or_else(|| inside.contains(&stem).then(|| named.to_string()))
        .or_else(|| matches!(holds, Release::OneVideo).then(|| named.to_string()))
}

fn folded(under: &Path) -> Option<Vec<&str>> {
    let parts: Vec<&str> = under
        .components()
        .filter_map(|part| match part {
            Component::Normal(name) => name.to_str(),
            _ => None,
        })
        .collect();
    let first = parts.first()?.to_lowercase();
    SUBTITLE_FOLDERS
        .contains(&first.as_str())
        .then(|| parts[1..].to_vec())
}

// A space is not a separator here: every convention that writes a track's
// language writes it after a dot, a dash or an underscore, and `Film 2` is the
// sequel rather than a track.
fn extending(named: &str, stem: &str) -> Option<String> {
    let rest = named.strip_prefix(stem)?;
    let separated = rest
        .chars()
        .next()
        .is_none_or(|c| matches!(c, '.' | '-' | '_'));
    separated.then(|| rest.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const FILM: &str = "/movies/Film (2019)/Film (2019).mkv";

    fn tail(file: &str) -> Option<String> {
        describing_tail(Path::new(FILM), Path::new(file), Release::Several)
    }

    #[test]
    fn a_file_named_after_the_film_describes_nothing_more() {
        assert_eq!(tail("/movies/Film (2019)/Film (2019).srt").unwrap(), "");
    }

    #[test]
    fn a_file_beside_the_film_is_described_by_what_follows_its_name() {
        assert_eq!(
            tail("/movies/Film (2019)/Film (2019).en.srt").unwrap(),
            ".en"
        );
        assert_eq!(
            tail("/movies/Film (2019)/Film (2019).fr.forced.srt").unwrap(),
            ".fr.forced"
        );
    }

    #[test]
    fn another_film_in_the_same_folder_keeps_its_own_subtitles() {
        assert!(tail("/movies/Film (2019)/Other Film.en.srt").is_none());
        assert!(tail("/movies/Film (2019)/Film (2019) 2.en.srt").is_none());
    }

    #[test]
    fn a_subs_folder_is_read_whatever_the_release_called_it() {
        let named = [
            "/movies/Film (2019)/Subs/Film (2019).en.srt",
            "/movies/Film (2019)/Subtitles/Film (2019).en.srt",
            "/movies/Film (2019)/subs/Film (2019).en.srt",
        ];

        assert!(named
            .iter()
            .all(|file| tail(file).as_deref() == Some(".en")));
    }

    #[test]
    fn a_subs_folder_named_after_the_film_holds_its_numbered_tracks() {
        let file = "/movies/Film (2019)/Subs/Film (2019)/2_English.srt";

        assert_eq!(tail(file).unwrap(), "2_English");
    }

    #[test]
    fn a_numbered_track_loose_in_a_subs_folder_belongs_to_the_one_film_there() {
        let file = Path::new("/movies/Film (2019)/Subs/2_English.srt");

        let shared = describing_tail(Path::new(FILM), file, Release::Several);
        let only_one = describing_tail(Path::new(FILM), file, Release::OneVideo);

        assert!(shared.is_none());
        assert_eq!(only_one.unwrap(), "2_English");
    }

    #[test]
    fn a_folder_that_is_not_the_releases_subtitle_folder_is_never_walked_into() {
        assert!(tail("/movies/Film (2019)/Extras/Film (2019).en.srt").is_none());
        assert!(tail("/movies/Other/Film (2019).en.srt").is_none());
    }
}

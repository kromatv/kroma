use serde::Serialize;

use super::{AudioStream, MediaFile, MediaItem, SubtitleTrack};

/// The languages a title can be heard and read in, across every file it has.
/// Each code appears once, lowercased, in the spelling the file wrote it in
/// (`fre`, `en`, `pt-br`): the client folds the spellings of one language
/// together. A track that names no language, or `und`, adds nothing.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct TrackLanguages {
    #[serde(rename = "audioLanguages")]
    pub audio: Vec<String>,
    #[serde(rename = "subtitleLanguages")]
    pub subtitles: Vec<String>,
}

impl TrackLanguages {
    /// Every track of every file of `item`, and the item's own mirror of its
    /// preferred file, which is all a title without a file row carries.
    pub fn of_item(item: &MediaItem) -> Self {
        let mut languages = Self::default();
        languages.hear_all(item.audio.iter().chain(&item.audio_tracks));
        languages.read_all(&item.subtitles);
        item.files.iter().for_each(|file| languages.add_file(file));
        languages
    }

    pub fn add_file(&mut self, file: &MediaFile) {
        self.hear_all(file.audio.iter().chain(&file.audio_tracks));
        self.read_all(&file.subtitles);
    }

    pub fn hear(&mut self, language: Option<&str>) {
        insert(&mut self.audio, language);
    }

    pub fn read(&mut self, language: Option<&str>) {
        insert(&mut self.subtitles, language);
    }

    fn hear_all<'a>(&mut self, tracks: impl Iterator<Item = &'a AudioStream>) {
        tracks.for_each(|track| self.hear(track.language.as_deref()));
    }

    fn read_all(&mut self, tracks: &[SubtitleTrack]) {
        tracks
            .iter()
            .for_each(|track| self.read(track.language.as_deref()));
    }
}

fn insert(codes: &mut Vec<String>, language: Option<&str>) {
    let Some(code) = language.map(|l| l.trim().to_ascii_lowercase()) else {
        return;
    };
    if code.is_empty() || code == "und" {
        return;
    }
    if let Err(at) = codes.binary_search(&code) {
        codes.insert(at, code);
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn audio(language: Option<&str>) -> AudioStream {
        serde_json::from_value(json!({ "codec": "aac", "channels": 2, "language": language }))
            .unwrap()
    }

    fn subtitle(language: &str) -> SubtitleTrack {
        serde_json::from_value(json!({ "codec": "subrip", "language": language })).unwrap()
    }

    fn file(audio_tracks: Vec<AudioStream>, subtitles: Vec<SubtitleTrack>) -> MediaFile {
        let mut file: MediaFile = serde_json::from_value(json!({
            "id": "f", "relPath": null, "container": "mkv", "durationMs": null,
            "video": null, "audio": null, "subtitles": [], "size": null, "probed": true
        }))
        .unwrap();
        file.audio_tracks = audio_tracks;
        file.subtitles = subtitles;
        file
    }

    fn movie(files: Vec<MediaFile>) -> MediaItem {
        let mut item: MediaItem = serde_json::from_value(json!({
            "id": "m1", "title": "Heat", "kind": "movie", "year": null, "durationMs": null,
            "container": "mkv", "video": null, "audio": null, "subtitles": [],
            "library": "lib", "showId": null, "showTitle": null, "season": null,
            "episode": null, "episodeEnd": null, "episodeTitle": null, "relPath": null,
            "addedAt": "t"
        }))
        .unwrap();
        item.files = files;
        item
    }

    #[test]
    fn every_track_of_every_file_counts_not_only_the_default_one() {
        let item = movie(vec![
            file(
                vec![audio(Some("eng")), audio(Some("fre"))],
                vec![subtitle("ger")],
            ),
            file(
                vec![audio(Some("ita"))],
                vec![subtitle("spa"), subtitle("ger")],
            ),
        ]);

        let languages = TrackLanguages::of_item(&item);

        assert_eq!(languages.audio, ["eng", "fre", "ita"]);
        assert_eq!(languages.subtitles, ["ger", "spa"]);
    }

    #[test]
    fn a_track_with_no_language_or_an_undetermined_one_adds_nothing() {
        let item = movie(vec![file(
            vec![audio(None), audio(Some("und")), audio(Some(" EN "))],
            vec![subtitle(""), subtitle("UND")],
        )]);

        let languages = TrackLanguages::of_item(&item);

        assert_eq!(languages.audio, ["en"]);
        assert!(languages.subtitles.is_empty());
    }

    #[test]
    fn a_file_probed_before_tracks_were_listed_still_names_its_audio() {
        let mut old = file(Vec::new(), Vec::new());
        old.audio = Some(audio(Some("jpn")));

        let languages = TrackLanguages::of_item(&movie(vec![old]));

        assert_eq!(languages.audio, ["jpn"]);
    }

    #[test]
    fn the_languages_travel_beside_the_other_fields_of_a_card() {
        let languages = TrackLanguages {
            audio: vec!["fre".into()],
            subtitles: Vec::new(),
        };

        let json = serde_json::to_value(languages).unwrap();

        assert_eq!(
            json,
            json!({ "audioLanguages": ["fre"], "subtitleLanguages": [] })
        );
    }
}

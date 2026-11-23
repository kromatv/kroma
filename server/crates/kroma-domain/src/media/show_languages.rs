use serde::Serialize;

use super::TrackLanguages;

/// The languages a show's episodes are heard and read in: every one of them,
/// which the filters list, and each episode's own, so that a filter on audio
/// and subtitles together can ask for one episode that has both. Episodes
/// with the same languages are listed once, and one that names none is left
/// out.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct ShowLanguages {
    #[serde(flatten)]
    pub all: TrackLanguages,
    #[serde(rename = "episodeLanguages")]
    pub episodes: Vec<TrackLanguages>,
}

impl ShowLanguages {
    pub fn of_episodes(episodes: impl IntoIterator<Item = TrackLanguages>) -> Self {
        let mut show = Self::default();
        episodes.into_iter().for_each(|episode| show.add(episode));
        show
    }

    fn add(&mut self, episode: TrackLanguages) {
        if episode.is_empty() || self.episodes.contains(&episode) {
            return;
        }
        self.all.add_all(&episode);
        self.episodes.push(episode);
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn episode(audio: &[&str], subtitles: &[&str]) -> TrackLanguages {
        let mut languages = TrackLanguages::default();
        audio.iter().for_each(|code| languages.hear(Some(code)));
        subtitles.iter().for_each(|code| languages.read(Some(code)));
        languages
    }

    #[test]
    fn a_show_has_every_language_of_its_episodes_and_each_episode_once() {
        let show = ShowLanguages::of_episodes([
            episode(&["jpn"], &["fre"]),
            episode(&["eng"], &[]),
            episode(&["jpn"], &["fre"]),
            episode(&[], &[]),
        ]);

        assert_eq!(show.all, episode(&["eng", "jpn"], &["fre"]));
        assert_eq!(
            show.episodes,
            [episode(&["jpn"], &["fre"]), episode(&["eng"], &[])]
        );
    }

    #[test]
    fn the_episodes_travel_beside_the_languages_of_the_whole_show() {
        let show = ShowLanguages::of_episodes([episode(&["fre"], &["eng"])]);

        let json = serde_json::to_value(show).unwrap();

        assert_eq!(
            json,
            json!({
                "audioLanguages": ["fre"],
                "subtitleLanguages": ["eng"],
                "episodeLanguages": [{ "audioLanguages": ["fre"], "subtitleLanguages": ["eng"] }]
            })
        );
    }
}

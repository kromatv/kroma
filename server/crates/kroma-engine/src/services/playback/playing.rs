//! What a live session plays: a catalogue item by its id, or a file of a watch
//! download named by the mount of the capability that serves it.

use serde::Serialize;

use crate::model::{MediaItem, WatchItem};

use super::snapshot::{snapshot, Snapshot};
use super::watch_item::accept_watch_item;

/// Serialized flat into a session, as `itemId` or as `watch`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum Playing {
    #[serde(rename = "itemId")]
    Item(String),
    #[serde(rename = "watch")]
    Watch(WatchItem),
}

impl Playing {
    /// What a client named: exactly one of a catalogue item or a watch
    /// download, the download in the shape the core holds. `None` for neither,
    /// for both, and for a download outside that shape.
    pub fn named(item_id: Option<String>, watch: Option<WatchItem>) -> Option<Playing> {
        match (item_id, watch) {
            (Some(id), None) => Some(Playing::Item(id)),
            (None, Some(watch)) => accept_watch_item(watch).map(Playing::Watch),
            _ => None,
        }
    }

    /// The catalogue item's id, `None` for a watch download.
    pub fn item_id(&self) -> Option<&str> {
        match self {
            Playing::Item(id) => Some(id),
            Playing::Watch(_) => None,
        }
    }

    pub(super) fn snapshot(&self, item: Option<&MediaItem>) -> Snapshot {
        match self {
            Playing::Item(_) => item.map(snapshot).unwrap_or_default(),
            Playing::Watch(watch) => watch_snapshot(watch),
        }
    }
}

fn watch_snapshot(watch: &WatchItem) -> Snapshot {
    let episode = watch.is_episode();
    Snapshot {
        title: watch.title.clone(),
        kind: if episode { "episode" } else { "movie" }.into(),
        show_title: episode.then(|| watch.title.clone()),
        season: watch.season,
        episode: watch.episode,
        video_label: "-".into(),
        audio_label: "-".into(),
        ..Snapshot::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn watching(season: Option<u32>, episode: Option<u32>) -> Playing {
        Playing::Watch(WatchItem {
            mount: "/api/module/tv.example.swarm".into(),
            id: "dl1".into(),
            file: 0,
            title: "Kaamelott".into(),
            poster: None,
            tmdb_id: Some(11466),
            season,
            episode,
        })
    }

    #[test]
    fn an_episode_being_watched_draws_as_the_show_it_belongs_to() {
        let playing = watching(Some(1), Some(2));

        let card = playing.snapshot(None);

        assert_eq!(card.kind, "episode");
        assert_eq!(card.show_title.as_deref(), Some("Kaamelott"));
        assert_eq!((card.season, card.episode), (Some(1), Some(2)));
    }

    #[test]
    fn a_film_being_watched_draws_as_a_film() {
        let playing = watching(None, None);

        let card = playing.snapshot(None);

        assert_eq!(card.kind, "movie");
        assert_eq!(card.title, "Kaamelott");
        assert_eq!(card.show_title, None);
    }

    #[test]
    fn a_watch_download_names_no_catalogue_item() {
        assert_eq!(watching(None, None).item_id(), None);
        assert_eq!(Playing::Item("it1".into()).item_id(), Some("it1"));
    }

    fn a_download() -> WatchItem {
        match watching(Some(1), Some(2)) {
            Playing::Watch(watch) => watch,
            Playing::Item(_) => unreachable!("the fixture names a download"),
        }
    }

    #[test]
    fn a_client_names_a_title_or_a_download() {
        assert_eq!(
            Playing::named(Some("it1".into()), None),
            Some(Playing::Item("it1".into()))
        );
        assert_eq!(
            Playing::named(None, Some(a_download())),
            Some(Playing::Watch(a_download()))
        );
    }

    #[test]
    fn a_client_naming_neither_or_both_names_nothing() {
        assert_eq!(Playing::named(None, None), None);
        assert_eq!(Playing::named(Some("it1".into()), Some(a_download())), None);
    }

    #[test]
    fn a_download_outside_the_shape_the_core_holds_names_nothing() {
        let download = WatchItem {
            mount: "../admin".into(),
            ..a_download()
        };

        assert_eq!(Playing::named(None, Some(download)), None);
    }
}

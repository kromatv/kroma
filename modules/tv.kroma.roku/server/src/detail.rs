//! One title's screen: what the channel shows for a movie, an episode or a
//! show, and the play action it offers first.

use serde_json::Value;

use crate::channel::{
    backdrop, episode_code, item_tile, join, overview, show_tile, str, stream_format, Detail, Play,
};

pub fn play_for(item: &Value, resume_ms: i64) -> Play {
    let id = str(item, "id");
    let tile = item_tile(item, 0.0);
    Play {
        url: format!("/api/items/{id}/stream"),
        item_id: id,
        format: stream_format(&str(item, "container")).into(),
        title: join([&tile.title, &tile.subtitle]),
        resume_ms,
    }
}

pub fn item_detail(item: &Value, resume_ms: i64) -> Detail {
    let tile = item_tile(item, 0.0);
    Detail {
        overview: overview(item),
        backdrop: backdrop(item),
        play: Some(play_for(item, resume_ms)),
        episodes: Vec::new(),
        id: tile.id,
        kind: tile.kind,
        title: tile.title,
        subtitle: tile.subtitle,
        poster: tile.poster,
    }
}

pub fn show_detail(show_detail: &Value, up_next: &Value, resume_ms: i64) -> Detail {
    let show = show_detail.get("show").cloned().unwrap_or(Value::Null);
    let tile = show_tile(&show);
    let episodes = show_detail
        .get("seasons")
        .and_then(Value::as_array)
        .map(|seasons| {
            seasons
                .iter()
                .flat_map(|s| {
                    s.get("episodes")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                })
                .map(|e| {
                    let mut t = item_tile(e, 0.0);
                    t.title = join([&episode_code(e), &str(e, "episodeTitle")]);
                    t.subtitle = String::new();
                    t
                })
                .collect()
        })
        .unwrap_or_default();
    Detail {
        overview: overview(&show),
        backdrop: backdrop(&show),
        play: up_next.get("item").map(|i| play_for(i, resume_ms)),
        episodes,
        id: tile.id,
        kind: tile.kind,
        title: tile.title,
        subtitle: tile.subtitle,
        poster: tile.poster,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn movie() -> Value {
        json!({
            "id": "m1", "kind": "movie", "title": "Dune", "year": 2021,
            "container": "mov,mp4,m4a,3gp,3g2,mj2",
            "metadata": { "overview": "Spice.", "backdropUrl": "https://img/dune.jpg" }
        })
    }

    fn episode() -> Value {
        json!({
            "id": "e3", "kind": "episode", "title": "Chapter 3", "showId": "s1",
            "showTitle": "Andor", "season": 1, "episode": 3, "episodeTitle": "Reckoning",
            "container": "matroska,webm"
        })
    }

    #[test]
    fn a_movie_detail_plays_itself_from_where_it_was_left() {
        let detail = item_detail(&movie(), 90000);

        let play = detail.play.unwrap();
        assert_eq!(play.url, "/api/items/m1/stream");
        assert_eq!(play.format, "mp4");
        assert_eq!(play.resume_ms, 90000);
        assert_eq!(play.title, "Dune · 2021");
        assert_eq!(detail.overview, "Spice.");
        assert_eq!(detail.backdrop, "https://img/dune.jpg");
        assert!(detail.episodes.is_empty());
    }

    #[test]
    fn a_show_detail_lists_every_episode_and_plays_what_comes_next() {
        let show = json!({
            "show": { "id": "s1", "title": "Andor", "year": 2022, "episodeCount": 1, "metadata": { "overview": "Rebels." } },
            "seasons": [{ "number": 1, "episodes": [episode()] }]
        });
        let up_next = json!({ "item": episode(), "resume": true });

        let detail = show_detail(&show, &up_next, 1000);

        assert_eq!(detail.kind, "show");
        assert_eq!(detail.episodes[0].title, "S1 E3 · Reckoning");
        assert_eq!(detail.episodes[0].id, "e3");
        let play = detail.play.unwrap();
        assert_eq!(play.format, "mkv");
        assert_eq!(play.item_id, "e3");
        assert_eq!(play.resume_ms, 1000);
    }

    #[test]
    fn a_show_nothing_was_watched_from_has_no_play_action_yet() {
        let show = json!({ "show": { "id": "s1", "title": "Andor" }, "seasons": [] });

        assert_eq!(show_detail(&show, &Value::Null, 0).play, None);
    }

    #[test]
    fn the_wire_shape_the_channel_reads_is_camel_cased() {
        let play = serde_json::to_value(play_for(&movie(), 5)).unwrap();

        assert_eq!(
            play,
            json!({ "itemId": "m1", "url": "/api/items/m1/stream", "format": "mp4", "title": "Dune · 2021", "resumeMs": 5 })
        );
    }
}

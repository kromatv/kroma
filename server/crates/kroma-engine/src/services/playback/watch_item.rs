//! The shape a watch item must have before the core holds it or hands it on.
//! The core reads none of it: these are only the bounds on what it keeps.

use kroma_primitives::clean_label;

use crate::model::WatchItem;

const MAX_MOUNT: usize = 256;
const MAX_ID: usize = 128;
const MAX_TITLE: usize = 256;
const MAX_POSTER: usize = 1024;

/// `item` with its title cleaned for display and a zero TMDB id dropped, or
/// `None` when a field is outside the shape a mount, a download id or a poster
/// address can have.
pub fn accept_watch_item(item: WatchItem) -> Option<WatchItem> {
    let title = clean_label(&item.title, MAX_TITLE);
    let shaped = mount_shaped(&item.mount)
        && id_shaped(&item.id)
        && !title.is_empty()
        && item.poster.as_deref().is_none_or(poster_shaped);
    shaped.then(|| WatchItem {
        title,
        tmdb_id: item.tmdb_id.filter(|id| *id > 0),
        ..item
    })
}

fn segment_shaped(segment: &str) -> bool {
    !matches!(segment, "" | "." | "..")
        && segment
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~'))
}

fn mount_shaped(mount: &str) -> bool {
    mount.len() <= MAX_MOUNT
        && mount
            .strip_prefix('/')
            .is_some_and(|path| path.split('/').all(segment_shaped))
}

fn id_shaped(id: &str) -> bool {
    id.len() <= MAX_ID && segment_shaped(id)
}

fn poster_shaped(poster: &str) -> bool {
    poster.len() <= MAX_POSTER
        && ["https://", "http://", "/"]
            .iter()
            .any(|scheme| poster.starts_with(scheme))
        && !poster.chars().any(|c| c.is_control() || c.is_whitespace())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn episode_two() -> WatchItem {
        WatchItem {
            mount: "/api/module/tv.example.swarm".into(),
            id: "f13348a88094f2e1".into(),
            file: 1,
            title: "Kaamelott".into(),
            poster: Some("https://image.tmdb.org/t/p/w500/k.jpg".into()),
            tmdb_id: Some(11466),
            season: Some(1),
            episode: Some(2),
        }
    }

    #[test]
    fn keeps_a_watch_item_in_the_shape_a_capability_answers() {
        let item = episode_two();

        assert_eq!(accept_watch_item(item.clone()), Some(item));
    }

    #[test]
    fn cleans_control_characters_out_of_the_title() {
        let item = WatchItem {
            title: "Kaa\nmelott\u{7}".into(),
            ..episode_two()
        };

        let kept = accept_watch_item(item).map(|kept| kept.title);

        assert_eq!(kept.as_deref(), Some("Kaamelott"));
    }

    #[test]
    fn refuses_a_title_that_is_empty_once_cleaned() {
        let item = WatchItem {
            title: " \t\n".into(),
            ..episode_two()
        };

        assert_eq!(accept_watch_item(item), None);
    }

    #[test]
    fn refuses_a_mount_that_is_not_a_plain_absolute_path() {
        for mount in [
            "api/module/x",
            "/api/../admin",
            "/api//module",
            "/api/module/x?y=1",
            "https://elsewhere.example/api",
        ] {
            let item = WatchItem {
                mount: mount.into(),
                ..episode_two()
            };

            assert_eq!(accept_watch_item(item), None, "{mount}");
        }
    }

    #[test]
    fn refuses_a_download_id_that_is_not_one_path_segment() {
        for id in ["", "..", "a/b", "a b", &"x".repeat(MAX_ID + 1)] {
            let item = WatchItem {
                id: id.into(),
                ..episode_two()
            };

            assert_eq!(accept_watch_item(item), None, "{id}");
        }
    }

    #[test]
    fn refuses_a_poster_that_is_not_an_address() {
        for poster in [
            "javascript:alert(1)",
            "https://a b",
            "data:image/png;base64,AA",
        ] {
            let item = WatchItem {
                poster: Some(poster.into()),
                ..episode_two()
            };

            assert_eq!(accept_watch_item(item), None, "{poster}");
        }
    }

    #[test]
    fn forgets_a_tmdb_id_of_zero() {
        let item = WatchItem {
            tmdb_id: Some(0),
            ..episode_two()
        };

        let kept = accept_watch_item(item).map(|kept| kept.tmdb_id);

        assert_eq!(kept, Some(None));
    }
}

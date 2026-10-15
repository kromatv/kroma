use kroma_scene::{Profile, Res, Target};

use crate::peers::indexers::{IndexerRef, Query, Release};
use crate::search::targets::SearchTarget;

pub(crate) fn indexer(priority: i32) -> IndexerRef {
    IndexerRef {
        id: "idx1".into(),
        name: "Tracker".into(),
        kind: "torznab".into(),
        enabled: true,
        priority,
    }
}

pub(crate) fn profile() -> Profile {
    Profile {
        resolution: Res::R1080,
        prefer_hevc: true,
        min_seeders: 1,
        max_size_bytes_movie: 20 * 1_073_741_824,
        max_size_bytes_episode: 5 * 1_073_741_824,
        required_keywords: Vec::new(),
        forbidden_keywords: Vec::new(),
    }
}

pub(crate) fn episode_target() -> SearchTarget {
    SearchTarget {
        query: Query::Episode {
            tmdb_id: Some(42),
            title: "Show".into(),
            season: 1,
            episode: 1,
        },
        target: Target::Episode {
            season: 1,
            episode: 1,
        },
        kind: "episode",
        season: Some(1),
        episodes: Some(vec![1]),
    }
}

pub(crate) fn release(title: &str, seeders: Option<u32>) -> Release {
    Release {
        title: title.into(),
        guid: "g1".into(),
        magnet: Some("magnet:?xt=1".into()),
        size_bytes: Some(1_073_741_824),
        seeders,
        leechers: Some(2),
        published_at: Some("2024-01-01".into()),
        details_url: Some("https://t/1".into()),
        ..Default::default()
    }
}

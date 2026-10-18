use kroma_scene::{
    default_formats, default_sizes, FormatSet, LegacySettings, QualityProfile, Res, Rules, Sizes,
    Target,
};

use crate::peers::indexers::{IndexerRef, Query, Release};
use crate::search::judge::Judge;
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

pub(crate) fn legacy() -> LegacySettings {
    LegacySettings {
        resolution: Res::R1080,
        prefer_hevc: true,
        min_seeders: 1,
        max_gb_movie: 20,
        max_gb_episode: 5,
        required_keywords: Vec::new(),
        forbidden_keywords: Vec::new(),
    }
}

/// The rules a fresh server starts with, owned so a test can lend a judge.
pub(crate) struct TestRules {
    pub(crate) profile: QualityProfile,
    pub(crate) formats: FormatSet,
    pub(crate) sizes: Sizes,
}

impl TestRules {
    pub(crate) fn new() -> Self {
        Self {
            profile: QualityProfile::from_legacy("standard", "Standard", &legacy()),
            formats: FormatSet::compile(&default_formats()).unwrap(),
            sizes: default_sizes(&legacy()),
        }
    }

    pub(crate) fn judge(&self) -> Judge<'_> {
        Judge {
            rules: Rules {
                profile: &self.profile,
                formats: &self.formats,
                sizes: &self.sizes,
            },
            original: None,
            runtime_minutes: None,
        }
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

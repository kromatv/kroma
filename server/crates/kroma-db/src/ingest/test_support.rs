use crate::testing::TempPool;
use kroma_domain::{
    CastMember, Kind, Library, LibraryKind, MediaFile, MediaItem, Metadata, VideoStream,
};
use std::collections::HashMap;

pub(super) fn pool() -> TempPool {
    crate::testing::temp_pool("ingest")
}

pub(super) fn video() -> VideoStream {
    VideoStream { codec: "hevc".into(), width: Some(3840), height: Some(2160), hdr: false, bit_depth: Some(10) }
}

pub(super) fn lib(id: &str) -> Library {
    Library { id: id.into(), name: "L".into(), kind: LibraryKind::Movies, path: "/x".into(), item_count: 0 }
}

pub(super) fn file(id: &str, abs: &str, probed: bool) -> MediaFile {
    MediaFile {
        id: id.into(),
        rel_path: Some(format!("{id}.mkv")),
        container: "mkv".into(),
        duration_ms: if probed { Some(7_200_000) } else { None },
        video: if probed { Some(video()) } else { None },
        audio: None,
        audio_tracks: Vec::new(),
        subtitles: Vec::new(),
        size: Some(1000),
        edition: None,
        probed,
        abs_path: Some(abs.into()),
    }
}

pub(super) fn movie(id: &str, title: &str, library: &str, files: Vec<MediaFile>) -> MediaItem {
    MediaItem {
        id: id.into(),
        title: title.into(),
        kind: Kind::Movie,
        year: Some(2021),
        duration_ms: None,
        container: String::new(),
        video: None,
        audio: None,
        audio_tracks: Vec::new(),
        subtitles: Vec::new(),
        library: library.into(),
        show_id: None,
        show_title: None,
        season: None,
        episode: None,
        episode_end: None,
        episode_title: None,
        rel_path: None,
        added_at: "t".into(),
        metadata: None,
        abs_path: None,
        files,
        default_file_id: None,
        markers: Vec::new(),
        audio_analysis: None,
    }
}

pub(super) fn mtimes_of(items: &[MediaItem], mtime: i64) -> HashMap<String, Option<i64>> {
    items
        .iter()
        .flat_map(|i| i.files.iter())
        .map(|f| (f.id.clone(), Some(mtime)))
        .collect()
}

pub(super) fn meta(tmdb: u64, title: &str) -> Metadata {
    Metadata {
        provider: "tmdb",
        tmdb_id: tmdb,
        imdb_id: Some("tt1".into()),
        title: Some(title.into()),
        tagline: None,
        overview: Some("an overview".into()),
        release_date: Some("2021-01-01".into()),
        genres: vec!["Science Fiction".into()],
        rating: Some(8.0),
        poster_url: Some("/api/images/p.webp".into()),
        backdrop_url: None,
        logo_url: None,
        theme_url: None,
        cast: vec![CastMember { name: "Timothee".into(), character: Some("Paul".into()), profile_url: None }],
        crew: vec![],
        keywords: vec![],
        tvdb_id: None,
        tmdb_url: "https://tmdb/1".into(),
    }
}

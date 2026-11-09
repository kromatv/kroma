use rusqlite::params;

use super::*;
use crate::testing::{temp_pool, TempPool};
use crate::{list_movies, list_shows};

const ENRICHED: &str = r#"{"tmdbId":1,"tmdbUrl":"x","genres":[],"title":"T","overview":"A heist.","backdropUrl":"/b.webp","rating":7}"#;
const NO_ART: &str =
    r#"{"tmdbId":2,"tmdbUrl":"x","genres":[],"title":"T","overview":"A heist.","rating":6.4}"#;
const NO_SYNOPSIS: &str =
    r#"{"tmdbId":3,"tmdbUrl":"x","genres":[],"title":"T","overview":"","backdropUrl":"/b.webp"}"#;

struct File<'a> {
    id: &'a str,
    probed: bool,
    unreadable: bool,
    codec: Option<&'a str>,
    width: Option<u32>,
    hdr: bool,
}

const fn opened(id: &str, width: u32, hdr: bool) -> File<'_> {
    File {
        id,
        probed: true,
        unreadable: false,
        codec: Some("hevc"),
        width: Some(width),
        hdr,
    }
}

fn catalogue() -> TempPool {
    let pool = temp_pool("hero-candidates");
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','mixed','/x','t')",
            [],
        )
        .unwrap();
    pool
}

fn movie(pool: &Pool, id: &str, metadata: Option<&str>, files: &[File]) {
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO items (id,kind,title,container,library,added_at,metadata) \
         VALUES (?1,'movie','T','mkv','lib','2026-11-01T00:00:00Z',?2)",
        params![id, metadata],
    )
    .unwrap();
    for f in files {
        file(&conn, id, f);
    }
}

fn show(pool: &Pool, id: &str, metadata: Option<&str>, episodes: &[File]) {
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO shows (id,library,title,added_at,metadata) VALUES (?1,'lib','S','2026-10-01T00:00:00Z',?2)",
        params![id, metadata],
    )
    .unwrap();
    for (n, f) in episodes.iter().enumerate() {
        let episode = format!("{id}-e{n}");
        conn.execute(
            "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
             VALUES (?1,'episode','E','mkv','lib',?2,1,?3,'t')",
            params![episode, id, n as i64 + 1],
        )
        .unwrap();
        file(&conn, &episode, f);
    }
}

fn file(conn: &rusqlite::Connection, item: &str, f: &File) {
    conn.execute(
        "INSERT INTO files (id,item_id,abs_path,probed,unreadable,v_codec,v_width,v_hdr) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![
            f.id,
            item,
            format!("/m/{}", f.id),
            f.probed,
            f.unreadable.then_some("moov atom not found"),
            f.codec,
            f.width,
            f.hdr
        ],
    )
    .unwrap();
}

fn scored_like_a_hydrated_movie(pool: &Pool) -> Vec<HeroCandidate> {
    let mut out: Vec<HeroCandidate> = list_movies(pool, None)
        .unwrap()
        .into_iter()
        .map(|m| facts(m.id, m.added_at, m.metadata, m.video))
        .collect();
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

fn scored_like_a_hydrated_show(pool: &Pool) -> Vec<HeroCandidate> {
    let mut out: Vec<HeroCandidate> = list_shows(pool, None)
        .unwrap()
        .into_iter()
        .map(|s| facts(s.id, s.added_at, s.metadata, s.video))
        .collect();
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

fn facts(
    id: String,
    added_at: String,
    metadata: Option<kroma_domain::Metadata>,
    video: Option<kroma_domain::VideoStream>,
) -> HeroCandidate {
    HeroCandidate {
        id,
        added_at,
        has_backdrop: metadata.as_ref().is_some_and(|m| m.backdrop_url.is_some()),
        has_overview: metadata
            .as_ref()
            .and_then(|m| m.overview.as_deref())
            .is_some_and(|o| !o.is_empty()),
        rating: metadata.and_then(|m| m.rating),
        width: video.as_ref().and_then(|v| v.width).unwrap_or(0),
        hdr: video.is_some_and(|v| v.hdr),
    }
}

fn sorted(mut candidates: Vec<HeroCandidate>) -> Vec<HeroCandidate> {
    candidates.sort_by(|a, b| a.id.cmp(&b.id));
    candidates
}

#[test]
fn a_movie_reads_as_the_title_its_hydration_would_score() {
    let pool = catalogue();
    movie(
        &pool,
        "uhd",
        Some(ENRICHED),
        &[opened("a", 1920, false), opened("b", 3840, true)],
    );
    movie(
        &pool,
        "hdr-first",
        Some(NO_ART),
        &[opened("c", 3840, false), opened("d", 3840, true)],
    );
    movie(
        &pool,
        "plain",
        Some(NO_SYNOPSIS),
        &[opened("e", 1280, false)],
    );
    movie(&pool, "bare", None, &[]);
    movie(
        &pool,
        "not-json",
        Some("{not json"),
        &[opened("f", 3840, true)],
    );
    movie(
        &pool,
        "unprobed",
        Some(ENRICHED),
        &[File {
            probed: false,
            codec: None,
            width: None,
            ..opened("g", 0, false)
        }],
    );
    movie(
        &pool,
        "broken-4k",
        Some(ENRICHED),
        &[
            File {
                unreadable: true,
                ..opened("h", 3840, true)
            },
            File {
                probed: false,
                codec: None,
                width: None,
                ..opened("i", 0, false)
            },
        ],
    );
    movie(
        &pool,
        "only-broken",
        Some(ENRICHED),
        &[File {
            unreadable: true,
            ..opened("j", 3840, true)
        }],
    );
    movie(
        &pool,
        "audio-only",
        Some(ENRICHED),
        &[
            File {
                codec: None,
                ..opened("k", 3840, true)
            },
            opened("l", 720, false),
        ],
    );

    let candidates = sorted(hero_movie_candidates(&pool).unwrap());

    assert_eq!(candidates, scored_like_a_hydrated_movie(&pool));
}

#[test]
fn a_show_reads_as_its_widest_probed_episode() {
    let pool = catalogue();
    show(
        &pool,
        "uhd",
        Some(ENRICHED),
        &[opened("a", 1920, false), opened("b", 3840, true)],
    );
    show(
        &pool,
        "unprobed",
        Some(NO_ART),
        &[File {
            probed: false,
            ..opened("c", 3840, true)
        }],
    );
    show(&pool, "empty", None, &[]);

    let candidates = sorted(hero_show_candidates(&pool).unwrap());

    assert_eq!(candidates, scored_like_a_hydrated_show(&pool));
}

#[test]
fn an_episode_is_never_a_hero_candidate() {
    let pool = catalogue();
    show(&pool, "s", Some(ENRICHED), &[opened("a", 1920, false)]);

    let movies = hero_movie_candidates(&pool).unwrap();

    assert!(movies.is_empty());
}

#[test]
fn a_rating_that_is_not_a_number_reads_as_unrated() {
    let pool = catalogue();
    movie(
        &pool,
        "odd",
        Some(r#"{"tmdbId":1,"tmdbUrl":"x","genres":[],"rating":"high"}"#),
        &[],
    );

    let candidates = hero_movie_candidates(&pool).unwrap();

    assert_eq!(candidates[0].rating, None);
}

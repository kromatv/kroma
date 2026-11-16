use std::sync::atomic::{AtomicU64, Ordering};

use crate::model::Section;
use crate::state::SharedState;
use crate::test_support::{self, now_secs};

static TMDB: AtomicU64 = AtomicU64::new(1000);

pub(super) struct Film<'a> {
    pub(super) id: &'a str,
    pub(super) genres: &'a [u32],
    pub(super) overview: &'a str,
    pub(super) director: &'a str,
    pub(super) days_old: i64,
    pub(super) tmdb: Option<u64>,
}

pub(super) fn film<'a>(id: &'a str, genres: &'a [u32]) -> Film<'a> {
    Film {
        id,
        genres,
        overview: "A story.",
        director: "",
        days_old: 400,
        tmdb: None,
    }
}

pub(super) fn stamp(days_old: i64) -> String {
    let at = time::OffsetDateTime::from_unix_timestamp(now_secs() - days_old * 86_400).unwrap();
    at.format(&time::format_description::well_known::Rfc3339).unwrap()
}

pub(super) fn seed(state: &SharedState, film: Film) {
    test_support::seed_library(state, "lib-movies", "movies");
    let crew = if film.director.is_empty() {
        serde_json::json!([])
    } else {
        serde_json::json!([{ "name": film.director, "job": "Director" }])
    };
    let meta = serde_json::json!({
        "tmdbId": film.tmdb.unwrap_or_else(|| TMDB.fetch_add(1, Ordering::Relaxed)),
        "tmdbUrl": "x",
        "title": film.id,
        "overview": film.overview,
        "backdropUrl": "/b.webp",
        "rating": 7.0,
        "genres": [],
        "tmdbGenreIds": film.genres,
        "crew": crew,
    });
    state
        .db
        .get()
        .unwrap()
        .execute(
            &format!(
                "INSERT INTO items (id,kind,title,year,duration_ms,container,library,added_at,metadata) \
                 VALUES ('{id}','movie','{id}',2015,6000000,'mkv','lib-movies','{added}',json('{meta}'))",
                id = film.id,
                added = stamp(film.days_old),
                meta = meta.to_string().replace('\'', "''"),
            ),
            [],
        )
        .unwrap();
}

pub(super) fn seed_many(state: &SharedState, prefix: &str, n: usize, genres: &[u32]) -> Vec<String> {
    (0..n)
        .map(|i| {
            let id = format!("{prefix}{i}");
            seed(state, film(&id, genres));
            id
        })
        .collect()
}

pub(super) fn viewer(state: &SharedState, name: &str) -> String {
    crate::db::create_user(&state.db, &format!("{name}@t.dev"), name, "h", &[])
        .unwrap()
        .id
}

pub(super) fn finish(state: &SharedState, user: &str, id: &str) {
    crate::db::mark_watched(&state.db, user, id).unwrap();
    test_support::seed_play(state, user, id, now_secs() - 3_600);
}

pub(super) fn row<'a>(sections: &'a [Section], id: &str) -> Option<&'a Section> {
    sections.iter().find(|s| s.id == id)
}

pub(super) fn ids_of(section: &Section) -> Vec<&str> {
    section.items.iter().map(|i| i.id()).collect()
}

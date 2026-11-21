//! What a movie or a show is ranked on, read for the whole catalogue at once:
//! no title is hydrated (no files, tracks or art) to be scored.

use anyhow::Result;
use serde::Deserialize;

use crate::media::present_show;
use crate::Pool;

/// One movie or show as the recommender sees it.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct TitleFacts {
    pub id: String,
    pub show: bool,
    pub library: String,
    pub tmdb_id: Option<u64>,
    pub year: Option<u32>,
    pub runtime_ms: Option<i64>,
    /// Unix seconds, `0` when the stamp cannot be read.
    pub added_at: i64,
    /// Provider genre ids, aligned with `genre_names` when both are stored.
    pub genre_ids: Vec<u32>,
    pub genre_names: Vec<String>,
    /// In billing order.
    pub cast: Vec<String>,
    pub directors: Vec<String>,
    pub rating: Option<f32>,
    pub has_backdrop: bool,
    pub has_overview: bool,
    /// Episodes on disk, `0` for a movie.
    pub episodes: u32,
}

const MAX_CAST: usize = 8;
const MAX_DIRECTORS: usize = 3;

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct Slim {
    tmdb_id: u64,
    genres: Vec<String>,
    tmdb_genre_ids: Vec<u32>,
    rating: Option<f32>,
    backdrop_url: Option<String>,
    overview: Option<String>,
    cast: Vec<Named>,
    crew: Vec<Crew>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Named {
    name: String,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Crew {
    name: String,
    job: String,
}

const MOVIES: &str = "SELECT id, year, duration_ms, \
       CAST(strftime('%s', added_at) AS INTEGER), library, metadata, 0 \
     FROM items WHERE kind != 'episode' AND absent_since IS NULL";

const SHOWS: &str = concat!(
    "SELECT s.id, s.year, NULL, \
       CAST(strftime('%s', s.added_at) AS INTEGER), s.library, s.metadata, \
       (SELECT COUNT(*) FROM items i WHERE i.show_id = s.id AND i.absent_since IS NULL) \
     FROM shows s WHERE ",
    present_show!()
);

/// Every movie and loose video, then every show. Never an episode.
pub fn title_facts(pool: &Pool) -> Result<Vec<TitleFacts>> {
    let conn = pool.get()?;
    let mut out = Vec::new();
    for (sql, show) in [(MOVIES, false), (SHOWS, true)] {
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map([], |r| {
            let blob: Option<String> = r.get(5)?;
            let slim: Slim = blob
                .as_deref()
                .and_then(|json| serde_json::from_str(json).ok())
                .unwrap_or_default();
            Ok(facts(
                Row {
                    id: r.get(0)?,
                    show,
                    year: r.get(1)?,
                    runtime_ms: r.get(2)?,
                    added_at: r.get::<_, Option<i64>>(3)?.unwrap_or(0),
                    library: r.get(4)?,
                    episodes: r.get(6)?,
                },
                slim,
            ))
        })?;
        for row in rows {
            out.push(row?);
        }
    }
    Ok(out)
}

struct Row {
    id: String,
    show: bool,
    year: Option<u32>,
    runtime_ms: Option<i64>,
    added_at: i64,
    library: String,
    episodes: u32,
}

fn facts(row: Row, slim: Slim) -> TitleFacts {
    let directing = |job: &str| matches!(job, "Director" | "Creator");
    TitleFacts {
        id: row.id,
        show: row.show,
        library: row.library,
        tmdb_id: (slim.tmdb_id != 0).then_some(slim.tmdb_id),
        year: row.year,
        runtime_ms: row.runtime_ms,
        added_at: row.added_at.max(0),
        genre_ids: slim.tmdb_genre_ids,
        genre_names: slim.genres,
        cast: slim
            .cast
            .into_iter()
            .map(|member| member.name)
            .filter(|name| !name.trim().is_empty())
            .take(MAX_CAST)
            .collect(),
        directors: slim
            .crew
            .into_iter()
            .filter(|member| directing(&member.job) && !member.name.trim().is_empty())
            .map(|member| member.name)
            .take(MAX_DIRECTORS)
            .collect(),
        rating: slim.rating.filter(|r| *r > 0.0),
        has_backdrop: slim.backdrop_url.is_some(),
        has_overview: slim.overview.is_some_and(|o| !o.trim().is_empty()),
        episodes: row.episodes,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::home::test_support::seeded;
    use rusqlite::params;

    fn by_id(pool: &Pool, id: &str) -> TitleFacts {
        title_facts(pool)
            .unwrap()
            .into_iter()
            .find(|t| t.id == id)
            .unwrap()
    }

    #[test]
    fn a_movie_reads_its_genres_people_and_stamps() {
        let pool = seeded();
        pool.get()
            .unwrap()
            .execute(
                "INSERT INTO items (id,kind,title,year,duration_ms,container,library,added_at,metadata) \
                 VALUES ('heat','movie','Heat',1995,10200000,'mkv','lib','2026-01-02T00:00:00Z',?1)",
                params![serde_json::json!({
                    "tmdbId": 949, "tmdbUrl": "x", "rating": 8.3, "overview": "A crew.",
                    "backdropUrl": "/b.webp", "genres": ["Crime", "Drama"], "tmdbGenreIds": [80, 18],
                    "cast": [{ "name": "Al Pacino" }, { "name": "Robert De Niro" }],
                    "crew": [{ "name": "Michael Mann", "job": "Director" }, { "name": "Dante Spinotti", "job": "Director of Photography" }]
                })
                .to_string()],
            )
            .unwrap();

        let heat = by_id(&pool, "heat");

        assert!(!heat.show);
        assert_eq!(heat.tmdb_id, Some(949));
        assert_eq!(heat.genre_ids, [80, 18]);
        assert_eq!(heat.cast, ["Al Pacino", "Robert De Niro"]);
        assert_eq!(heat.directors, ["Michael Mann"]);
        assert_eq!(heat.rating, Some(8.3));
        assert_eq!(heat.runtime_ms, Some(10_200_000));
        assert!(heat.has_backdrop && heat.has_overview);
        assert_eq!(heat.added_at, 1_767_312_000);
    }

    #[test]
    fn a_show_counts_its_episodes_and_an_episode_is_never_a_title() {
        let pool = seeded();

        let all = title_facts(&pool).unwrap();
        let show = all.iter().find(|t| t.id == "sh1").unwrap();

        assert!(show.show);
        assert_eq!(show.episodes, 1);
        assert_eq!(show.genre_names, ["Horror"]);
        assert!(all.iter().all(|t| t.id != "e1"));
    }

    #[test]
    fn a_title_nothing_enriched_reads_as_bare_facts() {
        let pool = seeded();

        let bare = by_id(&pool, "nogen");

        assert_eq!(bare.tmdb_id, None);
        assert!(bare.genre_names.is_empty() && bare.cast.is_empty());
        assert!(!bare.has_backdrop && !bare.has_overview);
        assert_eq!(bare.rating, None);
    }
}

use crate::testing::TempPool;
use rusqlite::params;

// A fresh temp-file DB seeded with a small movies+shows catalog.
pub(super) fn seeded_pool() -> TempPool {
    let pool = crate::testing::temp_pool("catq");
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movie','/x','t')",
        [],
    )
    .unwrap();

    let meta = |genres: &[&str], rating: f64, director: &str, actor: &str| {
        serde_json::json!({
            "tmdbId": 1, "tmdbUrl": "x",
            "genres": genres,
            "rating": rating,
            "overview": "a film about things",
            "crew": [{"name": director, "job": "Director"}],
            "cast": [{"name": actor}],
        })
        .to_string()
    };
    let movie = |id: &str, title: &str, year: i64, m: String| {
        conn.execute(
            "INSERT INTO items (id,kind,title,year,container,library,added_at,metadata) \
             VALUES (?1,'movie',?2,?3,'mkv','lib','t',?4)",
            params![id, title, year, m],
        )
        .unwrap();
    };
    movie("m1", "Dune", 2021, meta(&["Science Fiction"], 8.0, "Denis Villeneuve", "Timothée Chalamet"));
    movie("m2", "Sicario", 2015, meta(&["Thriller", "Crime"], 7.6, "Denis Villeneuve", "Emily Blunt"));
    movie("m3", "The Shining", 1980, meta(&["Horror"], 8.4, "Stanley Kubrick", "Jack Nicholson"));
    movie("m4", "Hereditary", 2018, meta(&["Horror"], 7.3, "Ari Aster", "Toni Collette"));
    movie("m5", "Old Unrated", 1990, "{\"tmdbId\":2,\"tmdbUrl\":\"x\",\"genres\":[\"Drama\"]}".to_string());

    // A show + an episode (the episode must be excluded from the catalog).
    conn.execute(
        "INSERT INTO shows (id,library,title,year,added_at,metadata) VALUES ('s1','lib','Severance',2022,'t',?1)",
        params![meta(&["Science Fiction", "Drama"], 8.7, "Ben Stiller", "Adam Scott")],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
         VALUES ('e1','episode','Ep1','mkv','lib','s1',1,1,'t')",
        [],
    )
    .unwrap();
    drop(conn);
    pool
}

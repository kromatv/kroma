use std::sync::atomic::AtomicU32;

use rusqlite::params;

use crate::testing::TempPool;

pub(super) static SEQ: AtomicU32 = AtomicU32::new(0);

pub(super) fn seeded() -> TempPool {
    let pool = crate::testing::temp_pool("home");
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
        [],
    )
    .unwrap();
    let movie = |id: &str, added: &str, genres: &str| {
        conn.execute(
            "INSERT INTO items (id,kind,title,container,library,added_at,metadata) \
             VALUES (?1,'movie','T','mkv','lib',?2,?3)",
            params![
                id,
                added,
                format!("{{\"tmdbId\":1,\"tmdbUrl\":\"x\",\"genres\":[{genres}]}}")
            ],
        )
        .unwrap();
    };
    movie("seed", "2019", "\"Horror\"");
    movie("c1", "2020", "\"Horror\",\"Thriller\"");
    movie("c2", "2021", "\"Comedy\"");
    // A movie with no metadata (no genres to guard on).
    conn.execute(
        "INSERT INTO items (id,kind,title,container,library,added_at) VALUES ('nogen','movie','N','mkv','lib','2022')",
        [],
    )
    .unwrap();
    // An episode (excluded from recently-added).
    conn.execute(
        "INSERT INTO shows (id,library,title,added_at,metadata) VALUES ('sh1','lib','Show','t','{\"tmdbId\":9,\"tmdbUrl\":\"x\",\"genres\":[\"Horror\"]}')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
         VALUES ('e1','episode','Ep','mkv','lib','sh1',1,1,'2099')",
        [],
    )
    .unwrap();
    drop(conn);
    pool
}

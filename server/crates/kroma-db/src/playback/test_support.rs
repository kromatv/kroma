use rusqlite::params;

use crate::pool::Pool;
use crate::testing::TempPool;
use kroma_domain::Permission;

// Fresh DB with one user and one movie item `m1` (so `progress` which has an
// items FK can be seeded).
pub(super) fn pool_with_user() -> (TempPool, String) {
    let pool = crate::testing::temp_pool("watched");
    let user = crate::create_user(&pool, "w@e.com", "w", "hash", &[Permission::Playback]).unwrap();
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movie','/x','t')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO items (id,kind,title,container,library,added_at) \
         VALUES ('m1','movie','Dune','mkv','lib','t')",
        [],
    )
    .unwrap();
    (pool, user.id)
}

// Insert a movie item so `progress`'s items FK is satisfied.
pub(super) fn seed_movie(pool: &Pool, id: &str) {
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO items (id,kind,title,container,library,added_at) \
             VALUES (?1,'movie','T','mkv','lib','t')",
            params![id],
        )
        .unwrap();
}

// Show `sid` with `n` episodes `{prefix}1..{prefix}n`.
pub(super) fn seed_show(pool: &Pool, sid: &str, prefix: &str, n: i64) {
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO shows (id,library,title,added_at) VALUES (?1,'lib','Show','t')",
        params![sid],
    )
    .unwrap();
    for e in 1..=n {
        conn.execute(
            "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
             VALUES (?1,'episode','Ep','mkv','lib',?2,1,?3,'t')",
            params![format!("{prefix}{e}"), sid, e],
        )
        .unwrap();
    }
}

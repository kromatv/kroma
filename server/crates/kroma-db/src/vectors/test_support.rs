use super::set_item_vector;
use crate::testing::TempPool;
use rusqlite::params;

// Seed three movies a/b/c (with genres for the guard) + their unit vectors.
// a=[1,0], b=[0.8,0.6], c=[0,1]: a is nearest b, orthogonal to c.
pub(super) fn seeded() -> TempPool {
    let pool = crate::testing::temp_pool("vec");
    {
        let conn = pool.get().unwrap();
        conn.execute("INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')", []).unwrap();
        let mk = |id: &str, genre: &str| {
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,added_at,metadata) \
                 VALUES (?1,'movie','T','mkv','lib','t',?2)",
                params![id, format!("{{\"tmdbId\":1,\"tmdbUrl\":\"x\",\"genres\":[\"{genre}\"]}}")],
            )
            .unwrap();
        };
        mk("a", "Horror");
        mk("b", "Horror");
        mk("c", "Comedy");
    }
    set_item_vector(&pool, "a", &[1.0, 0.0]).unwrap();
    set_item_vector(&pool, "b", &[0.8, 0.6]).unwrap();
    set_item_vector(&pool, "c", &[0.0, 1.0]).unwrap();
    pool
}

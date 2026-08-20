use rusqlite::{params, Connection};

use crate::testing::TempPool;

pub(super) fn pool() -> TempPool {
    crate::testing::temp_pool("media")
}

pub(super) fn seed_movie(conn: &Connection, id: &str, title: &str, library: &str) {
    conn.execute(
        "INSERT INTO items (id,kind,title,container,library,added_at) \
         VALUES (?1,'movie',?2,'mkv',?3,'t')",
        params![id, title, library],
    )
    .unwrap();
}

pub(super) fn seed_probed_file(conn: &Connection, id: &str, item_id: &str, abs: &str, v_width: i64) {
    conn.execute(
        "INSERT INTO files (id,item_id,abs_path,rel_path,container,probed,duration_ms,v_codec,v_width,v_height) \
         VALUES (?1,?2,?3,?4,'mkv',1,7200000,'hevc',?5,2160)",
        params![id, item_id, abs, format!("{item_id}.mkv"), v_width],
    )
    .unwrap();
}

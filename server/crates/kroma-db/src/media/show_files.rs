use anyhow::Result;

use crate::Pool;

const PATHS: &str = "SELECT f.abs_path FROM files f JOIN items i ON i.id = f.item_id \
                     WHERE i.show_id = ?1 AND i.absent_since IS NULL AND f.abs_path IS NOT NULL \
                     ORDER BY f.abs_path";

/// Where on disk the files of a show's present episodes are, in path order.
pub fn show_file_paths(pool: &Pool, show_id: &str) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(PATHS)?;
    let paths = stmt.query_map([show_id], |r| r.get(0))?;
    Ok(paths.collect::<rusqlite::Result<_>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media::test_support::*;

    #[test]
    fn a_show_s_files_are_those_of_its_present_episodes() {
        let p = pool();
        let conn = p.get().unwrap();
        conn.execute_batch(
            "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','shows','/x','t'); \
             INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Show','t'); \
             INSERT INTO items (id,kind,title,container,library,show_id,added_at,absent_since) \
             VALUES ('e1','episode','A','mkv','lib','s1','t',NULL), \
                    ('e2','episode','B','mkv','lib','s1','t',NULL), \
                    ('e3','episode','C','mkv','lib','s1','t',1);",
        )
        .unwrap();
        seed_movie(&conn, "m1", "Film", "lib");
        seed_probed_file(&conn, "f2", "e2", "/s/Show/Season 01/b.mkv", 1920);
        seed_probed_file(&conn, "f1", "e1", "/s/Show/Season 01/a.mkv", 1920);
        seed_probed_file(&conn, "f3", "e3", "/s/Show/Season 02/c.mkv", 1920);
        seed_probed_file(&conn, "f4", "m1", "/m/film.mkv", 1920);
        drop(conn);

        let paths = show_file_paths(&p, "s1").unwrap();

        assert_eq!(
            paths,
            ["/s/Show/Season 01/a.mkv", "/s/Show/Season 01/b.mkv"]
        );
    }
}

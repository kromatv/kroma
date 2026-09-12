use std::path::Path;

use kroma_testing::TempDir;

use crate::db::Pool;
use crate::infra::image::images_dir;
use crate::services::subtitles::downloaded_dir;

pub(super) fn fresh(tag: &str) -> (Pool, TempDir) {
    let data = kroma_testing::temp_dir(&format!("bksvc-{tag}"));
    std::fs::create_dir_all(images_dir(data.path())).unwrap();
    let pool = crate::db::init(&data.path().join("kroma.db")).unwrap();
    (pool, data)
}

pub(super) fn seed_user_with_avatar(pool: &Pool, data_dir: &Path) {
    std::fs::write(images_dir(data_dir).join("av99.webp"), b"AVATAR").unwrap();
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO users (id,email,username,password_hash,avatar_url,created_at) \
             VALUES ('u1','a@b.c','Al','ph','/api/images/av99.webp','t')",
            [],
        )
        .unwrap();
}

pub(super) fn seed_subtitle(pool: &Pool, data_dir: &Path, id: &str, vtt: &[u8]) {
    let dir = downloaded_dir(data_dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join(format!("{id}.vtt"));
    std::fs::write(&path, vtt).unwrap();
    let path = path.to_string_lossy().into_owned();
    let conn = pool.get().unwrap();
    conn.execute_batch(
        "INSERT OR IGNORE INTO libraries (id,name,kind,path,added_at) \
         VALUES ('lib','L','movies','/x','t'); \
         INSERT OR IGNORE INTO items (id,kind,title,container,library,added_at) \
         VALUES ('it1','movie','Film','mkv','lib','t');",
    )
    .unwrap();
    conn.execute(
        "INSERT INTO downloaded_subtitles (id,item_id,label,provider,path,created_at) \
         VALUES (?1,'it1','English','whisper',?2,'t')",
        [id, path.as_str()],
    )
    .unwrap();
}

pub(super) fn user_count(pool: &Pool) -> i64 {
    pool.get()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
        .unwrap()
}

pub(super) fn subtitle_path(pool: &Pool, id: &str) -> Option<String> {
    pool.get()
        .unwrap()
        .query_row(
            "SELECT path FROM downloaded_subtitles WHERE id = ?1",
            [id],
            |r| r.get(0),
        )
        .ok()
}

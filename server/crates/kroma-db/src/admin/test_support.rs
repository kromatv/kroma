use kroma_domain::PlayRecord;

use crate::testing::TempPool;
use crate::Pool;

pub(super) fn pool() -> TempPool {
    crate::testing::temp_pool("admin")
}

pub(super) fn play(
    user: &str,
    username: &str,
    title: &str,
    kind: &str,
    watched_ms: i64,
) -> PlayRecord {
    PlayRecord {
        user_id: Some(user.into()),
        username: Some(username.into()),
        item_id: Some("m1".into()),
        kind: kind.into(),
        title: title.into(),
        watched_ms,
        ended_at: 100,
        ..PlayRecord::default()
    }
}

pub(super) fn seed_library(pool: &Pool, id: &str, name: &str) {
    pool.get()
        .unwrap()
        .execute(
            "INSERT OR IGNORE INTO libraries (id,name,kind,path,added_at) \
             VALUES (?1,?2,'movie','/media',?3)",
            rusqlite::params![id, name, "2026-01-01"],
        )
        .unwrap();
}

pub(super) fn seed_movie(pool: &Pool, id: &str, library: &str, title: &str, year: u32) {
    seed_library(pool, library, library);
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO items (id,kind,title,year,container,library,added_at) \
             VALUES (?1,'movie',?2,?3,'mkv',?4,'2026-01-01')",
            rusqlite::params![id, title, year, library],
        )
        .unwrap();
}

pub(super) fn seed_show(pool: &Pool, id: &str, library: &str, title: &str, year: u32) {
    seed_library(pool, library, library);
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO shows (id,library,title,year,added_at) VALUES (?1,?2,?3,?4,'2026-01-01')",
            rusqlite::params![id, library, title, year],
        )
        .unwrap();
}

pub(super) fn seed_episode(pool: &Pool, id: &str, show: &str, library: &str, title: &str) {
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO items (id,kind,title,container,library,show_id,added_at) \
             VALUES (?1,'episode',?2,'mkv',?3,?4,'2026-01-01')",
            rusqlite::params![id, title, library, show],
        )
        .unwrap();
}

pub(super) fn seed_user(pool: &Pool, id: &str, username: &str, avatar: Option<&str>) {
    pool.get()
        .unwrap()
        .execute(
            "INSERT INTO users (id,email,username,password_hash,avatar_url,created_at) \
             VALUES (?1,?2,?3,'x',?4,'2026-01-01')",
            rusqlite::params![id, format!("{id}@kroma.tv"), username, avatar],
        )
        .unwrap();
}

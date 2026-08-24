//! What a user chose: their avatar and their languages.

use anyhow::Result;
use rusqlite::params;

use crate::Pool;

/// Uploaded avatars live in the same `images` dir as the regenerable art cache,
/// so the cleanup job uses this to spare them — they can't be re-downloaded.
pub fn avatar_urls(pool: &Pool) -> Result<Vec<String>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT avatar_url FROM users WHERE avatar_url IS NOT NULL")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn set_user_avatar(pool: &Pool, user_id: &str, avatar_url: Option<&str>) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE users SET avatar_url = ?2 WHERE id = ?1",
        params![user_id, avatar_url],
    )?;
    Ok(())
}

pub fn set_user_language(pool: &Pool, user_id: &str, language: Option<&str>) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE users SET language = ?2 WHERE id = ?1",
        params![user_id, language],
    )?;
    Ok(())
}

pub fn set_user_audio_language(pool: &Pool, user_id: &str, language: Option<&str>) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE users SET audio_language = ?2 WHERE id = ?1",
        params![user_id, language],
    )?;
    Ok(())
}

/// The sentinel `"off"` is a stored value meaning "force subtitles off".
pub fn set_user_subtitle_language(
    pool: &Pool,
    user_id: &str,
    language: Option<&str>,
) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "UPDATE users SET subtitle_language = ?2 WHERE id = ?1",
        params![user_id, language],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::test_support::*;
    use crate::accounts::user_by_id;

    #[test]
    fn avatar_get_set_and_urls() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");
        assert!(avatar_urls(&p).unwrap().is_empty());
        set_user_avatar(&p, &u.id, Some("/api/images/av.webp")).unwrap();
        assert_eq!(
            avatar_urls(&p).unwrap(),
            vec!["/api/images/av.webp".to_string()]
        );
        assert_eq!(
            user_by_id(&p, &u.id)
                .unwrap()
                .unwrap()
                .avatar_url
                .as_deref(),
            Some("/api/images/av.webp")
        );
        set_user_avatar(&p, &u.id, None).unwrap();
        assert!(avatar_urls(&p).unwrap().is_empty());
    }

    #[test]
    fn language_preferences_round_trip() {
        let p = pool();
        let u = mk_user(&p, "a@b.c", "alice");
        set_user_language(&p, &u.id, Some("fr")).unwrap();
        set_user_audio_language(&p, &u.id, Some("ja")).unwrap();
        set_user_subtitle_language(&p, &u.id, Some("off")).unwrap();
        let got = user_by_id(&p, &u.id).unwrap().unwrap();
        assert_eq!(got.language.as_deref(), Some("fr"));
        assert_eq!(got.audio_language.as_deref(), Some("ja"));
        assert_eq!(got.subtitle_language.as_deref(), Some("off"));
        set_user_language(&p, &u.id, None).unwrap();
        assert!(user_by_id(&p, &u.id).unwrap().unwrap().language.is_none());
    }
}

//! Persistence for per-user LLM taste: the evolving natural-language profile and
//! the cached personalized home sections (see the `sections.personalize` job).

use super::*;

/// `(profile, sections_json)`; `None` if never generated.
pub fn get_user_taste(pool: &Pool, user_id: &str) -> Result<Option<(Option<String>, String)>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT profile, sections FROM user_taste WHERE user_id = ?1")?;
    let mut rows = stmt.query_map(params![user_id], |r| {
        Ok((r.get::<_, Option<String>>(0)?, r.get::<_, String>(1)?))
    })?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

/// `sections` is a JSON array.
pub fn set_user_taste(pool: &Pool, user_id: &str, profile: Option<&str>, sections: &str) -> Result<()> {
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO user_taste (user_id, profile, sections, updated_at) \
         VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(user_id) DO UPDATE SET \
            profile=excluded.profile, sections=excluded.sections, updated_at=excluded.updated_at",
        params![user_id, profile, sections, kroma_primitives::now_ms()],
    )?;
    Ok(())
}

pub fn all_users_with_lang(pool: &Pool) -> Result<Vec<(String, Option<String>)>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare("SELECT id, language FROM users")?;
    let rows = stmt.query_map([], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_domain::Permission;
    use std::sync::atomic::{AtomicU32, Ordering};

    static SEQ: AtomicU32 = AtomicU32::new(0);

    fn pool() -> Pool {
        let n = SEQ.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("kroma-taste-{}-{n}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        crate::init(&path).unwrap()
    }

    #[test]
    fn taste_upsert_and_users_with_lang() {
        let p = pool();
        let u = crate::create_user(&p, "a@b.c", "alice", "h", &[Permission::Playback]).unwrap();
        crate::set_user_language(&p, &u.id, Some("fr")).unwrap();

        assert!(get_user_taste(&p, &u.id).unwrap().is_none());

        set_user_taste(&p, &u.id, Some("likes sci-fi"), "[{\"key\":\"row1\"}]").unwrap();
        let (profile, sections) = get_user_taste(&p, &u.id).unwrap().unwrap();
        assert_eq!(profile.as_deref(), Some("likes sci-fi"));
        assert_eq!(sections, "[{\"key\":\"row1\"}]");

        set_user_taste(&p, &u.id, None, "[]").unwrap();
        let (profile, sections) = get_user_taste(&p, &u.id).unwrap().unwrap();
        assert!(profile.is_none());
        assert_eq!(sections, "[]");

        let users = all_users_with_lang(&p).unwrap();
        assert_eq!(users, vec![(u.id.clone(), Some("fr".to_string()))]);
    }
}

//! The titles an admin blocked or allowed for one profile (ACCT-117 to
//! ACCT-120), keyed by the film or the show they name.

use std::collections::HashMap;

use serde::Deserialize;
use serde::de::IntoDeserializer;
use serde::de::value::StrDeserializer;

use super::{Pool, Result, params};

use kroma_domain::TitleRule;

/// A ruled title as the admin's restrictions list draws it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuledTitle {
    pub id: String,
    pub name: String,
    pub show: bool,
    pub rule: TitleRule,
}

/// Every rule on `user_id`'s profile, by title. A row whose rule no longer
/// parses is left out, as if the title carried none.
pub fn title_rules(pool: &Pool, user_id: &str) -> Result<HashMap<String, TitleRule>> {
    let conn = pool.get()?;
    let mut stmt =
        conn.prepare("SELECT title_id, rule FROM profile_title_rules WHERE user_id = ?1")?;
    let rows = stmt.query_map(params![user_id], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    })?;
    let mut out = HashMap::new();
    for row in rows {
        let (title, stored) = row?;
        if let Some(rule) = read_rule(&stored) {
            out.insert(title, rule);
        }
    }
    Ok(out)
}

/// Block or allow `title_id` for `user_id`, replacing whichever rule it had
/// (ACCT-119). `None` lifts the rule.
pub fn set_title_rule(
    pool: &Pool,
    (user_id, title_id): (&str, &str),
    rule: Option<TitleRule>,
) -> Result<()> {
    let conn = pool.get()?;
    match rule {
        Some(rule) => conn.execute(
            "INSERT INTO profile_title_rules (user_id, title_id, rule, created_at) \
             VALUES (?1, ?2, ?3, ?4) \
             ON CONFLICT (user_id, title_id) DO UPDATE SET rule = excluded.rule",
            params![user_id, title_id, stored_rule(rule), crate::now_or_blank()],
        )?,
        None => conn.execute(
            "DELETE FROM profile_title_rules WHERE user_id = ?1 AND title_id = ?2",
            params![user_id, title_id],
        )?,
    };
    Ok(())
}

/// Every title ruled for `user_id`, named, newest rule first. A rule on a
/// title the library no longer holds is left out.
pub fn ruled_titles(pool: &Pool, user_id: &str) -> Result<Vec<RuledTitle>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT r.title_id, COALESCE(i.title, s.title), s.id IS NOT NULL, r.rule \
         FROM profile_title_rules r \
         LEFT JOIN items i ON i.id = r.title_id AND i.kind != 'episode' \
         LEFT JOIN shows s ON s.id = r.title_id \
         WHERE r.user_id = ?1 AND (i.id IS NOT NULL OR s.id IS NOT NULL) \
         ORDER BY r.created_at DESC, r.title_id",
    )?;
    let rows = stmt.query_map(params![user_id], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get::<_, String>(3)?))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (id, name, show, stored) = row?;
        if let Some(rule) = read_rule(&stored) {
            out.push(RuledTitle {
                id,
                name,
                show,
                rule,
            });
        }
    }
    Ok(out)
}

fn stored_rule(rule: TitleRule) -> String {
    match serde_json::to_value(rule) {
        Ok(serde_json::Value::String(name)) => name,
        _ => String::new(),
    }
}

fn read_rule(stored: &str) -> Option<TitleRule> {
    let named: StrDeserializer<'_, serde::de::value::Error> = stored.into_deserializer();
    TitleRule::deserialize(named).ok()
}

#[cfg(test)]
mod tests;

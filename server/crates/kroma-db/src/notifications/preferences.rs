//! The per-user delivery matrix: which categories, and which types inside
//! them, reach which channel.

use std::collections::BTreeMap;

use crate::Pool;
use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension, Transaction};

use kroma_domain::{CategoryPref, NotificationCategory};

/// One user's full preference matrix, defaults filled in.
///
/// A missing row means "on", so this always returns every category and callers
/// never have to know which ones were explicitly set.
pub fn prefs(conn: &Connection, user_id: &str) -> rusqlite::Result<Vec<CategoryPref>> {
    let mut stmt =
        conn.prepare("SELECT category, in_app, push FROM notification_prefs WHERE user_id = ?1")?;
    let rows = stmt.query_map(params![user_id], |r| {
        let category: String = r.get(0)?;
        let in_app: i64 = r.get(1)?;
        let push: i64 = r.get(2)?;
        Ok((category, (in_app != 0, push != 0)))
    })?;
    let set: BTreeMap<String, (bool, bool)> = rows.collect::<rusqlite::Result<_>>()?;
    Ok(NotificationCategory::ALL
        .into_iter()
        .map(|category| {
            let (in_app, push) = set.get(category.as_str()).copied().unwrap_or((true, true));
            CategoryPref {
                category,
                in_app,
                push,
            }
        })
        .collect())
}

/// A notification type as the matrix weighs it: its name, and whether it
/// reaches a device before its reader has chosen for it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TypeDefault<'a> {
    pub name: &'a str,
    pub pushes: bool,
}

/// What one user chose for one type. A `None` switch follows the category.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct TypeChoice {
    pub in_app: Option<bool>,
    pub push: Option<bool>,
}

impl TypeChoice {
    /// The type's switches under `category`, as `(in_app, push)`. A switch the
    /// user left alone follows the category, and a type that does not push
    /// unasked stays quiet on the device until its reader turns it on.
    pub fn under(self, category: &CategoryPref, pushes: bool) -> (bool, bool) {
        (
            self.in_app.unwrap_or(category.in_app),
            self.push.unwrap_or(category.push && pushes),
        )
    }

    /// The choice that leaves a type with these switches under `category`,
    /// keeping only what departs from it: a switch set back to what the
    /// category gives follows the category again.
    pub fn departing(in_app: bool, push: bool, category: &CategoryPref, pushes: bool) -> Self {
        let (inherited_in_app, inherited_push) = TypeChoice::default().under(category, pushes);
        Self {
            in_app: (in_app != inherited_in_app).then_some(in_app),
            push: (push != inherited_push).then_some(push),
        }
    }
}

/// Every type `user_id` chose for, by type name.
pub fn type_choices(
    conn: &Connection,
    user_id: &str,
) -> rusqlite::Result<BTreeMap<String, TypeChoice>> {
    let mut stmt =
        conn.prepare("SELECT type, in_app, push FROM notification_type_prefs WHERE user_id = ?1")?;
    let rows = stmt.query_map(params![user_id], |r| Ok((r.get(0)?, choice_at(r, 1)?)))?;
    rows.collect()
}

fn choice_at(r: &rusqlite::Row<'_>, first: usize) -> rusqlite::Result<TypeChoice> {
    let in_app: Option<i64> = r.get(first)?;
    let push: Option<i64> = r.get(first + 1)?;
    Ok(TypeChoice {
        in_app: in_app.map(|v| v != 0),
        push: push.map(|v| v != 0),
    })
}

/// Whether a notification may be delivered to this user, as `(in_app, push)`:
/// its type's own switches where the user set one, its category's elsewhere. A
/// notification with no type follows its category alone.
pub fn allows(
    conn: &Connection,
    user_id: &str,
    category: NotificationCategory,
    kind: Option<TypeDefault<'_>>,
) -> rusqlite::Result<(bool, bool)> {
    let switches = prefs(conn, user_id)?
        .into_iter()
        .find(|p| p.category == category)
        .unwrap_or(CategoryPref {
            category,
            in_app: true,
            push: true,
        });
    let Some(kind) = kind else {
        return Ok((switches.in_app, switches.push));
    };
    let choice = conn
        .query_row(
            "SELECT in_app, push FROM notification_type_prefs WHERE user_id = ?1 AND type = ?2",
            params![user_id, kind.name],
            |r| choice_at(r, 0),
        )
        .optional()?;
    Ok(choice.unwrap_or_default().under(&switches, kind.pushes))
}

/// Write a user's choices in one transaction: every category given, and every
/// type given. A type whose switches both follow its category loses its row.
pub fn set_prefs(
    pool: &Pool,
    user_id: &str,
    categories: &[CategoryPref],
    types: &[(String, TypeChoice)],
) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    for p in categories {
        tx.execute(
            "INSERT INTO notification_prefs (user_id, category, in_app, push) \
             VALUES (?1, ?2, ?3, ?4) \
             ON CONFLICT(user_id, category) DO UPDATE SET in_app = ?3, push = ?4",
            params![user_id, p.category.as_str(), p.in_app as i64, p.push as i64],
        )?;
    }
    for (name, choice) in types {
        set_type_choice(&tx, user_id, name, *choice)?;
    }
    tx.commit()?;
    Ok(())
}

fn set_type_choice(
    tx: &Transaction<'_>,
    user_id: &str,
    name: &str,
    choice: TypeChoice,
) -> rusqlite::Result<()> {
    if choice == TypeChoice::default() {
        tx.execute(
            "DELETE FROM notification_type_prefs WHERE user_id = ?1 AND type = ?2",
            params![user_id, name],
        )?;
        return Ok(());
    }
    tx.execute(
        "INSERT INTO notification_type_prefs (user_id, type, in_app, push) \
         VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(user_id, type) DO UPDATE SET in_app = ?3, push = ?4",
        params![
            user_id,
            name,
            choice.in_app.map(i64::from),
            choice.push.map(i64::from)
        ],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests;

//! A reader's delivery matrix as the settings screen shows it: every category,
//! and every kind of notification under them with the switches it ends up with.

use kroma_db::notifications::{self as stored, TypeChoice};
use kroma_domain::{CategoryPref, NotificationPrefs, PrefsUpdate, TypePref};

use super::types::NotificationTypes;
use crate::db::{Pool, PooledConn};

/// One reader's whole matrix, its kinds labelled in `locale`. `enabled` says
/// which modules' types are listed.
pub fn matrix(
    conn: &PooledConn,
    user_id: &str,
    types: &NotificationTypes,
    enabled: impl Fn(&str) -> bool,
    locale: &str,
) -> anyhow::Result<NotificationPrefs> {
    let categories = stored::prefs(conn, user_id)?;
    let choices = stored::type_choices(conn, user_id)?;
    let listed = types.listed(enabled);
    let rows = listed
        .iter()
        .map(|kind| {
            let category = category_of(&categories, kind.category);
            let choice = choices.get(kind.name).copied().unwrap_or_default();
            let (in_app, push) = choice.under(&category, kind.pushes);
            TypePref {
                name: kind.name.to_string(),
                category: kind.category,
                label: types.label(kind, locale),
                in_app,
                push,
            }
        })
        .collect();
    Ok(NotificationPrefs {
        categories,
        types: rows,
    })
}

/// Write what a reader changed and answer the matrix it leaves. A type's
/// switches are weighed against its category as this same update leaves it,
/// so a switch set back to the category's value follows the category again. A
/// type nothing lists any more is passed over.
pub fn save(
    pool: &Pool,
    user_id: &str,
    update: &PrefsUpdate,
    types: &NotificationTypes,
    enabled: impl Fn(&str) -> bool,
    locale: &str,
) -> anyhow::Result<NotificationPrefs> {
    let mut categories = stored::prefs(&*pool.get()?, user_id)?;
    for changed in &update.categories {
        if let Some(pref) = categories
            .iter_mut()
            .find(|p| p.category == changed.category)
        {
            *pref = *changed;
        }
    }
    let listed = types.listed(&enabled);
    let choices: Vec<(String, TypeChoice)> = update
        .types
        .iter()
        .filter_map(|switches| {
            let kind = listed.iter().find(|kind| kind.name == switches.name)?;
            let category = category_of(&categories, kind.category);
            let choice =
                TypeChoice::departing(switches.in_app, switches.push, &category, kind.pushes);
            Some((switches.name.clone(), choice))
        })
        .collect();
    stored::set_prefs(pool, user_id, &update.categories, &choices)?;
    matrix(&pool.get()?, user_id, types, enabled, locale)
}

fn category_of(
    categories: &[CategoryPref],
    category: kroma_domain::NotificationCategory,
) -> CategoryPref {
    categories
        .iter()
        .find(|p| p.category == category)
        .copied()
        .unwrap_or(CategoryPref {
            category,
            in_app: true,
            push: true,
        })
}

#[cfg(test)]
mod tests;

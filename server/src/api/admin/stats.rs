//! Analytics: the dashboard's watch panels, the watch-history screen and the
//! top-line overview counts for the users page.

mod history;
mod most_watched;
mod plays;
mod viewers;

use axum::extract::State;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Json;
use axum::Router;
use serde::Deserialize;

use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::model::{Permission, User};
use crate::state::SharedState;

/// Analytics. Paths are relative to the `/api/admin` nest.
pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/stats/top-users", get(viewers::top_users))
        .route("/stats/history", get(history::history))
        .route("/stats/most-watched", get(most_watched::most_watched))
        .route("/stats/overview", get(overview))
        .route("/stats/plays", get(plays::plays))
        .route("/stats/libraries", get(plays::libraries))
}

const DAY: i64 = 86_400;

fn now_unix() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

// `None` where the window is the whole log, which is how the screens spell
// "everything" and what the chart needs to know before it can pick a bucket.
fn since(days: Option<i64>, fallback: i64) -> Option<i64> {
    let days = days.unwrap_or(fallback);
    (days > 0).then(|| now_unix() - days.min(36_500) * DAY)
}

fn present(value: Option<String>) -> Option<String> {
    value.filter(|v| !v.trim().is_empty())
}

fn require_history_of(user: &User, subject: Option<&str>) -> Result<(), Response> {
    if subject == Some(user.id.as_str()) {
        return Ok(());
    }
    super::require(user, Permission::UsersManage)
}

#[derive(Debug, Deserialize)]
pub struct WindowQuery {
    #[serde(default)]
    pub days: Option<i64>,
    #[serde(default)]
    pub user: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
}

/// `GET /api/admin/stats/overview` → top-line counts for the users page.
pub async fn overview(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
) -> Result<Response, Response> {
    super::require_any_admin(&user)?;
    let (libraries, items, shows, users, invites) = query(&state.db, move |pool| {
        let (libraries, items, shows) = db::counts(&pool)?;
        let users = db::admin_users(&pool)?;
        let invites = db::list_invites(&pool)?.len();
        Ok((libraries, items, shows, users, invites))
    })
    .await?;
    let online = users
        .iter()
        .filter(|u| state.playback.user_online(&u.id))
        .count();
    Ok(Json(crate::api::dto::AdminOverview {
        users: users.len(),
        online,
        invites,
        items,
        shows,
        libraries,
    })
    .into_response())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Permission;

    fn member(id: &str, permissions: &[Permission]) -> User {
        User {
            id: id.into(),
            email: format!("{id}@kroma.tv"),
            username: id.into(),
            avatar_url: None,
            permissions: permissions.to_vec(),
            created_at: "2026-01-01".into(),
            language: None,
            has_pin: false,
            audio_language: None,
            subtitle_language: None,
        }
    }

    #[test]
    fn a_member_reads_their_own_history_and_nobody_elses() {
        let alice = member("u1", &[Permission::Playback]);

        assert!(require_history_of(&alice, Some("u1")).is_ok());
        assert!(require_history_of(&alice, Some("u2")).is_err());
        assert!(require_history_of(&alice, None).is_err());
    }

    #[test]
    fn managing_accounts_is_what_opens_the_whole_log() {
        let owner = member("u9", &[Permission::UsersManage]);
        let librarian = member("u8", &[Permission::LibraryManage]);

        assert!(require_history_of(&owner, None).is_ok());
        assert!(require_history_of(&owner, Some("u1")).is_ok());
        assert!(require_history_of(&librarian, Some("u1")).is_err());
    }

    #[test]
    fn a_window_of_no_days_reaches_the_whole_log() {
        assert_eq!(since(Some(0), 30), None);
        assert_eq!(since(Some(-5), 30), None);
        assert!(since(Some(7), 30).is_some());
        assert!(since(Some(1), 30) > since(None, 7));
    }

    #[test]
    fn a_filter_left_blank_narrows_nothing() {
        assert_eq!(present(Some("u1".into())), Some("u1".into()));
        assert_eq!(present(Some("  ".into())), None);
        assert_eq!(present(None), None);
    }
}

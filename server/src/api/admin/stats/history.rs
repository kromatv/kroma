//! Playback over time: time watched per bucket, stacked by kind.

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;

use crate::api::error::json_error;
use crate::api::extract::AuthUser;
use crate::api::util::query;
use crate::db;
use crate::model::{HistoryRow, WatchKind, WatchTotals};
use crate::state::SharedState;

use super::{WindowQuery, DAY};

const MOST_BUCKETS: i64 = 32;
const WIDTH_LADDER: [i64; 5] = [1, 7, 28, 91, 365];

/// `GET /api/admin/stats/history?days=28&kind=&user=` → time watched per
/// bucket.
pub async fn history(
    State(state): State<SharedState>,
    AuthUser(user): AuthUser,
    Query(q): Query<WindowQuery>,
) -> Result<Response, Response> {
    super::super::require_any_admin(&user)?;
    let kind = match super::present(q.kind) {
        Some(raw) => Some(
            WatchKind::parse(&raw)
                .ok_or_else(|| json_error(StatusCode::BAD_REQUEST, "unknown kind"))?,
        ),
        None => None,
    };
    let who = super::present(q.user);
    let floor = super::since(q.days, 28);
    let rows = query(&state.db, move |pool| {
        db::history_since(&pool, floor.unwrap_or(0), who.as_deref(), kind)
    })
    .await?;

    let now = super::now_unix();
    let start = floor.unwrap_or_else(|| rows.first().map(|r| r.ended_at).unwrap_or(now));
    Ok(Json(chart(&rows, start, now)).into_response())
}

fn chart(rows: &[HistoryRow], start: i64, now: i64) -> crate::api::dto::HistoryStats {
    let span_days = ((now - start) / DAY).max(1);
    let width = bucket_days(span_days);
    let count = ((span_days + width - 1) / width).max(1) as usize;

    let mut per_bucket = vec![WatchTotals::default(); count];
    let mut totals = WatchTotals::default();
    for row in rows {
        let at = ((row.ended_at - start) / (width * DAY)).clamp(0, count as i64 - 1) as usize;
        per_bucket[at].add(row.kind, row.watched_ms);
        totals.add(row.kind, row.watched_ms);
    }

    let buckets = per_bucket
        .iter()
        .enumerate()
        .map(|(i, bucket)| {
            let from = start + (i as i64) * width * DAY;
            crate::api::dto::HistoryBucket {
                label: bucket_label(from, (from + width * DAY - 1).min(now)),
                films_ms: bucket.movie,
                tv_ms: bucket.tv,
            }
        })
        .collect();
    crate::api::dto::HistoryStats {
        total_films_ms: totals.movie,
        total_tv_ms: totals.tv,
        totals,
        bucket_days: width,
        buckets,
    }
}

fn bucket_days(span_days: i64) -> i64 {
    WIDTH_LADDER
        .into_iter()
        .find(|width| span_days / width <= MOST_BUCKETS)
        .unwrap_or(365)
}

fn bucket_label(from: i64, to: i64) -> String {
    let day = |ts: i64| {
        time::OffsetDateTime::from_unix_timestamp(ts)
            .map(|d| format!("{:02}/{:02}", d.day(), d.month() as u8))
            .unwrap_or_else(|_| "??".into())
    };
    let (from, to) = (day(from), day(to));
    if from == to {
        from
    } else {
        format!("{from} - {to}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(ended_at: i64, kind: WatchKind, watched_ms: i64) -> HistoryRow {
        HistoryRow {
            ended_at,
            kind,
            watched_ms,
        }
    }

    #[test]
    fn a_short_window_is_bucketed_by_day_and_a_long_one_by_week_or_more() {
        assert_eq!(bucket_days(1), 1);
        assert_eq!(bucket_days(30), 1);
        assert_eq!(bucket_days(90), 7);
        assert_eq!(bucket_days(365), 28);
        assert_eq!(bucket_days(3650), 365);
    }

    #[test]
    fn every_kind_lands_in_its_own_band_and_in_the_footer() {
        let start = 0;
        let now = 7 * DAY;
        let rows = [
            row(DAY, WatchKind::Movie, 60_000),
            row(DAY + 60, WatchKind::Tv, 30_000),
            row(4 * DAY, WatchKind::Movie, 10_000),
        ];

        let stats = chart(&rows, start, now);

        assert_eq!(stats.bucket_days, 1);
        assert_eq!(stats.buckets.len(), 7);
        assert_eq!(stats.buckets[1].films_ms, 60_000);
        assert_eq!(stats.buckets[1].tv_ms, 30_000);
        assert_eq!(stats.buckets[4].films_ms, 10_000);
        assert_eq!(stats.totals.movie, 70_000);
        assert_eq!(stats.totals.tv, 30_000);
        assert_eq!(stats.total_films_ms, 70_000);
        assert_eq!(stats.total_tv_ms, 30_000);
    }

    #[test]
    fn a_bucket_a_day_wide_is_labelled_with_that_day_alone() {
        assert_eq!(bucket_label(0, DAY - 1), "01/01");
        assert_eq!(bucket_label(0, 6 * DAY), "01/01 - 07/01");
    }

    #[test]
    fn an_empty_window_still_draws_one_bucket() {
        let stats = chart(&[], 0, 0);

        assert_eq!(stats.buckets.len(), 1);
        assert_eq!(stats.totals, WatchTotals::default());
    }
}

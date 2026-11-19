use anyhow::Result;

use crate::db::{self, Pool};

use super::{remembered, Arrival};

/// Keep a television that just arrived, so it can be brought back later, and
/// drop what was kept for it when it now gives nothing to reach it by. Runs
/// off the request: a roster update is not held up for the disk.
pub async fn keep(pool: Pool, arrival: Arrival, now_ms: i64) {
    let receiver_id = arrival.row.id.clone();
    let written = tokio::task::spawn_blocking(move || write(&pool, &arrival, now_ms)).await;
    if let Ok(Err(error)) = written {
        tracing::warn!("cast: could not keep {receiver_id}: {error:#}");
    }
}

pub(super) fn write(pool: &Pool, arrival: &Arrival, now_ms: i64) -> Result<()> {
    match remembered(arrival, now_ms) {
        Some(device) => db::remember_cast_device(pool, &device),
        None => db::forget_cast_device(pool, &arrival.row.id, &arrival.user_id).map(|_| ()),
    }
}

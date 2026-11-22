//! Pipeline stage `ratings`: every country's age rating for a film or a show
//! enriched before they were kept (ACCT-157), one TMDB request per title.

use anyhow::Result;

use crate::db;
use crate::domain::ratings::reader_rating;
use crate::infra::metadata::{ratings_by_id, Target};
use crate::model::{Kind, Metadata};
use crate::services::jobs::{JobContext, JobKey, Trigger};
use crate::services::settings;
use crate::state::SharedState;

use super::common::stage;

stage! {
    short: "ratings",
    subject_kind: "item",
    concurrency: 2,
    pause_for_playback: false,
    schedule: Some("45 4 * * *"),
    triggers: &[Trigger::AfterJob(JobKey("pipeline.metadata"))],
}

fn enumerate(state: &SharedState) -> Result<Vec<(String, String)>> {
    let films = db::list_items(&state.db, None)?
        .into_iter()
        .filter(|item| matches!(item.kind, Kind::Movie | Kind::Video))
        .filter_map(|item| unrated(item.id, item.metadata.as_ref()));
    let shows = db::list_shows(&state.db, None)?
        .into_iter()
        .filter_map(|show| unrated(show.id, show.metadata.as_ref()));
    Ok(films.chain(shows).collect())
}

fn unrated(id: String, meta: Option<&Metadata>) -> Option<(String, String)> {
    let meta = meta.filter(|meta| meta.tmdb_id != 0 && meta.ratings.is_empty())?;
    Some((id, format!("tmdb:{}", meta.tmdb_id)))
}

fn process(ctx: &JobContext, id: &str) -> Result<()> {
    let state = &ctx.state;
    let Some(api_key) = state.config.tmdb_api_key.as_deref() else {
        return Ok(());
    };
    match db::get_item(&state.db, id)? {
        Some(item) => rate(state, (api_key, Target::Movie), item.metadata, |meta| {
            db::set_item_metadata(&state.db, id, meta)
        }),
        None => rate(state, (api_key, Target::Tv), db::show_metadata(&state.db, id)?, |meta| {
            db::set_show_metadata(&state.db, id, meta)
        }),
    }
}

fn rate(
    state: &SharedState,
    (api_key, target): (&str, Target),
    stored: Option<Metadata>,
    store: impl FnOnce(&Metadata) -> Result<()>,
) -> Result<()> {
    let Some(mut meta) = stored.filter(|meta| meta.tmdb_id != 0) else {
        return Ok(());
    };
    let ratings = ratings_by_id(api_key, target, meta.tmdb_id)
        .ok_or_else(|| anyhow::anyhow!("TMDB did not answer for {}", meta.tmdb_id))?;
    if ratings.is_empty() {
        return Ok(());
    }
    let server = settings::metadata_country(&state.settings, &state.config);
    meta.age_rating = reader_rating(&ratings, &server, &server);
    meta.certification = meta.age_rating.as_ref().map(|shown| shown.label.clone());
    meta.ratings = ratings;
    store(&meta)
}

#[cfg(test)]
mod tests;

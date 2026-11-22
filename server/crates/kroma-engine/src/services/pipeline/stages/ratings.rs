//! Pipeline stage `ratings`: every country's age rating for a film or a show
//! enriched before they were kept (ACCT-157), one TMDB request per title.

use anyhow::Result;

use crate::db;
use crate::domain::ratings::reader_rating;
use crate::infra::metadata::{Target, ratings_by_id};
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

struct Asked<'a> {
    api_key: &'a str,
    server: String,
}

fn process(ctx: &JobContext, id: &str) -> Result<()> {
    let state = &ctx.state;
    let Some(api_key) = state.config.tmdb_api_key.as_deref() else {
        return Ok(());
    };
    let server = settings::metadata_country(&state.settings, &state.config);
    let asked = Asked { api_key, server };
    if let Some(item) = db::get_item(&state.db, id)? {
        let rated = asked.rate(Target::Movie, item.metadata)?;
        return rated.map_or(Ok(()), |meta| db::set_item_metadata(&state.db, id, &meta));
    }
    let rated = asked.rate(Target::Tv, db::show_metadata(&state.db, id)?)?;
    rated.map_or(Ok(()), |meta| db::set_show_metadata(&state.db, id, &meta))
}

impl Asked<'_> {
    fn rate(&self, target: Target, stored: Option<Metadata>) -> Result<Option<Metadata>> {
        let Some(mut meta) = stored.filter(|meta| meta.tmdb_id != 0) else {
            return Ok(None);
        };
        let ratings = ratings_by_id(self.api_key, target, meta.tmdb_id)
            .ok_or_else(|| anyhow::anyhow!("TMDB did not answer for {}", meta.tmdb_id))?;
        if ratings.is_empty() {
            return Ok(None);
        }
        meta.age_rating = reader_rating(&ratings, &self.server, &self.server);
        meta.certification = meta.age_rating.as_ref().map(|shown| shown.label.clone());
        meta.ratings = ratings;
        Ok(Some(meta))
    }
}

#[cfg(test)]
mod tests;

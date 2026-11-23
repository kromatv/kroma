//! Pipeline stage `ratings`: every country's age rating and the genre ids for
//! a film or a show enriched before they were kept (ACCT-157, ACCT-183), one
//! TMDB request per title.

use anyhow::Result;

use crate::db;
use crate::domain::ratings::reader_rating;
use crate::infra::metadata::{Target, facts_by_id};
use crate::model::{CountryRatings, Kind, Metadata};
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
    triggers: &[
        Trigger::AfterJob(JobKey("pipeline.metadata")),
        Trigger::AfterJob(JobKey("metadata.enrich")),
    ],
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
    let meta = meta.filter(|meta| meta.tmdb_id != 0 && lacks_facts(meta))?;
    Some((id, format!("tmdb:{}", meta.tmdb_id)))
}

fn lacks_facts(meta: &Metadata) -> bool {
    meta.ratings.is_empty() || meta.tmdb_genre_ids.is_empty()
}

struct Asked<'a> {
    api_key: &'a str,
    server: String,
    language: String,
}

fn process(ctx: &JobContext, id: &str) -> Result<()> {
    let state = &ctx.state;
    let Some(api_key) = state.config.tmdb_api_key.as_deref() else {
        return Ok(());
    };
    let asked = Asked {
        api_key,
        server: settings::metadata_country(&state.settings, &state.config),
        language: settings::metadata_language(&state.settings, &state.config),
    };
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
        let facts = facts_by_id(self.api_key, target, (meta.tmdb_id, &self.language))
            .ok_or_else(|| anyhow::anyhow!("TMDB did not answer for {}", meta.tmdb_id))?;
        let rated = self.fill_ratings(&mut meta, facts.ratings);
        let sorted = fill_genres(&mut meta, (facts.genres, facts.genre_ids));
        Ok((rated || sorted).then_some(meta))
    }

    fn fill_ratings(&self, meta: &mut Metadata, ratings: CountryRatings) -> bool {
        if ratings.is_empty() || !meta.ratings.is_empty() {
            return false;
        }
        meta.age_rating = reader_rating(&ratings, &self.server, &self.server);
        meta.certification = meta.age_rating.as_ref().map(|shown| shown.label.clone());
        meta.ratings = ratings;
        true
    }
}

fn fill_genres(meta: &mut Metadata, (names, ids): (Vec<String>, Vec<u32>)) -> bool {
    if ids.is_empty() || !meta.tmdb_genre_ids.is_empty() {
        return false;
    }
    meta.genres = names;
    meta.tmdb_genre_ids = ids;
    true
}

#[cfg(test)]
mod tests;

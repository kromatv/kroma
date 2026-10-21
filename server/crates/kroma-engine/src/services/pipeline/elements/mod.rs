//! The element-centric pipeline view: the whole catalog with, per element, the
//! status of each treatment and an overall roll-up. Computed in bulk from cheap
//! set/map queries so it scales to thousands of items; no per-item disk stats.

mod filter;
mod status;
mod treatments;

pub use filter::Filter;
pub use status::resolve_status;

use std::collections::{HashMap, HashSet};

use anyhow::Result;

use self::filter::{matches_filter, tally_counts};
use self::status::{overall_of, status_of, tr, Ledger};
use self::treatments::{element_title, group_episodes_by_show, item_treatments, Ledgers};
use crate::db;
use crate::model::{ElementRow, EpStats, PipelineElements};
use crate::state::SharedState;

/// Build the filtered, paginated element page + full-catalog counts.
pub fn list(state: &SharedState, f: &Filter) -> Result<PipelineElements> {
    let db = &state.db;
    let items = db::pipeline::raw_items(db)?;
    let shows = db::pipeline::raw_shows(db)?;
    let probed: HashSet<String> = db::probed_item_ids(db)?;
    let markset: HashSet<String> = db::item_ids_with_markers(db)?;
    let vecset: HashSet<String> = db::item_ids_with_vector(db)?;
    let meta_l: Ledger = db::pipeline::stage_statuses(db, "metadata")?;
    let story_l: Ledger = db::pipeline::stage_statuses(db, "storyboard")?;
    let subs_l: Ledger = db::pipeline::stage_statuses(db, "subtitles")?;
    let embed_l: Ledger = db::pipeline::stage_statuses(db, "embed")?;
    let mark_l: Ledger = db::pipeline::stage_statuses(db, "markers")?;
    let credits_l: Ledger = db::pipeline::stage_statuses(db, "credits")?;

    let ep_by_show = group_episodes_by_show(&items);
    let show_poster: HashMap<&str, Option<String>> = shows
        .iter()
        .map(|s| (s.id.as_str(), s.poster.clone()))
        .collect();

    let lg = Ledgers {
        probed: &probed,
        markset: &markset,
        vecset: &vecset,
        meta_l: &meta_l,
        story_l: &story_l,
        subs_l: &subs_l,
        embed_l: &embed_l,
        mark_l: &mark_l,
        credits_l: &credits_l,
        show_poster: &show_poster,
    };

    let mut all: Vec<ElementRow> = Vec::with_capacity(items.len() + shows.len());

    for it in &items {
        let (treatments, kind, poster) = item_treatments(it, &lg);
        let overall = overall_of(&treatments).to_string();
        all.push(ElementRow {
            id: it.id.clone(),
            kind: kind.to_string(),
            title: element_title(it),
            poster,
            year: it.year.map(|y| y as u32),
            genre: it.genre.clone(),
            duration_ms: it.duration_ms.map(|d| d as u64),
            season_count: None,
            treatments,
            overall,
            ep_stats: None,
        });
    }

    for sh in &shows {
        let (m, me) = status_of(meta_l.get(&sh.id), sh.has_meta, false);
        let (e, ee) = status_of(embed_l.get(&sh.id), vecset.contains(&sh.id), false);
        let treatments = vec![tr("metadata", m, me), tr("embed", e, ee)];
        let eps = ep_by_show.get(sh.id.as_str()).cloned().unwrap_or_default();
        let seasons: HashSet<i64> = eps.iter().filter_map(|e| e.season).collect();
        let marker_seasons = seasons
            .iter()
            .filter(|n| {
                mark_l
                    .get(&format!("{}#{}", sh.id, n))
                    .map(|(s, _)| s == "done")
                    .unwrap_or(false)
            })
            .count() as i64;
        let ep_stats = EpStats {
            episodes: eps.len() as i64,
            probed: eps.iter().filter(|e| probed.contains(&e.id)).count() as i64,
            storyboarded: eps
                .iter()
                .filter(|e| {
                    story_l
                        .get(&e.id)
                        .map(|(s, _)| s == "done")
                        .unwrap_or(false)
                })
                .count() as i64,
            seasons: seasons.len() as i64,
            marker_seasons,
        };
        let overall = overall_of(&treatments).to_string();
        all.push(ElementRow {
            id: sh.id.clone(),
            kind: "series".to_string(),
            title: sh.title.clone(),
            poster: sh.poster.clone(),
            year: sh.year.map(|y| y as u32),
            genre: sh.genre.clone(),
            duration_ms: None,
            season_count: Some(seasons.len() as u32),
            treatments,
            overall,
            ep_stats: Some(ep_stats),
        });
    }

    let counts = tally_counts(&all);

    let q = f.query.trim().to_lowercase();
    let filtered: Vec<&ElementRow> = all.iter().filter(|el| matches_filter(el, f, &q)).collect();

    let total = filtered.len() as i64;
    let limit = f.limit.clamp(1, 100);
    let pages = ((total + limit - 1) / limit).max(1);
    let page = f.page.clamp(0, pages - 1);
    let start = (page * limit) as usize;
    let elements: Vec<ElementRow> = filtered
        .into_iter()
        .skip(start)
        .take(limit as usize)
        .cloned()
        .collect();

    Ok(PipelineElements {
        total,
        page,
        pages,
        counts,
        elements,
    })
}

#[cfg(test)]
mod tests;

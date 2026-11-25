//! Overlaying a locale onto a show, its seasons and its episodes.

use super::layer::Ask;
use super::overlay_season_cast;
use crate::art_beside::{season_id, Art, SEASON};
use crate::{metadata_core, translations, Pool};
use anyhow::Result;

use kroma_domain::{Season, Show, ShowDetail};

/// Overlay `locale` onto a batch of shows (their top-level metadata only).
pub fn overlay_shows(pool: &Pool, shows: &mut [Show], locale: &str) -> Result<()> {
    if shows.is_empty() {
        return Ok(());
    }
    let conn = pool.get()?;
    let ids: Vec<&str> = shows.iter().map(|s| s.id.as_str()).collect();
    let layer = Ask {
        conn: &conn,
        locale,
    }
    .layer(metadata_core::SHOW, &ids)?;
    for show in shows.iter_mut() {
        layer.on_show(show);
    }
    Ok(())
}

/// Overlay `locale` onto a full show detail: the show, every episode of every
/// season, and each season's cast character names (`season_cast` translations
/// keyed `"{show_id}:{season}"`).
pub fn overlay_show_detail(pool: &Pool, detail: &mut ShowDetail, locale: &str) -> Result<()> {
    let conn = pool.get()?;
    let ask = Ask {
        conn: &conn,
        locale,
    };
    ask.layer(metadata_core::SHOW, &[detail.show.id.as_str()])?
        .on_show(&mut detail.show);
    let ep_ids: Vec<&str> = detail
        .seasons
        .iter()
        .flat_map(|s| s.episodes.iter())
        .map(|e| e.id.as_str())
        .collect();
    let episodes = ask.episodes(&ep_ids)?;
    for season in &mut detail.seasons {
        for ep in &mut season.episodes {
            episodes.on_episode(ep);
        }
        overlay_season_cast(&conn, &detail.show.id, season, locale)?;
        overlay_listed(&conn, &detail.show.id, season, locale)?;
    }
    season_posters(&ask, detail)
}

fn season_posters(ask: &Ask, detail: &mut ShowDetail) -> Result<()> {
    let ids: Vec<String> = detail
        .seasons
        .iter()
        .map(|season| season_id(&detail.show.id, season.number))
        .collect();
    let keys: Vec<&str> = ids.iter().map(String::as_str).collect();
    let art = Art::load(ask.conn, SEASON, &keys)?;
    let fetched = translations::resolve_many(ask.conn, SEASON, &keys, ask.locale)?;
    for (season, id) in detail.seasons.iter_mut().zip(&ids) {
        let fetched = fetched.get(id).and_then(|t| t.poster_url.clone());
        season.poster_url = art.poster(id).or(fetched);
    }
    Ok(())
}

// A listed episode is keyed `"{show_id}:{season}:{episode}"`: it has no row of
// its own to hang a translation on.
fn overlay_listed(
    conn: &rusqlite::Connection,
    show_id: &str,
    season: &mut Season,
    locale: &str,
) -> Result<()> {
    if season.missing.is_empty() {
        return Ok(());
    }
    let ids: Vec<String> = season
        .missing
        .iter()
        .map(|e| format!("{show_id}:{}:{}", season.number, e.episode))
        .collect();
    let refs: Vec<&str> = ids.iter().map(String::as_str).collect();
    let tr = translations::resolve_many(conn, "episode_guide", &refs, locale)?;
    for (ep, id) in season.missing.iter_mut().zip(&ids) {
        if let Some(t) = tr.get(id) {
            if t.title.is_some() {
                ep.title = t.title.clone();
            }
            if t.overview.is_some() {
                ep.overview = t.overview.clone();
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;

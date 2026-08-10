//! Locale overlay for served catalog entities.
//!
//! During the transition the `metadata` blob still carries the household
//! (primary) language; these helpers overlay the request locale's translation
//! on top so each user sees the catalog in *their* language. The overlay only
//! touches the localized text (title/tagline/overview/genres/character names)
//! the invariant art/ids/people already on the blob are left untouched. Applied
//! at the API boundary, right before serialization, keyed off `Accept-Language`.
//!
//! Resolution falls back requested lang -> `en` -> any (see
//! [`super::translations::resolve_many`]); an entity with no stored translation
//! keeps its blob text, so this is always safe to call.

use super::translations::{self, TransData};
use super::*;

use kroma_domain::{CastMember, Kind, MediaItem, Metadata, Season, SectionItem, Show, ShowDetail};

/// Overlay `locale` onto a batch of items (movies/videos + episodes). Episodes
/// resolve under the `'episode'` subject kind, everything else under `'item'`.
pub fn overlay_items(pool: &Pool, items: &mut [MediaItem], locale: &str) -> Result<()> {
    if items.is_empty() {
        return Ok(());
    }
    let conn = pool.get()?;
    let movie_ids: Vec<&str> =
        items.iter().filter(|i| i.kind != Kind::Episode).map(|i| i.id.as_str()).collect();
    let ep_ids: Vec<&str> =
        items.iter().filter(|i| i.kind == Kind::Episode).map(|i| i.id.as_str()).collect();
    let movie_tr = translations::resolve_many(&conn, metadata_core::ITEM, &movie_ids, locale)?;
    let ep_tr = translations::resolve_many(&conn, "episode", &ep_ids, locale)?;
    for item in items.iter_mut() {
        let table = if item.kind == Kind::Episode { &ep_tr } else { &movie_tr };
        if let Some(tr) = table.get(&item.id) {
            apply(item.metadata.as_mut(), tr);
        }
    }
    Ok(())
}

/// Overlay `locale` onto home-section items (a mix of movies and shows).
pub fn overlay_section_items(pool: &Pool, items: &mut [SectionItem], locale: &str) -> Result<()> {
    if items.is_empty() {
        return Ok(());
    }
    let conn = pool.get()?;
    let movie_ids: Vec<&str> = items
        .iter()
        .filter_map(|s| match s {
            SectionItem::Movie { item } => Some(item.id.as_str()),
            SectionItem::Show { .. } => None,
        })
        .collect();
    let show_ids: Vec<&str> = items
        .iter()
        .filter_map(|s| match s {
            SectionItem::Show { show } => Some(show.id.as_str()),
            SectionItem::Movie { .. } => None,
        })
        .collect();
    let m_tr = translations::resolve_many(&conn, metadata_core::ITEM, &movie_ids, locale)?;
    let s_tr = translations::resolve_many(&conn, metadata_core::SHOW, &show_ids, locale)?;
    for it in items.iter_mut() {
        match it {
            SectionItem::Movie { item } => {
                if let Some(t) = m_tr.get(&item.id) {
                    apply(item.metadata.as_mut(), t);
                }
            }
            SectionItem::Show { show } => {
                if let Some(t) = s_tr.get(&show.id) {
                    apply_show(show, t);
                }
            }
        }
    }
    Ok(())
}

/// Overlay `locale` onto a batch of shows (their top-level metadata only).
pub fn overlay_shows(pool: &Pool, shows: &mut [Show], locale: &str) -> Result<()> {
    if shows.is_empty() {
        return Ok(());
    }
    let conn = pool.get()?;
    let ids: Vec<&str> = shows.iter().map(|s| s.id.as_str()).collect();
    let tr = translations::resolve_many(&conn, metadata_core::SHOW, &ids, locale)?;
    for show in shows.iter_mut() {
        if let Some(t) = tr.get(&show.id) {
            apply_show(show, t);
        }
    }
    Ok(())
}

/// Overlay `locale` onto a full show detail: the show, every episode of every
/// season, and each season's cast character names (`season_cast` translations
/// keyed `"{show_id}:{season}"`).
pub fn overlay_show_detail(pool: &Pool, detail: &mut ShowDetail, locale: &str) -> Result<()> {
    let conn = pool.get()?;
    // Show + episodes reuse the batch helpers over this one detail.
    if let Some(t) =
        translations::resolve_many(&conn, metadata_core::SHOW, &[detail.show.id.as_str()], locale)?
            .get(&detail.show.id)
    {
        apply_show(&mut detail.show, t);
    }
    let ep_ids: Vec<&str> =
        detail.seasons.iter().flat_map(|s| s.episodes.iter()).map(|e| e.id.as_str()).collect();
    let ep_tr = translations::resolve_many(&conn, "episode", &ep_ids, locale)?;
    for season in &mut detail.seasons {
        for ep in &mut season.episodes {
            if let Some(t) = ep_tr.get(&ep.id) {
                apply(ep.metadata.as_mut(), t);
            }
        }
        overlay_season_cast(&conn, &detail.show.id, season, locale)?;
    }
    Ok(())
}

// Overlay one season's cast character names from its `season_cast` translation.
fn overlay_season_cast(conn: &Connection, show_id: &str, season: &mut Season, locale: &str) -> Result<()> {
    if season.cast.is_empty() {
        return Ok(());
    }
    let sc_id = format!("{show_id}:{}", season.number);
    if let Some(t) = translations::resolve_many(conn, "season_cast", &[sc_id.as_str()], locale)?.get(&sc_id) {
        apply_characters(&mut season.cast, &t.characters);
    }
    Ok(())
}

// Overlay the localized text fields onto an item's metadata (no-op when the item
// has no blob metadata yet, i.e. not enriched).
fn apply(meta: Option<&mut Metadata>, tr: &TransData) {
    let Some(meta) = meta else { return };
    if tr.title.is_some() {
        meta.title = tr.title.clone();
    }
    if tr.tagline.is_some() {
        meta.tagline = tr.tagline.clone();
    }
    if tr.overview.is_some() {
        meta.overview = tr.overview.clone();
    }
    if !tr.genres.is_empty() {
        meta.genres = tr.genres.clone();
    }
    apply_characters(&mut meta.cast, &tr.characters);
}

// A show's metadata overlay (same fields; shows carry no per-title cast here).
fn apply_show(show: &mut Show, tr: &TransData) {
    apply(show.metadata.as_mut(), tr);
}

// Overlay localized character names onto a cast list, aligned by index (the
// translation was written in the same TMDB cast order the core was stored in).
fn apply_characters(cast: &mut [CastMember], characters: &[Option<String>]) {
    for (member, ch) in cast.iter_mut().zip(characters.iter()) {
        if ch.is_some() {
            member.character = ch.clone();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempPool;

    fn pool() -> TempPool {
        crate::testing::temp_pool("loc")
    }

    fn meta(title: &str) -> Metadata {
        Metadata {
            provider: "tmdb",
            tmdb_id: 1,
            imdb_id: None,
            title: Some(title.into()),
            tagline: Some("orig tagline".into()),
            overview: Some("orig overview".into()),
            release_date: None,
            genres: vec!["Original".into()],
            rating: None,
            poster_url: None,
            backdrop_url: None,
            logo_url: None,
            theme_url: None,
            cast: vec![CastMember { name: "Actor".into(), character: Some("Orig Char".into()), profile_url: None }],
            crew: vec![],
            keywords: vec![],
            tvdb_id: None,
            tmdb_url: "x".into(),
        }
    }

    fn item(id: &str, kind: Kind) -> MediaItem {
        MediaItem {
            id: id.into(),
            title: "T".into(),
            kind,
            year: None,
            duration_ms: None,
            container: "mkv".into(),
            video: None,
            audio: None,
            audio_tracks: Vec::new(),
            subtitles: Vec::new(),
            library: "lib".into(),
            show_id: None,
            show_title: None,
            season: None,
            episode: None,
            episode_end: None,
            episode_title: None,
            rel_path: None,
            added_at: "t".into(),
            metadata: Some(meta("Original")),
            abs_path: None,
            files: Vec::new(),
            default_file_id: None,
            markers: Vec::new(),
            audio_analysis: None,
        }
    }

    fn show(id: &str) -> Show {
        Show {
            id: id.into(),
            title: "T".into(),
            year: None,
            library: "lib".into(),
            season_count: 0,
            episode_count: 0,
            video: None,
            added_at: "t".into(),
            metadata: Some(meta("Show EN")),
            progress: None,
        }
    }

    fn td(title: &str, characters: Vec<Option<String>>) -> TransData {
        TransData { title: Some(title.into()), characters, ..Default::default() }
    }

    #[test]
    fn overlay_items_applies_title_and_characters() {
        let p = pool();
        translations::put(&p, metadata_core::ITEM, "m1", "fr", translations::TMDB, &td("Titre FR", vec![Some("Perso FR".into())])).unwrap();
        translations::put(&p, "episode", "e1", "fr", translations::TMDB, &td("Episode FR", vec![])).unwrap();

        let mut items = vec![item("m1", Kind::Movie), item("e1", Kind::Episode)];
        overlay_items(&p, &mut items, "fr").unwrap();

        let m = items[0].metadata.as_ref().unwrap();
        assert_eq!(m.title.as_deref(), Some("Titre FR"));
        assert_eq!(m.cast[0].character.as_deref(), Some("Perso FR"));
        // Untranslated fields keep the blob's original text.
        assert_eq!(m.tagline.as_deref(), Some("orig tagline"));
        assert_eq!(m.genres, vec!["Original".to_string()]);
        assert_eq!(items[1].metadata.as_ref().unwrap().title.as_deref(), Some("Episode FR"));

        // Empty slice is a clean no-op.
        overlay_items(&p, &mut [], "fr").unwrap();
    }

    #[test]
    fn a_translation_overlays_every_text_field_it_carries() {
        let p = pool();
        let tr = TransData {
            title: Some("Titre FR".into()),
            tagline: Some("Accroche FR".into()),
            overview: Some("Synopsis FR".into()),
            genres: vec!["Science-fiction".into()],
            characters: vec![Some("Perso FR".into())],
            ..Default::default()
        };
        translations::put(&p, metadata_core::ITEM, "m1", "fr", translations::TMDB, &tr).unwrap();

        let mut items = vec![item("m1", Kind::Movie)];
        overlay_items(&p, &mut items, "fr").unwrap();
        let m = items[0].metadata.as_ref().unwrap();
        assert_eq!(m.title.as_deref(), Some("Titre FR"));
        assert_eq!(m.tagline.as_deref(), Some("Accroche FR"));
        assert_eq!(m.overview.as_deref(), Some("Synopsis FR"));
        assert_eq!(m.genres, vec!["Science-fiction".to_string()]);
        assert_eq!(m.cast[0].character.as_deref(), Some("Perso FR"));

        overlay_section_items(&p, &mut [], "fr").unwrap();
    }

    #[test]
    fn overlay_shows_and_section_items() {
        let p = pool();
        translations::put(&p, metadata_core::SHOW, "s1", "fr", translations::TMDB, &td("Serie FR", vec![])).unwrap();
        translations::put(&p, metadata_core::ITEM, "m1", "fr", translations::TMDB, &td("Film FR", vec![])).unwrap();

        let mut shows = vec![show("s1")];
        overlay_shows(&p, &mut shows, "fr").unwrap();
        assert_eq!(shows[0].metadata.as_ref().unwrap().title.as_deref(), Some("Serie FR"));

        let mut section = vec![
            SectionItem::Movie { item: Box::new(item("m1", Kind::Movie)) },
            SectionItem::Show { show: Box::new(show("s1")) },
        ];
        overlay_section_items(&p, &mut section, "fr").unwrap();
        match &section[0] {
            SectionItem::Movie { item } => assert_eq!(item.metadata.as_ref().unwrap().title.as_deref(), Some("Film FR")),
            _ => panic!("expected movie"),
        }
        match &section[1] {
            SectionItem::Show { show } => assert_eq!(show.metadata.as_ref().unwrap().title.as_deref(), Some("Serie FR")),
            _ => panic!("expected show"),
        }
    }

    #[test]
    fn overlay_show_detail_covers_show_episodes_and_season_cast() {
        let p = pool();
        translations::put(&p, metadata_core::SHOW, "s1", "fr", translations::TMDB, &td("Serie FR", vec![])).unwrap();
        translations::put(&p, "episode", "e1", "fr", translations::TMDB, &td("Ep FR", vec![])).unwrap();
        translations::put(&p, "season_cast", "s1:1", "fr", translations::TMDB, &TransData {
            characters: vec![Some("Perso Saison".into())],
            ..Default::default()
        })
        .unwrap();

        let mut detail = ShowDetail {
            show: show("s1"),
            seasons: vec![Season {
                number: 1,
                episodes: vec![item("e1", Kind::Episode)],
                cast: vec![CastMember { name: "A".into(), character: Some("orig".into()), profile_url: None }],
            }],
        };
        overlay_show_detail(&p, &mut detail, "fr").unwrap();

        assert_eq!(detail.show.metadata.as_ref().unwrap().title.as_deref(), Some("Serie FR"));
        assert_eq!(detail.seasons[0].episodes[0].metadata.as_ref().unwrap().title.as_deref(), Some("Ep FR"));
        assert_eq!(detail.seasons[0].cast[0].character.as_deref(), Some("Perso Saison"));
    }
}

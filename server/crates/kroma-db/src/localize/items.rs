//! Overlaying a locale onto items and home-section rows.

use super::layer::{Ask, Layer};
use crate::{metadata_core, Pool};
use anyhow::Result;

use kroma_domain::{Kind, MediaItem, SectionItem};

/// Overlay `locale` onto a batch of items (movies/videos + episodes). Episodes
/// resolve under the `'episode'` subject kind, everything else under `'item'`.
pub fn overlay_items(pool: &Pool, items: &mut [MediaItem], locale: &str) -> Result<()> {
    overlay_each(pool, items.iter_mut(), locale)
}

/// Overlay `locale` onto items reached through something other than a slice: a
/// resume row's inner item, the next episode, one `Option`.
pub fn overlay_each<'a>(
    pool: &Pool,
    items: impl IntoIterator<Item = &'a mut MediaItem>,
    locale: &str,
) -> Result<()> {
    let mut items: Vec<&mut MediaItem> = items.into_iter().collect();
    if items.is_empty() {
        return Ok(());
    }
    let conn = pool.get()?;
    let ask = Ask {
        conn: &conn,
        locale,
    };
    let movie_ids = ids_where(&items, |i| i.kind != Kind::Episode);
    let movies = ask.layer(metadata_core::ITEM, &movie_ids)?;
    let episode_ids = ids_where(&items, |i| i.kind == Kind::Episode);
    let episodes = ask.episodes(&episode_ids)?;
    // The show's name is printed beside the episode's on every continue row and
    // every up-next rail, so translating one without the other puts two
    // languages on one card.
    let show_ids: Vec<&str> = items.iter().filter_map(|i| i.show_id.as_deref()).collect();
    let shows = ask.layer(metadata_core::SHOW, &show_ids)?;
    for item in items.iter_mut() {
        if item.kind != Kind::Episode {
            movies.on_item(item);
        } else {
            episodes.on_episode(item);
        }
        show_onto(item, &shows);
    }
    Ok(())
}

fn ids_where<'a>(items: &'a [&mut MediaItem], keep: impl Fn(&MediaItem) -> bool) -> Vec<&'a str> {
    items
        .iter()
        .filter(|i| keep(i))
        .map(|i| i.id.as_str())
        .collect()
}

fn show_onto(item: &mut MediaItem, shows: &Layer) {
    let Some(show) = item.show_id.as_deref() else {
        return;
    };
    if let Some(name) = shows.title(show) {
        item.show_title = Some(name.to_string());
    }
    if item.kind == Kind::Episode {
        shows.poster_onto(show, item.metadata.as_mut());
    }
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
    let ask = Ask {
        conn: &conn,
        locale,
    };
    let movies = ask.layer(metadata_core::ITEM, &movie_ids)?;
    let shows = ask.layer(metadata_core::SHOW, &show_ids)?;
    for it in items.iter_mut() {
        match it {
            SectionItem::Movie { item } => movies.on_item(item),
            SectionItem::Show { show } => shows.on_show(show),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::localize::test_support::*;
    use crate::translations::{self, TransData};

    #[test]
    fn the_items_own_title_is_localized_not_only_its_metadata() {
        let p = pool();
        translations::put(
            &p,
            metadata_core::ITEM,
            "m1",
            "en",
            translations::TMDB,
            &td("Minions: The Rise of Gru", vec![]),
        )
        .unwrap();

        let mut items = vec![item("m1", Kind::Movie)];
        overlay_items(&p, &mut items, "en").unwrap();

        assert_eq!(items[0].title, "Minions: The Rise of Gru");
    }

    #[test]
    fn an_episode_card_does_not_print_two_languages() {
        let p = pool();
        translations::put(
            &p,
            "episode",
            "e1",
            "en",
            translations::TMDB,
            &td("Ozymandias", vec![]),
        )
        .unwrap();
        translations::put(
            &p,
            metadata_core::SHOW,
            "sh1",
            "en",
            translations::TMDB,
            &td("Breaking Bad", vec![]),
        )
        .unwrap();

        let mut ep = item("e1", Kind::Episode);
        ep.show_id = Some("sh1".into());
        ep.show_title = Some("Breaking Bad VF".into());
        ep.episode_title = Some("Ozymandias VF".into());
        let mut items = vec![ep];
        overlay_items(&p, &mut items, "en").unwrap();

        // A row prints the show's name beside the episode's, and falls back to
        // `episodeTitle` over `title`, so all three have to move together.
        assert_eq!(items[0].title, "Ozymandias");
        assert_eq!(items[0].episode_title.as_deref(), Some("Ozymandias"));
        assert_eq!(items[0].show_title.as_deref(), Some("Breaking Bad"));
    }

    #[test]
    fn the_home_rows_localize_the_title_the_card_renders() {
        let p = pool();
        translations::put(
            &p,
            metadata_core::ITEM,
            "m1",
            "en",
            translations::TMDB,
            &td("Arrival", vec![]),
        )
        .unwrap();

        let mut rows = vec![SectionItem::Movie {
            item: Box::new(item("m1", Kind::Movie)),
        }];
        overlay_section_items(&p, &mut rows, "en").unwrap();

        let SectionItem::Movie { item } = &rows[0] else {
            panic!("expected a movie row");
        };
        assert_eq!(item.title, "Arrival");
    }

    #[test]
    fn an_item_reached_through_a_wrapper_is_localized_like_any_other() {
        let p = pool();
        translations::put(
            &p,
            metadata_core::ITEM,
            "m1",
            "en",
            translations::TMDB,
            &td("Arrival", vec![]),
        )
        .unwrap();

        let mut resume = (item("m1", Kind::Movie), 1234);
        overlay_each(&p, std::iter::once(&mut resume.0), "en").unwrap();

        assert_eq!(resume.0.title, "Arrival");
    }

    #[test]
    fn overlay_items_applies_title_and_characters() {
        let p = pool();
        translations::put(
            &p,
            metadata_core::ITEM,
            "m1",
            "fr",
            translations::TMDB,
            &td("Titre FR", vec![Some("Perso FR".into())]),
        )
        .unwrap();
        translations::put(
            &p,
            "episode",
            "e1",
            "fr",
            translations::TMDB,
            &td("Episode FR", vec![]),
        )
        .unwrap();

        let mut items = vec![item("m1", Kind::Movie), item("e1", Kind::Episode)];
        overlay_items(&p, &mut items, "fr").unwrap();

        let m = items[0].metadata.as_ref().unwrap();
        assert_eq!(m.title.as_deref(), Some("Titre FR"));
        assert_eq!(m.cast[0].character.as_deref(), Some("Perso FR"));
        // Untranslated fields keep the blob's original text.
        assert_eq!(m.tagline.as_deref(), Some("orig tagline"));
        assert_eq!(m.genres, vec!["Original".to_string()]);
        assert_eq!(
            items[1].metadata.as_ref().unwrap().title.as_deref(),
            Some("Episode FR")
        );

        // Empty slice is a clean no-op.
        overlay_items(&p, &mut [], "fr").unwrap();
    }

    #[test]
    fn a_locale_overlay_rewrites_the_genre_names_and_leaves_their_ids_alone() {
        let p = pool();
        let tr = TransData {
            genres: vec!["Science-fiction".into()],
            ..Default::default()
        };
        translations::put(&p, metadata_core::ITEM, "m1", "fr", translations::TMDB, &tr).unwrap();
        let mut items = vec![item("m1", Kind::Movie)];

        overlay_items(&p, &mut items, "fr").unwrap();

        let m = items[0].metadata.as_ref().unwrap();
        assert_eq!(m.genres, vec!["Science-fiction".to_string()]);
        assert_eq!(m.tmdb_genre_ids, vec![878]);
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
}

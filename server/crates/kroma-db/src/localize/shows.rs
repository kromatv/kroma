//! Overlaying a locale onto a show, its seasons and its episodes.

use super::{apply, apply_show, overlay_season_cast};
use crate::{metadata_core, translations, Pool};
use anyhow::Result;

use kroma_domain::{Show, ShowDetail};

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
    if let Some(t) = translations::resolve_many(
        &conn,
        metadata_core::SHOW,
        &[detail.show.id.as_str()],
        locale,
    )?
    .get(&detail.show.id)
    {
        apply_show(&mut detail.show, t);
    }
    let ep_ids: Vec<&str> = detail
        .seasons
        .iter()
        .flat_map(|s| s.episodes.iter())
        .map(|e| e.id.as_str())
        .collect();
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::localize::overlay_section_items;
    use crate::localize::test_support::*;
    use crate::translations::TransData;

    use kroma_domain::{CastMember, Kind, Season, SectionItem};

    #[test]
    fn overlay_shows_and_section_items() {
        let p = pool();
        translations::put(
            &p,
            metadata_core::SHOW,
            "s1",
            "fr",
            translations::TMDB,
            &td("Serie FR", vec![]),
        )
        .unwrap();
        translations::put(
            &p,
            metadata_core::ITEM,
            "m1",
            "fr",
            translations::TMDB,
            &td("Film FR", vec![]),
        )
        .unwrap();

        let mut shows = vec![show("s1")];
        overlay_shows(&p, &mut shows, "fr").unwrap();
        assert_eq!(
            shows[0].metadata.as_ref().unwrap().title.as_deref(),
            Some("Serie FR")
        );

        let mut section = vec![
            SectionItem::Movie {
                item: Box::new(item("m1", Kind::Movie)),
            },
            SectionItem::Show {
                show: Box::new(show("s1")),
            },
        ];
        overlay_section_items(&p, &mut section, "fr").unwrap();
        match &section[0] {
            SectionItem::Movie { item } => assert_eq!(
                item.metadata.as_ref().unwrap().title.as_deref(),
                Some("Film FR")
            ),
            _ => panic!("expected movie"),
        }
        match &section[1] {
            SectionItem::Show { show } => assert_eq!(
                show.metadata.as_ref().unwrap().title.as_deref(),
                Some("Serie FR")
            ),
            _ => panic!("expected show"),
        }
    }

    #[test]
    fn overlay_show_detail_covers_show_episodes_and_season_cast() {
        let p = pool();
        translations::put(
            &p,
            metadata_core::SHOW,
            "s1",
            "fr",
            translations::TMDB,
            &td("Serie FR", vec![]),
        )
        .unwrap();
        translations::put(
            &p,
            "episode",
            "e1",
            "fr",
            translations::TMDB,
            &td("Ep FR", vec![]),
        )
        .unwrap();
        translations::put(
            &p,
            "season_cast",
            "s1:1",
            "fr",
            translations::TMDB,
            &TransData {
                characters: vec![Some("Perso Saison".into())],
                ..Default::default()
            },
        )
        .unwrap();

        let mut detail = ShowDetail {
            show: show("s1"),
            seasons: vec![Season {
                number: 1,
                episodes: vec![item("e1", Kind::Episode)],
                cast: vec![CastMember {
                    name: "A".into(),
                    tmdb_id: None,
                    character: Some("orig".into()),
                    profile_url: None,
                }],
            }],
        };
        overlay_show_detail(&p, &mut detail, "fr").unwrap();

        assert_eq!(
            detail.show.metadata.as_ref().unwrap().title.as_deref(),
            Some("Serie FR")
        );
        assert_eq!(
            detail.seasons[0].episodes[0]
                .metadata
                .as_ref()
                .unwrap()
                .title
                .as_deref(),
            Some("Ep FR")
        );
        assert_eq!(
            detail.seasons[0].cast[0].character.as_deref(),
            Some("Perso Saison")
        );
    }
}

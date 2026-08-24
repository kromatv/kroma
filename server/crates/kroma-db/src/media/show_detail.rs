//! One show, with its seasons, its artwork and its stored metadata.

use anyhow::Result;
use rusqlite::params;

use kroma_domain::MediaItem;

use super::shows::{representative_video, row_to_show_bare};
use super::{Metadata, OptionalExtension, Season, ShowDetail};
use crate::{attach_files_batch, parse_metadata, row_to_item, season_casts, Pool, ITEM_COLS};

pub fn show_title(pool: &Pool, id: &str) -> Result<Option<String>> {
    let conn = pool.get()?;
    Ok(conn
        .query_row("SELECT title FROM shows WHERE id = ?1", params![id], |r| {
            r.get(0)
        })
        .optional()?)
}

/// `metadata.posterUrl`, when enrichment found one.
pub fn show_poster_art(pool: &Pool, id: &str) -> Result<Option<String>> {
    Ok(show_metadata(pool, id)?.and_then(|m| m.poster_url))
}

/// The show's full enrichment metadata, when one is stored.
pub fn show_metadata(pool: &Pool, id: &str) -> Result<Option<Metadata>> {
    let conn = pool.get()?;
    let raw: Option<Option<String>> = conn
        .query_row(
            "SELECT metadata FROM shows WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .optional()?;
    Ok(parse_metadata(raw.flatten()))
}

pub fn get_show(pool: &Pool, id: &str) -> Result<Option<ShowDetail>> {
    let conn = pool.get()?;
    let show = conn
        .query_row(
            "SELECT id,title,year,library,added_at,metadata FROM shows WHERE id = ?1",
            params![id],
            row_to_show_bare,
        )
        .optional()?;

    let Some(mut show) = show else {
        return Ok(None);
    };

    let mut stmt = conn.prepare(&format!(
        "SELECT {ITEM_COLS} FROM items WHERE show_id = ?1 \
         ORDER BY season, episode",
    ))?;
    let mut episodes: Vec<MediaItem> = stmt
        .query_map(params![id], row_to_item)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    attach_files_batch(&conn, &mut episodes)?;

    let mut seasons: Vec<Season> = Vec::new();
    for ep in episodes.iter().cloned() {
        let n = ep.season.unwrap_or(0);
        match seasons.iter_mut().find(|s| s.number == n) {
            Some(s) => s.episodes.push(ep),
            None => seasons.push(Season {
                number: n,
                episodes: vec![ep],
                cast: Vec::new(),
            }),
        }
    }
    seasons.sort_by_key(|s| s.number);

    let mut casts = season_casts(pool, id)?;
    for s in &mut seasons {
        if let Some(cast) = casts.remove(&s.number) {
            s.cast = cast;
        }
    }

    show.episode_count = episodes.len() as u32;
    show.season_count = seasons.len() as u32;
    show.video = representative_video(&conn, id)?;

    Ok(Some(ShowDetail { show, seasons }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media::test_support::*;
    use kroma_domain::CastMember;

    #[test]
    fn get_show_groups_seasons_and_attaches_cast() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','shows','/x','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at) VALUES ('s1','lib','Show','t')",
                [],
            )
            .unwrap();
            for (id, s, e) in [("e1", 1, 1), ("e2", 1, 2), ("e3", 2, 1)] {
                conn.execute(
                    "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
                     VALUES (?1,'episode','Ep','mkv','lib','s1',?2,?3,'t')",
                    params![id, s, e],
                )
                .unwrap();
            }
        }
        crate::set_season_cast(
            &p,
            "s1",
            1,
            &[CastMember {
                name: "Adam".into(),
                character: Some("Mark".into()),
                profile_url: None,
            }],
        )
        .unwrap();

        let detail = get_show(&p, "s1").unwrap().unwrap();
        assert_eq!(detail.show.season_count, 2);
        assert_eq!(detail.show.episode_count, 3);
        assert_eq!(detail.seasons.len(), 2);
        assert_eq!(detail.seasons[0].number, 1);
        assert_eq!(detail.seasons[0].episodes.len(), 2);
        assert_eq!(detail.seasons[0].cast.len(), 1);
        assert_eq!(detail.seasons[0].cast[0].name, "Adam");
        assert_eq!(detail.seasons[1].number, 2);
        assert_eq!(detail.seasons[1].episodes.len(), 1);
        assert!(detail.seasons[1].cast.is_empty());

        assert!(get_show(&p, "missing").unwrap().is_none());
        assert_eq!(show_title(&p, "s1").unwrap().as_deref(), Some("Show"));
        assert!(show_title(&p, "missing").unwrap().is_none());
    }

    #[test]
    fn a_shows_poster_comes_from_its_stored_metadata() {
        let p = pool();
        {
            let conn = p.get().unwrap();
            conn.execute(
                "INSERT INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','shows','/x','t')",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at,metadata) VALUES ('s1','lib','Show','t',?1)",
                params![
                    r#"{"tmdbId":1,"tmdbUrl":"x","genres":[],"posterUrl":"/art/poster.jpg"}"#
                ],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at,metadata) VALUES ('s2','lib','Bare','t',?1)",
                params![r#"{"tmdbId":2,"tmdbUrl":"x","genres":[]}"#],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO shows (id,library,title,added_at) VALUES ('s3','lib','Raw','t')",
                [],
            )
            .unwrap();
        }
        assert_eq!(
            show_poster_art(&p, "s1").unwrap().as_deref(),
            Some("/art/poster.jpg")
        );
        assert!(show_poster_art(&p, "s2").unwrap().is_none());
        assert!(show_poster_art(&p, "s3").unwrap().is_none());
        assert!(show_poster_art(&p, "missing").unwrap().is_none());
    }
}

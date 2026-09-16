//! Which title a cached image belongs to, read back from the rows that name
//! its public path: enrichment of that title is what puts a cleared file back.

use anyhow::Result;
use rusqlite::{params, OptionalExtension};

use crate::metadata_core::{ITEM, SHOW};
use crate::Pool;

/// The subject whose enrichment caches `url`: `kind` is `metadata_core::ITEM`
/// or `SHOW`. An episode still answers with its show, since the season fetch
/// is where stills come from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtOwner {
    pub kind: &'static str,
    pub id: String,
}

pub fn art_owner(pool: &Pool, url: &str) -> Result<Option<ArtOwner>> {
    let conn = pool.get()?;
    let quoted = format!("%\"{url}\"%");
    let show = |id: String| ArtOwner { kind: SHOW, id };

    if let Some(id) = conn
        .query_row(
            "SELECT id FROM shows WHERE metadata LIKE ?1 LIMIT 1",
            params![quoted],
            |r| r.get::<_, String>(0),
        )
        .optional()?
    {
        return Ok(Some(show(id)));
    }
    if let Some((id, kind, show_id)) = conn
        .query_row(
            "SELECT id, kind, show_id FROM items WHERE metadata LIKE ?1 LIMIT 1",
            params![quoted],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .optional()?
    {
        return Ok(Some(match show_id {
            Some(show_id) if kind == "episode" => show(show_id),
            _ => ArtOwner { kind: ITEM, id },
        }));
    }
    if let Some((kind, id)) = conn
        .query_row(
            "SELECT subject_kind, subject_id FROM translations \
             WHERE subject_kind IN ('item', 'show') AND data LIKE ?1 LIMIT 1",
            params![quoted],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()?
    {
        let kind = if kind == SHOW { SHOW } else { ITEM };
        return Ok(Some(ArtOwner { kind, id }));
    }
    if let Some(id) = conn
        .query_row(
            "SELECT show_id FROM season_meta WHERE casts LIKE ?1 LIMIT 1",
            params![quoted],
            |r| r.get::<_, String>(0),
        )
        .optional()?
    {
        return Ok(Some(show(id)));
    }
    if let Some(id) = conn
        .query_row(
            "SELECT show_id FROM episode_guide WHERE still_url = ?1 LIMIT 1",
            params![url],
            |r| r.get::<_, String>(0),
        )
        .optional()?
    {
        return Ok(Some(show(id)));
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media::test_support::pool;
    use crate::testing::TempPool;
    use rusqlite::params;

    const ART: &str = "/api/images/feedfeedfeedfeed.webp";

    fn seeded() -> TempPool {
        let p = pool();
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
        conn.execute(
            "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,added_at) \
             VALUES ('e1','episode','Ep','mkv','lib','s1',1,1,'t')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO items (id,kind,title,container,library,added_at) \
             VALUES ('m1','movie','Film','mkv','lib','t')",
            [],
        )
        .unwrap();
        drop(conn);
        p
    }

    fn meta_with(url: &str) -> String {
        format!(r#"{{"tmdbId":1,"tmdbUrl":"x","genres":[],"backdropUrl":"{url}"}}"#)
    }

    #[test]
    fn a_shows_own_art_answers_with_the_show() {
        let p = seeded();
        p.get()
            .unwrap()
            .execute(
                "UPDATE shows SET metadata = ?1 WHERE id = 's1'",
                params![meta_with(ART)],
            )
            .unwrap();

        let owner = art_owner(&p, ART).unwrap();

        assert_eq!(owner, Some(ArtOwner { kind: SHOW, id: "s1".into() }));
    }

    #[test]
    fn an_episode_still_answers_with_its_show_and_a_movie_with_itself() {
        let p = seeded();
        p.get()
            .unwrap()
            .execute(
                "UPDATE items SET metadata = ?1 WHERE id = 'e1'",
                params![meta_with(ART)],
            )
            .unwrap();
        p.get()
            .unwrap()
            .execute(
                "UPDATE items SET metadata = ?1 WHERE id = 'm1'",
                params![meta_with("/api/images/movie.webp")],
            )
            .unwrap();

        assert_eq!(
            art_owner(&p, ART).unwrap(),
            Some(ArtOwner { kind: SHOW, id: "s1".into() })
        );
        assert_eq!(
            art_owner(&p, "/api/images/movie.webp").unwrap(),
            Some(ArtOwner { kind: ITEM, id: "m1".into() })
        );
    }

    #[test]
    fn a_languages_poster_a_season_portrait_and_a_listed_still_name_their_subject() {
        let p = seeded();
        crate::translations::put(
            &p,
            SHOW,
            "s1",
            "fr",
            crate::translations::TMDB,
            &crate::translations::TransData {
                poster_url: Some("/api/images/fr.webp".into()),
                ..Default::default()
            },
        )
        .unwrap();
        crate::set_season_cast(
            &p,
            "s1",
            1,
            &[kroma_domain::CastMember {
                name: "A".into(),
                tmdb_id: None,
                character: None,
                profile_url: Some("/api/images/face.webp".into()),
            }],
        )
        .unwrap();
        crate::replace_episode_guide(
            &p,
            "s1",
            1,
            &[kroma_domain::ListedEpisode {
                episode: 2,
                title: None,
                overview: None,
                air_date: None,
                still_url: Some("/api/images/gap.webp".into()),
            }],
        )
        .unwrap();

        for url in ["/api/images/fr.webp", "/api/images/face.webp", "/api/images/gap.webp"] {
            assert_eq!(
                art_owner(&p, url).unwrap(),
                Some(ArtOwner { kind: SHOW, id: "s1".into() }),
                "{url}"
            );
        }
    }

    #[test]
    fn an_image_nothing_names_has_no_owner() {
        let p = seeded();

        assert_eq!(art_owner(&p, ART).unwrap(), None);
    }
}

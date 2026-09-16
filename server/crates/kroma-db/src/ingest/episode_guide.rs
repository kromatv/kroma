//! What the provider lists for a season (`episode_guide`), kept beside the
//! episodes on disk so a gap in a season still has a title, a still and an air
//! date to show.

use std::collections::HashMap;

use anyhow::Result;
use rusqlite::params;

use kroma_domain::ListedEpisode;

use crate::Pool;

/// Store one season's roster as the provider lists it, every episode included,
/// replacing what was stored for that season.
pub fn replace_episode_guide(
    pool: &Pool,
    show_id: &str,
    season: u32,
    episodes: &[ListedEpisode],
) -> Result<()> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;
    tx.execute(
        "DELETE FROM episode_guide WHERE show_id = ?1 AND season = ?2",
        params![show_id, season],
    )?;
    {
        let mut stmt = tx.prepare(
            "INSERT INTO episode_guide (show_id, season, episode, title, overview, air_date, still_url) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )?;
        for ep in episodes {
            stmt.execute(params![
                show_id,
                season,
                ep.episode,
                ep.title,
                ep.overview,
                ep.air_date,
                ep.still_url
            ])?;
        }
    }
    tx.commit()?;
    Ok(())
}

const NOT_ON_DISK: &str = "NOT EXISTS (\
    SELECT 1 FROM items i \
    WHERE i.show_id = g.show_id AND i.season = g.season \
      AND g.episode BETWEEN i.episode AND COALESCE(i.episode_end, i.episode))";

/// Per season, the listed episodes the library does not hold, in episode order.
pub fn season_gaps(pool: &Pool, show_id: &str) -> Result<HashMap<u32, Vec<ListedEpisode>>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(&format!(
        "SELECT g.season, g.episode, g.title, g.overview, g.air_date, g.still_url \
         FROM episode_guide g \
         WHERE g.show_id = ?1 AND {NOT_ON_DISK} \
         ORDER BY g.season, g.episode"
    ))?;
    let rows = stmt.query_map(params![show_id], |r| {
        Ok((
            r.get::<_, u32>(0)?,
            ListedEpisode {
                episode: r.get(1)?,
                title: r.get(2)?,
                overview: r.get(3)?,
                air_date: r.get(4)?,
                still_url: r.get(5)?,
            },
        ))
    })?;
    let mut out: HashMap<u32, Vec<ListedEpisode>> = HashMap::new();
    for row in rows {
        let (season, ep) = row?;
        out.entry(season).or_default().push(ep);
    }
    Ok(out)
}

/// Whether `season`'s roster is worth fetching again: never stored, or holding a
/// gap that is undated or aired within the last week, whose still and date the
/// provider may still be settling.
pub fn episode_guide_stale(pool: &Pool, show_id: &str, season: u32) -> Result<bool> {
    let conn = pool.get()?;
    let stored: i64 = conn.query_row(
        "SELECT COUNT(*) FROM episode_guide WHERE show_id = ?1 AND season = ?2",
        params![show_id, season],
        |r| r.get(0),
    )?;
    if stored == 0 {
        return Ok(true);
    }
    let unsettled: i64 = conn.query_row(
        &format!(
            "SELECT COUNT(*) FROM episode_guide g \
             WHERE g.show_id = ?1 AND g.season = ?2 \
               AND (g.air_date IS NULL OR g.air_date > date('now', '-7 days')) \
               AND {NOT_ON_DISK}"
        ),
        params![show_id, season],
        |r| r.get(0),
    )?;
    Ok(unsettled > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::TempPool;

    fn pool() -> TempPool {
        let p = crate::testing::temp_pool("episode-guide");
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
        for (id, e, end) in [("e1", 1, None), ("e2", 2, Some(3))] {
            conn.execute(
                "INSERT INTO items (id,kind,title,container,library,show_id,season,episode,episode_end,added_at) \
                 VALUES (?1,'episode','Ep','mkv','lib','s1',1,?2,?3,'t')",
                params![id, e, end],
            )
            .unwrap();
        }
        p
    }

    fn listed(episode: u32, air_date: Option<&str>) -> ListedEpisode {
        ListedEpisode {
            episode,
            title: Some(format!("Ep {episode}")),
            overview: None,
            air_date: air_date.map(str::to_string),
            still_url: Some(format!("/api/images/{episode}.webp")),
        }
    }

    #[test]
    fn a_seasons_gaps_are_the_listed_episodes_no_file_covers() {
        let p = pool();

        replace_episode_guide(
            &p,
            "s1",
            1,
            &[
                listed(1, Some("2020-01-01")),
                listed(2, Some("2020-01-08")),
                listed(3, Some("2020-01-15")),
                listed(4, Some("2020-01-22")),
                listed(5, None),
            ],
        )
        .unwrap();

        let gaps = season_gaps(&p, "s1").unwrap();
        let s1: Vec<u32> = gaps[&1].iter().map(|e| e.episode).collect();
        assert_eq!(s1, vec![4, 5], "a two-episode file covers 2 and 3");
        assert_eq!(gaps[&1][0].title.as_deref(), Some("Ep 4"));
        assert_eq!(gaps[&1][0].still_url.as_deref(), Some("/api/images/4.webp"));
    }

    #[test]
    fn replacing_a_season_drops_what_it_listed_before() {
        let p = pool();
        replace_episode_guide(&p, "s1", 1, &[listed(4, None), listed(5, None)]).unwrap();

        replace_episode_guide(&p, "s1", 1, &[listed(4, None)]).unwrap();

        let gaps = season_gaps(&p, "s1").unwrap();
        assert_eq!(gaps[&1].len(), 1);
    }

    #[test]
    fn a_season_never_stored_is_stale() {
        let p = pool();

        assert!(episode_guide_stale(&p, "s1", 1).unwrap());
    }

    #[test]
    fn a_season_whose_gaps_aired_long_ago_is_settled() {
        let p = pool();
        replace_episode_guide(&p, "s1", 1, &[listed(4, Some("2020-01-22"))]).unwrap();

        assert!(!episode_guide_stale(&p, "s1", 1).unwrap());
    }

    #[test]
    fn an_undated_or_upcoming_gap_keeps_the_season_stale() {
        let p = pool();

        replace_episode_guide(&p, "s1", 1, &[listed(4, None)]).unwrap();
        assert!(episode_guide_stale(&p, "s1", 1).unwrap());

        replace_episode_guide(&p, "s1", 1, &[listed(4, Some("2999-01-01"))]).unwrap();
        assert!(episode_guide_stale(&p, "s1", 1).unwrap());
    }

    #[test]
    fn an_upcoming_episode_already_on_disk_does_not_count() {
        let p = pool();
        replace_episode_guide(&p, "s1", 1, &[listed(1, Some("2999-01-01"))]).unwrap();

        assert!(!episode_guide_stale(&p, "s1", 1).unwrap());
        assert!(season_gaps(&p, "s1").unwrap().is_empty());
    }
}

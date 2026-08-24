//! The "En vedette" hero pick: one spotlight title per user per day. This file
//! orchestrates gather -> gate -> rank -> rotate -> localize; [`score`] holds the
//! scoring rules and [`gather`] the catalog/history reads.

mod gather;
mod score;

#[cfg(test)]
mod fixtures;

use std::collections::{HashMap, HashSet};

use crate::db::{self, Pool};
use crate::model::SectionItem;
use crate::services::jobs::now_ms;
use crate::state::SharedState;

use score::{presentable, rank, rotation_index, DAY_MS};

const ROTATION_POOL: usize = 5;

/// Today's featured entry for one user, localized. `None` only when the catalog
/// is empty.
pub fn pick(state: &SharedState, pool: &Pool, locale: &str, user_id: &str) -> Option<SectionItem> {
    let _ = state.vectors.refresh_if_stale(pool);

    let all = gather::catalog(pool);
    if all.is_empty() {
        return None;
    }

    let recent = db::recent_watched_ids(pool, user_id).unwrap_or_default();
    let seen = gather::seen_ids(pool, user_id, &recent);
    let taste: HashMap<String, f32> = if recent.is_empty() {
        HashMap::new()
    } else {
        state
            .vectors
            .for_you(&recent, usize::MAX)
            .into_iter()
            .collect()
    };
    let trend = gather::trend_scores(pool);
    let (day, day_start) = today(now_ms());

    let candidates = gate(&all, &seen);
    let top = rank(&candidates, &taste, &trend, day_start, ROTATION_POOL);
    let winner = *top.get(rotation_index(day, user_id, top.len()))?;
    let mut hero = vec![winner.clone()];
    let _ = db::localize::overlay_section_items(pool, &mut hero, locale);
    hero.pop()
}

// Relaxes strict -> presentable-only -> anything, so a small or fully-watched
// library still yields a hero.
fn gate<'a>(all: &'a [SectionItem], seen: &HashSet<String>) -> Vec<&'a SectionItem> {
    let strict: Vec<&SectionItem> = all
        .iter()
        .filter(|e| presentable(e) && !seen.contains(e.id()))
        .collect();
    if !strict.is_empty() {
        return strict;
    }
    let presentable_only: Vec<&SectionItem> = all.iter().filter(|e| presentable(e)).collect();
    if presentable_only.is_empty() {
        all.iter().collect()
    } else {
        presentable_only
    }
}

// Scoring runs on the day start, not the wall clock: freshness moves
// continuously, and re-ranking against it per request would slide the hero
// through the day instead of holding it.
fn today(now_ms: i64) -> (u64, i64) {
    let day = now_ms.div_euclid(DAY_MS);
    (day as u64, day * DAY_MS)
}

#[cfg(test)]
mod tests {
    use super::fixtures::{meta, seed_user};
    use super::*;
    use crate::model::Metadata;
    use crate::test_support;

    fn seed_movie(pool: &Pool, id: &str, m: &Metadata) {
        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO libraries (id,name,kind,path,added_at) VALUES ('lib','L','movies','/x','t')",
            [],
        )
        .unwrap();
        // Test-controlled literals, inlined because kroma-engine has no direct
        // rusqlite dependency for parameter binding.
        let json = serde_json::to_string(m).unwrap();
        let now = kroma_primitives::now_iso8601();
        conn.execute(
            &format!(
                "INSERT INTO items (id,kind,title,container,library,added_at,metadata) \
                 VALUES ('{id}','movie','Title {id}','mkv','lib','{now}','{json}')"
            ),
            [],
        )
        .unwrap();
    }

    #[test]
    fn scoring_clock_is_quantized_to_the_day() {
        let (day, start) = today(1_700_000_000_000);
        assert_eq!(start % DAY_MS, 0);
        assert_eq!(today(start), (day, start));
        assert_eq!(today(start + DAY_MS - 1), (day, start));
        assert_eq!(today(start + DAY_MS), (day + 1, start + DAY_MS));
    }

    #[test]
    fn pick_returns_none_on_empty_catalog() {
        let state = test_support::test_state();
        assert!(pick(&state, &state.db, "en", "u1").is_none());
    }

    #[test]
    fn pick_prefers_presentable_and_novel_titles() {
        let state = test_support::test_state();
        seed_movie(&state.db, "plain", &meta(Some(9.9), false, false));
        seed_movie(&state.db, "hero", &meta(Some(7.0), true, true));
        let picked = pick(&state, &state.db, "en", "u1").expect("a hero");
        assert_eq!(picked.id(), "hero");
    }

    #[test]
    fn pick_skips_watched_then_relaxes_when_exhausted() {
        let state = test_support::test_state();
        seed_movie(&state.db, "seen", &meta(Some(9.0), true, true));
        seed_movie(&state.db, "fresh", &meta(Some(6.0), true, true));
        // The watched table has an FK on users, so the marker needs a real row.
        seed_user(&state, "u1");
        db::mark_watched(&state.db, "u1", "seen").unwrap();
        let picked = pick(&state, &state.db, "en", "u1").expect("a hero");
        assert_eq!(picked.id(), "fresh");
        db::mark_watched(&state.db, "u1", "fresh").unwrap();
        assert!(pick(&state, &state.db, "en", "u1").is_some());
    }

    #[test]
    fn a_reader_with_a_history_is_scored_against_their_taste() {
        let state = test_support::test_state();
        seed_movie(&state.db, "seen", &meta(Some(9.9), true, true));
        seed_movie(&state.db, "fresh", &meta(Some(6.0), true, true));
        seed_user(&state, "u1");
        state
            .db
            .get()
            .unwrap()
            .execute(
                "INSERT INTO play_history (id,user_id,item_id,kind,title,started_at,ended_at) \
                 VALUES ('h1','u1','seen','movie','Title seen',1,2)",
                [],
            )
            .unwrap();

        let picked = pick(&state, &state.db, "en", "u1").expect("a hero");
        assert_eq!(
            picked.id(),
            "fresh",
            "the title they just finished is not the hero"
        );
    }

    #[test]
    fn gate_ladder_relaxes_presentation_before_going_dark() {
        let plain = fixtures::movie("plain", Some(meta(None, false, false)), "t", None);
        let shown = fixtures::movie("shown", Some(meta(None, true, true)), "t", None);
        let all = vec![plain, shown];
        let seen: HashSet<String> = ["shown".to_string()].into();
        let ids = |v: Vec<&SectionItem>| v.iter().map(|e| e.id().to_string()).collect::<Vec<_>>();
        assert_eq!(ids(gate(&all, &HashSet::new())), ["shown"]);
        assert_eq!(ids(gate(&all, &seen)), ["shown"]);
        assert_eq!(ids(gate(&all[..1], &HashSet::new())), ["plain"]);
    }
}

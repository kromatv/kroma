//! Pipeline stage `credits`: finds where each film's credits start, so reaching
//! them counts as watched. Per film, since a film has no season to align
//! against. Wraps [`crate::services::markers::credits::detect_movie`].

use anyhow::{anyhow, Result};

use crate::model::Kind;
use crate::services::jobs::{JobContext, JobKey, Trigger};
use crate::state::SharedState;

use super::common::stage;

stage! {
    short: "credits",
    subject_kind: "item",
    concurrency: 1,
    pause_for_playback: true,
    schedule: None,
    triggers: &[Trigger::AfterJob(JobKey("pipeline.markers"))],
}

fn enumerate(state: &SharedState) -> Result<Vec<(String, String)>> {
    let mode = state.settings.get_str("introDetection", "chapters");
    if mode == "off" {
        return Ok(Vec::new());
    }
    let items = crate::db::list_items(&state.db, None)?;
    Ok(items
        .into_iter()
        .filter(|i| i.kind == Kind::Movie)
        .filter_map(|i| {
            let abs = i.abs_path.as_deref()?;
            if i.duration_ms.unwrap_or(0) == 0 {
                return None;
            }
            let sig = super::sig_for_path(abs);
            if sig == crate::db::pipeline::UNREADABLE_SIG {
                return Some((i.id, sig));
            }
            let signed = crate::services::scan::short_hash(&format!("{mode}|{sig}"));
            Some((i.id, signed))
        })
        .collect())
}

fn process(ctx: &JobContext, item_id: &str) -> Result<()> {
    let item = crate::db::get_item(&ctx.state.db, item_id)?
        .ok_or_else(|| anyhow!("item {item_id} no longer exists"))?;
    crate::services::markers::credits::detect_movie(ctx, &item)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{seed_movie, seed_show_episode, test_state};

    fn set_duration(state: &SharedState, item_id: &str, ms: i64) {
        state
            .db
            .get()
            .unwrap()
            .execute(
                &format!("UPDATE items SET duration_ms = {ms} WHERE id = '{item_id}'"),
                [],
            )
            .unwrap();
    }

    #[test]
    fn only_films_with_a_known_duration_are_in_scope() {
        let state = test_state();
        seed_movie(&state, "m1");
        let (_, ep) = seed_show_episode(&state, "s1", "e1");
        set_duration(&state, &ep, 1_400_000);
        assert!(enumerate(&state).unwrap().is_empty());

        set_duration(&state, "m1", 7_200_000);

        let subjects = enumerate(&state).unwrap();
        assert_eq!(subjects.len(), 1);
        assert_eq!(subjects[0].0, "m1");
    }

    #[test]
    fn the_signature_follows_the_detection_mode() {
        let state = test_state();
        seed_movie(&state, "m1");
        set_duration(&state, "m1", 7_200_000);
        let file = state.config.data_dir.join("m1.mkv");
        std::fs::write(&file, b"x").unwrap();
        let conn = state.db.get().unwrap();
        let path = file.to_string_lossy().to_string();
        conn.execute("UPDATE items SET abs_path = ?1 WHERE id = 'm1'", [&path])
            .unwrap();
        conn.execute(
            "UPDATE files SET abs_path = ?1 WHERE item_id = 'm1'",
            [&path],
        )
        .unwrap();
        drop(conn);
        let before = enumerate(&state).unwrap();

        state.settings.set_patch(
            &state.db,
            [(
                "introDetection".to_string(),
                serde_json::json!("fingerprint"),
            )]
            .into(),
        );

        let after = enumerate(&state).unwrap();
        assert_ne!(before[0].1, after[0].1);
    }

    #[test]
    fn detection_off_empties_the_stage() {
        let state = test_state();
        seed_movie(&state, "m1");
        set_duration(&state, "m1", 7_200_000);

        state.settings.set_patch(
            &state.db,
            [("introDetection".to_string(), serde_json::json!("off"))].into(),
        );

        assert!(enumerate(&state).unwrap().is_empty());
    }

    #[test]
    fn a_film_that_vanished_since_enumerate_is_reported() {
        let state = test_state();
        let err = process(&JobContext::for_test(state), "ghost").unwrap_err();
        assert!(format!("{err:#}").contains("no longer exists"), "{err:#}");
    }
}

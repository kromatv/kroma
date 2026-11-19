use std::time::{SystemTime, UNIX_EPOCH};

use super::*;

const RELEASE: &str = "SELECT h.abs_path, h.user_id, f.item_id, \
            h.watched_at, h.position_ms, h.duration_ms, h.resumed_at, h.listed \
     FROM import_held_states h JOIN files f ON f.abs_path = h.abs_path";

fn now_secs() -> i64 {
    let since = SystemTime::now().duration_since(UNIX_EPOCH).unwrap();
    since.as_secs() as i64
}

fn held_rows(pool: &Pool) -> Vec<String> {
    rows(
        pool,
        "SELECT abs_path || ' for ' || user_id || ' watched ' || COALESCE(watched_at, '-') \
         || ' at ' || COALESCE(position_ms, '-') FROM import_held_states ORDER BY 1",
    )
}

fn data_dir(pool: &Pool) -> std::path::PathBuf {
    pool.path().parent().unwrap().to_path_buf()
}

#[test]
fn a_state_dated_after_a_players_write_wins_and_one_dated_before_it_does_not() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    crate::upsert_progress(&pool, &ana, "heat", 600_000, Some(7_200_000)).unwrap();

    let older = merge(&pool, &ana, Place::Title("heat"), stopped(1_000_000, now_secs() - 60));
    let newer = merge(&pool, &ana, Place::Title("heat"), stopped(3_000_000, now_secs() + 60));

    assert_eq!(older, Merged::Unchanged);
    assert_eq!(newer, Merged::Changed);
}

#[test]
fn a_backup_carries_a_held_state_to_another_server() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    let brought = Watching {
        listed: true,
        ..watched_and_stopped(5_025_000, LAST_WEEK)
    };
    merge(&pool, &ana, Place::File(HEAT), brought);
    let held = held_rows(&pool);
    let other = super::pool();

    let doc = crate::export_portable(&pool, &data_dir(&pool)).unwrap();
    crate::import_portable(&other, &data_dir(&other), &doc, true).unwrap();

    assert_eq!(held.len(), 1);
    assert_eq!(held_rows(&other), held);
}

#[test]
fn a_state_held_for_one_file_by_two_accounts_shows_for_each_of_them() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    let ben = an_account(&pool, "ben");
    merge(&pool, &ana, Place::File(HEAT), stopped(600_000, LAST_WEEK));
    merge(&pool, &ben, Place::File(HEAT), watched(YESTERDAY));
    let conn = pool.get().unwrap();
    conn.execute(
        "INSERT INTO files (id,item_id,abs_path) VALUES ('f1','heat',?1)",
        [HEAT],
    )
    .unwrap();

    let released = release_held_states(&conn).unwrap();

    assert_eq!(released, 2);
    assert_eq!(held_rows(&pool), Vec::<String>::new());
    assert_eq!(rows(&pool, "SELECT user_id FROM progress"), [ana.as_str()]);
    assert_eq!(rows(&pool, "SELECT user_id FROM watched"), [ben.as_str()]);
}

#[test]
fn the_release_reads_no_whole_table_when_nothing_is_held() {
    let (pool, _) = a_film_with_a_library_and_an_account();
    let conn = pool.get().unwrap();
    let mut stmt = conn
        .prepare(&format!("EXPLAIN QUERY PLAN {RELEASE}"))
        .unwrap();
    let plan: Vec<String> = stmt
        .query_map([], |r| r.get(3))
        .unwrap()
        .map(Result::unwrap)
        .collect();

    assert!(
        !plan.iter().any(|step| step.starts_with("SCAN f")),
        "{plan:#?}"
    );
}

#[test]
fn a_players_writes_during_many_merges_are_all_kept() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    let last_played = 1_000 + 199;

    std::thread::scope(|scope| {
        scope.spawn(|| {
            for step in 0..200 {
                crate::upsert_progress(&pool, &ana, "heat", 1_000 + step, Some(7_200_000))
                    .unwrap();
            }
        });
        for step in 0..200 {
            let brought = stopped(5_000_000, LAST_WEEK + step);
            merge_states(&pool, &ana, &[(Place::Title("heat"), brought)]).unwrap();
        }
    });

    assert_eq!(
        rows(&pool, "SELECT CAST(position_ms AS TEXT) FROM progress")
            .first()
            .map(String::as_str),
        Some(last_played.to_string().as_str())
    );
}

#[test]
fn a_page_whose_second_state_fails_leaves_nothing_of_its_first_state() {
    let (pool, ana) = a_film_with_a_library_and_an_account();
    a_film(&pool, "ronin");
    pool.get()
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER no_list BEFORE INSERT ON my_list \
             BEGIN SELECT RAISE(ABORT, 'the disk is full'); END",
        )
        .unwrap();
    let page = [
        (Place::Title("heat"), stopped(600_000, LAST_WEEK)),
        (Place::Title("ronin"), favourite()),
    ];

    let merged = merge_states(&pool, &ana, &page);

    assert!(merged.is_err());
    assert_eq!(resume_points(&pool), Vec::<String>::new());
}

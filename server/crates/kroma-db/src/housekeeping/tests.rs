use super::*;

const NOW: i64 = 1_800_000_000;

fn count(pool: &Pool, sql: &str) -> i64 {
    pool.get()
        .unwrap()
        .query_row(sql, [], |r| r.get(0))
        .unwrap()
}

fn seeded() -> crate::testing::TempPool {
    let pool = crate::testing::temp_pool("housekeeping");
    pool.get()
        .unwrap()
        .execute_batch(&format!(
            "INSERT INTO users (id, email, username, password_hash, created_at) \
                 VALUES ('u1', 'a@b.c', 'alice', 'x', '2026-01-01');
             INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES
                 ('old', 'u1', '2026-01-01', {old}), ('live', 'u1', '2026-01-01', {live});
             INSERT INTO access_tokens (token, user_id, created_at, expires_at) VALUES
                 ('gone', 'u1', '2026-01-01', {old}), ('kept', 'u1', '2026-01-01', {live});
             INSERT INTO libraries (id, name, kind, path, added_at) VALUES ('l', 'L', 'movies', '/m', 'x');
             INSERT INTO items (id, kind, title, container, library, added_at)
                 VALUES ('here', 'movie', 'T', 'mkv', 'l', 'x');
             INSERT INTO pipeline_tasks (stage, subject_kind, subject_id, status, enqueued_at, updated_at) VALUES
                 ('probe', 'item', 'here', 'done', 0, 0), ('probe', 'item', 'gone', 'pending', 0, 0),
                 ('probe', 'file', 'gone', 'pending', 0, 0), ('markers', 'season', 's1:1', 'done', 0, 0);",
            old = NOW - 1,
            live = NOW + 3600,
        ))
        .unwrap();
    pool
}

#[test]
fn a_pass_drops_expired_credentials_and_work_whose_subject_is_gone() {
    let pool = seeded();

    let tidied = tidy(&pool, NOW).unwrap();

    assert_eq!(
        tidied,
        Tidied {
            sessions: 1,
            access_tokens: 1,
            pipeline_tasks: 2,
            deliveries: 0,
            flow_tallies: 0
        }
    );
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM sessions"), 1);
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM access_tokens"), 1);
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM pipeline_tasks"), 2);
}

#[test]
fn a_pass_drops_a_push_record_past_its_retention_and_keeps_a_recent_one() {
    let pool = seeded();
    let stale = NOW * 1_000 - (crate::notification_deliveries::RETENTION_DAYS + 1) * 86_400_000;
    pool.get()
        .unwrap()
        .execute_batch(&format!(
            "INSERT INTO notification_deliveries \
                 (id, user_id, transport, status, created_at) VALUES
                 ('old', 'u1', 'webpush', 'sent', {stale}),
                 ('new', 'u1', 'webpush', 'sent', {now});",
            now = NOW * 1_000,
        ))
        .unwrap();

    let tidied = tidy(&pool, NOW).unwrap();

    assert_eq!(tidied.deliveries, 1);
    assert_eq!(
        count(&pool, "SELECT COUNT(*) FROM notification_deliveries"),
        1
    );
}

#[test]
fn a_pass_drops_the_flow_tallies_past_their_retention() {
    let pool = seeded();
    let today = crate::network_flows::day_of(NOW * 1_000);
    pool.get()
        .unwrap()
        .execute_batch(&format!(
            "INSERT INTO network_flows_daily \
                 (day, caller, purpose, host, route, verdict, count, bytes_in, bytes_out, last_at) VALUES
                 ({stale}, 'core', 'metadata', 'a', 'direct', 'allowed', 1, 0, 0, 0),
                 ({today}, 'core', 'metadata', 'a', 'direct', 'allowed', 1, 0, 0, 0);",
            stale = today - crate::network_flows::RETENTION_DAYS - 1,
        ))
        .unwrap();

    let tidied = tidy(&pool, NOW).unwrap();

    assert_eq!(tidied.flow_tallies, 1);
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM network_flows_daily"), 1);
}

#[test]
fn optimizing_records_the_statistics_the_planner_picks_indexes_by() {
    let pool = seeded();

    optimize(&pool).unwrap();

    assert_eq!(
        count(
            &pool,
            "SELECT COUNT(*) FROM sqlite_schema WHERE name = 'sqlite_stat1'"
        ),
        1
    );
}

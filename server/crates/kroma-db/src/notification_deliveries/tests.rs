use super::*;
use crate::testing::TempPool;

const NOW: i64 = 1_800_000_000_000;
const DAY_MS: i64 = 24 * 3_600 * 1_000;

fn pool() -> (TempPool, String, String) {
    let p = crate::testing::temp_pool("deliveries");
    let ana = crate::create_user(&p, "ana@test.dev", "Ana", "h", &[])
        .unwrap()
        .id;
    let bo = crate::create_user(&p, "bo@test.dev", "Bo", "h", &[])
        .unwrap()
        .id;
    (p, ana, bo)
}

fn attempt<'a>(
    id: &str,
    user_id: &'a str,
    status: DeliveryStatus,
    created_at: i64,
) -> NewDelivery<'a> {
    NewDelivery {
        id: id.into(),
        user_id,
        notification_id: Some("n1"),
        subscription_id: Some("sub-1"),
        device: Some("Firefox on Mac"),
        transport: PushTransport::WebPush,
        status,
        error: None,
        created_at,
    }
}

#[test]
fn a_recorded_attempt_reads_back_with_its_device_and_outcome() {
    let (p, ana, _) = pool();
    let conn = p.get().unwrap();

    record(&conn, &attempt("d1", &ana, DeliveryStatus::Sent, NOW)).unwrap();

    let list = deliveries_for_user(&conn, &ana, 50).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].status, DeliveryStatus::Sent);
    assert_eq!(list[0].device.as_deref(), Some("Firefox on Mac"));
    assert_eq!(list[0].device_id.as_deref(), Some("sub-1"));
    assert_eq!(list[0].notification_id.as_deref(), Some("n1"));
}

#[test]
fn a_reader_sees_their_own_attempts_newest_first_and_nobody_elses() {
    let (p, ana, bo) = pool();
    let conn = p.get().unwrap();
    record(
        &conn,
        &attempt("old", &ana, DeliveryStatus::Failed, NOW - 1_000),
    )
    .unwrap();
    record(&conn, &attempt("new", &ana, DeliveryStatus::Sent, NOW)).unwrap();
    record(&conn, &attempt("theirs", &bo, DeliveryStatus::Sent, NOW)).unwrap();

    let list = deliveries_for_user(&conn, &ana, 50).unwrap();

    assert_eq!(
        list.iter().map(|d| d.id.as_str()).collect::<Vec<_>>(),
        ["new", "old"]
    );
}

#[test]
fn an_attempt_survives_the_device_it_was_sent_to() {
    let (p, ana, _) = pool();
    let conn = p.get().unwrap();
    record(&conn, &attempt("d1", &ana, DeliveryStatus::Gone, NOW)).unwrap();

    conn.execute("DELETE FROM push_subscriptions WHERE id = 'sub-1'", [])
        .unwrap();

    let list = deliveries_for_user(&conn, &ana, 50).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].status, DeliveryStatus::Gone);
}

#[test]
fn the_admin_view_names_whose_device_each_attempt_was() {
    let (p, ana, bo) = pool();
    let conn = p.get().unwrap();
    record(&conn, &attempt("d1", &ana, DeliveryStatus::Sent, NOW)).unwrap();
    record(&conn, &attempt("d2", &bo, DeliveryStatus::Failed, NOW + 1)).unwrap();

    let list = recent_deliveries(&conn, 50).unwrap();

    assert_eq!(list.len(), 2);
    assert_eq!(list[0].account.as_ref().unwrap().username, "Bo");
    assert_eq!(list[1].account.as_ref().unwrap().id, ana);
}

#[test]
fn deleting_an_account_takes_its_records_with_it() {
    let (p, ana, _) = pool();
    let conn = p.get().unwrap();
    record(&conn, &attempt("d1", &ana, DeliveryStatus::Sent, NOW)).unwrap();

    conn.execute("DELETE FROM users WHERE id = ?1", params![ana])
        .unwrap();

    assert!(deliveries_for_user(&conn, &ana, 50).unwrap().is_empty());
}

#[test]
fn pruning_drops_what_is_older_than_the_retention_and_keeps_the_rest() {
    let (p, ana, _) = pool();
    {
        let conn = p.get().unwrap();
        let stale = NOW - (RETENTION_DAYS + 1) * DAY_MS;
        record(&conn, &attempt("stale", &ana, DeliveryStatus::Sent, stale)).unwrap();
        record(&conn, &attempt("fresh", &ana, DeliveryStatus::Sent, NOW)).unwrap();
    }

    assert_eq!(prune(&p, NOW).unwrap(), 1);

    let conn = p.get().unwrap();
    let left = deliveries_for_user(&conn, &ana, 50).unwrap();
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].id, "fresh");
}

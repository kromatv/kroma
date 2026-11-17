use super::super::test_support::{client, test_db};
use super::*;

#[test]
fn download_clients_crud_and_ordering() {
    let pool = test_db();
    {
        let conn = pool.get().unwrap();
        // Empty DB: nothing to list / find / prefer.
        assert!(list_download_clients(&conn).unwrap().is_empty());
        assert!(get_download_client(&conn, "c1").unwrap().is_none());
        assert!(enabled_download_clients(&conn).unwrap().is_empty());
    }

    insert_download_client(&pool, &client("c1", 10, true, 100)).unwrap();
    insert_download_client(&pool, &client("c2", 20, true, 200)).unwrap();
    insert_download_client(&pool, &client("c3", 20, false, 150)).unwrap();

    {
        let conn = pool.get().unwrap();
        // ORDER BY priority DESC, created_at ASC: c3 (20,150), c2 (20,200), c1 (10).
        let ids: Vec<String> = list_download_clients(&conn)
            .unwrap()
            .into_iter()
            .map(|c| c.id)
            .collect();
        assert_eq!(
            ids,
            vec!["c3".to_string(), "c2".to_string(), "c1".to_string()]
        );

        let c2 = get_download_client(&conn, "c2").unwrap().unwrap();
        assert_eq!(c2.name, "Client c2");
        assert_eq!(c2.password, "secret");
        assert!(get_download_client(&conn, "missing").unwrap().is_none());

        // Enabled, by priority (disabled c3 is skipped).
        let enabled: Vec<String> = enabled_download_clients(&conn)
            .unwrap()
            .into_iter()
            .map(|c| c.id)
            .collect();
        assert_eq!(enabled, vec!["c2".to_string(), "c1".to_string()]);
    }

    // INSERT OR IGNORE: re-inserting an existing id keeps the original row.
    insert_download_client(&pool, &client("c1", 99, false, 999)).unwrap();
    {
        let conn = pool.get().unwrap();
        let c1 = get_download_client(&conn, "c1").unwrap().unwrap();
        assert_eq!(c1.priority, 10);
        assert_eq!(c1.name, "Client c1");
    }

    // Partial update: name/enabled/priority change; password None keeps the secret.
    assert!(update_download_client(
        &pool,
        "c1",
        &ClientChanges {
            name: Some("Renamed"),
            enabled: Some(false),
            priority: Some(50),
            ..Default::default()
        },
    )
    .unwrap());
    {
        let conn = pool.get().unwrap();
        let c1 = get_download_client(&conn, "c1").unwrap().unwrap();
        assert_eq!(c1.name, "Renamed");
        assert!(!c1.enabled);
        assert_eq!(c1.priority, 50);
        assert_eq!(c1.password, "secret"); // unchanged
        assert_eq!(c1.url, "http://host"); // unchanged
    }
    // Password can be updated when Some is passed.
    assert!(update_download_client(
        &pool,
        "c1",
        &ClientChanges {
            password: Some("newpass"),
            ..Default::default()
        },
    )
    .unwrap());
    {
        let conn = pool.get().unwrap();
        assert_eq!(
            get_download_client(&conn, "c1").unwrap().unwrap().password,
            "newpass"
        );
    }
    // Updating an unknown id affects no rows.
    assert!(!update_download_client(
        &pool,
        "missing",
        &ClientChanges {
            name: Some("x"),
            ..Default::default()
        },
    )
    .unwrap());

    assert!(delete_download_client(&pool, "c1").unwrap());
    assert!(!delete_download_client(&pool, "c1").unwrap()); // already gone
    {
        let conn = pool.get().unwrap();
        assert!(get_download_client(&conn, "c1").unwrap().is_none());
    }
}

#[test]
fn a_client_update_the_database_refuses_surfaces_instead_of_reading_as_no_such_row() {
    let pool = test_db();
    insert_download_client(&pool, &client("a", 0, true, 100)).unwrap();
    pool.get()
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER refuse_client BEFORE UPDATE ON download_clients \
             BEGIN SELECT RAISE(ABORT, 'read only'); END",
        )
        .unwrap();

    let changes = ClientChanges {
        name: Some("x"),
        ..Default::default()
    };

    let err = update_download_client(&pool, "a", &changes)
        .unwrap_err()
        .to_string();

    assert!(err.contains("read only"), "{err}");
}

#[test]
fn a_setting_sent_empty_keeps_the_stored_one() {
    let pool = test_db();
    let stored = DownloadClientRow {
        settings: [
            ("apiKey".to_string(), "secret-key".to_string()),
            ("category".to_string(), "tv".to_string()),
        ]
        .into(),
        ..client("sab", 0, true, 100)
    };
    insert_download_client(&pool, &stored).unwrap();
    let sent: BTreeMap<String, String> = [
        ("apiKey".to_string(), String::new()),
        ("category".to_string(), "movies".to_string()),
    ]
    .into();

    update_download_client(
        &pool,
        "sab",
        &ClientChanges {
            settings: Some(&sent),
            ..Default::default()
        },
    )
    .unwrap();

    let kept = get_download_client(&pool.get().unwrap(), "sab")
        .unwrap()
        .unwrap()
        .settings;
    assert_eq!(kept["apiKey"], "secret-key");
    assert_eq!(kept["category"], "movies");
}

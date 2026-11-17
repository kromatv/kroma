use crate::db::{self, DownloadRow};
use crate::downloads::test_support::{added, manager_over};

#[test]
fn a_download_whose_client_was_deleted_can_still_be_removed() {
    let orphan = DownloadRow {
        client_id: "deleted".into(),
        ..added("d1")
    };
    let (_host, manager) = manager_over("remove-orphan", &[orphan]);

    manager.remove("d1", false).unwrap();

    let conn = manager.core().get().unwrap();
    assert!(db::get_download(&conn, "d1").unwrap().is_none());
}

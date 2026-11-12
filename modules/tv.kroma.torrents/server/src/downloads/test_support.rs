use std::path::PathBuf;
use std::sync::Arc;

use kroma_module_sdk::host::testing::StubHost;
use kroma_module_sdk::host::{HostCtx as _, HostStorage as _};

use crate::db::{self, DownloadRow};

use super::DownloadManager;

pub(crate) fn manager_over(tag: &str, rows: &[DownloadRow]) -> (StubHost, Arc<DownloadManager>) {
    let host = host_over(tag, rows);
    let manager = restarted(&host);
    (host, manager)
}

pub(crate) fn host_over(tag: &str, rows: &[DownloadRow]) -> StubHost {
    let host = StubHost::with_core(kroma_module_sdk::db::testing::temp_pool(tag));
    let store = host.store();
    db::apply_migrations(&store.get().unwrap(), db::MIGRATIONS).unwrap();
    db::insert_download_client(
        store,
        &db::test_support::client(db::EMBEDDED_CLIENT_ID, 100, true, 1),
    )
    .unwrap();
    for row in rows {
        db::insert_download(host.db(), row).unwrap();
    }
    host
}

pub(crate) fn manager_with_helper(_tag: &str, host: &StubHost, helper: PathBuf) -> Arc<DownloadManager> {
    DownloadManager::build(
        Arc::new(host.clone()),
        host.data_dir(),
        host.db().clone(),
        host.store().clone(),
        helper.to_string_lossy().into_owned(),
    )
}

pub(crate) fn restarted(host: &StubHost) -> Arc<DownloadManager> {
    DownloadManager::new(
        Arc::new(host.clone()),
        host.data_dir(),
        host.db().clone(),
        host.store().clone(),
    )
}

pub(crate) fn added(id: &str) -> DownloadRow {
    DownloadRow {
        client_ref: "deadbeef".into(),
        ..db::test_support::download(id, "downloading", 1)
    }
}

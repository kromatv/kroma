//! The consumer side of the two download ports: a client that reaches whichever
//! module currently serves them.

use kroma_module_host::{call, call_raw, HostCtx, Resolver};
use serde_json::json;

use crate::ports::TorrentFileEntry;

use super::{DownloadDbPort, DownloadGrabPort, DownloadRow, GrabSpec};

pub struct DownloadGrabClient {
    resolve: Resolver,
}
pub struct DownloadDbClient {
    resolve: Resolver,
}

impl DownloadGrabClient {
    pub fn new(resolve: Resolver) -> Self {
        Self { resolve }
    }
}
impl DownloadDbClient {
    pub fn new(resolve: Resolver) -> Self {
        Self { resolve }
    }
}

impl DownloadGrabPort for DownloadGrabClient {
    fn grab(&self, _host: &dyn HostCtx, spec: GrabSpec) -> anyhow::Result<DownloadRow> {
        call(&self.resolve, "downloadgrab/grab", &spec)
    }
    fn list_files(
        &self,
        _host: &dyn HostCtx,
        magnet_or_url: &str,
    ) -> anyhow::Result<Vec<TorrentFileEntry>> {
        call(&self.resolve, "downloadgrab/list_files", &json!({ "magnet_or_url": magnet_or_url }))
    }
    fn gate_open(&self) -> bool {
        // A transient bridge hiccup shouldn't silently disable acquisition; grab()
        // re-checks the gate authoritatively on the provider side, so default open.
        call_raw(&self.resolve, "downloadgrab/gate_open", &json!({})).unwrap_or(true)
    }
    fn activate(&self, _host: &dyn HostCtx, row: &DownloadRow) {
        let _: anyhow::Result<()> = call_raw(&self.resolve, "downloadgrab/activate", row);
    }
    fn drop_data(&self, _host: &dyn HostCtx, row: &DownloadRow) {
        let _: anyhow::Result<()> = call_raw(&self.resolve, "downloadgrab/drop_data", row);
    }
}

impl DownloadDbPort for DownloadDbClient {
    fn completed_downloads(&self, _host: &dyn HostCtx) -> anyhow::Result<Vec<DownloadRow>> {
        call(&self.resolve, "downloaddb/completed", &json!({}))
    }
    fn mark_download_imported(
        &self,
        _host: &dyn HostCtx,
        id: &str,
        paths: &[String],
        now_ms: i64,
    ) -> anyhow::Result<()> {
        call(
            &self.resolve,
            "downloaddb/mark_imported",
            &json!({ "id": id, "paths": paths, "now_ms": now_ms }),
        )
    }
    fn set_download_status(
        &self,
        _host: &dyn HostCtx,
        id: &str,
        status: &str,
        error: Option<&str>,
    ) -> anyhow::Result<bool> {
        call(
            &self.resolve,
            "downloaddb/set_status",
            &json!({ "id": id, "status": status, "error": error }),
        )
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;

    use super::super::download_routes;
    use super::super::fixtures::{sample_download_row, StubDb, StubGrab};

    use crate::testing::{blocking, serve};

    use kroma_module_host::testing::StubHost;

    fn offline() -> Resolver {
        Arc::new(|| None)
    }

    #[test]
    fn grab_client_offline_behavior() {
        let c = DownloadGrabClient::new(offline());
        assert!(c.grab(&StubHost::new(), GrabSpec::default()).is_err());
        assert!(c.list_files(&StubHost::new(), "magnet:?xt=1").is_err());
        assert!(c.gate_open());
        // Infallible fire-and-forget calls must not panic when offline.
        let row = sample_download_row("x");
        c.activate(&StubHost::new(), &row);
        c.drop_data(&StubHost::new(), &row);
    }

    #[test]
    fn db_client_offline_errors() {
        let c = DownloadDbClient::new(offline());
        assert!(c.completed_downloads(&StubHost::new()).is_err());
        assert!(c.mark_download_imported(&StubHost::new(), "id", &["p".to_string()], 0).is_err());
        assert!(c.set_download_status(&StubHost::new(), "id", "done", None).is_err());
    }

    // Everything above drives one side or the other. This mounts the REAL
    // router on a real port and points a REAL client at it, so the wire
    // itself is under test: the `/_port/<port>/<method>` paths, the bearer
    // token, the `Result<T, String>` envelope, and the JSON shape of every
    // boundary type. Those only ever disagree at runtime, in a sidecar,
    // which is the worst place to find out.

    #[tokio::test(flavor = "multi_thread")]
    async fn every_grab_verb_survives_the_round_trip() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::open());
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::default());
        let resolve = serve(download_routes::<StubHost>(grab, db), StubHost::new()).await;

        let client = DownloadGrabClient::new(resolve);
        let row = blocking(move || {
            let spec = GrabSpec { magnet_or_url: "magnet:?xt=1".into(), ..Default::default() };
            client.grab(&StubHost::new(), spec)
        })
        .await
        .unwrap();
        // The whole DownloadRow made it across, not just the id: every field here
        // is one the importer reads on the far side.
        assert_eq!(row.id, "grabbed");
        assert_eq!(row.release_title, "Movie.2020.1080p");
        assert_eq!(row.tmdb_id, 1);
        assert_eq!(row.info_hash.as_deref(), Some("hash"));
        assert_eq!(row.size_bytes, Some(100));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_file_listing_survives_the_round_trip() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::open());
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::default());
        let resolve = serve(download_routes::<StubHost>(grab, db), StubHost::new()).await;

        let client = DownloadGrabClient::new(resolve);
        let files =
            blocking(move || client.list_files(&StubHost::new(), "magnet:?xt=1")).await.unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "a.mkv");
        assert_eq!(files[0].size_bytes, 10);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_gate_is_read_from_the_provider_when_it_is_reachable() {
        // The client defaults OPEN when the bridge is down, so a closed gate is
        // only ever observable through a working round trip - which makes this
        // the test that proves the default is not masking everything.
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::closed());
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::default());
        let resolve = serve(download_routes::<StubHost>(grab, db), StubHost::new()).await;

        let client = DownloadGrabClient::new(resolve);
        assert!(!blocking(move || client.gate_open()).await);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_provider_error_crosses_the_wire_as_an_error() {
        // The envelope is `Result<T, String>`; losing the Err arm would turn a
        // failed grab into a successful one carrying nonsense.
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::failing());
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::failing());
        let resolve = serve(download_routes::<StubHost>(grab, db), StubHost::new()).await;

        let grab_client = DownloadGrabClient::new(resolve.clone());
        let err = blocking(move || {
            let spec = GrabSpec { magnet_or_url: "magnet:?xt=1".into(), ..Default::default() };
            grab_client.grab(&StubHost::new(), spec)
        })
        .await
        .unwrap_err()
        .to_string();
        assert!(err.contains("boom"), "the provider's reason was lost: {err}");

        let db_client = DownloadDbClient::new(resolve);
        let err = blocking(move || db_client.completed_downloads(&StubHost::new()))
            .await
            .unwrap_err()
            .to_string();
        assert!(err.contains("boom"), "{err}");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_ledger_verbs_survive_the_round_trip() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::open());
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::default());
        let resolve = serve(download_routes::<StubHost>(grab, db), StubHost::new()).await;

        let client = DownloadDbClient::new(resolve);
        let done = blocking({
            let c = DownloadDbClient::new(client.resolve.clone());
            move || c.completed_downloads(&StubHost::new())
        })
        .await
        .unwrap();
        assert_eq!(done.len(), 1);
        assert_eq!(done[0].id, "done");

        let c = DownloadDbClient::new(client.resolve.clone());
        blocking(move || {
            c.mark_download_imported(&StubHost::new(), "done", &["/media/a.mkv".to_string()], 42)
        })
        .await
        .unwrap();

        let c = DownloadDbClient::new(client.resolve.clone());
        assert!(blocking(move || c.set_download_status(&StubHost::new(), "done", "imported", None))
            .await
            .unwrap());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn the_fire_and_forget_verbs_reach_the_provider() {
        // `activate` and `drop_data` return nothing, so a broken route would be
        // completely silent. Counting them on the provider side is the only way
        // to see they arrived.
        let counting = Arc::new(StubGrab::open());
        let grab: Arc<dyn DownloadGrabPort> = counting.clone();
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::default());
        let resolve = serve(download_routes::<StubHost>(grab, db), StubHost::new()).await;

        let client = DownloadGrabClient::new(resolve);
        let row = sample_download_row("moved");
        blocking(move || {
            client.activate(&StubHost::new(), &row);
            client.drop_data(&StubHost::new(), &row);
        })
        .await;

        assert_eq!(&*counting.activated.lock().unwrap(), &["moved".to_string()]);
        assert_eq!(&*counting.dropped.lock().unwrap(), &["moved".to_string()]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_ledger_write_failure_crosses_the_wire_as_an_error() {
        let grab: Arc<dyn DownloadGrabPort> = Arc::new(StubGrab::failing());
        let db: Arc<dyn DownloadDbPort> = Arc::new(StubDb::failing());
        let resolve = serve(download_routes::<StubHost>(grab, db), StubHost::new()).await;

        let client = DownloadDbClient::new(resolve.clone());
        let err = blocking(move || {
            client.mark_download_imported(&StubHost::new(), "d1", &["a.mkv".to_string()], 1)
        })
        .await
        .unwrap_err()
        .to_string();
        assert!(err.contains("boom"), "{err}");

        let client = DownloadDbClient::new(resolve.clone());
        let err = blocking(move || client.set_download_status(&StubHost::new(), "d1", "failed", None))
            .await
            .unwrap_err()
            .to_string();
        assert!(err.contains("boom"), "{err}");

        let client = DownloadGrabClient::new(resolve);
        let err = blocking(move || client.list_files(&StubHost::new(), "magnet:?xt=1"))
            .await
            .unwrap_err()
            .to_string();
        assert!(err.contains("boom"), "{err}");
    }
}

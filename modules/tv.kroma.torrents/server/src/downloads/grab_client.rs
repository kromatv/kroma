use anyhow::{anyhow, Result};

use crate::db::{self, DownloadClientRow};

use super::DownloadManager;

impl DownloadManager {
    pub(super) fn grab_client(&self, requested: Option<&str>) -> Result<DownloadClientRow> {
        let conn = self.store().get()?;
        match requested {
            Some(id) => db::get_download_client(&conn, id)?.filter(|client| client.enabled),
            None => db::preferred_download_client(&conn)?,
        }
        .ok_or_else(|| anyhow!("no enabled download client"))
    }
}

#[cfg(test)]
mod tests {
    use kroma_module_sdk::host::testing::StubHost;
    use kroma_module_sdk::host::HostStorage as _;

    use super::super::test_support::manager_over;
    use super::*;
    use crate::GrabSpec;

    fn with_clients(tag: &str) -> (StubHost, std::sync::Arc<DownloadManager>) {
        let (host, manager) = manager_over(tag, &[]);
        for (id, priority, enabled) in [("preferred", 200, true), ("off", 300, false)] {
            db::insert_download_client(
                host.store(),
                &db::test_support::client(id, priority, enabled, 2),
            )
            .unwrap();
        }
        (host, manager)
    }

    #[test]
    fn a_grab_lands_on_the_client_its_spec_names() {
        let (host, manager) = with_clients("grab-client-named");
        let spec = GrabSpec {
            magnet_or_url: "magnet:?xt=urn:btih:ab".into(),
            kind: "movie".into(),
            release_title: "Sintel.2010.720p.WEBrip.x264".into(),
            client_id: Some(db::EMBEDDED_CLIENT_ID.into()),
            ..GrabSpec::default()
        };

        let row = manager.grab(&host, spec).unwrap();

        assert_eq!(row.client_id, db::EMBEDDED_CLIENT_ID);
    }

    #[test]
    fn a_named_client_is_taken_only_while_enabled_and_no_name_takes_the_preferred_one() {
        let (_, manager) = with_clients("grab-client-choice");
        let named = [
            Some(db::EMBEDDED_CLIENT_ID),
            None,
            Some("off"),
            Some("ghost"),
        ];

        let chosen = named.map(|id| manager.grab_client(id).ok().map(|client| client.id));

        assert_eq!(
            chosen,
            [Some(db::EMBEDDED_CLIENT_ID), Some("preferred"), None, None]
                .map(|id| id.map(String::from))
        );
    }
}

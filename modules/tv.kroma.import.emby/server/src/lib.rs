//! The Emby importer. It answers the core's `importer` point by reading an Emby
//! server with the Jellyfin importer's Emby dialect: the same calls under Emby's
//! paths and authorization scheme.

use kroma_module_sdk::host::{async_trait, HostCtx, HostStorage, ServerModule};
use kroma_module_sdk::EmbeddedModule;

pub const MODULE_ID: &str = "tv.kroma.import.emby";

/// This module's registry entry: its manifest and icon, embedded at compile time.
pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();

struct EmbyImport;

#[async_trait]
impl<S> ServerModule<S> for EmbyImport
where
    S: HostCtx + Clone + Send + Sync + 'static,
{
    fn id(&self) -> &'static str {
        MODULE_ID
    }

    fn migrations(&self) -> &'static str {
        kroma_import_jellyfin::MIGRATIONS
    }
}

/// What the host starts: the module's own database, and no job or event.
pub fn server_module<S: HostCtx + Clone + Send + Sync + 'static>() -> Box<dyn ServerModule<S>> {
    Box::new(EmbyImport)
}

/// The `importer` point as this module answers it, for an Emby server.
pub fn routes<S: HostStorage + Clone + Send + Sync + 'static>() -> axum::Router<S> {
    kroma_import_jellyfin::routes_for(&kroma_import_jellyfin::EMBY)
}

#[cfg(test)]
mod tests {
    use axum::body::{to_bytes, Body};
    use axum::http::{header, Request};
    use kroma_module_sdk::host::testing::StubHost;
    use kroma_module_sdk::Module;
    use serde_json::{json, Value};
    use tower::ServiceExt;

    use super::*;

    #[test]
    fn the_embedded_manifest_is_this_module_s() {
        let manifest = MODULE.manifest();

        assert_eq!(manifest.id, MODULE_ID);
        assert_eq!(manifest.contributes[0].point, "importer");
    }

    #[test]
    fn the_host_starts_this_module_with_the_importer_s_own_tables() {
        let module = server_module::<StubHost>();

        let (id, migrations) = (module.id(), module.migrations());

        assert_eq!(id, MODULE_ID);
        assert_eq!(migrations, kroma_import_jellyfin::MIGRATIONS);
    }

    #[tokio::test]
    async fn the_routes_refuse_an_address_that_is_not_a_web_one_before_calling_any_server() {
        let app = routes::<StubHost>().with_state(StubHost::with_db("import-emby"));
        let ask = json!({ "fields": { "url": "ftp://nas.local", "username": "sam" } });
        let request = Request::post("/_port/importer/connect")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(ask.to_string()))
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        let body = to_bytes(response.into_body(), 1 << 16).await.unwrap();
        let answer: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            answer,
            json!({ "Ok": { "status": "refused", "reason": "unreachable" } })
        );
    }
}

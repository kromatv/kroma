//! The backend contract a module crate implements to own its server-side
//! vertical, and the scheduled jobs it contributes.

use super::HostCtx;

use async_trait::async_trait;

/// One scheduled job a module contributes to the core JobManager. Its `run` pass
/// executes in-process on the sidecar, which serves the `/_job/run/{key}`
/// endpoint the core scheduler calls.
pub struct ModuleJob<S> {
    // `key` is dotted (`"acquisition.import"`) and doubles as DB key, URL segment
    // and i18n base. `category` is one of `maintenance`, `library`,
    // `recommendations`, `pipeline`, `acquisition`. `schedule` is cron,
    // admin-overridable, `None` for manual-only.
    pub key: &'static str,
    pub category: &'static str,
    pub schedule: Option<&'static str>,
    pub run: fn(&S) -> anyhow::Result<()>,
}

/// The backend contract a module crate implements to own its server-side
/// vertical. Generic over the host state `S` so the crate depends only on this
/// seam, never on the app; the binary instantiates it at `S = SharedState`.
#[async_trait]
pub trait ServerModule<S>: Send + Sync
where
    S: HostCtx + Clone + Send + Sync + 'static,
{
    // Matches its `module.json` and frontend package.
    fn id(&self) -> &'static str;

    // SQL run at DB init, after the core schema. `IF NOT EXISTS` DDL only; runs
    // on every boot.
    fn migrations(&self) -> &'static str {
        ""
    }

    // Routes served under `/api/admin`. Mounted behind the module's enabled-gate
    // by the host, so they 404 while it is disabled.
    fn admin_routes(&self, _host: &S) -> Option<axum::Router<S>> {
        None
    }

    fn jobs(&self) -> Vec<ModuleJob<S>> {
        Vec::new()
    }

    // Called when the module is enabled at runtime AND at boot for an
    // already-enabled module. Awaited, not detached, so a slow start completes
    // before a following disable can race it. Takes the state itself rather than
    // an `Arc<dyn HostCtx>`, which would erase whatever the module declared
    // beyond the base seam.
    async fn on_enable(&self, _host: S) {}

    // Called when the module is disabled at runtime AND at boot for a disabled
    // module, so nothing is left running. Awaited.
    async fn on_disable(&self, _host: S) {}
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;

    use crate::testing;

    #[test]
    fn a_module_that_declares_nothing_gets_empty_defaults() {
        struct Bare;
        #[async_trait]
        impl ServerModule<Arc<testing::StubHost>> for Bare {
            fn id(&self) -> &'static str {
                "tv.kroma.bare"
            }
        }
        assert_eq!(Bare.id(), "tv.kroma.bare");
        assert_eq!(Bare.migrations(), "");
        assert!(Bare.admin_routes(&Arc::new(testing::StubHost::new())).is_none());
        assert!(Bare.jobs().is_empty());

        let rt = tokio::runtime::Builder::new_current_thread().build().unwrap();
        rt.block_on(async {
            let host = Arc::new(testing::StubHost::new());
            Bare.on_enable(host.clone()).await;
            Bare.on_disable(host).await;
        });
    }
}

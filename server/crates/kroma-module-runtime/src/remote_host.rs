use std::any::{Any, TypeId};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use crate::env::Env;

/// The out-of-process [`HostCtx`]: settings, events, sessions and jobs go to the
/// core over the callback API; the databases (behind `storage`) are opened here,
/// because SQLite in WAL mode is multi-process and a query has no business
/// becoming an HTTP round-trip.
#[derive(Clone)]
pub struct RemoteHost {
    pub(crate) inner: Arc<Inner>,
}

pub(crate) struct Inner {
    pub(crate) module_id: String,
    pub(crate) data_dir: PathBuf,
    #[cfg(feature = "storage")]
    pub(crate) store: kroma_sqlite::Pool,
    #[cfg(feature = "storage")]
    pub(crate) core: kroma_sqlite::Pool,
    pub(crate) core_url: String,
    pub(crate) module_token: String,
    pub(crate) services: RwLock<HashMap<TypeId, Arc<dyn Any + Send + Sync>>>,
    // The metadata language, cached: it is one env-derived string, and every
    // caller that renames a file asks for it.
    pub(crate) language: RwLock<Option<String>>,
}

impl RemoteHost {
    pub(crate) fn new(env: &Env) -> anyhow::Result<Self> {
        Ok(Self {
            inner: Arc::new(Inner {
                module_id: env.module_id.clone(),
                data_dir: env.data_dir.clone(),
                // `open`, not `init`: the module's own file has no core schema
                // in it, only whatever its own `migrations()` create below.
                #[cfg(feature = "storage")]
                store: kroma_sqlite::open(&env.store_path())?,
                #[cfg(feature = "storage")]
                core: kroma_sqlite::init_scoped(&env.db_path, &env.module_id, &env.grant())?,
                core_url: env.core_url.clone(),
                module_token: env.module_token.clone(),
                services: RwLock::new(HashMap::new()),
                language: RwLock::new(None),
            }),
        })
    }

    pub fn module_id(&self) -> &str {
        &self.inner.module_id
    }

    /// Register a module-owned concrete service so its own code can resolve it by
    /// type through `service::<T>(host)`. Keyed like the in-process registry:
    /// concrete `TypeId::of::<T>()`, single `Arc`.
    pub fn register_service<T: Any + Send + Sync>(&self, service: Arc<T>) {
        self.inner
            .services
            .write()
            .unwrap()
            .insert(TypeId::of::<T>(), service as Arc<dyn Any + Send + Sync>);
    }

    pub(crate) fn callback(&self) -> kroma_http::Loopback {
        kroma_http::Loopback::new().header(
            "authorization",
            format!("Bearer {}", self.inner.module_token),
        )
    }

    pub(crate) fn host_url(&self, path: &str) -> String {
        format!(
            "{}/api/_host/{path}",
            self.inner.core_url.trim_end_matches('/')
        )
    }
}

#[cfg(feature = "storage")]
impl kroma_module_host::HostStorage for RemoteHost {
    fn db(&self) -> &kroma_sqlite::Pool {
        &self.inner.core
    }

    fn store(&self) -> &kroma_sqlite::Pool {
        &self.inner.store
    }
}

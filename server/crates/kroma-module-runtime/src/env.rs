use std::path::PathBuf;

pub(crate) struct Env {
    pub(crate) module_id: String,
    pub(crate) port: u16,
    pub(crate) core_url: String,
    pub(crate) host_token: String,
    pub(crate) module_token: String,
    // Only read under `storage`: a module that declares none never learns where
    // the core database is, which is the capability said in one more place.
    #[cfg(feature = "storage")]
    pub(crate) db_path: PathBuf,
    pub(crate) data_dir: PathBuf,
}

impl Env {
    pub(crate) fn from_process() -> anyhow::Result<Self> {
        let get = |k: &str| std::env::var(k).map_err(|_| anyhow::anyhow!("{k} not set"));
        Ok(Self {
            module_id: get("KROMA_MODULE_ID")?,
            port: get("KROMA_MODULE_PORT")?.parse()?,
            core_url: get("KROMA_CORE_URL")?,
            host_token: get("KROMA_HOST_TOKEN")?,
            // A host that predates per-module tokens sends none, and the fabric
            // token still authenticates; it just does not name this module, so
            // the callback answers it nothing that wants a declaration.
            module_token: std::env::var("KROMA_MODULE_TOKEN")
                .or_else(|_| get("KROMA_HOST_TOKEN"))?,
            #[cfg(feature = "storage")]
            db_path: PathBuf::from(get("KROMA_DB_PATH")?),
            data_dir: PathBuf::from(get("KROMA_DATA_DIR")?),
        })
    }

    /// The grant the core spawned this module with, as its manifest declared it.
    /// Absent or unreadable is the empty grant: a pool that answers nothing,
    /// never an unscoped one.
    #[cfg(feature = "storage")]
    pub(crate) fn grant(&self) -> kroma_sqlite::Grant {
        let Ok(json) = std::env::var("KROMA_MODULE_GRANT") else {
            return kroma_sqlite::Grant::none();
        };
        serde_json::from_str(&json).unwrap_or_else(|error| {
            tracing::error!(%error, "core sent a storage grant this build cannot read; denying all");
            kroma_sqlite::Grant::none()
        })
    }

    /// The module's own database, beside the files the core unpacked it into.
    #[cfg(feature = "storage")]
    pub(crate) fn store_path(&self) -> PathBuf {
        self.data_dir
            .join("modules")
            .join(&self.module_id)
            .join("module.sqlite")
    }
}

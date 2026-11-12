use std::path::PathBuf;

use kroma_module_wire::Role;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Startup {
    Own,
    Run(Role),
}

impl Startup {
    pub(crate) fn of(role: Option<&str>) -> anyhow::Result<Self> {
        let Some(role) = role else {
            return Ok(Self::Own);
        };
        Role::parse(role).map(Self::Run).ok_or_else(|| {
            anyhow::anyhow!("the host gave this instance a role it does not know: {role}")
        })
    }

    pub(crate) fn enables(self) -> bool {
        self != Self::Run(Role::Worker)
    }
}

pub(crate) struct Env {
    pub(crate) startup: Startup,
    pub(crate) module_id: String,
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
    #[cfg(target_family = "wasm")]
    pub(crate) fn from_process() -> anyhow::Result<Self> {
        let get = |k: &str| std::env::var(k).map_err(|_| anyhow::anyhow!("{k} not set"));
        Ok(Self {
            startup: Startup::of(std::env::var(kroma_module_wire::ROLE_ENV).ok().as_deref())?,
            module_id: get("KROMA_MODULE_ID")?,
            core_url: get("KROMA_CORE_URL")?,
            host_token: get("KROMA_HOST_TOKEN")?,
            module_token: std::env::var("KROMA_MODULE_TOKEN")
                .or_else(|_| get("KROMA_HOST_TOKEN"))?,
            #[cfg(feature = "storage")]
            db_path: PathBuf::from(get("KROMA_DB_PATH")?),
            data_dir: PathBuf::from(get("KROMA_DATA_DIR")?),
        })
    }

    #[cfg(feature = "storage")]
    pub(crate) fn store_path(&self) -> PathBuf {
        self.data_dir
            .join("modules")
            .join(&self.module_id)
            .join("module.sqlite")
    }
}

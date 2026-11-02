//! A module's lifecycle: starting its component, stopping it, and refusing a
//! native build left from before every module was a component.

use super::{check_manifest_schema, Endpoint, Supervisor, MODULE_COMPONENT, NATIVE_BINARY};

pub(crate) struct Proc {
    pub(crate) endpoint: Endpoint,
    #[cfg(unix)]
    pub(crate) media: Option<Vec<std::path::PathBuf>>,
    #[cfg(unix)]
    pub(crate) downloads: Option<Vec<std::path::PathBuf>>,
    #[cfg(unix)]
    pub(crate) component: std::sync::Arc<super::component::Pool>,
    #[cfg(unix)]
    pub(crate) _gateway: super::gateway::Running,
}

pub(crate) fn native_build(id: &str) -> anyhow::Error {
    anyhow::anyhow!("'{id}' is a native build, and this server runs only WebAssembly components")
}

impl Supervisor {
    /// Whether `id` is installed as a native binary with no component beside it.
    /// Such a module never starts: its update from a registry is a component.
    pub fn is_native_build(&self, id: &str) -> bool {
        let dir = self.dir(id);
        dir.join(NATIVE_BINARY).exists() && !dir.join(MODULE_COMPONENT).exists()
    }

    /// Start a module's component on its socket under the run directory. A no-op
    /// if it already runs, an error if the module ships no component.
    pub fn spawn(&self, id: &str) -> anyhow::Result<Endpoint> {
        if let Some(p) = self.procs.read().unwrap().get(id) {
            return Ok(p.endpoint.clone());
        }
        if self.is_native_build(id) {
            return Err(native_build(id));
        }
        let component = self.dir(id).join(MODULE_COMPONENT);
        if !component.exists() {
            anyhow::bail!(
                "'{id}' ships no component: {} is missing",
                component.display()
            );
        }
        #[cfg(unix)]
        {
            self.spawn_component(id)
        }
        #[cfg(not(unix))]
        {
            anyhow::bail!("'{id}' is a WebAssembly component, which this server runs only on Unix")
        }
    }

    /// Stop a module, letting its component run its own shutdown first. A no-op
    /// if it is not running. Blocking: call it off the async runtime.
    pub fn stop(&self, id: &str) {
        let Some(p) = self.procs.write().unwrap().remove(id) else {
            return;
        };
        self.say(id, "INFO stopping the module");
        #[cfg(unix)]
        p.component.shut_down();
        drop(p);
        self.say(id, "INFO module stopped");
        tracing::info!(module = %id, "stopped module");
    }

    /// Stop every running module. Blocking: call it off the async runtime.
    pub fn stop_all(&self) {
        let procs: Vec<(String, Proc)> = self.procs.write().unwrap().drain().collect();
        for (id, p) in procs {
            #[cfg(unix)]
            p.component.shut_down();
            drop(p);
            tracing::info!(module = %id, "stopped module");
        }
    }

    /// Start one installed module, applying the same gates as boot: a stray
    /// `.kmod` for a built-in id never starts (it would duplicate the in-core
    /// module), a native build never starts, its `engines` are enforced, and a
    /// library module (no component) is a successful no-op. This is what the
    /// admin enable toggle drives, so enabling a module brings it up without a
    /// restart.
    pub fn start_installed(&self, id: &str) -> anyhow::Result<()> {
        let manifest = self
            .installed_manifests()
            .into_iter()
            .find(|m| m.id == id)
            .ok_or_else(|| anyhow::anyhow!("'{id}' is not installed"))?;
        if self.cfg.reserved_ids.iter().any(|r| r == id) {
            anyhow::bail!("'{id}' shadows a built-in module; not spawning");
        }
        if self.is_native_build(id) {
            return Err(native_build(id));
        }
        check_manifest_schema(id, &manifest)?;
        kroma_module_manifest::engines_satisfied(&manifest.engines, &self.cfg.server_version)
            .map_err(|reason| anyhow::anyhow!("'{id}' {reason}"))?;
        if !self.has_component(id) {
            return Ok(());
        }
        self.spawn(id)?;
        Ok(())
    }
}

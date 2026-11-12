use std::path::Path;
use std::sync::Arc;

use kroma_http::egress::{self, Decision, Outgoing, Ruling};
use kroma_module_manifest::{ModuleManifest, Permissions};

/// The `net.connect` purposes a module declares, held against every call its code
/// makes. A test server on loopback never matches a declared host, so only the
/// purpose is compared, exactly, as the host compares it first.
pub struct DeclaredPurposes {
    module: String,
    permissions: Permissions,
}

impl DeclaredPurposes {
    pub fn of(manifest: &ModuleManifest) -> Self {
        Self {
            module: manifest.id.clone(),
            permissions: manifest.permissions.clone().unwrap_or_default(),
        }
    }

    /// The `module.json` in the parent of `CARGO_MANIFEST_DIR`, where
    /// `embedded_module!` finds it. `None` for a crate that is not a module's.
    pub fn beside_this_crate() -> Option<Self> {
        let crate_dir = std::env::var_os("CARGO_MANIFEST_DIR")?;
        let json =
            std::fs::read_to_string(Path::new(&crate_dir).parent()?.join("module.json")).ok()?;
        let manifest: ModuleManifest = serde_json::from_str(&json).ok()?;
        Some(Self::of(&manifest))
    }

    /// A call for `purpose`, refused with the module and the purpose named when no
    /// entry declares it.
    pub fn check(&self, purpose: &str) -> Result<(), String> {
        if self.permissions.declares_purpose(purpose) {
            return Ok(());
        }
        Err(format!(
            "{} calls out for purpose `{purpose}`, which its module.json does not declare in \
             permissions.net.connect, so the host refuses every such call",
            self.module
        ))
    }

    /// Make this the process's egress gate: a call for an undeclared purpose
    /// panics where it is made, and any other goes where its builder says. Fails
    /// when the process already has a gate.
    pub fn hold_this_process(self) -> anyhow::Result<()> {
        egress::set_gate(Arc::new(move |outgoing: &Outgoing| -> Ruling {
            if let Err(refusal) = self.check(outgoing.purpose) {
                panic!("{refusal}");
            }
            Decision::Direct.into()
        }))
    }
}

#[cfg(test)]
mod tests;

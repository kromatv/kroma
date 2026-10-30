//! The tokens a module process holds, and what each one lets it do. Two per
//! module, never shared: the one it calls back into the core with, which names
//! it, and the one its own routes accept, which the core hands only to whoever
//! consumes what it serves.

use kroma_module_host::host_token::ct_eq;

use super::Supervisor;

impl Supervisor {
    /// The token `id`'s process calls back with, minted on first ask and then
    /// stable for the life of this server. It names its holder, which is what lets
    /// a callback answer for the module that made it rather than for "a module".
    pub fn module_token(&self, id: &str) -> String {
        if let Some(token) = self.module_tokens.read().unwrap().get(id) {
            return token.clone();
        }
        let mut tokens = self.module_tokens.write().unwrap();
        tokens
            .entry(id.to_string())
            .or_insert_with(kroma_primitives::random_token)
            .clone()
    }

    /// The module `token` was minted for, or `None` for the fabric token and for
    /// anything else: a caller the callback cannot name holds no declaration, so it
    /// reaches nothing that wants one.
    pub fn module_of_token(&self, token: &str) -> Option<String> {
        self.module_tokens
            .read()
            .unwrap()
            .iter()
            .find(|(_, minted)| ct_eq(minted.as_bytes(), token.as_bytes()))
            .map(|(id, _)| id.clone())
    }

    /// The token `id`'s own routes accept, handed to its process as
    /// `KROMA_HOST_TOKEN`. The core calls the module with it, and gives it to a
    /// peer only through [`Self::contributions_for`]: one module's token opens
    /// no other module's routes, and authenticates no callback.
    pub fn port_token(&self, id: &str) -> String {
        if let Some(token) = self.port_tokens.read().unwrap().get(id) {
            return token.clone();
        }
        let mut tokens = self.port_tokens.write().unwrap();
        tokens
            .entry(id.to_string())
            .or_insert_with(kroma_primitives::random_token)
            .clone()
    }

    /// Whether `bearer` may act for `module_id` when that module registers its
    /// jobs or its event subscriptions: the fabric token, or one of the two
    /// tokens minted for that module and no other.
    pub fn speaks_for(&self, module_id: &str, bearer: &str) -> bool {
        let minted_for = |tokens: &std::sync::RwLock<std::collections::HashMap<String, String>>| {
            tokens
                .read()
                .unwrap()
                .get(module_id)
                .is_some_and(|minted| ct_eq(minted.as_bytes(), bearer.as_bytes()))
        };
        ct_eq(self.cfg.host_token.as_bytes(), bearer.as_bytes())
            || minted_for(&self.module_tokens)
            || minted_for(&self.port_tokens)
    }

    /// [`Self::speaks_for`] with the bearer read off a request's headers.
    pub fn request_speaks_for(&self, module_id: &str, headers: &axum::http::HeaderMap) -> bool {
        headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .is_some_and(|bearer| self.speaks_for(module_id, bearer))
    }

    /// The answers to `point` that `caller` may reach: none unless its manifest
    /// consumes the point or defines it. Asking for a point it never declared is
    /// said on the caller's own log, since it is either a missing declaration or
    /// a module looking around.
    pub fn contributions_for(
        &self,
        caller: &str,
        point: &str,
    ) -> Vec<kroma_module_host::Contribution> {
        let declared = self.installed_manifests().into_iter().any(|m| {
            m.id == caller
                && (m.consumes.iter().any(|need| need.point == point)
                    || m.defines_points
                        .iter()
                        .any(|def| format!("{caller}/{}", def.name) == point))
        });
        if !declared {
            self.say(
                caller,
                &format!("WARN asked for {point}, which its manifest neither consumes nor defines; not resolved"),
            );
            return Vec::new();
        }
        self.contributions(point)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;
    use crate::SupervisorConfig;

    fn supervisor(dir: &std::path::Path, said: Arc<Mutex<Vec<String>>>) -> Arc<Supervisor> {
        Supervisor::new(SupervisorConfig {
            modules_dir: dir.to_path_buf(),
            core_url: "http://127.0.0.1:0".into(),
            host_token: "fabric".into(),
            db_path: dir.join("db.sqlite"),
            data_dir: dir.to_path_buf(),
            reserved_ids: Vec::new(),
            server_version: "0.1.4".into(),
            log_line: Some(Arc::new(move |id: &str, line: &str| {
                said.lock().unwrap().push(format!("{id}: {line}"));
            })),
        })
    }

    #[test]
    fn a_module_speaks_for_itself_and_for_no_other_module() {
        let dir = kroma_testing::temp_dir("speaks-for");
        let sup = supervisor(dir.path(), Arc::default());
        let own_port = sup.port_token("com.example.one");
        let own_callback = sup.module_token("com.example.one");
        let other_port = sup.port_token("com.example.two");

        assert!(sup.speaks_for("com.example.one", &own_port));
        assert!(sup.speaks_for("com.example.one", &own_callback));
        assert!(sup.speaks_for("com.example.one", "fabric"));
        assert!(!sup.speaks_for("com.example.one", &other_port));
        assert!(!sup.speaks_for("com.example.three", &own_port));
        assert!(!sup.speaks_for("com.example.one", ""));
    }

    #[test]
    fn a_port_token_is_no_callback_identity() {
        let dir = kroma_testing::temp_dir("port-token");
        let sup = supervisor(dir.path(), Arc::default());

        let port = sup.port_token("com.example.one");

        assert_eq!(sup.port_token("com.example.one"), port, "stable per module");
        assert_ne!(port, sup.module_token("com.example.one"));
        assert_ne!(port, "fabric");
        assert_eq!(sup.module_of_token(&port), None);
    }

    #[test]
    fn a_point_the_caller_never_declared_resolves_to_nothing_and_says_so() {
        let dir = kroma_testing::temp_dir("undeclared-point");
        let said = Arc::new(Mutex::new(Vec::new()));
        let sup = supervisor(dir.path(), said.clone());
        let module = dir.path().join("com.example.nosy");
        std::fs::create_dir_all(&module).unwrap();
        std::fs::write(
            module.join("module.json"),
            format!(
                r#"{{"schemaVersion":{},"id":"com.example.nosy","name":"Nosy","version":"1.0.0"}}"#,
                kroma_module_manifest::MODULE_SCHEMA_VERSION
            ),
        )
        .unwrap();

        let found = sup.contributions_for("com.example.nosy", "tv.kroma.indexer/db");

        assert!(found.is_empty());
        let said = said.lock().unwrap();
        assert!(
            said.iter().any(
                |line| line.starts_with("com.example.nosy: WARN asked for tv.kroma.indexer/db")
            ),
            "{said:?}"
        );
    }
}

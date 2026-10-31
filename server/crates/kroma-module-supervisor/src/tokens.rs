//! The two tokens a module process holds: the one it calls the core back with,
//! which names it, and the one its own routes accept.

use std::collections::HashMap;
use std::sync::RwLock;

use kroma_module_host::host_token::ct_eq;

use super::Supervisor;

fn minted(tokens: &RwLock<HashMap<String, String>>, id: &str) -> String {
    if let Some(token) = tokens.read().unwrap().get(id) {
        return token.clone();
    }
    tokens
        .write()
        .unwrap()
        .entry(id.to_string())
        .or_insert_with(kroma_primitives::random_token)
        .clone()
}

fn minted_for(tokens: &RwLock<HashMap<String, String>>, module_id: &str, bearer: &str) -> bool {
    tokens
        .read()
        .unwrap()
        .get(module_id)
        .is_some_and(|token| ct_eq(token.as_bytes(), bearer.as_bytes()))
}

impl Supervisor {
    /// The token `id`'s process calls back with: minted on first ask, stable for
    /// the life of this server, and naming its holder.
    pub fn module_token(&self, id: &str) -> String {
        minted(&self.module_tokens, id)
    }

    /// The module `token` was minted for, or `None` for the fabric token and for
    /// anything else.
    pub fn module_of_token(&self, token: &str) -> Option<String> {
        self.module_tokens
            .read()
            .unwrap()
            .iter()
            .find(|(_, token_minted)| ct_eq(token_minted.as_bytes(), token.as_bytes()))
            .map(|(id, _)| id.clone())
    }

    /// The token `id`'s own routes accept, handed to its process as
    /// `KROMA_HOST_TOKEN`. A peer gets it only through [`Self::contributions_for`].
    pub fn port_token(&self, id: &str) -> String {
        minted(&self.port_tokens, id)
    }

    /// Whether the bearer in `headers` may register `module_id`'s jobs or event
    /// subscriptions: the fabric token, or either token minted for that module.
    pub fn request_speaks_for(&self, module_id: &str, headers: &axum::http::HeaderMap) -> bool {
        headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .is_some_and(|bearer| self.speaks_for(module_id, bearer))
    }

    fn speaks_for(&self, module_id: &str, bearer: &str) -> bool {
        ct_eq(self.cfg.host_token.as_bytes(), bearer.as_bytes())
            || minted_for(&self.module_tokens, module_id, bearer)
            || minted_for(&self.port_tokens, module_id, bearer)
    }

    /// The answers to `point` that `caller` may reach: none unless its manifest
    /// consumes or defines the point. A refused ask is said on the caller's log.
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

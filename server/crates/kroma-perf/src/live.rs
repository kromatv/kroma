use std::collections::{BTreeMap, HashMap};
use std::sync::{Mutex, Weak};

use crate::scope::{Inner, Scope, ScopeKind};
use crate::stats::Part;

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Running {
    pub id: u64,
    pub kind: ScopeKind,
    pub name: String,
    pub elapsed_ms: f64,
    pub segments: u32,
    pub kinds: BTreeMap<String, Part>,
    pub last_key: Option<u64>,
}

#[derive(Default)]
pub(crate) struct Live(Mutex<HashMap<u64, Weak<Inner>>>);

impl Live {
    pub fn add(&self, scope: &Scope) {
        let weak = std::sync::Arc::downgrade(&scope.0);
        self.0.lock().unwrap().insert(scope.id(), weak);
    }

    pub fn remove(&self, id: u64) {
        self.0.lock().unwrap().remove(&id);
    }

    pub fn list(&self) -> Vec<Running> {
        let mut running: Vec<Running> = {
            let mut scopes = self.0.lock().unwrap();
            scopes.retain(|_, weak| weak.strong_count() > 0);
            scopes
                .values()
                .filter_map(Weak::upgrade)
                .map(|inner| describe(&inner))
                .collect()
        };
        running.sort_by(|a, b| b.elapsed_ms.total_cmp(&a.elapsed_ms));
        running
    }
}

fn describe(inner: &Inner) -> Running {
    let trace = inner.trace.lock().unwrap();
    Running {
        id: inner.id,
        kind: inner.kind,
        name: inner.name.clone(),
        elapsed_ms: inner.started.elapsed().as_secs_f64() * 1_000.0,
        segments: trace.segments,
        kinds: trace
            .kinds
            .iter()
            .map(|(kind, part)| ((*kind).to_string(), *part))
            .collect(),
        last_key: trace.events.last().map(|e| e.key),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_dropped_scope_leaves_the_list() {
        let live = Live::default();
        let kept = Scope::new(ScopeKind::Request, "GET /a".into());
        let gone = Scope::new(ScopeKind::Request, "GET /b".into());
        live.add(&kept);
        live.add(&gone);

        drop(gone);

        assert_eq!(
            live.list()
                .iter()
                .map(|s| s.name.as_str())
                .collect::<Vec<_>>(),
            vec!["GET /a"]
        );
    }
}

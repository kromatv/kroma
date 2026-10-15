//! Which module made a callback, resolved from the token it presented, and what
//! that module declared about the settings it reads.

use std::sync::Arc;

use axum::extract::{Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::Supervisor;

/// Who made a callback, and what that caller declared about itself.
///
/// `module` is `None` for a caller holding the fabric token rather than one minted
/// per module process: authenticated, but not named. A bundle built before
/// per-module tokens existed is in that position, and so is a module presenting
/// the fabric token on purpose, so an unnamed caller reaches nothing that wants a
/// declaration.
#[derive(Clone)]
pub(super) struct Caller {
    module: Option<String>,
    supervisor: Arc<Supervisor>,
}

impl Caller {
    pub(super) fn declares_read(&self, key: &str) -> bool {
        self.declaration().is_some_and(|scope| scope.reads(key))
    }

    pub(super) fn declares_write(&self, key: &str) -> bool {
        self.declaration().is_some_and(|scope| scope.writes(key))
    }

    pub(super) fn declares_nothing(&self) -> bool {
        self.declaration().is_none()
    }

    pub(super) fn name(&self) -> &str {
        self.module.as_deref().unwrap_or("an unnamed caller")
    }

    pub(super) fn rights_it_can_name(&self, mut user: kroma_domain::User) -> kroma_domain::User {
        let declared = self
            .module
            .as_deref()
            .map(|id| self.supervisor.rights_scope(id))
            .unwrap_or_default();
        let (kept, withheld): (Vec<_>, Vec<_>) =
            user.permissions.iter().copied().partition(|right| {
                right.known_to_every_module() || declared.iter().any(|key| key == right.key())
            });
        if !withheld.is_empty() {
            let keys: Vec<&str> = withheld.iter().map(|right| right.key()).collect();
            tracing::debug!(
                module = %self.name(),
                rights = %keys.join(", "),
                "a right the account holds is withheld from a module whose manifest omits it",
            );
        }
        user.permissions = kept;
        user
    }

    fn declaration(&self) -> Option<kroma_module_manifest::SettingsScope> {
        self.supervisor.settings_scope(self.module.as_deref()?)
    }
}

pub(super) async fn resolve_caller(
    State(supervisor): State<Arc<Supervisor>>,
    headers: HeaderMap,
    mut req: Request,
    next: Next,
) -> Response {
    let Some(bearer) = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
    else {
        return (StatusCode::UNAUTHORIZED, "bad host token").into_response();
    };
    let fabric =
        kroma_module_host::host_token::ct_eq(bearer.as_bytes(), supervisor.host_token().as_bytes());
    let module = supervisor.module_of_token(bearer);
    if !fabric && module.is_none() {
        return (StatusCode::UNAUTHORIZED, "bad host token").into_response();
    }
    req.extensions_mut().insert(Caller {
        module,
        supervisor: supervisor.clone(),
    });
    next.run(req).await
}

use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use kroma_module_sdk::host::{async_trait, AuthUser, HostCtx, ServerModule};
use kroma_module_sdk::EmbeddedModule;

pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();

pub struct __STRUCT__;

#[async_trait]
impl<S> ServerModule<S> for __STRUCT__
where
    S: HostCtx + Clone + Send + Sync + 'static,
{
    fn id(&self) -> &'static str {
        "__ID__"
    }
__MIGRATIONS__
    fn admin_routes(&self, _host: &S) -> Option<Router<S>> {
        Some(Router::new().route("/hello", get(hello::<S>)))
    }
}

#[derive(Serialize)]
struct Hello {
    answer: String,
}

async fn hello<S: HostCtx + Clone + Send + Sync + 'static>(
    State(_state): State<S>,
    AuthUser(user): AuthUser,
) -> Json<Hello> {
    Json(Hello {
        answer: format!("hello, {}", user.username),
    })
}

pub fn server_module<S: HostCtx + Clone + Send + Sync + 'static>() -> Box<dyn ServerModule<S>> {
    Box::new(__STRUCT__)
}

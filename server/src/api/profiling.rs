//! One profiling scope per API request: named by its route, closed with its
//! status and body size, and reported back in `Server-Timing`.

use std::sync::Arc;

use axum::body::HttpBody;
use axum::extract::{MatchedPath, Request, State};
use axum::http::HeaderValue;
use axum::http::header::HeaderName;
use axum::middleware::Next;
use axum::response::Response;
use kroma_module_supervisor::Supervisor;

const SERVER_TIMING: HeaderName = HeaderName::from_static("server-timing");
const TIMING_ALLOW_ORIGIN: HeaderName = HeaderName::from_static("timing-allow-origin");
const NAMED_BY_MODULE: [&str; 2] = ["/api/module/", "/api/admin/m/"];

/// Runs the request inside its own scope. Every statement, span and measured
/// call it makes, on its task or on a thread it carried the scope to, counts
/// toward it. A module's route is named after the module only while it runs,
/// so an id made up in a URL never becomes an entry. Switched off, it only
/// forwards.
pub async fn profile(
    State(supervisor): State<Arc<Supervisor>>,
    req: Request,
    next: Next,
) -> Response {
    let profiler = kroma_perf::profiler();
    let route = route_of(&req, |id| supervisor.is_running(id));
    let Some(scope) = profiler.request(req.method().as_str(), &route) else {
        return next.run(req).await;
    };
    let mut response = scope.clone().run(next.run(req)).await;
    let bytes = response.body().size_hint().exact();
    let finished = profiler.finish(&scope, Some(response.status().as_u16()), bytes);
    let headers = response.headers_mut();
    if let Ok(value) = HeaderValue::from_str(&finished.server_timing()) {
        headers.insert(SERVER_TIMING, value);
    }
    headers.insert(TIMING_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    response
}

fn route_of(req: &Request, running: impl Fn(&str) -> bool) -> String {
    let Some(matched) = req.extensions().get::<MatchedPath>() else {
        return "(unrouted)".into();
    };
    let template = matched.as_str();
    module_route(template, req.uri().path())
        .filter(|(_, id)| running(id))
        .map_or_else(|| template.to_string(), |(prefix, id)| format!("{prefix}{id}/*"))
}

fn module_route<'a>(template: &str, path: &'a str) -> Option<(&'static str, &'a str)> {
    let prefix = NAMED_BY_MODULE
        .into_iter()
        .find(|p| template.starts_with(p))?;
    let id = path.strip_prefix(prefix)?.split('/').next()?;
    Some((prefix, id))
}

#[cfg(test)]
mod tests {
    use super::module_route;

    #[test]
    fn a_module_route_names_its_module() {
        let named = module_route(
            "/api/module/{id}/{*rest}",
            "/api/module/tv.kroma.acquisition/requests/12",
        );

        assert_eq!(named, Some(("/api/module/", "tv.kroma.acquisition")));
    }

    #[test]
    fn any_other_route_keeps_its_template() {
        assert_eq!(
            module_route("/api/shows/{id}", "/api/shows/820ac34e83c11b71"),
            None
        );
    }
}

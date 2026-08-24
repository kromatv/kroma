//! Module registry endpoints: the manifest list (`GET /api/modules`) the
//! frontend registry reconciles against, and each module's packaged icon
//! (`GET /api/modules/:id/icon`).
//!
//! The icon route is PUBLIC: an `<img>` can't attach a bearer, so it is merged
//! outside the content auth layer (like the theme / image endpoints).

use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::state::SharedState;

/// Auth-gated: the module manifest list. Relative to `/api`.
pub fn routes() -> Router<SharedState> {
    Router::new().route("/modules", get(list))
}

/// Public: packaged module icons (fetched by `<img>`, which can't send a bearer).
pub fn public_routes() -> Router<SharedState> {
    Router::new().route("/modules/{id}/icon", get(icon))
}

/// A manifest plus its admin enabled flag (persisted in the `moduleStates`
/// settings blob, default true) and whatever it needs that nothing provides. The
/// frontend hides modules with `enabled: false`.
#[derive(Serialize)]
struct ListedModule {
    #[serde(flatten)]
    manifest: kroma_module_manifest::ModuleManifest,
    enabled: bool,
    /// Points this module `consumes` that no enabled module answers.
    /// Empty for almost every module; non-empty means it is installed and INERT,
    /// which is otherwise silent: the module runs, answers nothing useful, and
    /// nothing says why.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    unmet: Vec<String>,
}

async fn list(State(state): State<SharedState>) -> impl IntoResponse {
    let all = kroma_module_kernel::manifests(&state);
    let enabled_of = |id: &str| kroma_engine::modules::module_enabled(&state.settings, id);
    let answered = answered_by(&all, &state);

    let mods: Vec<ListedModule> = all
        .iter()
        .map(|m| ListedModule {
            manifest: m.clone(),
            enabled: enabled_of(&m.id),
            unmet: unmet_of(m, &answered),
        })
        .collect();
    Json(mods)
}

/// What the ENABLED modules between them answer, as `(point, instance)`, which is
/// what a `consumes` is satisfied by. Built once per listing rather than per
/// module.
pub(crate) fn answered_by(
    all: &[kroma_module_manifest::ModuleManifest],
    state: &SharedState,
) -> Vec<(String, Option<String>)> {
    all.iter()
        .filter(|m| kroma_engine::modules::module_enabled(&state.settings, &m.id))
        .flat_map(|m| {
            m.contributes
                .iter()
                .map(|c| (c.point.clone(), c.id.clone()))
        })
        .collect()
}

/// The points `m` consumes that `answered` does not cover, as `point` or
/// `point#id`. A need naming an `id` wants that exact contributor; one without
/// takes any. An OPTIONAL need is never reported: the module runs without it,
/// which is the whole reason it said so.
pub(crate) fn unmet_of(
    m: &kroma_module_manifest::ModuleManifest,
    answered: &[(String, Option<String>)],
) -> Vec<String> {
    m.consumes
        .iter()
        .filter(|req| !req.optional)
        .filter(|req| {
            !answered.iter().any(|(point, id)| {
                point == &req.point && req.id.as_ref().is_none_or(|want| id.as_ref() == Some(want))
            })
        })
        .map(|req| match &req.id {
            Some(id) => format!("{}#{}", req.point, id),
            None => req.point.clone(),
        })
        .collect()
}

async fn icon(State(state): State<SharedState>, Path(id): Path<String>) -> impl IntoResponse {
    match kroma_module_kernel::icon(&state, &id) {
        Some((content_type, bytes)) => (
            [
                (header::CONTENT_TYPE, content_type),
                (header::CACHE_CONTROL, "public, max-age=86400"),
            ],
            bytes,
        )
            .into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use kroma_module_manifest::{Contribution, ModuleManifest, PointReq};

    const POINT: &str = "tv.kroma.torrents/client";

    fn wanting(point: &str, id: Option<&str>) -> ModuleManifest {
        let mut m = ModuleManifest::new("tv.x.consumer", "Consumer", "1.0.0");
        m.consumes = vec![PointReq {
            point: point.into(),
            version: None,
            id: id.map(str::to_string),
            optional: false,
        }];
        m
    }

    fn answers(point: &str, id: &str) -> Vec<(String, Option<String>)> {
        vec![(point.to_string(), Some(id.to_string()))]
    }

    #[test]
    fn a_point_nothing_answers_is_reported() {
        let unmet = unmet_of(&wanting(POINT, None), &[]);

        assert_eq!(unmet, vec![POINT.to_string()]);
    }

    #[test]
    fn any_contributor_satisfies_a_need_with_no_id() {
        assert!(unmet_of(&wanting(POINT, None), &answers(POINT, "qbittorrent")).is_empty());
    }

    // The module runs without it, which is the whole reason it said `optional`.
    #[test]
    fn an_optional_need_is_never_reported_as_leaving_a_module_inert() {
        let mut m = wanting(POINT, None);
        m.consumes[0].optional = true;

        assert!(unmet_of(&m, &[]).is_empty());
    }

    // A requirement naming an id wants THAT engine; another one answering the same
    // kind does not satisfy it.
    #[test]
    fn a_need_naming_an_id_is_not_satisfied_by_a_different_one() {
        let answered = answers(POINT, "transmission");

        let unmet = unmet_of(&wanting(POINT, Some("qbittorrent")), &answered);

        assert_eq!(unmet, vec![format!("{POINT}#qbittorrent")]);
        assert!(unmet_of(&wanting(POINT, Some("transmission")), &answered).is_empty());
    }

    #[test]
    fn a_module_that_consumes_nothing_is_never_inert() {
        let m = ModuleManifest::new("tv.x.leaf", "Leaf", "1.0.0");

        assert!(unmet_of(&m, &[]).is_empty());
    }

    // The field is skipped when empty, so the common case adds nothing to the
    // response the frontend registry reconciles against.
    #[test]
    fn nothing_unmet_is_absent_from_the_json_rather_than_an_empty_list() {
        let listed = ListedModule {
            manifest: ModuleManifest::new("tv.x.leaf", "Leaf", "1.0.0"),
            enabled: true,
            unmet: Vec::new(),
        };

        let json = serde_json::to_value(&listed).unwrap();

        assert!(json.get("unmet").is_none(), "{json}");
        assert_eq!(json["enabled"], true);
    }

    #[test]
    fn an_unmet_requirement_reaches_the_json() {
        let listed = ListedModule {
            manifest: wanting("tv.kroma.indexer/search", None),
            enabled: true,
            unmet: vec!["tv.kroma.indexer/search".to_string()],
        };

        let json = serde_json::to_value(&listed).unwrap();

        assert_eq!(json["unmet"][0], "tv.kroma.indexer/search");
    }

    // A disabled module answers nothing, so switching off the last engine makes
    // its consumers report themselves inert.
    #[test]
    fn a_contributor_only_counts_while_it_is_enabled() {
        let contribution = Contribution::instance(POINT, "qbittorrent");
        let live = vec![(contribution.point.clone(), contribution.id.clone())];

        assert!(unmet_of(&wanting(POINT, None), &live).is_empty());
        assert_eq!(
            unmet_of(&wanting(POINT, None), &[]),
            vec![POINT.to_string()]
        );
    }
}

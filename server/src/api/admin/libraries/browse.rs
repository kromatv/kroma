//! The library folder picker: the browseable sub-directories under the volume
//! roots a library may be pointed at.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use axum::extract::Query;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::api::admin::{require, user_locale};
use crate::api::error::lerr;
use crate::api::extract::AuthUser;
use crate::model::Permission;

#[cfg(test)]
mod tests;

#[derive(Debug, Deserialize)]
pub struct BrowseQuery {
    #[serde(default)]
    pub path: Option<String>,
}

/// Browseable sub-directories of `path`, as `{ path, parent, entries: [{ name,
/// path }] }`. With no `path`, the roots: Synology `volumeN` dirs, else `/`.
pub async fn browse_libraries(
    AuthUser(user): AuthUser,
    Query(q): Query<BrowseQuery>,
) -> Result<Response, Response> {
    require(&user, Permission::LibraryManage)?;
    let raw = q.path.unwrap_or_default();
    // Never resolve a traversal segment, even before touching the filesystem.
    if raw.contains("..") {
        return Err(lerr(
            user_locale(&user),
            StatusCode::FORBIDDEN,
            "error.forbidden",
        ));
    }
    match tokio::task::spawn_blocking(move || browse_dirs(raw)).await {
        Ok(Ok(body)) => Ok(Json(body).into_response()),
        Ok(Err(BrowseErr::Forbidden)) => Err(lerr(
            user_locale(&user),
            StatusCode::FORBIDDEN,
            "error.forbidden",
        )),
        Ok(Err(BrowseErr::NotFound)) => Err(lerr(
            user_locale(&user),
            StatusCode::NOT_FOUND,
            "error.itemNotFound",
        )),
        Err(_) => Err(lerr(
            user_locale(&user),
            StatusCode::INTERNAL_SERVER_ERROR,
            "error.internal",
        )),
    }
}

enum BrowseErr {
    Forbidden,
    NotFound,
}

fn browse_dirs(raw: String) -> Result<Value, BrowseErr> {
    let roots = volume_roots();
    let raw = raw.trim();

    if raw.is_empty() {
        if !roots.is_empty() {
            return Ok(json!({ "path": "", "parent": Value::Null, "entries": to_entries(roots) }));
        }
        let entries = read_subdirs(Path::new("/"))?;
        return Ok(json!({ "path": "/", "parent": Value::Null, "entries": entries }));
    }

    let canon = std::fs::canonicalize(raw).map_err(|_| BrowseErr::NotFound)?;
    if !canon.is_dir() {
        return Err(BrowseErr::NotFound);
    }
    if !within_roots(&canon, &roots) {
        return Err(BrowseErr::Forbidden);
    }

    let entries = read_subdirs(&canon)?;
    let is_root = canon == Path::new("/") || roots.contains(&canon);
    let parent = if is_root {
        Value::Null
    } else {
        canon
            .parent()
            .map(|p| Value::String(p.to_string_lossy().to_string()))
            .unwrap_or(Value::Null)
    };
    Ok(json!({ "path": canon.to_string_lossy(), "parent": parent, "entries": entries }))
}

// Confines the browse to the volume roots; with none (a dev box, not a DSM
// one) anywhere is allowed.
fn within_roots(path: &Path, roots: &[PathBuf]) -> bool {
    roots.is_empty() || roots.iter().any(|r| path.starts_with(r))
}

fn volume_roots() -> Vec<PathBuf> {
    std::fs::read_dir("/")
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.is_dir()
                && p.file_name()
                    .and_then(OsStr::to_str)
                    .map(|n| n.starts_with("volume"))
                    .unwrap_or(false)
        })
        .collect()
}

// Skips hidden and DSM system names (`@eaDir`, `#recycle`).
fn read_subdirs(dir: &Path) -> Result<Vec<Value>, BrowseErr> {
    let rd = std::fs::read_dir(dir).map_err(|_| BrowseErr::NotFound)?;
    let mut dirs: Vec<PathBuf> = Vec::new();
    for entry in rd.flatten() {
        let name = entry.file_name();
        if name.to_string_lossy().starts_with(['.', '@', '#']) {
            continue;
        }
        let is_dir =
            entry.file_type().map(|t| t.is_dir()).unwrap_or(false) || entry.path().is_dir();
        if is_dir {
            dirs.push(entry.path());
        }
    }
    Ok(to_entries(dirs))
}

fn to_entries(mut paths: Vec<PathBuf>) -> Vec<Value> {
    paths.sort_by_key(|p| {
        p.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase()
    });
    paths
        .iter()
        .map(|p| {
            json!({
                "name": p.file_name().and_then(OsStr::to_str).unwrap_or_default(),
                "path": p.to_string_lossy(),
            })
        })
        .collect()
}

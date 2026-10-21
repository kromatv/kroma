//! Library file organization: Sonarr/Radarr-style naming ([`naming`]) and the
//! bulk rename tool that moves existing library files to match the configured
//! templates. Item logical ids are derived from the parsed title+year, not the
//! path, so renaming to a cleaner (still-parseable) name preserves watched
//! state / progress / my-list.

mod expected;
mod files;
mod sample;

// The naming engine is the `kroma-naming` library, shared
// with acquisition's import; re-exported here so this crate's own callers keep
// using crate::organize::naming.
pub use kroma_naming as naming;

pub use sample::sample;

use std::collections::HashMap;
use std::path::PathBuf;

use anyhow::Result;

use kroma_module_sdk::db;
use kroma_module_sdk::engine::model::{Kind, MediaItem};

use crate::dtos::{OrganizeMove, OrganizePlan, OrganizeResult};
use kroma_module_sdk::host::HostStorage;

use expected::{expected_rel, show_info};
use files::{current_abs, library_root, move_file, prune_empty_dirs};
use naming::NamingTemplates;

// Everything both walks below read: templates, library roots, show titles and
// the item list.
struct OrganizeInputs {
    tpl: NamingTemplates,
    folders: HashMap<String, Vec<PathBuf>>,
    shows_by_id: HashMap<String, (String, Option<u32>)>,
    items: Vec<MediaItem>,
}

fn inputs<S: HostStorage>(state: &S) -> Result<OrganizeInputs> {
    let shows = db::list_shows(state.db(), None)?;
    Ok(OrganizeInputs {
        tpl: NamingTemplates::read(|k, d| state.setting_str(k, d)),
        folders: state
            .library_folders()
            .into_iter()
            .map(|d| (d.id, d.folders.into_iter().map(PathBuf::from).collect()))
            .collect(),
        shows_by_id: show_info(&shows),
        items: db::list_items(state.db(), None)?,
    })
}

/// Compute the rename plan: every library file whose current path doesn't match
/// the configured templates. Non-destructive.
pub fn plan<S: HostStorage>(state: &S) -> Result<OrganizePlan> {
    let OrganizeInputs {
        tpl,
        folders,
        shows_by_id,
        items,
    } = inputs(state)?;
    let mut moves = Vec::new();
    let (mut total, mut matching) = (0u32, 0u32);
    for item in &items {
        for file in &item.files {
            let Some(abs) = current_abs(file) else {
                continue;
            };
            let Some(root) = library_root(&folders, &item.library, &abs) else {
                continue;
            };
            let Some((expected_rel, title)) = expected_rel(&tpl, item, file, &shows_by_id) else {
                continue;
            };
            total += 1;
            let expected_abs = root.join(&expected_rel);
            let current_rel = abs.strip_prefix(&root).unwrap_or(&abs);
            if expected_abs == abs {
                matching += 1;
            } else {
                moves.push(OrganizeMove {
                    title,
                    kind: if item.kind == Kind::Episode {
                        "episode"
                    } else {
                        "movie"
                    }
                    .into(),
                    from: current_rel.to_string_lossy().into_owned(),
                    to: expected_rel.to_string_lossy().into_owned(),
                });
            }
        }
    }
    // Stable, readable order.
    moves.sort_by(|a, b| a.to.cmp(&b.to));
    Ok(OrganizePlan {
        moves,
        total_files: total,
        matching,
    })
}

/// Apply the rename plan: recompute + move every mismatched file (same-filesystem
/// rename preserves the inode; item ids are title/year-based so watched/progress
/// survive). Emptied source folders are pruned; a scan is chained afterward.
pub fn apply<S: HostStorage>(state: &S, log: &dyn Fn(String)) -> Result<OrganizeResult> {
    let OrganizeInputs {
        tpl,
        folders,
        shows_by_id,
        items,
    } = inputs(state)?;
    let mut result = OrganizeResult {
        moved: 0,
        failed: 0,
        errors: Vec::new(),
    };
    for item in &items {
        for file in &item.files {
            let Some(abs) = current_abs(file) else {
                continue;
            };
            let Some(root) = library_root(&folders, &item.library, &abs) else {
                continue;
            };
            let Some((expected_rel, title)) = expected_rel(&tpl, item, file, &shows_by_id) else {
                continue;
            };
            let dest = root.join(&expected_rel);
            if dest == abs {
                continue;
            }
            match move_file(&abs, &dest) {
                Ok(()) => {
                    log(format!("{title}: {} -> {}", abs.display(), dest.display()));
                    result.moved += 1;
                    prune_empty_dirs(abs.parent(), &root);
                }
                Err(e) => {
                    result.failed += 1;
                    result.errors.push(format!("{title}: {e:#}"));
                }
            }
        }
    }
    if result.moved > 0 {
        state.trigger_job("library.scan", "organize");
    }
    Ok(result)
}

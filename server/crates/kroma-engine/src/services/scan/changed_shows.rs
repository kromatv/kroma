//! Which shows a walk moved, which is what decides whether a scan hands one to
//! TMDB or leaves it to the nightly stage.

use std::collections::{HashMap, HashSet};

use super::ScanData;

/// Compare the walk against what the database holds and record which shows
/// gained or lost an episode. Call BEFORE [`crate::db::sync_all`]: afterwards
/// the two sides agree and nothing looks changed.
pub fn note_changed_shows(pool: &crate::db::Pool, data: &mut ScanData) {
    let Ok(held) = crate::db::episode_ids_by_show(pool) else {
        data.changed_shows = data.shows.iter().map(|s| s.id.clone()).collect();
        return;
    };
    let mut walked: HashMap<&str, HashSet<&str>> = HashMap::new();
    for item in &data.items {
        if let Some(show_id) = item.show_id.as_deref() {
            walked.entry(show_id).or_default().insert(item.id.as_str());
        }
    }
    data.changed_shows = data
        .shows
        .iter()
        .filter(|show| moved(walked.remove(show.id.as_str()), held.get(&show.id)))
        .map(|show| show.id.clone())
        .collect();
}

fn moved(walked: Option<HashSet<&str>>, held: Option<&HashSet<String>>) -> bool {
    let Some(held) = held else { return true };
    let walked = walked.unwrap_or_default();
    walked.len() != held.len() || walked.iter().any(|id| !held.contains(*id))
}

#[cfg(test)]
mod tests;

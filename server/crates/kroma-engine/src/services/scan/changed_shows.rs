//! Which shows a walk moved, which is what decides whether a scan hands one to
//! TMDB or leaves it to the nightly stage.

use std::collections::{HashMap, HashSet};

use super::ScanData;

/// The episodes every show held when this was read, and the shows an earlier
/// walk wrote episodes for without reaching its end. Read it BEFORE a walk
/// writes its first batch: afterwards the two sides agree and nothing looks
/// changed.
pub(super) struct HeldEpisodes(Option<Held>);

struct Held {
    episodes: HashMap<String, HashSet<String>>,
    unsettled: HashSet<String>,
}

impl HeldEpisodes {
    pub(super) fn read(pool: &crate::db::Pool) -> Self {
        Self(read_held(pool).ok())
    }

    pub(super) fn note_changed(&self, data: &mut ScanData) {
        let Some(held) = &self.0 else {
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
            .filter(|show| {
                moved(walked.remove(show.id.as_str()), held.episodes.get(&show.id))
                    || held.unsettled.contains(&show.id)
            })
            .map(|show| show.id.clone())
            .collect();
    }

    pub(super) fn settled_by(&self, data: &ScanData) -> HashSet<String> {
        let taken = self.0.iter().flat_map(|held| held.unsettled.iter());
        taken.chain(&data.changed_shows).cloned().collect()
    }
}

fn read_held(pool: &crate::db::Pool) -> anyhow::Result<Held> {
    Ok(Held {
        episodes: crate::db::episode_ids_by_show(pool)?,
        unsettled: crate::db::unsettled_shows(pool)?,
    })
}

fn moved(walked: Option<HashSet<&str>>, held: Option<&HashSet<String>>) -> bool {
    let Some(held) = held else { return true };
    let walked = walked.unwrap_or_default();
    walked.len() != held.len() || walked.iter().any(|id| !held.contains(*id))
}

#[cfg(test)]
mod tests;

use anyhow::Result;

use crate::jellyfin::{Item, UserData};
use crate::queries::{in_library, paged, titles_and_shows, with_user_data, Window};
use crate::time::{ticks_to_ms, unix_seconds};
use crate::titles::number;
use crate::wire::{StatePage, StatesAsk, WatchState};
use crate::Importer;

fn positive(ticks: i64) -> Option<u64> {
    u64::try_from(ticks).ok().filter(|ticks| *ticks > 0)
}

pub(crate) fn last_played(data: &UserData) -> Option<i64> {
    data.last_played_date.as_deref().and_then(unix_seconds)
}

fn touched(data: &UserData) -> bool {
    data.played
        || data.is_favorite
        || data.play_count > 0
        || data.playback_position_ticks > 0
        || data.last_played_date.is_some()
}

fn state(item: &Item) -> Option<WatchState> {
    let data = item.user_data.as_ref().filter(|data| touched(data))?;
    if item.id.is_empty() {
        return None;
    }
    Some(WatchState {
        title: item.id.clone(),
        watched: data.played,
        play_count: number(Some(data.play_count)).filter(|count| *count > 0),
        position_ms: positive(data.playback_position_ticks).map(ticks_to_ms),
        duration_ms: item.run_time_ticks.and_then(positive).map(ticks_to_ms),
        last_played_at: last_played(data),
        favourite: data.is_favorite,
    })
}

impl Importer {
    // Jellyfin cannot list the states that changed since a time, so the
    // ask's `changedSince` is not read and every state is answered.
    pub(crate) fn states(&self, ask: &StatesAsk) -> Result<StatePage> {
        let session = self.session(&ask.sign_in, &ask.server)?;
        let window = Window::of(ask.cursor.as_deref(), ask.limit)?;
        let listed = in_library(titles_and_shows(&ask.user), &ask.library);
        let Some(page) = session.visible_items(paged(with_user_data(listed), window))? else {
            return Ok(StatePage::default());
        };
        Ok(StatePage {
            next: window.next(page.items.len()).map(|start| start.to_string()),
            states: page.items.iter().filter_map(state).collect(),
        })
    }
}

#[cfg(test)]
mod tests;

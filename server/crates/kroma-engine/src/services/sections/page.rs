//! One viewer's rows put on one page: which rows, in what order, and which
//! titles each keeps once no recommendation may repeat another's.

use std::collections::{HashMap, HashSet};

use crate::db;
use crate::i18n;
use crate::model::{Layout, Section, SectionItem};

use super::board::{Board, Draft};

const MAX_SECTIONS: usize = 18;

fn plan(board: &Board, show_recent: bool) -> Vec<Draft> {
    let mut because = board.because().into_iter();
    let mut genres = board.genres().into_iter();
    let mut people = board.people().into_iter();
    let mut themes = board.themes().into_iter();
    let recent = |row: Option<Draft>| row.filter(|_| show_recent);

    let mut rows: Vec<Option<Draft>> = vec![
        board.hero(),
        board.new_episodes(),
        board.top_picks(),
        because.next(),
        board.trending(),
        genres.next(),
        board.spotlight(),
        recent(board.recent_movies()),
        people.next(),
        themes.next(),
        recent(board.recent_shows()),
        genres.next(),
        board.saved(),
    ];
    rows.extend(board.authored().into_iter().map(Some));
    rows.extend(board.curated().into_iter().map(Some));
    rows.extend([
        because.next(),
        themes.next(),
        board.acclaimed(),
        genres.next(),
        people.next(),
        board.quick(),
        themes.next(),
        board.again(),
    ]);
    rows.into_iter().flatten().collect()
}

struct Page<'a, 'b> {
    board: &'a Board<'b>,
    offered: HashSet<String>,
    promised: HashMap<String, usize>,
    row_cap: usize,
}

const ROW_SHARE: usize = 6;
const SHORTEST_ROW: usize = 8;

fn row_cap(open: usize) -> usize {
    (open / ROW_SHARE).clamp(SHORTEST_ROW, super::board::ROW_CAP)
}

impl Page<'_, '_> {
    fn title_key(&self, id: &str) -> String {
        self.board
            .catalog
            .get(id)
            .and_then(|title| Some(format!("{}:{}", title.facts.show, title.facts.tmdb_id?)))
            .unwrap_or_else(|| id.to_string())
    }

    fn promise(&mut self, drafts: &[Draft]) {
        let mut claims: Vec<(usize, &Draft)> = drafts
            .iter()
            .enumerate()
            .filter(|(_, draft)| draft.claim.is_some() && !draft.factual)
            .collect();
        claims.sort_by_key(|(slot, draft)| (draft.claim, draft.ids.len(), *slot));
        for (slot, draft) in claims {
            let mut held: Vec<String> = Vec::with_capacity(draft.min);
            for id in draft.ids.iter().rev() {
                if held.len() == draft.min {
                    break;
                }
                let key = self.title_key(id);
                let free = !self.promised.contains_key(&key) && !self.offered.contains(&key);
                if free && !held.contains(&key) {
                    held.push(key);
                }
            }
            if held.len() == draft.min {
                self.promised.extend(held.into_iter().map(|key| (key, slot)));
            }
        }
    }

    fn place(&mut self, slot: usize, draft: &Draft) -> Option<Section> {
        let mut in_row: HashSet<String> = HashSet::new();
        let open: Vec<(&str, bool)> = draft
            .ids
            .iter()
            .filter_map(|id| {
                let key = self.title_key(id);
                let mine = self.promised.get(&key) == Some(&slot);
                let free = draft.factual
                    || (!self.offered.contains(&key) && self.promised.get(&key).is_none_or(|_| mine));
                (free && in_row.insert(key)).then_some((id.as_str(), mine))
            })
            .collect();
        let unpromised = open.iter().filter(|(_, mine)| !mine).count();
        let rail = matches!(draft.layout, Layout::Rail | Layout::Wide) && !draft.factual;
        let cap = if rail {
            draft.cap.min(self.row_cap.max(draft.min))
        } else {
            draft.cap
        };
        let share = match draft.claim {
            Some(_) if !draft.factual => draft.min.max(unpromised.div_ceil(2)),
            _ => cap,
        };
        let mut taken = 0;
        let kept: Vec<&str> = open
            .into_iter()
            .filter(|(_, mine)| {
                let take = *mine || taken < share;
                taken += usize::from(take && !mine);
                take
            })
            .map(|(id, _)| id)
            .take(cap)
            .collect();
        if kept.len() < draft.min {
            return None;
        }
        let items = db::entities_by_ids(self.board.pool, &kept).ok()?;
        if items.len() < draft.min {
            return None;
        }
        if !draft.factual {
            let keys: Vec<String> = kept.iter().map(|id| self.title_key(id)).collect();
            self.offered.extend(keys);
        }
        let notes: HashMap<String, String> = items
            .iter()
            .filter_map(|item| Some((item.id().to_string(), draft.notes.get(item.id())?.clone())))
            .collect();
        Some(Section {
            id: draft.id.clone(),
            title: draft.title.clone(),
            reason: draft.reason.clone(),
            layout: draft.layout,
            notes,
            items,
        })
    }
}

/// The ordered, de-duplicated page for one viewer. Infallible: a row that
/// fails or comes up thin is simply not there.
pub(super) fn compose(board: &Board, show_recent: bool) -> Vec<Section> {
    let drafts = plan(board, show_recent);
    let mut page = Page {
        board,
        offered: HashSet::new(),
        promised: HashMap::new(),
        row_cap: row_cap(board.ranked.len()),
    };
    let leads = |draft: &Draft| matches!(draft.layout, Layout::Hero | Layout::Spotlight);
    let mut placed: Vec<Option<Section>> = drafts.iter().map(|_| None).collect();
    for first in [true, false] {
        if !first {
            page.promise(&drafts);
        }
        for (slot, draft) in drafts.iter().enumerate() {
            if leads(draft) == first {
                placed[slot] = page.place(slot, draft);
            }
        }
    }
    let mut sections: Vec<Section> = placed.into_iter().flatten().take(MAX_SECTIONS).collect();

    let progress = db::show_progress(board.pool, &board.viewer.user_id).unwrap_or_default();
    let content_locale = i18n::content_locale(board.locale);
    for section in &mut sections {
        for item in &mut section.items {
            if let SectionItem::Show { show } = item {
                show.progress = progress.get(&show.id).copied();
            }
        }
        let _ = db::localize::overlay_section_items(board.pool, &mut section.items, content_locale);
    }
    sections
}

/// The layouts a client says it can draw, beyond a rail.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Accepts {
    pub hero: bool,
    pub spotlight: bool,
    pub ranked: bool,
    pub wide: bool,
}

const MIN_RAIL: usize = 3;

impl Accepts {
    /// Reads `hero,spotlight,ranked,wide`. A client that names none draws
    /// rails only, which is every client released before layouts existed.
    pub fn parse(raw: Option<&str>) -> Self {
        let named: HashSet<&str> = raw.unwrap_or_default().split(',').map(str::trim).collect();
        Self {
            hero: named.contains("hero"),
            spotlight: named.contains("spotlight"),
            ranked: named.contains("ranked"),
            wide: named.contains("wide"),
        }
    }

    fn draws(&self, layout: Layout) -> bool {
        match layout {
            Layout::Rail => true,
            Layout::Hero => self.hero,
            Layout::Spotlight => self.spotlight,
            Layout::Ranked => self.ranked,
            Layout::Wide => self.wide,
        }
    }
}

/// `sections` as a client that draws `accepts` can show them: a layout it does
/// not draw becomes a rail when the row still reads as one, and is left out
/// when it does not (a hero is not a row of five posters).
pub fn adapt(sections: &[Section], accepts: Accepts) -> Vec<Section> {
    sections
        .iter()
        .filter_map(|section| {
            if accepts.draws(section.layout) {
                return Some(section.clone());
            }
            let reads_as_a_rail = matches!(section.layout, Layout::Ranked | Layout::Wide)
                && section.items.len() >= MIN_RAIL;
            reads_as_a_rail.then(|| Section {
                layout: Layout::Rail,
                ..section.clone()
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_row_runs_shorter_in_a_small_library_and_never_past_twenty() {
        assert_eq!(row_cap(10), 8);
        assert_eq!(row_cap(78), 13);
        assert_eq!(row_cap(600), 20);
    }

    #[test]
    fn a_client_names_the_layouts_it_draws() {
        let all = Accepts::parse(Some("hero, spotlight,ranked,wide"));
        let some = Accepts::parse(Some("ranked,carousel"));

        assert!(all.hero && all.spotlight && all.ranked && all.wide);
        assert_eq!(some, Accepts { ranked: true, ..Accepts::default() });
        assert_eq!(Accepts::parse(None), Accepts::default());
    }
}

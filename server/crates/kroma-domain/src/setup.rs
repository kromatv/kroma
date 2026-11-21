//! The guided setup a new owner is led through: the step they are on, the
//! furthest one they reached, and the checklist an ended setup leaves on the
//! admin dashboard (ADMIN-102 to ADMIN-104, ADMIN-121 to ADMIN-124). These are
//! the wire types of `/api/admin/setup`.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

/// One screen of the setup, in the order the owner meets them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Step {
    Language,
    Start,
    Owner,
    Import,
    Media,
    Modules,
    People,
    Backups,
    Privacy,
    Done,
}

/// How the setup began: on an empty server, or by bringing another one over.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Start {
    #[default]
    Fresh,
    Bring,
}

/// The steps that can be a line of the checklist, in its order.
pub const LINES: [Step; 6] = [
    Step::Import,
    Step::Media,
    Step::Modules,
    Step::People,
    Step::Backups,
    Step::Privacy,
];

impl Step {
    /// A step whose answer leaves nothing on the server but the answer: the
    /// owner confirms it, and that is what makes it done.
    pub fn confirmed_by_the_owner(self) -> bool {
        matches!(self, Self::Modules | Self::Backups | Self::Privacy)
    }
}

/// What the server holds that makes a step done wherever it was made
/// (ADMIN-122): an import that ran, a source, a module, an invitation or a
/// second account, scheduled backups switched on.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Facts {
    pub imported: bool,
    pub source: bool,
    pub module: bool,
    pub people: bool,
    pub backups: bool,
}

impl Facts {
    fn done(self) -> impl Iterator<Item = Step> {
        [
            (self.imported, Step::Import),
            (self.source, Step::Media),
            (self.module, Step::Modules),
            (self.people, Step::People),
            (self.backups, Step::Backups),
        ]
        .into_iter()
        .filter_map(|(held, step)| held.then_some(step))
    }
}

/// Where one owner's setup stands. A step in `done` stays done once the server
/// has seen it done, so a line that left the checklist never comes back.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Setup {
    pub owner: Option<String>,
    pub start: Start,
    pub step: Step,
    pub reached: Step,
    pub ended: bool,
    pub done: BTreeSet<Step>,
    pub dismissed: BTreeSet<Step>,
}

impl Setup {
    /// The setup of an owner whose account was just made.
    pub fn led_by(owner: &str) -> Self {
        Self {
            owner: Some(owner.to_string()),
            start: Start::Fresh,
            step: Step::Owner,
            reached: Step::Owner,
            ended: false,
            done: BTreeSet::new(),
            dismissed: BTreeSet::new(),
        }
    }

    /// Whether `user` is the owner this setup leads.
    pub fn is_led_by(&self, user: &str) -> bool {
        self.owner.as_deref() == Some(user)
    }

    /// The owner is on `step` of a setup that began with `start`. Going back
    /// leaves the furthest step reached where it was.
    pub fn advance(&mut self, step: Step, start: Start) {
        self.step = step;
        self.start = start;
        self.reached = self.reached.max(step);
    }

    /// Records the steps the server holds done, and says whether one is new.
    pub fn observe(&mut self, facts: Facts) -> bool {
        let before = self.done.len();
        self.done.extend(facts.done());
        self.done.len() != before
    }

    /// The lines of the checklist, in order: none while the setup runs, then
    /// one per step that is neither done nor dismissed. The import is a line
    /// only for an owner who chose to bring a server over.
    pub fn checklist(&self) -> Vec<Step> {
        if !self.ended {
            return Vec::new();
        }
        LINES
            .into_iter()
            .filter(|step| *step != Step::Import || self.start == Start::Bring)
            .filter(|step| !self.done.contains(step) && !self.dismissed.contains(step))
            .collect()
    }

    /// What the owner reads of their setup.
    pub fn view(&self) -> SetupView {
        SetupView {
            start: self.start,
            step: self.step,
            reached: self.reached,
            ended: self.ended,
            checklist: self.checklist(),
        }
    }
}

/// The setup as `/api/admin/setup` answers it to its owner.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupView {
    pub start: Start,
    pub step: Step,
    pub reached: Step,
    pub ended: bool,
    pub checklist: Vec<Step>,
}

/// `GET /api/admin/setup`: the caller's setup, or none for anyone the setup
/// does not lead and on a server that had its owner before it had a setup.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SetupAnswer {
    pub setup: Option<SetupView>,
}

#[cfg(test)]
mod tests;

//! One person's watch state for one title, and the rule that merges what
//! another server holds into what this server holds: the newer wins, this
//! server wins a tie, and nothing the other server lacks is removed.

/// Where a person stopped, and when. `at` is epoch seconds.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Resume {
    pub position_ms: i64,
    pub duration_ms: Option<i64>,
    pub at: i64,
}

/// One person's watch state for one title, held here or brought from another
/// server. `watched_at` is epoch seconds, and `None` is not watched. A
/// time nobody recorded is 0, so anything dated is newer than it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Watching {
    pub watched_at: Option<i64>,
    pub resume: Option<Resume>,
    pub listed: bool,
}

impl Watching {
    /// This state once `brought` is merged into it. A state equal to this one
    /// means the merge changes nothing.
    ///
    /// A watched flag comes when this state has none or an older one. A resume
    /// point comes when it is newer than everything this state holds, its
    /// watched flag included, so a title finished here later is not started
    /// again. A favourite joins the list.
    ///
    /// A resume point here gives way to a watched flag that comes over and is
    /// newer than it: the person finished the title after they stopped in it.
    /// Nothing else is ever taken away.
    pub fn merged_with(&self, brought: &Watching) -> Watching {
        let newest_here = self.watched_at.max(self.resume.map(|resume| resume.at));
        let flag = brought
            .watched_at
            .filter(|at| self.watched_at.is_none_or(|here| *at > here));
        let resume = brought
            .resume
            .filter(|resume| newest_here.is_none_or(|here| resume.at > here));
        let outlived = |here: &Resume| flag.is_some_and(|flag| flag > here.at);
        Watching {
            watched_at: flag.or(self.watched_at),
            resume: resume.or(self.resume.filter(|here| !outlived(here))),
            listed: self.listed || brought.listed,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.watched_at.is_none() && self.resume.is_none() && !self.listed
    }
}

/// When a person took each part of their state away on this server, in epoch
/// seconds. `None` is a part they never removed.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Removed {
    pub watched: Option<i64>,
    pub resume: Option<i64>,
    pub listed: Option<i64>,
}

impl Watching {
    /// This state, brought from another server, without each part a person
    /// removed here at or after the time that part carries. A favourite has no
    /// time of its own: it carries the newest time of the rest of the state,
    /// and none when the state has no other part.
    pub fn newer_than(&self, removed: &Removed) -> Watching {
        let outlives = |at: i64, gone: Option<i64>| gone.is_none_or(|gone| at > gone);
        let listed_at = self.watched_at.max(self.resume.map(|resume| resume.at));
        Watching {
            watched_at: self.watched_at.filter(|at| outlives(*at, removed.watched)),
            resume: self
                .resume
                .filter(|resume| outlives(resume.at, removed.resume)),
            listed: self.listed && outlives(listed_at.unwrap_or(0), removed.listed),
        }
    }
}

#[cfg(test)]
mod tests;

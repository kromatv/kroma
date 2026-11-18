//! One person's watch state for one title, and the rule that merges what
//! another server holds into what this server holds: the newer wins, this
//! server wins a tie, and nothing is removed.

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
    /// What `brought` adds to this state or moves forward in it, as the state
    /// to write over it: an absent part is left as it stands.
    ///
    /// A watched flag comes when this state has none or an older one. A resume
    /// point comes when it is newer than everything this state holds, its
    /// watched flag included, so a title finished here later is not started
    /// again. A favourite joins the list. Nothing is ever taken away.
    pub fn gain_from(&self, brought: &Watching) -> Watching {
        let newest_here = self.watched_at.max(self.resume.map(|resume| resume.at));
        Watching {
            watched_at: brought
                .watched_at
                .filter(|at| self.watched_at.is_none_or(|here| *at > here)),
            resume: brought
                .resume
                .filter(|resume| newest_here.is_none_or(|here| resume.at > here)),
            listed: brought.listed && !self.listed,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.watched_at.is_none() && self.resume.is_none() && !self.listed
    }

    /// This state with `gain` written over it.
    pub fn with(&self, gain: &Watching) -> Watching {
        Watching {
            watched_at: gain.watched_at.or(self.watched_at),
            resume: gain.resume.or(self.resume),
            listed: self.listed || gain.listed,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const YESTERDAY: i64 = 1_700_000_000;
    const TODAY: i64 = YESTERDAY + 86_400;

    fn stopped(position_ms: i64, at: i64) -> Watching {
        Watching {
            resume: Some(Resume {
                position_ms,
                duration_ms: Some(7_200_000),
                at,
            }),
            ..Default::default()
        }
    }

    fn watched(at: i64) -> Watching {
        Watching {
            watched_at: Some(at),
            ..Default::default()
        }
    }

    #[test]
    fn a_resume_point_comes_to_a_title_nobody_started_here() {
        let here = Watching::default();
        let brought = stopped(5_025_000, YESTERDAY);

        let gain = here.gain_from(&brought);

        assert_eq!(gain, brought);
    }

    #[test]
    fn a_resume_point_newer_than_the_one_here_replaces_it() {
        let here = stopped(600_000, YESTERDAY);
        let brought = stopped(1_200_000, TODAY);

        let gain = here.gain_from(&brought);

        assert_eq!(gain, brought);
    }

    #[test]
    fn a_person_who_watched_further_here_is_not_moved_back() {
        let here = stopped(3_000_000, TODAY);
        let brought = stopped(1_200_000, YESTERDAY);

        let gain = here.gain_from(&brought);

        assert!(gain.is_empty());
    }

    #[test]
    fn this_server_wins_a_tie() {
        let here = stopped(3_000_000, TODAY);
        let brought = stopped(1_200_000, TODAY);

        let gain = here.gain_from(&brought);

        assert!(gain.is_empty());
    }

    #[test]
    fn a_resume_point_older_than_the_watched_flag_here_does_not_come_back() {
        let here = watched(TODAY);
        let brought = stopped(1_200_000, YESTERDAY);

        let gain = here.gain_from(&brought);

        assert!(gain.is_empty());
    }

    #[test]
    fn a_resume_point_newer_than_the_watched_flag_here_comes_over() {
        let here = watched(YESTERDAY);
        let brought = stopped(1_200_000, TODAY);

        let gain = here.gain_from(&brought);

        assert_eq!(gain, brought);
    }

    #[test]
    fn a_watched_flag_comes_to_a_title_in_progress_here_and_moves_no_resume_point() {
        let here = stopped(600_000, TODAY);
        let brought = watched(YESTERDAY);

        let gain = here.gain_from(&brought);

        assert_eq!(gain, watched(YESTERDAY));
    }

    #[test]
    fn a_newer_watched_flag_moves_the_one_here_forward() {
        let here = watched(YESTERDAY);

        let newer = here.gain_from(&watched(TODAY));
        let older = watched(TODAY).gain_from(&watched(YESTERDAY));

        assert_eq!(newer, watched(TODAY));
        assert!(older.is_empty());
    }

    #[test]
    fn a_title_unwatched_there_takes_nothing_away_here() {
        let here = Watching {
            listed: true,
            ..watched(YESTERDAY).with(&stopped(600_000, YESTERDAY))
        };
        let brought = Watching::default();

        let gain = here.gain_from(&brought);

        assert!(gain.is_empty());
        assert_eq!(here.with(&gain), here);
    }

    #[test]
    fn a_favourite_joins_the_list_once() {
        let favourite = Watching {
            listed: true,
            ..Default::default()
        };

        let first = Watching::default().gain_from(&favourite);
        let second = favourite.gain_from(&favourite);

        assert_eq!(first, favourite);
        assert!(second.is_empty());
    }

    #[test]
    fn a_state_nobody_dated_fills_only_what_is_empty_here() {
        let undated = watched(0).with(&stopped(1_200_000, 0));

        let onto_nothing = Watching::default().gain_from(&undated);
        let onto_a_resume_point = stopped(600_000, YESTERDAY).gain_from(&undated);

        assert_eq!(onto_nothing, undated);
        assert_eq!(onto_a_resume_point, watched(0));
    }

    #[test]
    fn merging_the_same_state_twice_changes_nothing_the_second_time() {
        let here = stopped(600_000, YESTERDAY);
        let brought = Watching {
            listed: true,
            ..watched(TODAY).with(&stopped(1_200_000, TODAY))
        };
        let merged = here.with(&here.gain_from(&brought));

        let again = merged.gain_from(&brought);

        assert_eq!(merged, brought);
        assert!(again.is_empty());
    }
}

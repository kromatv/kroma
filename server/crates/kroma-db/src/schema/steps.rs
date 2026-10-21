//! Every change to the core schema since the baseline, oldest first. A step
//! that has shipped is never edited: a new change is a new step at the end.

use kroma_sqlite::{Run, Step};

pub(super) const STEPS: &[Step] = &[
    Step {
        name: "0002_upgrade_tasks",
        run: Run::Sql(include_str!("steps/0002_upgrade_tasks.sql")),
        rebuilds: false,
    },
];

//! Every change to the core schema since the baseline, oldest first. A step
//! that has shipped is never edited: a new change is a new step at the end.

use kroma_sqlite::{Run, Step};

// One name for the step and its file, so the two cannot drift apart and a step
// reads as the one line it is.
macro_rules! sql_steps {
    ($($name:literal),+ $(,)?) => {
        &[$(Step {
            name: $name,
            run: Run::Sql(include_str!(concat!("steps/", $name, ".sql"))),
            rebuilds: false,
        }),+]
    };
}

pub(super) const STEPS: &[Step] = sql_steps![
    "0002_upgrade_tasks",
    "0003_notification_subjects",
    "0004_notification_dedupe",
    "0005_drop_item_probe_columns",
    "0006_notification_folding",
    "0007_notification_resolve",
    "0008_notification_deliveries",
];

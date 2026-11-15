//! Every change to the core schema since the baseline, oldest first. A step
//! that has shipped is never edited: a new change is a new step at the end.

use kroma_sqlite::{Run, Step};

// One name for the step and its file, so the two cannot drift apart and a step
// reads as the one line it is.
macro_rules! sql_step {
    ($name:literal) => {
        Step {
            name: $name,
            run: Run::Sql(include_str!(concat!("steps/", $name, ".sql"))),
            rebuilds: false,
        }
    };
}

pub(super) const STEPS: &[Step] = &[
    sql_step!("0002_upgrade_tasks"),
    sql_step!("0003_notification_subjects"),
    sql_step!("0004_notification_dedupe"),
    sql_step!("0005_drop_item_probe_columns"),
    sql_step!("0006_notification_folding"),
    sql_step!("0007_notification_resolve"),
    sql_step!("0008_notification_deliveries"),
    sql_step!("0009_network_flows_daily"),
    sql_step!("0010_notification_types"),
    sql_step!("0011_network_inbound_daily"),
    sql_step!("0012_item_vectors_updated"),
    Step {
        name: "0013_stored_tokens",
        run: Run::Code(super::stored_tokens::hash_bearers),
        rebuilds: false,
    },
    sql_step!("0014_notification_engagement"),
    sql_step!("0015_sign_in_identities"),
];

use std::collections::BTreeSet;

use super::test_support::{fresh_pool, schema_tables};
use super::TABLES;

const REBUILT_BY_A_SCAN: &[&str] = &["files", "items", "libraries", "shows"];

const REBUILT_FROM_THE_MEDIA_AND_ITS_PROVIDERS: &[&str] = &[
    "audio_analysis",
    "curated_sections",
    "file_segments",
    "item_suggestions",
    "item_vectors",
    "library_gaps",
    "markers",
    "metadata_core",
    "pipeline_tasks",
    "season_meta",
    "translations",
    "user_taste",
];

const SIGNED_IN_DEVICES: &[&str] = &["access_tokens", "push_subscriptions", "sessions"];

const SHORT_LIVED: &[&str] = &[
    "credential_resets",
    "email_verifications",
    "job_logs",
    "job_runs",
    "notifications",
    "pin_attempts",
    "reset_requests",
    "whisper_jobs",
];

const THIS_MACHINE_ONLY: &[&str] = &["downloads", "metric_samples"];

const LEFT_OUT: [&[&str]; 5] = [
    REBUILT_BY_A_SCAN,
    REBUILT_FROM_THE_MEDIA_AND_ITS_PROVIDERS,
    SIGNED_IN_DEVICES,
    SHORT_LIVED,
    THIS_MACHINE_ONLY,
];

fn named() -> Vec<&'static str> {
    TABLES
        .iter()
        .chain(LEFT_OUT.iter().flat_map(|group| group.iter()))
        .copied()
        .collect()
}

#[test]
fn every_table_the_schema_creates_is_backed_up_or_left_out_by_name() {
    let tables = schema_tables(&fresh_pool("named"));
    let named = named();

    let unnamed: Vec<&str> = tables
        .iter()
        .map(String::as_str)
        .filter(|t| !named.contains(t))
        .collect();

    assert_eq!(unnamed, Vec::<&str>::new());
}

#[test]
fn every_table_named_here_is_one_the_schema_creates() {
    let tables = schema_tables(&fresh_pool("stale"));

    let stale: Vec<&str> = named()
        .into_iter()
        .filter(|t| !tables.contains(*t))
        .collect();

    assert_eq!(stale, Vec::<&str>::new());
}

#[test]
fn no_table_is_named_twice() {
    let named = named();

    let unique: BTreeSet<&str> = named.iter().copied().collect();

    assert_eq!(unique.len(), named.len());
}

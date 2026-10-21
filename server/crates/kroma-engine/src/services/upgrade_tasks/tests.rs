use super::*;
use crate::test_support::test_state;

fn mark(state: &SharedState, name: &str) -> Result<()> {
    let marker = state.config.data_dir.join(name);
    let runs = std::fs::read_to_string(&marker).unwrap_or_default();
    std::fs::write(marker, format!("{runs}x"))?;
    Ok(())
}

fn moves_files(state: &SharedState) -> Result<()> {
    mark(state, "moves_files")
}

fn fails(state: &SharedState) -> Result<()> {
    mark(state, "fails")?;
    anyhow::bail!("the disk is full")
}

const TASKS: &[UpgradeTask] = &[
    UpgradeTask {
        name: "fails",
        run: fails,
    },
    UpgradeTask {
        name: "moves_files",
        run: moves_files,
    },
];

fn runs(state: &SharedState, name: &str) -> String {
    std::fs::read_to_string(state.config.data_dir.join(name)).unwrap_or_default()
}

#[test]
fn a_finished_task_never_runs_again_and_a_failed_one_runs_at_every_boot() {
    let state = test_state();

    run_pending(&state, TASKS).unwrap();
    run_pending(&state, TASKS).unwrap();

    assert_eq!(runs(&state, "moves_files"), "x");
    assert_eq!(runs(&state, "fails"), "xx");
    let error: Option<String> = state
        .db
        .get()
        .unwrap()
        .query_row(
            "SELECT last_error FROM upgrade_tasks WHERE name = 'fails'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(error.as_deref(), Some("the disk is full"));
}

#[test]
fn the_shipped_list_names_every_task_once() {
    let mut names: Vec<&str> = super::TASKS.iter().map(|t| t.name).collect();
    let count = names.len();

    names.sort_unstable();
    names.dedup();

    assert_eq!(names.len(), count);
}

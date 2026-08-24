use anyhow::Result;

use crate::db::testing::TempPool;
use crate::services::jobs::JobContext;
use crate::state::SharedState;

use super::super::stage::Stage;

pub(super) fn test_pool() -> TempPool {
    crate::db::testing::temp_pool("disp-test")
}

pub(super) fn enum_empty(_s: &SharedState) -> Result<Vec<(String, String)>> {
    Ok(Vec::new())
}

pub(super) fn process_ok(_ctx: &JobContext, _id: &str) -> Result<()> {
    Ok(())
}

pub(super) fn process_fail(_ctx: &JobContext, id: &str) -> Result<()> {
    anyhow::bail!("boom: {id}")
}

pub(super) fn process_panic(_ctx: &JobContext, _id: &str) -> Result<()> {
    panic!("kaboom")
}

pub(super) fn test_stage(process: fn(&JobContext, &str) -> Result<()>) -> Stage {
    Stage {
        short: "teststage",
        key: "pipeline.teststage",
        subject_kind: "file",
        concurrency: 3,
        pause_for_playback: false,
        enumerate: enum_empty,
        process,
    }
}

pub(super) fn log_lines(
    rx: &mut tokio::sync::broadcast::Receiver<crate::infra::events::Envelope>,
) -> Vec<String> {
    let mut out = Vec::new();
    while let Ok(env) = rx.try_recv() {
        let v: serde_json::Value = serde_json::from_str(env.payload_unrouted()).unwrap();
        if let Some(message) = v["message"].as_str() {
            out.push(message.to_string());
        }
    }
    out
}

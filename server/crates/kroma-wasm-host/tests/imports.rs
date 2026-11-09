mod support;

use std::sync::Arc;

use kroma_wasm_host::{
    FetchCall, FetchRecord, FetchRequest, ModuleInstance, NetPolicy, Outcome, Response, Settings, Verdict,
};
use support::{instance, probe, text, LIMITS};

const ALLOWED_PURPOSE: &str = "metadata";
const BLOCKED_PURPOSE: &str = "telemetry";
const BLOCKED_REASON: &str = "telemetry is not a declared purpose";

struct OnePurpose;

impl NetPolicy for OnePurpose {
    fn fetch(&self, request: &FetchRequest) -> Verdict {
        if request.purpose != ALLOWED_PURPOSE {
            return Verdict::Block(BLOCKED_REASON.into());
        }
        Verdict::Allow(Response {
            status: 200,
            headers: Vec::new(),
            body: b"stubbed answer".to_vec(),
        })
    }
}

fn fetching_module() -> ModuleInstance {
    instance(Arc::new(OnePurpose), Settings::default(), LIMITS)
}

fn configured_module() -> ModuleInstance {
    let settings = Settings::new(
        ["indexer.url"],
        [
            ("indexer.url", "https://indexer.test"),
            ("admin.password", "hunter2"),
        ],
    );
    instance(Arc::new(OnePurpose), settings, LIMITS)
}

fn call_for(purpose: &str) -> FetchCall {
    FetchCall {
        purpose: purpose.into(),
        method: "GET".into(),
        url: "https://api.example.test/v1".into(),
    }
}

#[test]
fn a_fetch_the_policy_allows_answers_the_component_with_the_policy_response() {
    let mut module = fetching_module();

    let response = probe(&mut module, "/fetch", ALLOWED_PURPOSE);

    assert_eq!(
        (response.status, text(&response).as_str()),
        (200, "stubbed answer")
    );
}

#[test]
fn a_fetch_the_policy_blocks_fails_inside_the_component_with_its_reason() {
    let mut module = fetching_module();

    let response = probe(&mut module, "/fetch", BLOCKED_PURPOSE);

    assert_eq!(
        (response.status, text(&response).as_str()),
        (403, BLOCKED_REASON)
    );
}

#[test]
fn the_journal_holds_each_fetch_with_its_verdict_in_call_order() {
    let mut module = fetching_module();
    probe(&mut module, "/fetch", ALLOWED_PURPOSE);

    probe(&mut module, "/fetch", BLOCKED_PURPOSE);

    assert_eq!(
        module.fetches(),
        &[
            FetchRecord {
                call: call_for(ALLOWED_PURPOSE),
                outcome: Outcome::Allowed,
            },
            FetchRecord {
                call: call_for(BLOCKED_PURPOSE),
                outcome: Outcome::Blocked(BLOCKED_REASON.into()),
            },
        ]
    );
}

#[test]
fn the_journal_keeps_the_last_256_fetches_and_drops_the_oldest() {
    let mut module = fetching_module();
    probe(&mut module, "/fetch", BLOCKED_PURPOSE);

    for _ in 0..256 {
        probe(&mut module, "/fetch", ALLOWED_PURPOSE);
    }

    assert_eq!(module.fetches().len(), 256);
    assert!(module
        .fetches()
        .iter()
        .all(|record| record.outcome == Outcome::Allowed));
}

#[test]
fn a_declared_setting_reads_its_stored_value() {
    let mut module = configured_module();

    let response = probe(&mut module, "/settings", "indexer.url");

    assert_eq!(
        (response.status, text(&response).as_str()),
        (200, "https://indexer.test")
    );
}

#[test]
fn an_undeclared_setting_reads_as_absent_although_it_is_stored() {
    let mut module = configured_module();

    let response = probe(&mut module, "/settings", "admin.password");

    assert_eq!((response.status, text(&response).as_str()), (403, "absent"));
}

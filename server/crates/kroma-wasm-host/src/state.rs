use std::sync::Arc;

use wasmtime::component::ResourceTable;
use wasmtime_wasi::{WasiCtx, WasiCtxView, WasiView};

use crate::bindings::kroma::module::{net, settings, types};
use crate::limits::Ceiling;
use crate::policy::{FetchCall, FetchRecord, NetPolicy, Outcome, Verdict};
use crate::{Response, Settings};

pub(crate) struct State {
    wasi: WasiCtx,
    table: ResourceTable,
    pub(crate) ceiling: Ceiling,
    policy: Arc<dyn NetPolicy>,
    settings: Settings,
    pub(crate) fetches: Vec<FetchRecord>,
}

impl State {
    pub(crate) fn new(policy: Arc<dyn NetPolicy>, settings: Settings, memory_bytes: usize) -> Self {
        Self {
            wasi: empty_wasi(),
            table: ResourceTable::new(),
            ceiling: Ceiling::new(memory_bytes),
            policy,
            settings,
            fetches: Vec::new(),
        }
    }
}

fn empty_wasi() -> WasiCtx {
    WasiCtx::builder()
        .allow_tcp(false)
        .allow_udp(false)
        .allow_ip_name_lookup(false)
        .build()
}

impl WasiView for State {
    fn ctx(&mut self) -> WasiCtxView<'_> {
        WasiCtxView {
            ctx: &mut self.wasi,
            table: &mut self.table,
        }
    }
}

impl types::Host for State {}

impl net::Host for State {
    fn fetch(
        &mut self,
        purpose: String,
        method: String,
        url: String,
        _body: Vec<u8>,
    ) -> Result<Response, String> {
        let call = FetchCall {
            purpose,
            method,
            url,
        };
        let (outcome, answer) = match self.policy.decide(&call) {
            Verdict::Allow(response) => (Outcome::Allowed, Ok(response)),
            Verdict::Block(reason) => (Outcome::Blocked(reason.clone()), Err(reason)),
        };
        self.fetches.push(FetchRecord { call, outcome });
        answer
    }
}

impl settings::Host for State {
    fn get(&mut self, key: String) -> Option<String> {
        self.settings.get(&key)
    }
}

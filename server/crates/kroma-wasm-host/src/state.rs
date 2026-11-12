use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use std::time::Duration;

use wasmtime::component::ResourceTable;
use wasmtime_wasi::{FsPerms, WasiCtx, WasiCtxView, WasiView};

use crate::bindings::kroma::module::{files, host_api, lan, net, process, settings, sql, types};
use crate::capabilities::{Databases, Files, Lan, Media, Preopen, Processes, SqlConnection};
use crate::limits::Ceiling;
use crate::policy::{FetchCall, FetchRecord, NetPolicy, Outcome, Verdict};
use crate::{Grant, HostError, Request, Response, Settings};

const NO_DATABASE: &str = "this module declares no storage";
const NO_PROCESSES: &str = "this module may not start programs";
const NO_LAN: &str = "this module declares no discovery";
const FETCHES_KEPT: usize = 256;

pub(crate) struct State {
    wasi: WasiCtx,
    table: ResourceTable,
    pub(crate) ceiling: Ceiling,
    policy: Arc<dyn NetPolicy>,
    settings: Settings,
    databases: Option<Arc<dyn Databases>>,
    processes: Option<Arc<dyn Processes>>,
    lan: Option<Arc<dyn Lan>>,
    files: Option<Arc<dyn Files>>,
    pub(crate) media: Option<Arc<dyn Media>>,
    connections: HashMap<u32, Box<dyn SqlConnection>>,
    next_connection: u32,
    pub(crate) fetches: VecDeque<FetchRecord>,
    pub(crate) cpu_at_start: Duration,
    pub(crate) cpu_budget: Duration,
}

impl State {
    pub(crate) fn new(grant: Grant, args: &[String]) -> Result<Self, HostError> {
        let wasi = wasi_of(&grant.env, args, grant.log, &grant.preopens)?;
        Ok(Self {
            wasi,
            table: ResourceTable::new(),
            ceiling: Ceiling::new(grant.limits.memory_bytes),
            policy: grant.policy,
            settings: grant.settings,
            databases: grant.databases,
            processes: grant.processes,
            lan: grant.lan,
            files: grant.files,
            media: grant.media,
            connections: HashMap::new(),
            next_connection: 0,
            fetches: VecDeque::new(),
            cpu_at_start: Duration::ZERO,
            cpu_budget: grant.limits.cpu_budget,
        })
    }

    fn record(&mut self, request: &net::FetchRequest, answer: &Result<Response, String>) {
        let outcome = match answer {
            Ok(_) => Outcome::Allowed,
            Err(reason) => Outcome::Blocked(reason.clone()),
        };
        if self.fetches.len() == FETCHES_KEPT {
            self.fetches.pop_front();
        }
        self.fetches.push_back(FetchRecord {
            call: FetchCall {
                purpose: request.purpose.clone(),
                method: request.method.clone(),
                url: request.url.clone(),
            },
            outcome,
        });
    }
}

fn wasi_of(
    env: &[(String, String)],
    args: &[String],
    log: Option<crate::LogSink>,
    preopens: &[Preopen],
) -> Result<WasiCtx, HostError> {
    let mut builder = WasiCtx::builder();
    builder
        .envs(env)
        .args(args)
        .allow_tcp(false)
        .allow_udp(false)
        .allow_ip_name_lookup(false);
    if let Some(sink) = log {
        let lines = crate::log::LineStream::new(sink);
        builder.stdout(lines.clone()).stderr(lines);
    }
    for preopen in preopens {
        let perms = if preopen.writable {
            FsPerms::ReadWrite
        } else {
            FsPerms::ReadOnly
        };
        builder
            .preopened_dir(&preopen.host, &preopen.guest, perms)
            .map_err(HostError::Instantiate)?;
    }
    Ok(builder.build())
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

fn verdict_answer(verdict: Verdict) -> Result<Response, String> {
    match verdict {
        Verdict::Allow(response) => Ok(response),
        Verdict::Block(reason) => Err(reason),
    }
}

impl net::Host for State {
    fn fetch(&mut self, request: net::FetchRequest) -> Result<Response, String> {
        let policy = Arc::clone(&self.policy);
        let answer = verdict_answer(policy.fetch(&request));
        self.record(&request, &answer);
        answer
    }

    fn fetch_all(&mut self, requests: Vec<net::FetchRequest>) -> Vec<Result<Response, String>> {
        let policy = Arc::clone(&self.policy);
        let answers = std::thread::scope(|threads| {
            let running: Vec<_> = requests
                .iter()
                .map(|request| threads.spawn(|| verdict_answer(policy.fetch(request))))
                .collect();
            running
                .into_iter()
                .map(|call| call.join().unwrap_or_else(|_| Err("the call panicked".to_string())))
                .collect::<Vec<_>>()
        });
        for (request, answer) in requests.iter().zip(&answers) {
            self.record(request, answer);
        }
        answers
    }

    fn download(&mut self, request: net::FetchRequest, destination: String) -> Result<Response, String> {
        let policy = Arc::clone(&self.policy);
        let answer = verdict_answer(policy.download(&request, &destination));
        self.record(&request, &answer);
        answer
    }
}

impl host_api::Host for State {
    fn call(&mut self, request: Request) -> Result<Response, String> {
        let policy = Arc::clone(&self.policy);
        policy.host_api(&request)
    }

    fn call_all(&mut self, requests: Vec<Request>) -> Vec<Result<Response, String>> {
        let policy = Arc::clone(&self.policy);
        std::thread::scope(|threads| {
            let running: Vec<_> = requests
                .iter()
                .map(|request| threads.spawn(|| policy.host_api(request)))
                .collect();
            running
                .into_iter()
                .map(|call| call.join().unwrap_or_else(|_| Err("the call panicked".to_string())))
                .collect()
        })
    }
}

impl settings::Host for State {
    fn get(&mut self, key: String) -> Option<String> {
        self.settings.get(&key)
    }
}

fn refused(message: impl Into<String>) -> sql::Failure {
    sql::Failure {
        code: 23,
        message: message.into(),
    }
}

impl sql::Host for State {
    fn open(&mut self, path: String) -> Result<u32, sql::Failure> {
        let databases = self.databases.clone().ok_or_else(|| refused(NO_DATABASE))?;
        let connection = databases.open(&path)?;
        self.next_connection += 1;
        self.connections.insert(self.next_connection, connection);
        Ok(self.next_connection)
    }

    fn close(&mut self, connection: u32) {
        self.connections.remove(&connection);
    }

    fn run(
        &mut self,
        connection: u32,
        statement: String,
        params: Vec<sql::Value>,
    ) -> Result<sql::Outcome, sql::Failure> {
        self.connections
            .get_mut(&connection)
            .ok_or_else(|| refused("this connection is closed"))?
            .run(&statement, &params)
    }

    fn batch(&mut self, connection: u32, statements: String) -> Result<(), sql::Failure> {
        self.connections
            .get_mut(&connection)
            .ok_or_else(|| refused("this connection is closed"))?
            .batch(&statements)
    }

    fn snapshot(&mut self, connection: u32, target: String) -> Result<(), sql::Failure> {
        self.connections
            .get_mut(&connection)
            .ok_or_else(|| refused("this connection is closed"))?
            .snapshot(&target)
    }
}

impl State {
    fn processes(&self) -> Result<Arc<dyn Processes>, String> {
        self.processes.clone().ok_or_else(|| NO_PROCESSES.to_string())
    }

    fn lan(&self) -> Result<Arc<dyn Lan>, String> {
        self.lan.clone().ok_or_else(|| NO_LAN.to_string())
    }
}

impl process::Host for State {
    fn ensure(&mut self, program: String) -> Result<(), String> {
        let processes = self.processes()?;
        processes.ensure(&program)
    }

    fn spawn(&mut self, command: process::Command) -> Result<u64, String> {
        let processes = self.processes()?;
        processes.spawn(command)
    }

    fn wait(&mut self, child: u64, timeout_ms: u32) -> Result<Option<i32>, String> {
        let processes = self.processes()?;
        processes.wait(child, Duration::from_millis(u64::from(timeout_ms)))
    }

    fn read(&mut self, child: u64, which: process::Output, max_bytes: u32) -> Result<Vec<u8>, String> {
        let processes = self.processes()?;
        processes.read(child, which, max_bytes)
    }

    fn kill(&mut self, child: u64, force: bool) -> Result<(), String> {
        let processes = self.processes()?;
        processes.kill(child, force)
    }
}

impl files::Host for State {
    fn canonical(&mut self, path: String) -> Option<String> {
        let files = self.files.clone()?;
        files.canonical(&path)
    }

    fn copy(&mut self, source: String, destination: String) -> Result<u64, String> {
        let files = self.files.clone().ok_or("this module holds no folders")?;
        files.copy(&source, &destination)
    }
}

impl lan::Host for State {
    fn announce(&mut self, service: lan::Service) -> Result<u64, String> {
        let lan = self.lan()?;
        lan.announce(service)
    }

    fn withdraw(&mut self, announcement: u64) {
        if let Ok(lan) = self.lan() {
            lan.withdraw(announcement);
        }
    }

    fn search(&mut self, target: String, wait_ms: u32) -> Result<Vec<lan::Reply>, String> {
        let lan = self.lan()?;
        lan.search(&target, Duration::from_millis(u64::from(wait_ms)))
    }

    fn addresses(&mut self) -> Vec<String> {
        self.lan().map(|lan| lan.addresses()).unwrap_or_default()
    }
}

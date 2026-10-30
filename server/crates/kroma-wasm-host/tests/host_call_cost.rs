mod support;

use std::net::TcpListener;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::Path;
use axum::routing::get;
use axum::{Json, Router};
use kroma_http::Loopback;
use kroma_wasm_host::{ModuleInstance, Settings};
use support::{instance, probe, text, BlockEverything, LIMITS};

const SAMPLES: usize = 501;
const WARM_UP: usize = 50;
const HOST_CALLS_PER_SAMPLE: u32 = 10_000;

fn bench_module() -> ModuleInstance {
    let settings = Settings::new(["bench.key"], [("bench.key", "value of bench.key")]);
    instance(Arc::new(BlockEverything), settings, LIMITS)
}

fn settings_server() -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind a loopback port");
    let address = listener.local_addr().expect("read the bound address");
    listener
        .set_nonblocking(true)
        .expect("hand the listener to tokio");
    std::thread::spawn(move || {
        let runtime = tokio::runtime::Runtime::new().expect("start the server runtime");
        runtime.block_on(async move {
            let listener = tokio::net::TcpListener::from_std(listener).expect("adopt the listener");
            let router = Router::new().route(
                "/api/_host/settings/{key}",
                get(|Path(key): Path<String>| async move { Json(Some(format!("value of {key}"))) }),
            );
            axum::serve(listener, router).await.expect("serve settings");
        });
    });
    format!("http://{address}/api/_host/settings/bench.key")
}

fn median(mut samples: Vec<Duration>) -> Duration {
    samples.sort_unstable();
    samples[samples.len() / 2]
}

fn sample(mut run: impl FnMut() -> Duration) -> Duration {
    (0..WARM_UP).for_each(|_| {
        run();
    });
    median((0..SAMPLES).map(|_| run()).collect())
}

fn timed(run: impl FnOnce()) -> Duration {
    let started = Instant::now();
    run();
    started.elapsed()
}

fn one_host_call(module: &mut ModuleInstance) -> Duration {
    let count = HOST_CALLS_PER_SAMPLE.to_string();
    let elapsed = timed(|| {
        let response = probe(module, "/bench/settings", &count);
        assert_eq!(text(&response), count);
    });
    elapsed / HOST_CALLS_PER_SAMPLE
}

fn one_route_call(module: &mut ModuleInstance) -> Duration {
    timed(|| {
        probe(module, "/ping", "");
    })
}

fn one_loopback_round_trip(client: &Loopback, url: &str) -> Duration {
    timed(|| {
        let value: Option<String> = client.get_json(url).expect("the settings server answers");
        assert!(value.is_some());
    })
}

#[test]
#[ignore = "a measurement: run with --release -- --ignored --nocapture"]
fn a_host_call_costs_less_than_a_loopback_round_trip() {
    let mut module = bench_module();
    let url = settings_server();
    let client = Loopback::new();

    let host_call = sample(|| one_host_call(&mut module));
    let route_call = sample(|| one_route_call(&mut module));
    let loopback = sample(|| one_loopback_round_trip(&client, &url));

    println!("settings.get, guest to host:     {host_call:?} (median of {SAMPLES} x {HOST_CALLS_PER_SAMPLE})");
    println!("route.handle, host to guest:     {route_call:?} (median of {SAMPLES})");
    println!("Loopback GET + JSON, round trip: {loopback:?} (median of {SAMPLES})");
    assert!(host_call < loopback, "{host_call:?} >= {loopback:?}");
}

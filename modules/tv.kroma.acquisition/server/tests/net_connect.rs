use kroma_module_sdk::requests::tmdb::PURPOSE;
use kroma_module_sdk::{Attempt, ModuleManifest, Proto};

#[test]
fn the_manifest_lets_every_tmdb_lookup_this_module_runs_leave() {
    let manifest: ModuleManifest = serde_json::from_str(include_str!("../../module.json")).unwrap();
    let attempt = Attempt {
        purpose: PURPOSE,
        host: "api.themoviedb.org",
        host_is_local: false,
        port: 443,
        proto: Proto::Tcp,
    };

    let reach = manifest
        .permissions
        .as_ref()
        .and_then(|declared| declared.connect_reach(&attempt, &|_| Vec::new()));

    assert!(reach.is_some());
}

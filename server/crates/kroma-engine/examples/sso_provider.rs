//! A sign-in provider for development: `bun run dev:sso` runs it beside the
//! server, which is pointed at it through the `KROMA_OIDC_*` variables.

use kroma_engine::services::sso::testing::FakeProvider;

fn main() {
    let port = std::env::var("KROMA_DEV_SSO_PORT")
        .ok()
        .and_then(|port| port.parse().ok())
        .unwrap_or(4455);
    FakeProvider::run(port);
}

//! A route straight to this server across the household's own network, for a
//! client that otherwise reaches it the long way round (a tunnel, a CDN). See
//! `docs/direct-connection.md`.

mod challenge;
mod origins;
mod public_ip;
mod reach;
mod routes;

use std::net::IpAddr;
use std::sync::Arc;

pub use challenge::Challenge;
pub use origins::{PublicOrigins, origin_of};
pub use reach::is_private_client;

use challenge::Challenges;
use reach::same_network;
use routes::{global_v6, lan_addresses, local_addresses};

use crate::services::pairing::throttle::Throttle;
use crate::services::settings::Settings;

/// The admin switch, on by default. Off, no route is offered and the public
/// address is never asked for.
pub const ENABLED_KEY: &str = "directConnections";

/// Why the core asks an echo service for its public address.
pub const PURPOSE: &str = "address";

const PROOFS_PER_MINUTE: u32 = 30;

// Each route costs every client a probe, and the client refuses an offer of
// more than 32.
const MAX_ROUTES: usize = 16;

/// What a signed-in client is offered: where to try, whether the server places
/// it in the same house, and the challenge a route has to answer.
#[derive(Debug, Clone)]
pub struct Offer {
    pub routes: Vec<String>,
    pub same_network: bool,
    pub challenge: Challenge,
}

/// Where this server listens and who is asking, as the handler resolved it.
#[derive(Debug, Clone, Copy)]
pub struct Asker {
    pub bind: IpAddr,
    pub port: u16,
    pub client: IpAddr,
}

/// The direct-route state one server holds: open challenges, the public address
/// it last learned, the origins it was seen served at, and a ceiling on proofs.
pub struct Direct {
    challenges: Challenges,
    public_ip: public_ip::PublicIp,
    origins: Arc<PublicOrigins>,
    proofs: Throttle,
}

impl Direct {
    pub fn new(public_ip_url: Option<String>) -> Self {
        Self {
            challenges: Challenges::default(),
            public_ip: public_ip::PublicIp::new(public_ip_url),
            origins: Arc::default(),
            proofs: Throttle::new(PROOFS_PER_MINUTE, 60),
        }
    }

    pub fn origins(&self) -> Arc<PublicOrigins> {
        Arc::clone(&self.origins)
    }

    pub async fn offer(&self, settings: &Settings, asker: Asker) -> Offer {
        let now = kroma_primitives::now_ms();
        let challenge = self.challenges.issue(now);
        if !settings.get_bool(ENABLED_KEY, true) {
            return Offer {
                routes: Vec::new(),
                same_network: is_private_client(asker.client),
                challenge,
            };
        }
        let addresses = local_addresses();
        let primary = kroma_http::address::primary_address();
        let routes = lan_addresses(&addresses, primary, asker.bind)
            .into_iter()
            .take(MAX_ROUTES)
            .map(|ip| format!("http://{ip}:{}", asker.port))
            .collect();
        let public_v4 = match asker.client.to_canonical() {
            IpAddr::V4(v4) if kroma_http::address::is_public(IpAddr::V4(v4)) => {
                self.public_ip.get(now).await
            }
            _ => None,
        };
        Offer {
            routes,
            same_network: same_network(asker.client, public_v4, &global_v6(&addresses)),
            challenge,
        }
    }

    /// Count one proof from `client` and say whether it is under the ceiling.
    pub fn admit_proof(&self, client: &str) -> bool {
        self.proofs.admit(client)
    }

    /// The answer to a challenge, once. The caller has already established that
    /// the request crossed this machine's own network.
    pub fn redeem(&self, nonce: &str) -> Option<String> {
        self.challenges.redeem(nonce, kroma_primitives::now_ms())
    }
}

use std::sync::{Arc, PoisonError};
use std::time::{Duration, Instant};

use kroma_http::egress::Decision;
use kroma_module_host::{NetworkOffer, NetworkSeal};

use super::Network;

pub const NO_NETWORK: &str = "no network is running, and this call may not go direct";

const OFFERS_TTL: Duration = Duration::from_secs(5);

/// The enabled modules that say they answer the `network` point, whether or not
/// they are answering right now.
pub type NetworkProviders = Arc<dyn Fn() -> Vec<String> + Send + Sync>;

/// What the `network` point answered: what is on offer, and whether an enabled
/// provider said nothing, which must never read as "no network".
#[derive(Debug, Clone, Default)]
pub(super) struct Offers {
    offers: Vec<NetworkOffer>,
    a_provider_is_silent: bool,
}

impl Network {
    pub(super) fn through(&self, name: &str) -> Decision {
        let offers = self.current_offers();
        match offers.offers.iter().find(|offer| offer.name == name) {
            Some(offer) if offer.health.up => Decision::Proxy(offer.endpoint.url()),
            _ => Decision::Block(network_down(name)),
        }
    }

    // A call that may not go direct takes the first network that is up.
    pub(super) fn sealed_route(&self) -> Decision {
        let offers = self.current_offers();
        offers
            .offers
            .iter()
            .find(|offer| offer.health.up)
            .map_or_else(
                || Decision::Block(NO_NETWORK.to_string()),
                |offer| Decision::Proxy(offer.endpoint.url()),
            )
    }

    /// Whether a module that must never go direct can leave right now. Nothing on
    /// offer reads as no network only when every enabled provider answered.
    pub fn seal(&self) -> NetworkSeal {
        let offers = self.current_offers();
        if offers.offers.iter().any(|offer| offer.health.up) {
            NetworkSeal::Up
        } else if !offers.offers.is_empty() || offers.a_provider_is_silent {
            NetworkSeal::Down
        } else {
            NetworkSeal::None
        }
    }

    /// Every network on offer, for the admin. The credentials stay out of it.
    pub fn networks(&self) -> Vec<NetworkOffer> {
        self.current_offers().offers
    }

    fn current_offers(&self) -> Offers {
        let cached = self.offers.lock().unwrap_or_else(PoisonError::into_inner).clone();
        if let Some((at, offers)) = cached {
            if at.elapsed() < OFFERS_TTL {
                return offers;
            }
        }
        let offers = self.ask_for_offers();
        *self.offers.lock().unwrap_or_else(PoisonError::into_inner) =
            Some((Instant::now(), offers.clone()));
        offers
    }

    fn ask_for_offers(&self) -> Offers {
        let answers = self
            .networks
            .answers::<_, Vec<NetworkOffer>>("list", &serde_json::json!({}));
        let mut offers: Vec<NetworkOffer> = Vec::new();
        let mut answered = Vec::new();
        for (module, answer) in answers {
            let Some(list) = answer else {
                tracing::warn!(module = %module, "a network provider did not answer");
                continue;
            };
            answered.push(module.clone());
            for offer in list {
                if offers.iter().any(|kept| kept.name == offer.name) {
                    tracing::warn!(module = %module, network = %offer.name, "a network name is taken");
                    continue;
                }
                offers.push(offer);
            }
        }
        let a_provider_is_silent = (self.providers)()
            .iter()
            .any(|provider| !answered.contains(provider));
        Offers {
            offers,
            a_provider_is_silent,
        }
    }
}

fn network_down(name: &str) -> String {
    format!("the network {name} is not running")
}

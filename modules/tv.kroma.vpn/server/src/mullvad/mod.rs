//! Mullvad without leaving KROMA: the server makes its own WireGuard key,
//! registers only the public half on the account, and writes a config for the
//! place the admin picks. One device serves every relay, so changing country
//! swaps the peer and calls Mullvad for nothing but the relay list.

use std::path::Path;

mod api;
mod relays;
pub mod routes;
mod store;

pub use api::Device;
pub use relays::{City, Country};
pub(crate) use store::Account;

use api::ApiError;
use relays::{Relay, RelayList};

const ENDPOINT_PORT: u16 = 51820;

/// Why connecting did not happen, in the vocabulary the page explains.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ConnectError {
    AccountNeeded,
    InvalidAccount,
    MaxDevices(Vec<Device>),
    NoRelay,
    Throttled,
    Unavailable(String),
}

impl From<ApiError> for ConnectError {
    fn from(error: ApiError) -> Self {
        match error {
            ApiError::InvalidAccount => Self::InvalidAccount,
            ApiError::MaxDevices => Self::MaxDevices(Vec::new()),
            ApiError::Throttled => Self::Throttled,
            ApiError::Unavailable(why) => Self::Unavailable(why),
        }
    }
}

/// The digits of an account number, however it was typed.
pub(crate) fn account_number(typed: &str) -> String {
    typed.chars().filter(char::is_ascii_digit).collect()
}

/// Every country and city Mullvad can take the tunnel to.
pub(crate) fn locations() -> Result<Vec<Country>, ConnectError> {
    Ok(api::relays()?.countries())
}

/// Register this server on the account when it is a new one, then pick a relay
/// in `country` (or `city`), among Mullvad's own servers when `owned_only`, and
/// answer the config to bring up.
pub(crate) fn connect(
    dir: &Path,
    typed: Option<&str>,
    country: &str,
    city: Option<&str>,
    owned_only: bool,
) -> Result<(Account, String), ConnectError> {
    let mut account = match (typed.map(account_number), store::load(dir)) {
        (Some(number), Some(held)) if held.number == number => held,
        (Some(number), held) => {
            if let Some(old) = held {
                retire(&old);
                forget_places(dir, &old);
            }
            let fresh = register(&number)?;
            store::save(dir, &fresh).map_err(|e| ConnectError::Unavailable(e.to_string()))?;
            fresh
        }
        (None, Some(held)) => held,
        (None, None) => return Err(ConnectError::AccountNeeded),
    };
    let list = api::relays()?;
    let roll = kroma_module_sdk::primitives::random_u32();
    let relay = list
        .pick(country, city, owned_only, roll)
        .ok_or(ConnectError::NoRelay)?;
    let place = place_of(&list, relay, city);
    account.place = Some(place.clone());
    store::save(dir, &account).map_err(|e| ConnectError::Unavailable(e.to_string()))?;
    let config = render(&account, relay, &list.wireguard.ipv4_gateway, &place);
    Ok((account, config))
}

/// A config for another place on this server's device, to keep beside the
/// default tunnel: same key and address, a relay in `country` (or `city`) that
/// neither the default nor a kept place already reaches.
pub(crate) fn router_place(
    dir: &Path,
    country: &str,
    city: Option<&str>,
    owned_only: bool,
    default_config: &str,
) -> Result<String, ConnectError> {
    let account = store::load(dir).ok_or(ConnectError::AccountNeeded)?;
    let in_use = relays_in_use(dir, &account, default_config);
    let avoid: Vec<&str> = in_use.iter().map(String::as_str).collect();
    let list = api::relays()?;
    let roll = kroma_module_sdk::primitives::random_u32();
    let relay = list
        .pick_avoiding(country, city, owned_only, roll, &avoid)
        .ok_or(ConnectError::NoRelay)?;
    let place = place_of(&list, relay, Some(&relay.location));
    Ok(render(
        &account,
        relay,
        &list.wireguard.ipv4_gateway,
        &place,
    ))
}

fn relays_in_use(dir: &Path, account: &Account, default_config: &str) -> Vec<String> {
    let kept = crate::saved::load(dir).into_iter().map(|one| one.config);
    std::iter::once(default_config.to_string())
        .chain(kept)
        .filter(|config| {
            crate::wireguard::value_of(config, "PrivateKey") == Some(account.private_key.as_str())
        })
        .filter_map(
            |config| match crate::provider::provider_of_config(&config) {
                Some(crate::ProviderView::Mullvad { hostname, .. }) => Some(hostname),
                _ => None,
            },
        )
        .collect()
}

/// Remove a device from the account, to free a slot for this server.
pub(crate) fn free_device(typed: &str, device_id: &str) -> Result<(), ConnectError> {
    let token = api::token(&account_number(typed))?;
    api::delete_device(&token, device_id)?;
    Ok(())
}

/// Stop using Mullvad: remove this server's device from the account, then
/// forget the account here and every kept place built on its key.
pub(crate) fn forget(dir: &Path) {
    if let Some(account) = store::load(dir) {
        retire(&account);
        forget_places(dir, &account);
    }
    store::forget(dir);
}

pub(crate) fn held(dir: &Path) -> Option<Account> {
    store::load(dir)
}

/// Whether `config` runs on the device this server registered, so switching
/// to it keeps the device.
pub(crate) fn uses_key(dir: &Path, config: &str) -> bool {
    store::load(dir).is_some_and(|account| {
        crate::wireguard::value_of(config, "PrivateKey") == Some(account.private_key.as_str())
    })
}

fn forget_places(dir: &Path, account: &Account) {
    if let Err(error) = crate::saved::forget_key(dir, &account.private_key) {
        tracing::warn!(%error, "the kept Mullvad places were not dropped");
    }
}

fn register(number: &str) -> Result<Account, ConnectError> {
    let token = api::token(number)?;
    let (private_key, public_key) = crate::keys::keypair();
    let device = match api::create_device(&token, &public_key) {
        Err(ApiError::MaxDevices) => {
            return Err(ConnectError::MaxDevices(api::devices(&token)?));
        }
        other => other?,
    };
    Ok(Account {
        number: number.to_string(),
        device_id: device.id,
        device_name: device.name,
        private_key,
        ipv4: with_prefix(&device.ipv4_address),
        place: None,
    })
}

fn retire(account: &Account) {
    let removed = api::token(&account.number)
        .and_then(|token| api::delete_device(&token, &account.device_id));
    if let Err(error) = removed {
        tracing::warn!(?error, device = %account.device_name, "the Mullvad device was not removed");
    }
}

fn with_prefix(address: &str) -> String {
    if address.contains('/') {
        address.to_string()
    } else {
        format!("{address}/32")
    }
}

fn place_of(list: &RelayList, relay: &Relay, city: Option<&str>) -> store::Place {
    let place = list.place(&relay.location);
    store::Place {
        country: relay
            .location
            .split('-')
            .next()
            .unwrap_or_default()
            .to_string(),
        country_name: place.map(|p| p.country.clone()).unwrap_or_default(),
        city: city.map(str::to_string),
        city_name: city.and(place.map(|p| p.city.clone())),
        hostname: relay.hostname.clone(),
    }
}

fn render(account: &Account, relay: &Relay, gateway: &str, place: &store::Place) -> String {
    let named = match &place.city_name {
        Some(city) => format!("{} · {} · {city}", relay.hostname, place.country_name),
        None => format!("{} · {}", relay.hostname, place.country_name),
    };
    format!(
        "[Interface]\nPrivateKey = {}\nAddress = {}\nDNS = {gateway}\n\n[Peer]\n# Mullvad {named}\nPublicKey = {}\nAllowedIPs = 0.0.0.0/0\nEndpoint = {}:{ENDPOINT_PORT}\n",
        account.private_key, account.ipv4, relay.public_key, relay.ipv4_addr_in,
    )
}

#[cfg(test)]
pub(crate) fn hold_for_test(dir: &Path, private_key: &str, device_name: &str) {
    let account = Account {
        number: "1234123412341234".into(),
        device_id: "d1".into(),
        device_name: device_name.into(),
        private_key: private_key.into(),
        ipv4: "10.140.1.2/32".into(),
        place: None,
    };
    store::save(dir, &account).unwrap();
}

#[cfg(test)]
mod tests;

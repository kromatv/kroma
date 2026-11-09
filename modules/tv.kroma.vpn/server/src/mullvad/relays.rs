use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// Mullvad's public WireGuard relay list (`/public/relays/wireguard/v2`).
#[derive(Debug, Clone, Deserialize)]
pub(crate) struct RelayList {
    pub locations: BTreeMap<String, Place>,
    pub wireguard: WireGuard,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct Place {
    pub country: String,
    pub city: String,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct WireGuard {
    pub ipv4_gateway: String,
    pub relays: Vec<Relay>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct Relay {
    pub hostname: String,
    pub location: String,
    pub active: bool,
    #[serde(default)]
    pub owned: bool,
    pub ipv4_addr_in: String,
    pub public_key: String,
    #[serde(default = "full_weight")]
    pub weight: u32,
    #[serde(default = "in_country")]
    pub include_in_country: bool,
}

fn full_weight() -> u32 {
    100
}

fn in_country() -> bool {
    true
}

/// A country the list can reach, with the cities that hold an active relay.
/// `owned` says Mullvad owns at least one of its servers outright.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Country {
    pub code: String,
    pub name: String,
    pub owned: bool,
    pub cities: Vec<City>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct City {
    pub code: String,
    pub name: String,
    pub owned: bool,
}

fn country_of(location: &str) -> &str {
    location.split('-').next().unwrap_or(location)
}

impl RelayList {
    /// Every country and city with an active relay, by name.
    pub(crate) fn countries(&self) -> Vec<Country> {
        let mut by_code: BTreeMap<&str, Country> = BTreeMap::new();
        for relay in self.wireguard.relays.iter().filter(|relay| relay.active) {
            let Some(place) = self.locations.get(&relay.location) else {
                continue;
            };
            let country = by_code
                .entry(country_of(&relay.location))
                .or_insert_with(|| Country {
                    code: country_of(&relay.location).to_string(),
                    name: place.country.clone(),
                    owned: false,
                    cities: Vec::new(),
                });
            country.owned |= relay.owned;
            match country
                .cities
                .iter_mut()
                .find(|city| city.code == relay.location)
            {
                Some(city) => city.owned |= relay.owned,
                None => country.cities.push(City {
                    code: relay.location.clone(),
                    name: place.city.clone(),
                    owned: relay.owned,
                }),
            }
        }
        let mut countries: Vec<Country> = by_code.into_values().collect();
        for country in &mut countries {
            country.cities.sort_by(|a, b| a.name.cmp(&b.name));
        }
        countries.sort_by(|a, b| a.name.cmp(&b.name));
        countries
    }

    /// An active relay in `country`, or in `city` when one is named, drawn by
    /// the relays' own weights from `roll`, among the servers Mullvad owns
    /// outright when `owned_only`. A relay kept out of country picks is only
    /// reached by naming its city, as Mullvad's own app does.
    pub(crate) fn pick(
        &self,
        country: &str,
        city: Option<&str>,
        owned_only: bool,
        roll: u32,
    ) -> Option<&Relay> {
        self.pick_avoiding(country, city, owned_only, roll, &[])
    }

    /// [`Self::pick`], leaving out the relays named in `avoid`: one key to one
    /// relay twice would steal its own replies.
    pub(crate) fn pick_avoiding(
        &self,
        country: &str,
        city: Option<&str>,
        owned_only: bool,
        roll: u32,
        avoid: &[&str],
    ) -> Option<&Relay> {
        let candidates: Vec<&Relay> = self
            .wireguard
            .relays
            .iter()
            .filter(|relay| relay.active && relay.weight > 0 && (relay.owned || !owned_only))
            .filter(|relay| !avoid.contains(&relay.hostname.as_str()))
            .filter(|relay| match city {
                Some(city) => relay.location == city,
                None => country_of(&relay.location) == country && relay.include_in_country,
            })
            .collect();
        let total: u64 = candidates.iter().map(|relay| u64::from(relay.weight)).sum();
        if total == 0 {
            return None;
        }
        let mut left = u64::from(roll) % total;
        candidates.into_iter().find(|relay| {
            let weight = u64::from(relay.weight);
            if left < weight {
                return true;
            }
            left -= weight;
            false
        })
    }

    pub(crate) fn place(&self, location: &str) -> Option<&Place> {
        self.locations.get(location)
    }
}

#[cfg(test)]
mod tests;

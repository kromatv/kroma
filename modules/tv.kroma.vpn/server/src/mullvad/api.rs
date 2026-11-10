use kroma_module_sdk::http::Fetch;
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::relays::RelayList;

const API: &str = "https://api.mullvad.net";
const PURPOSE: &str = "vpn-provider";
const RELAY_LIST_MAX_BYTES: u64 = 4 * 1024 * 1024;

/// Why Mullvad refused, in the vocabulary the page explains.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ApiError {
    InvalidAccount,
    MaxDevices,
    Throttled,
    Unavailable(String),
}

/// A device on the account, as Mullvad lists it.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub created: String,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct NewDevice {
    pub id: String,
    pub name: String,
    pub ipv4_address: String,
}

#[derive(Deserialize)]
struct Token {
    access_token: String,
}

#[derive(Deserialize)]
struct Refusal {
    code: String,
}

fn fetch() -> Fetch {
    Fetch::new().purpose(PURPOSE).https_only().max_time(30)
}

fn authed(token: &str) -> Fetch {
    fetch().header("authorization", format!("Bearer {token}"))
}

fn refusal(status: u16, body: &[u8]) -> ApiError {
    let code = serde_json::from_slice::<Refusal>(body)
        .map(|r| r.code)
        .unwrap_or_default();
    match code.as_str() {
        "INVALID_ACCOUNT" => ApiError::InvalidAccount,
        "MAX_DEVICES_REACHED" => ApiError::MaxDevices,
        "THROTTLED" => ApiError::Throttled,
        _ if status == 429 => ApiError::Throttled,
        _ => ApiError::Unavailable(format!("Mullvad answered {status} {code}")),
    }
}

fn answer(sent: anyhow::Result<kroma_module_sdk::http::Response>) -> Result<Vec<u8>, ApiError> {
    let response = sent.map_err(|e| ApiError::Unavailable(format!("{e:#}")))?;
    if (200..300).contains(&response.status) {
        Ok(response.body)
    } else {
        Err(refusal(response.status, &response.body))
    }
}

fn decode<T: serde::de::DeserializeOwned>(body: &[u8]) -> Result<T, ApiError> {
    serde_json::from_slice(body)
        .map_err(|e| ApiError::Unavailable(format!("unreadable answer: {e}")))
}

/// Trade an account number for an access token.
pub(crate) fn token(account: &str) -> Result<String, ApiError> {
    let body = json!({ "account_number": account });
    let token: Token = decode(&answer(
        fetch().post_json(&format!("{API}/auth/v1/token"), &body),
    )?)?;
    Ok(token.access_token)
}

/// Register a WireGuard public key as a new device on the account.
pub(crate) fn create_device(token: &str, pubkey: &str) -> Result<NewDevice, ApiError> {
    let body = json!({ "pubkey": pubkey, "hijack_dns": false });
    decode(&answer(
        authed(token).post_json(&format!("{API}/accounts/v1/devices"), &body),
    )?)
}

pub(crate) fn devices(token: &str) -> Result<Vec<Device>, ApiError> {
    decode(&answer(
        authed(token).get(&format!("{API}/accounts/v1/devices")),
    )?)
}

pub(crate) fn delete_device(token: &str, id: &str) -> Result<(), ApiError> {
    answer(authed(token).delete(&format!("{API}/accounts/v1/devices/{id}"))).map(|_| ())
}

/// The relay list, which needs no account.
pub(crate) fn relays() -> Result<RelayList, ApiError> {
    decode(&answer(
        fetch()
            .max_bytes(RELAY_LIST_MAX_BYTES)
            .get(&format!("{API}/public/relays/wireguard/v2")),
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_refusal_mullvad_documents_is_told_apart() {
        assert_eq!(
            refusal(400, br#"{"code":"INVALID_ACCOUNT"}"#),
            ApiError::InvalidAccount
        );
        assert_eq!(
            refusal(400, br#"{"code":"MAX_DEVICES_REACHED"}"#),
            ApiError::MaxDevices
        );
        assert_eq!(refusal(429, b"slow down"), ApiError::Throttled);
        assert!(matches!(refusal(500, b"oops"), ApiError::Unavailable(_)));
    }
}

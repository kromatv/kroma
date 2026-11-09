//! Managed WireGuard-to-SOCKS5 bridge for torrent traffic, Proton VPN first.
//!
//! Proton (like most consumer VPNs) exposes no public SOCKS5 endpoint, but it
//! hands out standard WireGuard configs (account.protonvpn.com -> Downloads ->
//! WireGuard configuration; pick a P2P server). KROMA turns such a config into
//! a LOCAL SOCKS5 proxy by supervising a `wireproxy` child (userspace
//! WireGuard, single static binary), self-provisioned exactly like the
//! `cloudflared` connector in the `kroma-remote` crate. The embedded
//! torrent engine then routes every peer connection through
//! `socks5://127.0.0.1:<port>`; the rest of the server never touches the
//! tunnel. Works identically for Mullvad or any other WireGuard provider.
//!
//! The bridge must never outlive the module. Stopping this module (the admin
//! toggle, an uninstall, a server shutdown) runs [`VpnModule::on_disable`] →
//! [`Vpn::stop`]: respawns are latched off and the child is killed before the
//! module stops. A server that died before that leaves a `wireproxy` holding the
//! SOCKS port, and the host stops it by pidfile before the module starts again.

#![allow(clippy::result_large_err)]

mod admin;
mod backoff;
pub mod bandwidth;
mod keys;
mod module;
pub mod mullvad;
pub mod port;
mod process;
mod provider;
mod provision;
pub mod routes;
mod socks_auth;
mod stderr_tail;
mod supervise;
#[cfg(test)]
mod test_support;
mod vpn;
mod wireguard;

/// This module's registry entry (manifest + packaged icon, embedded at compile
/// time from the shared module folder).
use kroma_module_sdk::EmbeddedModule;
pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();

pub use admin::{bridge_password, wg_configured, SaveVpnBody, VpnAdminView, VpnTestResult};
pub use provider::ProviderView;
pub use module::{server_module, VpnModule, MODULE_ID};
pub use vpn::Vpn;

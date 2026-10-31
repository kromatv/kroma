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
//! toggle, an uninstall, a server shutdown) SIGTERMs the sidecar, which runs
//! [`VpnModule::on_disable`] → [`Vpn::stop`]: respawns are latched off and the
//! child is killed before the process exits. A generation that missed that
//! window (SIGKILL, a crash) leaves a `wireproxy` still tunnelling and still
//! holding the SOCKS port, so [`Vpn::apply`] reaps one by pidfile on every pass,
//! including the pass that finds no config at all.

#![allow(clippy::result_large_err)]

mod admin;
pub mod bandwidth;
mod module;
pub mod port;
mod process;
mod provision;
pub mod routes;
mod socks_auth;
mod supervise;
#[cfg(test)]
mod test_support;
mod vpn;
mod wireguard;

/// This module's registry entry (manifest + packaged icon, embedded at compile
/// time from the shared module folder).
use kroma_module_sdk::EmbeddedModule;
pub const MODULE: EmbeddedModule = kroma_module_sdk::embedded_module!();

pub use admin::{proxy_url, wg_configured, SaveVpnBody, VpnAdminView, VpnTestResult};
pub use module::{server_module, VpnModule, MODULE_ID};
pub use vpn::Vpn;

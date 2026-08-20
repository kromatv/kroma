//! Peer port traits: the contracts modules use to call each other WITHOUT
//! depending on each other's crate. A provider module implements a port and the
//! composition root registers it in the host service registry; a consumer module
//! resolves it via `kroma_module_host::resolve_port`. Only generic contracts live
//! here, never a module's own types, so no crate here depends on a module.
//!
//! A port names [`HostCtx`](kroma_module_host::HostCtx) and nothing wider, even
//! when the module answering it is database-backed: the CONSUMER has to be able
//! to name every type in the contract, and a consumer holds no capability just
//! because a provider does. A provider that needs a database holds it itself
//! (the manager it registers carries its own pools), so the contract stays the
//! narrow thing both ends can compile against.


// The download-client contract (engine trait + shared types + the host port), so
// download engine modules depend on the SDK, not on the torrents crate.
pub mod download_client;
pub use download_client::*;
// The magnet-URI info hash, shared by the download engines and the ledger.
pub mod magnet;
pub use magnet::*;
// The Torznab search contract (types + port), so the indexer / acquisition
// modules search without depending on the torznab crate.
pub mod torznab;
pub use torznab::*;
// The indexer data + native-search contract (shared row + IndexerDbPort /
// IndexerSearchPort), so downloads / acquisition don't depend on the indexer crate.
pub mod indexer;
pub use indexer::*;
// The download-ledger contract (grab spec + row + DownloadGrabPort/DownloadDbPort).
pub mod download;
pub use download::*;
// The VPN contracts (proxy bridge + the engine kill-switch surface).
pub mod vpn;
pub use vpn::*;
// The acquisition module's search/grab contract, consumed by the core.
pub mod acquisition;
pub use acquisition::*;
// The Sonarr/Radarr-style naming engine, shared by torrents (organize) +
// acquisition. Behind `engine` because it also reads templates straight off the
// core's `Settings`; both its consumers hold that feature anyway.
#[cfg(feature = "engine")]
pub mod naming;

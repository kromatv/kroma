//! Live playback-session registry. Direct-play streams have no server-side session,
//! so clients heartbeat to `POST /api/playback/ping`; records that stop pinging are
//! reaped after [`SESSION_TTL`] into `play_history`. Process-local, cleared on restart.

mod network;
mod playing;
mod registry;
mod snapshot;
mod watch_item;

pub use network::*;
pub use playing::Playing;
pub use registry::*;
pub use watch_item::accept_watch_item;

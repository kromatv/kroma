//! What crosses the seam between the host and a module as JSON: the account a
//! session resolves to, the notification a module raises and who it is for,
//! what the host answers a metadata lookup with, what it rules on an outbound
//! call, how a track inside a media file is described, and the startup a
//! module asks the host to run once. Serde and nothing else, so a module links
//! this and never the crates that give these types meaning.

mod accounts;
mod audience;
mod lifecycle;
mod metadata;
mod network;
mod notifications;
mod streams;

pub use accounts::*;
pub use audience::*;
pub use lifecycle::*;
pub use metadata::*;
pub use network::*;
pub use notifications::*;
pub use streams::*;

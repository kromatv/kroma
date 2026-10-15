//! What crosses the seam between the host and a module as JSON: the account a
//! session resolves to, the notification a module raises and who it is for,
//! what the host answers a metadata lookup with, and how a track inside a media
//! file is described. Serde and nothing else, so a sidecar links this and never
//! the crates that give these types meaning.

mod accounts;
mod audience;
mod metadata;
mod notifications;
mod streams;

pub use accounts::*;
pub use audience::*;
pub use metadata::*;
pub use notifications::*;
pub use streams::*;

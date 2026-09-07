//! What crosses the seam between the host and a module as JSON: the account a
//! session resolves to, the notification a module raises and who it is for,
//! and what the host answers a metadata lookup with. Serde and nothing else,
//! so a sidecar links this and never the crates that give these types meaning.

mod accounts;
mod audience;
mod metadata;
mod notifications;

pub use accounts::*;
pub use audience::*;
pub use metadata::*;
pub use notifications::*;

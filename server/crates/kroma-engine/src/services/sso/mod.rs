//! Signing in through an OpenID Connect provider: the provider proves who a
//! person is, and this server decides whether they may come in.

pub mod admit;
pub mod discovery;
pub mod exchange;
pub mod flows;
pub mod id_token;
pub mod identify;
pub mod images;
pub mod keys;
pub mod logos;
pub mod person;

#[cfg(any(test, feature = "testing"))]
pub mod testing;

/// What the server holds between requests: the sign-ins in flight and the
/// providers it has read.
#[derive(Default)]
pub struct Sso {
    pub flows: flows::Flows,
    pub directory: discovery::Directory,
}

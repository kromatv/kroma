//! A provider to test against, and the keys it signs with.

mod endpoints;
mod page;
pub mod provider;
pub mod signing;

pub use provider::{FakeProvider, Forgery, CLIENT_ID, CLIENT_SECRET};

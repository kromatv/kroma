//! HTTP request extractors. The `Authorization: Bearer <token>` gate lives in
//! `kroma-module-host`; re-exported here so existing call sites are unchanged.

pub use kroma_module_host::{bearer_from_headers, AuthUser, OptionalAuthUser};

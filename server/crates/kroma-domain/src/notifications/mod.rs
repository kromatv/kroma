//! Notifications as pure data (serde); persistence lives in
//! `crate::db::notifications`, delivery in `crate::services::notify`.
//!
//! Stored rows hold an i18n key plus params, never rendered text; the wire shape
//! below is the RENDERED form and is a public client contract, so field names,
//! casing and epoch-millisecond timestamps must not drift.

mod action;
mod event;
mod param;
mod spec;
mod view;

pub use action::*;
pub use event::*;
pub use param::*;
pub use spec::*;
pub use view::*;

//! Notifications as pure data (serde); persistence lives in
//! `crate::db::notifications`, delivery in `crate::services::notify`.
//!
//! Stored rows hold an i18n key plus params, never rendered text; the wire shape
//! below is the RENDERED form and is a public client contract, so field names,
//! casing and epoch-millisecond timestamps must not drift.

mod data;
mod view;

pub use data::*;
pub use kroma_module_wire::{
    ActionKind, ActionSpec, ActionStyle, NotificationAction, NotificationActor,
    NotificationCategory, NotificationEvent, NotificationSpec, NotificationSubject,
    NotificationType, ParamValue, SubjectKind,
};
pub use view::*;

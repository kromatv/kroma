//! API surface: composes each feature module's `routes()` into the `/api`
//! router, then layers CORS, tracing and the SPA fallback. Individual routes
//! live next to their handlers in the submodules, not here.

pub mod admin;
pub mod card;
pub mod dto;
pub mod error;
pub mod playback;
pub mod poster;
pub mod ws;

mod accounts;
mod cast;
mod diagnostics;
mod direct;
mod discover;
mod downloads_overlay;
mod etag;
mod extract;
mod handoff;
mod home;
pub mod host_events;
mod host_jobs;
mod images;
mod inbound;
mod invites;
mod mail;
mod media;
pub mod media_ticket;
mod metadata;
mod modules;
mod monitoring;
mod notifications;
pub mod online_subs;
mod origin;
mod passkeys;
mod people;
mod permission;
mod pin;
mod plugin;
mod point;
mod recommend;
mod releases;
mod rematch;
mod remote_art;
mod reports;
mod requests;
mod router;
pub mod seam;
mod search;
mod server_status;
mod spa;
mod sso;
mod stream;
mod suggest;
mod themes;
mod trailers;
mod util;
mod visibility;

#[cfg(test)]
mod it_accounts;
#[cfg(test)]
mod it_accounts_faults;
#[cfg(test)]
mod it_admin;
#[cfg(test)]
mod it_admin2;
#[cfg(test)]
mod it_admin_manage;
#[cfg(test)]
mod it_auth;
#[cfg(test)]
mod it_auth_faults;
#[cfg(test)]
mod it_backup;
#[cfg(test)]
mod it_backup_libraries;
#[cfg(test)]
mod it_cast;
#[cfg(test)]
mod it_content;
#[cfg(test)]
mod it_device_versions;
#[cfg(test)]
mod it_diagnostics;
#[cfg(test)]
mod it_direct;
#[cfg(test)]
mod it_direct_reach;
#[cfg(test)]
mod it_external_subtitles;
#[cfg(test)]
mod it_first_run;
#[cfg(test)]
mod it_handoff;
#[cfg(test)]
mod it_handoff_house;
#[cfg(test)]
mod it_host_settings;
#[cfg(test)]
mod it_images;
#[cfg(test)]
mod it_importer_calls;
#[cfg(test)]
mod it_importers;
#[cfg(test)]
mod it_imports;
#[cfg(test)]
mod it_imports_folders;
#[cfg(test)]
mod it_imports_people;
#[cfg(test)]
mod it_invites;
#[cfg(test)]
mod it_library_visibility;
#[cfg(test)]
mod it_settings_libraries;
#[cfg(test)]
mod it_mail_relay;
#[cfg(test)]
mod it_account_identifiers;
#[cfg(test)]
mod it_media;
#[cfg(test)]
mod it_module_frontend;
#[cfg(test)]
mod it_media_bearer;
#[cfg(test)]
mod it_media_ticket;
#[cfg(test)]
mod it_home;
#[cfg(test)]
mod it_movie_cards;
#[cfg(test)]
mod it_member_reach;
#[cfg(test)]
mod it_monitoring;
#[cfg(test)]
mod it_network;
#[cfg(test)]
mod it_notification_images;
#[cfg(test)]
mod it_notification_inbox;
#[cfg(test)]
mod it_notification_types;
#[cfg(test)]
mod it_notifications;
#[cfg(test)]
mod it_online_subs;
#[cfg(test)]
mod it_passkeys;
#[cfg(test)]
mod it_people;
#[cfg(test)]
mod it_pin;
#[cfg(test)]
mod it_pin_lockout;
#[cfg(test)]
mod it_playback;
#[cfg(test)]
mod it_playback_faults;
#[cfg(test)]
mod it_releases;
#[cfg(test)]
mod it_rematch;
#[cfg(test)]
mod it_remote_art;
#[cfg(test)]
mod it_reports;
#[cfg(test)]
mod it_requests_calendar;
#[cfg(test)]
mod it_requests_ledger;
#[cfg(test)]
mod it_reset;
#[cfg(test)]
mod it_reset_faults;
#[cfg(test)]
mod it_saved_titles;
#[cfg(test)]
mod it_search;
#[cfg(test)]
mod it_server_restart;
#[cfg(test)]
mod it_server_status;
#[cfg(test)]
mod it_store_versions;
#[cfg(test)]
mod it_sso;
#[cfg(test)]
mod it_sso_account;
#[cfg(test)]
mod it_sso_admin;
#[cfg(test)]
mod it_stream_hls;
#[cfg(test)]
mod it_suggest;
#[cfg(test)]
mod it_trailers;
#[cfg(test)]
mod it_updates;
#[cfg(test)]
mod it_verify_email;
#[cfg(test)]
mod it_waiting_account;
#[cfg(test)]
mod it_waiting_doors;
#[cfg(test)]
mod it_waiting_reset;
#[cfg(test)]
pub(crate) mod test_support;

pub use router::router;

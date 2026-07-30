//! Push transports: getting a notification onto a device whose app is closed.
//!
//! One crate per concern would mean three copies of base64url and ES256 JWT
//! signing, so the transports share [`b64`] and [`jwt`]:
//!
//! - [`webpush`] browsers + installed PWAs, self-hosted end to end (RFC 8291/8292).
//! - [`apns`] iOS/tvOS, via an Apple auth key (ES256).
//! - [`fcm`] Android, via a Firebase service account (RS256 + OAuth2).
//! - [`relay`] iOS + Android when the server holds neither credential — the
//!   normal self-hosted path, since those belong to whoever publishes the app.
//!
//! Every transport does no I/O: it returns a URL, headers and a body, so every
//! cryptographic claim is testable against published vectors without a network.

mod b64;
mod jwt;

pub mod apns;
pub mod fcm;
pub mod relay;
pub mod webpush;

/// What a push carries beyond its text, in the one shape every transport reads.
///
/// Shared rather than mirrored per transport, so adding a field can't silently
/// stay unhandled on one of them. Each transport still decides what it can
/// express (the relay ignores more of this than APNs does).
#[derive(Debug, Clone, Default)]
pub struct Alert<'a> {
    pub id: &'a str,
    pub title: &'a str,
    pub body: &'a str,
    pub link: Option<&'a str>,
    pub image_url: Option<&'a str>,
    pub category: Option<&'a str>,
    pub thread_id: Option<&'a str>,
    pub actions: &'a [(String, String, String)],
}

/// A ready-to-send push, whatever the transport.
#[derive(Debug, Clone)]
pub struct PushRequest {
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
    pub http2: bool,
}

/// How urgently the push service should wake the device.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Urgency {
    Low,
    Normal,
    High,
}

impl Urgency {
    /// The Web Push `Urgency` header value.
    pub fn as_str(self) -> &'static str {
        match self {
            Urgency::Low => "low",
            Urgency::Normal => "normal",
            Urgency::High => "high",
        }
    }

    /// APNs has two levels, not three: 10 delivers immediately, 5 lets the
    /// system batch it for power. A digest is not worth waking a radio for.
    pub fn apns_priority(self) -> &'static str {
        match self {
            Urgency::Low => "5",
            Urgency::Normal | Urgency::High => "10",
        }
    }
}

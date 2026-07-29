//! Push transports: getting a notification onto a device whose app is closed.
//!
//! One crate per concern would mean three copies of base64url and of ES256 JWT
//! signing, so the transports live together and share [`b64`] and [`jwt`]:
//!
//! - [`webpush`]  browsers + installed PWAs. Self-hosted end to end (RFC 8291/8292).
//! - [`apns`]     iOS / tvOS, via an Apple auth key (ES256, same primitives as VAPID).
//! - [`fcm`]      Android, via a Firebase service account (RS256 + OAuth2).
//! - [`relay`]    iOS + Android from a server that holds NEITHER of the above —
//!                which is every self-hosted one, since those credentials belong
//!                to whoever publishes the app. The normal path in practice.
//!
//! Every transport does **no I/O**: each returns a URL, headers and a body, and
//! the caller sends it with `kroma-http` (curl). That keeps every cryptographic
//! claim testable against published vectors without a network, and keeps this
//! crate out of the async runtime.

mod b64;
mod jwt;

pub mod apns;
pub mod fcm;
pub mod relay;
pub mod webpush;

/// What a push carries beyond its text, in the one shape every transport reads.
///
/// Deliberately shared rather than mirrored per module: the app is supposed to
/// see the same notification whichever service delivered it, and three structs
/// with the same fields made that a convention instead of a guarantee — adding
/// a field meant remembering three edits, and forgetting one silently dropped
/// it on that transport alone. Each transport still decides what it can express
/// (the relay owns the topic, the push type and the priority, so it ignores
/// more of this than APNs does).
#[derive(Debug, Clone, Default)]
pub struct Alert<'a> {
    pub id: &'a str,
    pub title: &'a str,
    pub body: &'a str,
    /// In-app route a tap opens.
    pub link: Option<&'a str>,
    pub image_url: Option<&'a str>,
    /// A notification category the app registered at launch — a
    /// `UNNotificationCategory` on Apple, a channel on Android. This is what
    /// puts action buttons on the notification: neither service can carry
    /// arbitrary buttons, only the name of a set the app already knows.
    pub category: Option<&'a str>,
    /// Groups related notifications in the shade (per show, per request…).
    pub thread_id: Option<&'a str>,
    /// What each registered button actually does, as `(id, method, href)`.
    ///
    /// The category names the buttons; this says what they call. Without it the
    /// app would have to reverse-engineer an id out of `link`, which breaks the
    /// moment a link shape changes.
    pub actions: &'a [(String, String, String)],
}

/// A ready-to-send push, whatever the transport.
#[derive(Debug, Clone)]
pub struct PushRequest {
    pub url: String,
    /// Header name/value pairs, in the order they should be sent.
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
    /// APNs speaks HTTP/2 only; the caller must ask curl for it explicitly.
    pub http2: bool,
}

/// How urgently the push service should wake the device.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Urgency {
    /// Can wait for the device to be awake anyway (a media digest).
    Low,
    /// The default for user-visible notifications.
    Normal,
    /// Wake the device now (a request the user is waiting on).
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

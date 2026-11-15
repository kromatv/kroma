//! The image a PUSH carries.
//!
//! A push carries a URL, not the picture: all three vendors (Web Push, APNs,
//! FCM) fetch it after delivery, over the device's own network, and cap the
//! payload at about 4KB. The only decision left is which rendition to name: the
//! master is up to 1280px, far more than a lock-screen thumbnail needs.

use kroma_domain::Notification;

use crate::infra::image::PUBLIC_PREFIX;
use crate::services::remote_art;

// Must be one of the buckets `GET /api/images/:name?w=` accepts, or the server
// ignores it. Wide enough for Android's big-picture style and an iOS attachment.
const PUSH_WIDTH: u32 = 780;

/// Point `image_url` at this server, at a sized rendition when it has one.
///
/// A provider's poster goes out as this server's path for it, signed with
/// `art_key`, so the device never asks the provider. Any other external art is
/// left alone: it is already sized by whoever serves it.
pub fn sized_for_push(mut n: Notification, art_key: &str) -> Notification {
    n.image_url = n.image_url.map(|url| {
        let url = remote_art::served(art_key, &url).unwrap_or(url);
        if url.starts_with(PUBLIC_PREFIX) && !url.contains('?') {
            format!("{url}?w={PUSH_WIDTH}")
        } else {
            url
        }
    });
    n
}

/// The URL a NATIVE push should name for this notification's art, if any.
///
/// Apple, Google and the relay fetch the picture from the DEVICE, off this
/// server's network, so a server-relative `/api/images/…` reaches nothing; FCM
/// answers 400 to one, which used to cost a failure strike per notification.
/// Web Push is the exception and keeps the relative form, resolved against its
/// own install origin.
///
/// `None` when the art is ours and there is no public address to build an
/// absolute URL from — sending no picture rather than a URL the vendor will
/// fail on, which would cost the reader their registration.
pub fn native_image_url(n: &Notification, public_url: Option<&str>) -> Option<String> {
    let url = n.image_url.as_deref()?;
    if !url.starts_with(PUBLIC_PREFIX) {
        return Some(url.to_string());
    }
    public_url.map(|base| format!("{base}{url}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use kroma_domain::{NotificationCategory, NotificationEvent};

    const KEY: &str = "0123456789abcdef0123456789abcdef";

    fn with_image(url: Option<&str>) -> Notification {
        Notification {
            id: "n1".into(),
            category: NotificationCategory::Media,
            event: NotificationEvent::MediaAdded,
            title: "t".into(),
            body: "b".into(),
            subject: None,
            actor: None,
            data: None,
            group_key: None,
            link: None,
            image_url: url.map(str::to_string),
            actions: Vec::new(),
            push_category: None,
            read: false,
            resolved: false,
            resolved_by: None,
            count: 1,
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn our_own_art_is_asked_for_at_a_push_size() {
        let out = sized_for_push(with_image(Some("/api/images/abc.webp")), KEY);
        assert_eq!(out.image_url.as_deref(), Some("/api/images/abc.webp?w=780"));
    }

    #[test]
    fn someone_elses_art_and_an_already_sized_one_are_left_alone() {
        let external = "https://img.example/p/x.jpg";
        assert_eq!(
            sized_for_push(with_image(Some(external)), KEY)
                .image_url
                .as_deref(),
            Some(external)
        );

        let sized = "/api/images/abc.webp?w=320";
        assert_eq!(
            sized_for_push(with_image(Some(sized)), KEY).image_url.as_deref(),
            Some(sized)
        );

        assert!(sized_for_push(with_image(None), KEY).image_url.is_none());
    }

    #[test]
    fn a_providers_poster_goes_out_as_this_servers_path_for_it() {
        let poster = "https://image.tmdb.org/t/p/w500/x.jpg";
        let ours = remote_art::served(KEY, poster).unwrap();

        let n = sized_for_push(with_image(Some(poster)), KEY);

        assert_eq!(
            n.image_url.as_deref(),
            Some(format!("{ours}?w=780").as_str())
        );
        assert_eq!(
            native_image_url(&n, Some("https://kroma.example.com")),
            Some(format!("https://kroma.example.com{ours}?w=780"))
        );
        assert_eq!(native_image_url(&n, None), None);
    }

    #[test]
    fn a_native_push_names_art_the_device_can_actually_reach() {
        // The device fetches this itself, from wherever it is: a path that only
        // means something on our own network names nothing at all.
        let n = sized_for_push(with_image(Some("/api/images/abc.webp")), KEY);
        assert_eq!(
            native_image_url(&n, Some("https://kroma.example.com")).as_deref(),
            Some("https://kroma.example.com/api/images/abc.webp?w=780"),
        );
    }

    #[test]
    fn a_server_with_no_public_address_sends_no_picture_rather_than_a_broken_one() {
        // The normal case for a NAS on a home LAN. FCM answers 400 to an image
        // URL it cannot fetch, and a 400 is not `gone` - so naming one used to
        // spend a failure strike per notification until the device was dropped.
        let n = sized_for_push(with_image(Some("/api/images/abc.webp")), KEY);
        assert_eq!(native_image_url(&n, None), None);
    }

    #[test]
    fn someone_elses_art_needs_no_help_and_travels_either_way() {
        let n = with_image(Some("https://img.example/p/x.jpg"));
        for base in [Some("https://kroma.example.com"), None] {
            assert_eq!(
                native_image_url(&n, base).as_deref(),
                Some("https://img.example/p/x.jpg"),
            );
        }
        assert_eq!(
            native_image_url(&with_image(None), Some("https://k.example")),
            None
        );
    }
}

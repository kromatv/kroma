//! Which Web Push endpoints the server agrees to send to.

use kroma_http::address::{is_public, web_target};
use kroma_http::Fetch;

const MAX_ENDPOINT_LEN: usize = 2048;

/// Whether a browser-supplied Web Push endpoint is one the server may POST to:
/// an `https` URL naming a host, or a public address, and no credentials. Any
/// signed-in account chooses this URL, so it is checked again at send time,
/// once the name has resolved.
pub fn accepts_web_push_endpoint(endpoint: &str) -> bool {
    if endpoint.len() > MAX_ENDPOINT_LEN {
        return false;
    }
    web_target(endpoint)
        .is_some_and(|target| target.https && target.literal().is_none_or(is_public))
}

pub(super) fn web_push_reach(fetch: Fetch) -> Fetch {
    #[cfg(test)]
    if test_reach::private_allowed() {
        return fetch;
    }
    fetch.public_only()
}

#[cfg(test)]
pub(super) mod test_reach {
    use std::cell::Cell;

    thread_local! {
        static PRIVATE_ALLOWED: Cell<bool> = const { Cell::new(true) };
    }

    pub(in crate::services::notify::push) fn private_allowed() -> bool {
        PRIVATE_ALLOWED.with(Cell::get)
    }

    pub(in crate::services::notify::push) fn refuse_private() {
        PRIVATE_ALLOWED.with(|allowed| allowed.set(false));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_browser_push_service_endpoint_is_accepted() {
        for endpoint in [
            "https://fcm.googleapis.com/fcm/send/abc:def",
            "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
            "https://web.push.apple.com/QGh0",
            "https://wns2-par02p.notify.windows.com/w/?token=AwYAAAB",
        ] {
            assert!(accepts_web_push_endpoint(endpoint), "{endpoint}");
        }
    }

    #[test]
    fn an_endpoint_that_could_reach_the_server_or_its_network_is_refused() {
        for endpoint in [
            "http://updates.push.services.mozilla.com/wpush/v2/x",
            "https://127.0.0.1:4040/api/_host/settings",
            "https://[::1]/",
            "https://192.168.1.1/admin",
            "https://169.254.169.254/latest/meta-data",
            "https://user@push.example/",
            "file:///etc/passwd",
            "",
        ] {
            assert!(!accepts_web_push_endpoint(endpoint), "{endpoint}");
        }
    }

    #[test]
    fn an_oversized_endpoint_is_refused() {
        let endpoint = format!("https://push.example/{}", "a".repeat(MAX_ENDPOINT_LEN));

        assert!(!accepts_web_push_endpoint(&endpoint));
    }
}

//! How far a request to a URL someone chose may reach.

use kroma_http::Fetch;

/// `fetch`, refused unless the host resolves only to public internet
/// addresses: for a URL an account chose, which must not reach the server or
/// its network.
pub fn public_reach(fetch: Fetch) -> Fetch {
    #[cfg(test)]
    if test_reach::private_allowed() {
        return fetch;
    }
    fetch.public_only()
}

#[cfg(test)]
pub(crate) mod test_reach {
    use std::cell::Cell;

    thread_local! {
        static PRIVATE_ALLOWED: Cell<bool> = const { Cell::new(true) };
    }

    pub(crate) fn private_allowed() -> bool {
        PRIVATE_ALLOWED.with(Cell::get)
    }

    pub(crate) fn refuse_private() {
        PRIVATE_ALLOWED.with(|allowed| allowed.set(false));
    }
}

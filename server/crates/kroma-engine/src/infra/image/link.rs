//! A picture someone links to, fetched once to be kept as if it was uploaded.

use kroma_http::address::web_target;
use kroma_http::Fetch;

use super::cache::{MAX_ARTWORK_BYTES, MAX_TIME_SECS};
use crate::infra::reach::public_reach;

const HOPS: usize = 4;

/// The bytes served at `link`, an `http` or `https` URL whose host is on the
/// public internet, through up to three redirects to such URLs. None when it
/// serves nothing, or when it cannot be reached.
pub fn fetch_link(link: &str) -> Option<Vec<u8>> {
    let mut url = link.to_string();
    for _ in 0..HOPS {
        web_target(&url)?;
        let response = public_reach(picture_fetch()).get(&url).ok()?;
        match response.status {
            200..=299 => return Some(response.body).filter(|body| !body.is_empty()),
            300..=399 => url = response.header("location")?.to_string(),
            _ => return None,
        }
    }
    None
}

fn picture_fetch() -> Fetch {
    Fetch::new()
        .purpose("artwork")
        .max_time(MAX_TIME_SECS)
        .max_bytes(MAX_ARTWORK_BYTES)
        .no_redirects()
}

#[cfg(test)]
mod tests;

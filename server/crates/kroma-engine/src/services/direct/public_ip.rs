use std::net::Ipv4Addr;

const FRESH_MS: i64 = 10 * 60_000;
const RETRY_MS: i64 = 60_000;
const MAX_TIME_SECS: u32 = 3;
const MAX_BYTES: u64 = 256;

struct Lookup {
    ip: Option<Ipv4Addr>,
    at_ms: i64,
}

/// This server's public IPv4 as an echo service sees it, asked at most every ten
/// minutes, and every minute while the answer is unknown.
pub struct PublicIp {
    url: Option<String>,
    last: tokio::sync::Mutex<Option<Lookup>>,
}

impl PublicIp {
    pub fn new(url: Option<String>) -> Self {
        Self {
            url,
            last: tokio::sync::Mutex::new(None),
        }
    }

    /// `None` when no echo is configured or it did not answer: an unknown
    /// address places nobody, and nothing waits on it for more than a few
    /// seconds. Callers arriving during a lookup share its answer.
    pub async fn get(&self, now_ms: i64) -> Option<Ipv4Addr> {
        let url = self.url.clone()?;
        let mut last = self.last.lock().await;
        if let Some(lookup) = last.as_ref() {
            let fresh_for = if lookup.ip.is_some() {
                FRESH_MS
            } else {
                RETRY_MS
            };
            if now_ms - lookup.at_ms < fresh_for {
                return lookup.ip;
            }
        }
        let ip = tokio::task::spawn_blocking(move || ask(&url))
            .await
            .ok()
            .flatten();
        *last = Some(Lookup { ip, at_ms: now_ms });
        ip
    }
}

fn ask(url: &str) -> Option<Ipv4Addr> {
    let res = kroma_http::Fetch::new()
        .purpose(super::PURPOSE)
        .max_time(MAX_TIME_SECS)
        .max_bytes(MAX_BYTES)
        .get(url)
        .ok()?;
    if !(200..300).contains(&res.status) {
        return None;
    }
    res.text().trim().parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    type Seen = std::sync::Arc<std::sync::Mutex<Vec<String>>>;

    fn echo(answer: &'static str) -> (String, Seen) {
        crate::test_support::serve_bytes(move |_| (200, answer.as_bytes().to_vec()))
    }

    #[tokio::test]
    async fn the_address_is_asked_once_and_held_for_ten_minutes() {
        let (url, seen) = echo("203.0.113.7\n");
        let public_ip = PublicIp::new(Some(url));

        let first = public_ip.get(0).await;
        let held = public_ip.get(FRESH_MS - 1).await;
        public_ip.get(FRESH_MS).await;

        assert_eq!(first, Some("203.0.113.7".parse().unwrap()));
        assert_eq!(held, first);
        assert_eq!(seen.lock().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn an_answer_that_is_not_an_address_is_unknown_and_asked_again_a_minute_later() {
        let (url, seen) = echo("<html>blocked</html>");
        let public_ip = PublicIp::new(Some(url));

        let first = public_ip.get(0).await;
        public_ip.get(RETRY_MS - 1).await;
        public_ip.get(RETRY_MS).await;

        assert_eq!(first, None);
        assert_eq!(seen.lock().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn no_echo_means_no_address_and_no_request() {
        assert_eq!(PublicIp::new(None).get(0).await, None);
    }

    #[tokio::test]
    async fn an_echo_that_cannot_be_reached_is_unknown() {
        let public_ip = PublicIp::new(Some("http://127.0.0.1:1".to_string()));

        assert_eq!(public_ip.get(0).await, None);
    }
}

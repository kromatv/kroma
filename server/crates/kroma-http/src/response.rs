//! The rendered outcome of one exchange.

use anyhow::{bail, Context, Result};
use serde::de::DeserializeOwned;

/// One HTTP exchange: final status + final header block + body bytes.
#[derive(Debug)]
pub struct Response {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl Response {
    /// First header with this name, case-insensitively.
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }

    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }

    pub fn json<T: DeserializeOwned>(&self) -> Result<T> {
        serde_json::from_slice(&self.body)
            .with_context(|| format!("parse JSON response: {}", snippet(&self.body)))
    }

    /// Error out (with a body snippet) unless the status is 2xx.
    pub fn ensure_ok(self) -> Result<Self> {
        if !(200..300).contains(&self.status) {
            bail!("HTTP {}: {}", self.status, snippet(&self.body));
        }
        Ok(self)
    }
}

fn snippet(body: &[u8]) -> String {
    let text = String::from_utf8_lossy(body);
    let trimmed = text.trim();
    let mut s: String = trimmed.chars().take(200).collect();
    if trimmed.chars().count() > 200 {
        s.push_str("...");
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_lookup_is_case_insensitive() {
        let resp = Response {
            status: 409,
            headers: vec![(
                "X-Transmission-Session-Id".to_string(),
                "abc123".to_string(),
            )],
            body: Vec::new(),
        };
        assert_eq!(resp.header("x-transmission-session-id"), Some("abc123"));
        assert_eq!(resp.header("missing"), None);
    }

    #[test]
    fn ensure_ok_rejects_non_2xx_with_snippet() {
        let resp = Response {
            status: 500,
            headers: Vec::new(),
            body: b"boom".to_vec(),
        };
        let err = resp.ensure_ok().unwrap_err().to_string();
        assert!(err.contains("500"), "{err}");
        assert!(err.contains("boom"), "{err}");
    }

    #[test]
    fn snippet_trims_and_truncates_long_bodies() {
        assert_eq!(snippet(b"  hi there  "), "hi there");
        let long = "a".repeat(500);
        let s = snippet(long.as_bytes());
        assert_eq!(s.chars().count(), 203, "200 kept chars + the ... suffix");
        assert!(s.ends_with("..."));
        let exact = "b".repeat(200);
        let s = snippet(exact.as_bytes());
        assert_eq!(s.chars().count(), 200);
        assert!(!s.ends_with("..."));
    }

    #[test]
    fn response_text_and_json_round_trip_and_error() {
        let resp = Response {
            status: 200,
            headers: Vec::new(),
            body: br#"{"a":1}"#.to_vec(),
        };
        assert_eq!(resp.text(), r#"{"a":1}"#);
        let v: serde_json::Value = resp.json().unwrap();
        assert_eq!(v["a"], 1);

        let bad = Response {
            status: 200,
            headers: Vec::new(),
            body: b"not json at all".to_vec(),
        };
        let err = bad.json::<serde_json::Value>().unwrap_err().to_string();
        assert!(err.contains("parse JSON"), "{err}");
        assert!(err.contains("not json"), "{err}");
    }

    #[test]
    fn ensure_ok_accepts_2xx() {
        let resp = Response {
            status: 204,
            headers: Vec::new(),
            body: Vec::new(),
        };
        assert!(resp.ensure_ok().is_ok());
        let redirect = Response {
            status: 300,
            headers: Vec::new(),
            body: b"moved".to_vec(),
        };
        assert!(redirect.ensure_ok().is_err());
    }
}

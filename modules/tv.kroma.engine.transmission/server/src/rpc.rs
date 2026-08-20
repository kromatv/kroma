use anyhow::{anyhow, bail, Result};
use serde_json::{json, Value};

use crate::base64::base64;
use crate::Transmission;

pub(crate) const SESSION_HEADER: &str = "X-Transmission-Session-Id";

impl Transmission {
    fn fetch(&self) -> kroma_module_sdk::http::Fetch {
        let mut f = kroma_module_sdk::http::Fetch::new().max_time(60);
        let sid = self.session_id.lock().unwrap().clone();
        if !sid.is_empty() {
            f = f.header(SESSION_HEADER, sid);
        }
        if !self.username.is_empty() {
            let credentials = base64(format!("{}:{}", self.username, self.password).as_bytes());
            f = f.header("authorization", format!("Basic {credentials}"));
        }
        f
    }

    pub(crate) fn rpc(&self, method: &str, arguments: Value) -> Result<Value> {
        let body = json!({ "method": method, "arguments": arguments });
        let mut resp = self.fetch().post_json(&self.url, &body)?;
        if resp.status == 409 {
            let sid = resp
                .header(SESSION_HEADER)
                .ok_or_else(|| anyhow!("409 without a {SESSION_HEADER} header"))?
                .to_string();
            *self.session_id.lock().unwrap() = sid;
            resp = self.fetch().post_json(&self.url, &body)?;
        }
        if resp.status == 401 {
            bail!("authentication failed (check username/password)");
        }
        let v: Value = resp.ensure_ok()?.json()?;
        match v.get("result").and_then(Value::as_str) {
            Some("success") => Ok(v.get("arguments").cloned().unwrap_or(Value::Null)),
            Some(other) => bail!("transmission error: {other}"),
            None => bail!("malformed transmission response"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake_transmission::{FakeTransmission, Reply};

    #[test]
    fn test_reports_the_server_version() {
        let fake = FakeTransmission::start(|method, _, _| match method {
            "session-get" => Reply::ok(json!({ "version": "4.0.5" })),
            other => Reply::refuses(other),
        });
        assert_eq!(fake.client().test().unwrap(), "Transmission 4.0.5");
    }

    #[test]
    fn a_server_that_hides_its_version_still_counts_as_reachable() {
        // The point of `test` is "can I talk to it", so a missing version field
        // is not a failure - reporting reachability matters more than the number.
        let fake = FakeTransmission::start(|_, _, _| Reply::ok(json!({})));
        assert_eq!(fake.client().test().unwrap(), "Transmission ?");
    }

    #[test]
    fn the_409_handshake_is_replayed_once_and_then_remembered() {
        // Transmission answers the FIRST request of a session with 409 + a fresh
        // session id. Failing to cache it would mean every call costs two round
        // trips; failing to replay would surface a 409 as a user-visible error.
        let fake = FakeTransmission::start(|method, _, n| match (method, n) {
            ("session-get", 1) => Reply::challenge("Zx9-token"),
            ("session-get", _) => Reply::ok(json!({ "version": "4.0.5" })),
            (other, _) => Reply::refuses(other),
        });
        let client = fake.client();
        assert_eq!(client.test().unwrap(), "Transmission 4.0.5");
        assert_eq!(client.test().unwrap(), "Transmission 4.0.5");

        let calls = fake.calls();
        assert_eq!(calls.len(), 3, "challenge, replay, then one plain call");
        assert_eq!(calls[0].session, None, "nothing to send before the challenge");
        assert_eq!(calls[1].session.as_deref(), Some("Zx9-token"), "replayed with the id");
        assert_eq!(calls[2].session.as_deref(), Some("Zx9-token"), "and it stuck");
    }

    #[test]
    fn a_409_without_the_session_header_is_an_error() {
        // Nothing to replay with, so retrying would just loop.
        let fake = FakeTransmission::start(|_, _, _| Reply::raw(409, "Conflict"));
        let err = fake.client().test().unwrap_err().to_string();
        assert!(err.contains(SESSION_HEADER), "{err}");
    }

    #[test]
    fn a_401_names_the_credentials_and_the_request_carried_basic_auth() {
        let fake = FakeTransmission::start(|_, _, _| Reply::raw(401, "Unauthorized"));
        let err = fake.client().test().unwrap_err().to_string();
        assert!(err.contains("username/password"), "{err}");
        // base64("admin:secret") - the header has to be right for the 401 to mean
        // what the message says it means.
        assert_eq!(fake.calls()[0].auth.as_deref(), Some("Basic YWRtaW46c2VjcmV0"));
    }

    #[test]
    fn a_client_without_credentials_sends_no_authorization_header() {
        // Sending `Basic Og==` (":") to an open server is a needless 401 risk.
        let fake = FakeTransmission::start(|_, _, _| Reply::ok(json!({ "version": "3.0" })));
        fake.anonymous().test().unwrap();
        assert_eq!(fake.calls()[0].auth, None);
    }

    #[test]
    fn a_refusal_is_surfaced_verbatim_despite_the_200() {
        // Transmission reports most errors as 200 + result != "success", so the
        // status alone never decides.
        let fake = FakeTransmission::start(|_, _, _| Reply::refuses("torrent-add: invalid or corrupt"));
        let err = fake.client().test().unwrap_err().to_string();
        assert!(err.contains("invalid or corrupt"), "{err}");
    }

    #[test]
    fn a_reply_without_a_result_field_is_malformed() {
        // Typically a reverse proxy's own JSON, not Transmission's.
        let fake = FakeTransmission::start(|_, _, _| Reply::raw(200, r#"{"ok":true}"#));
        let err = fake.client().test().unwrap_err().to_string();
        assert!(err.contains("malformed"), "{err}");
    }

}

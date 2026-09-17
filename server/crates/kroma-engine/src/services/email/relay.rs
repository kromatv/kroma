//! The kroma.tv mail relay, from the server's side: register once, then send
//! like SMTP, one mailbox at a time. The relay writes nothing; it carries what
//! this server rendered, checks it, and only to a mailbox that said yes to
//! this origin, or to ask it. See `packages/mail-relay/README.md`.

use serde_json::{json, Value};

use super::identity::{b64url, RelayIdentity};
use super::render::LOGO_PNG;
use super::Rendered;

/// Where every KROMA server registers and sends unless `KROMA_MAIL_RELAY_URL`
/// names an operator's own copy of the Worker.
pub const RELAY_URL: &str = "https://mail.kroma.tv";

const MAX_TIME_SECS: u32 = 15;

#[derive(Debug, PartialEq, Eq)]
pub enum RelayError {
    /// The relay no longer knows this instance: register again.
    Unregistered,
    /// This mailbox has not allowed this origin. Ask it, or carry the link by hand.
    ConsentRequired,
    /// The mailbox is gone for good: it bounced, or reported the sender.
    Gone,
    /// The relay would not carry this request as written. Retrying changes nothing.
    Refused(String),
    /// The relay, or the way to it, was not there.
    Transient(String),
}

impl std::fmt::Display for RelayError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unregistered => f.write_str("the relay does not know this server"),
            Self::ConsentRequired => f.write_str("the mailbox has not allowed this server"),
            Self::Gone => f.write_str("the relay retired this mailbox"),
            Self::Refused(why) => write!(f, "the relay refused: {why}"),
            Self::Transient(why) => write!(f, "the relay was unreachable: {why}"),
        }
    }
}

/// What signs a call: the instance the relay sealed for this origin, and the key it named.
pub struct Session {
    pub instance: String,
    pub identity: RelayIdentity,
}

fn signed(session: &Session, payload: Value) -> Value {
    let text = payload.to_string();
    json!({
        "instance": session.instance,
        "payload": text,
        "signature": session.identity.sign(&text),
    })
}

fn now() -> i64 {
    time::OffsetDateTime::now_utc().unix_timestamp()
}

pub fn register_body(origin: &str, identity: &RelayIdentity) -> Value {
    json!({ "origin": origin, "publicKey": identity.public_base64url() })
}

pub fn consent_body(session: &Session, to: &str, token: &str) -> Value {
    signed(session, json!({ "to": to, "token": token, "ts": now() }))
}

pub fn send_body(session: &Session, to: &str, rendered: &Rendered) -> Value {
    signed(
        session,
        json!({
            "to": to,
            "subject": rendered.subject,
            "text": rendered.text,
            "html": rendered.html,
            "attachments": [{
                "filename": "logo.png",
                "type": "image/png",
                "contentId": "logo",
                "content": b64url(LOGO_PNG),
            }],
            "ts": now(),
        }),
    )
}

/// What the relay's answer means.
pub fn outcome(status: u16, body: &str) -> Result<Value, RelayError> {
    let parsed: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let error = || {
        parsed["error"]
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| format!("HTTP {status}"))
    };
    match status {
        200..=299 => Ok(parsed),
        401 => Err(RelayError::Unregistered),
        403 if parsed["error"] == "consent required" => Err(RelayError::ConsentRequired),
        410 => Err(RelayError::Gone),
        400 | 403 | 413 | 422 => Err(RelayError::Refused(error())),
        _ => Err(RelayError::Transient(error())),
    }
}

async fn post(url: String, body: Value) -> Result<Value, RelayError> {
    let response = tokio::task::spawn_blocking(move || {
        kroma_http::Fetch::new()
            .max_time(MAX_TIME_SECS)
            .post_json(&url, &body)
    })
    .await
    .map_err(|e| RelayError::Transient(e.to_string()))?
    .map_err(|e| RelayError::Transient(e.to_string()))?;
    outcome(response.status, &response.text())
}

/// Register this origin under `identity`. The relay will call the origin's
/// challenge route before answering, so the server must be reachable at it.
/// Returns the sealed instance to keep.
pub async fn register(base: &str, origin: &str, identity: &RelayIdentity) -> Result<String, RelayError> {
    let answer = post(format!("{base}/v1/register"), register_body(origin, identity)).await?;
    answer["instance"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| RelayError::Refused("no instance in the answer".into()))
}

/// The link one mailbox may click to allow this origin, for the server to
/// write its own message around.
pub async fn consent(base: &str, session: &Session, to: &str, token: &str) -> Result<String, RelayError> {
    let answer = post(format!("{base}/v1/consent"), consent_body(session, to, token)).await?;
    answer["url"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| RelayError::Refused("no link in the answer".into()))
}

/// Send one rendered message to `to`, as SMTP would.
pub async fn send(base: &str, session: &Session, to: &str, rendered: &Rendered) -> Result<(), RelayError> {
    post(format!("{base}/v1/send"), send_body(session, to, rendered))
        .await
        .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session() -> Session {
        Session {
            instance: "v1.INSTANCE".into(),
            identity: RelayIdentity::generate(),
        }
    }

    fn rendered() -> Rendered {
        Rendered {
            subject: "Reset".into(),
            text: "open https://kroma.example/reset".into(),
            html: "<a href=\"https://kroma.example/reset\">x</a>".into(),
        }
    }

    #[test]
    fn a_send_is_signed_and_names_the_mailbox_the_message_and_the_logo() {
        let s = session();
        let body = send_body(&s, "u@b.co", &rendered());

        assert_eq!(body["instance"], "v1.INSTANCE");
        let payload: Value = serde_json::from_str(body["payload"].as_str().unwrap()).unwrap();
        assert_eq!(payload["to"], "u@b.co");
        assert_eq!(payload["subject"], "Reset");
        assert_eq!(payload["attachments"][0]["contentId"], "logo");
        assert!(payload["ts"].as_i64().unwrap() > 1_700_000_000);
        assert_eq!(body["signature"].as_str().unwrap().len(), 86);
    }

    #[test]
    fn a_registration_carries_the_origin_and_the_public_point_only() {
        let identity = RelayIdentity::generate();
        let body = register_body("https://kroma.example", &identity);

        assert_eq!(body["origin"], "https://kroma.example");
        assert_eq!(body["publicKey"], identity.public_base64url());
        assert!(body.get("privateKey").is_none());
    }

    #[test]
    fn every_status_the_relay_speaks_has_one_meaning() {
        assert_eq!(outcome(200, r#"{"url":"x"}"#).unwrap()["url"], "x");
        assert_eq!(outcome(401, "").unwrap_err(), RelayError::Unregistered);
        assert_eq!(
            outcome(403, r#"{"error":"consent required"}"#).unwrap_err(),
            RelayError::ConsentRequired
        );
        assert_eq!(
            outcome(403, r#"{"error":"this origin is shut out"}"#).unwrap_err(),
            RelayError::Refused("this origin is shut out".into())
        );
        assert_eq!(outcome(410, "").unwrap_err(), RelayError::Gone);
        assert_eq!(
            outcome(422, r#"{"error":"html: a link leads where this message may not"}"#).unwrap_err(),
            RelayError::Refused("html: a link leads where this message may not".into())
        );
        for transient in [429, 500, 502, 503, 504] {
            assert!(matches!(outcome(transient, "").unwrap_err(), RelayError::Transient(_)));
        }
    }

    #[tokio::test]
    async fn a_relay_that_is_not_there_is_transient() {
        let err = register("http://127.0.0.1:1", "https://kroma.example", &RelayIdentity::generate())
            .await
            .unwrap_err();

        assert!(matches!(err, RelayError::Transient(_)), "{err}");
    }
}

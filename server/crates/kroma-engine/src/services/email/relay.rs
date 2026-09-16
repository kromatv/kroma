//! The kroma.tv mail relay: how a self-hosted server writes to a mailbox that
//! let it. The server holds no credential the relay would trust; it holds a
//! GRANT the mailbox minted by clicking the relay's consent link, opaque to the
//! server and good for that one address from this one origin. See
//! `packages/mail-relay/README.md`.

use serde_json::{json, Value};

use super::Rendered;

/// Where every KROMA server enrols and sends unless `KROMA_MAIL_RELAY_URL` names
/// an operator's own copy of the Worker.
pub const RELAY_URL: &str = "https://mail.kroma.tv";

const MAX_TIME_SECS: u32 = 15;

#[derive(Debug, PartialEq, Eq)]
pub enum RelayError {
    /// The grant will never work again: expired, sealed under a key the relay
    /// no longer holds, or the mailbox bounced. Drop it; the mailbox re-consents.
    Gone,
    /// The relay would not carry this request as written. Retrying changes nothing.
    Refused(String),
    /// The relay, or the way to it, was not there. The grant stays.
    Transient(String),
}

impl std::fmt::Display for RelayError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Gone => f.write_str("the relay retired this grant"),
            Self::Refused(why) => write!(f, "the relay refused: {why}"),
            Self::Transient(why) => write!(f, "the relay was unreachable: {why}"),
        }
    }
}

pub struct Enrolment<'a> {
    pub address: &'a str,
    pub origin: &'a str,
    pub server_name: &'a str,
    pub locale: &'a str,
    pub token: &'a str,
}

pub fn enrol_body(e: &Enrolment<'_>) -> Value {
    json!({
        "address": e.address,
        "origin": e.origin,
        "serverName": e.server_name,
        "locale": e.locale,
        "token": e.token,
    })
}

pub fn send_body(grant: &str, rendered: &Rendered) -> Value {
    json!({
        "grant": grant,
        "subject": rendered.subject,
        "text": rendered.text,
        "html": rendered.html,
    })
}

/// What the relay's answer means. A 2xx carries the renewed grant when one was
/// spent; 401 and 410 retire the grant; a 4xx names what was wrong with the
/// request; anything else is the network or the relay having a moment.
pub fn outcome(status: u16, body: &str) -> Result<Option<String>, RelayError> {
    let parsed: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let error = || {
        parsed["error"]
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| format!("HTTP {status}"))
    };
    match status {
        200..=299 => Ok(parsed["grant"].as_str().map(str::to_string)),
        401 | 410 => Err(RelayError::Gone),
        400 | 413 | 422 => Err(RelayError::Refused(error())),
        _ => Err(RelayError::Transient(error())),
    }
}

async fn post(url: String, body: Value) -> Result<Option<String>, RelayError> {
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

/// Ask the relay to ask `address` for consent. Nothing comes back but the
/// verdict: the grant reaches this server later, in the recipient's browser.
pub async fn enrol(base: &str, enrolment: &Enrolment<'_>) -> Result<(), RelayError> {
    post(format!("{base}/v1/enrol"), enrol_body(enrolment))
        .await
        .map(|_| ())
}

/// Spend `grant` on one rendered message. Returns the renewed grant to store.
pub async fn send(base: &str, grant: &str, rendered: &Rendered) -> Result<String, RelayError> {
    let renewed = post(format!("{base}/v1/send"), send_body(grant, rendered)).await?;
    Ok(renewed.unwrap_or_else(|| grant.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rendered() -> Rendered {
        Rendered {
            subject: "Reset".into(),
            text: "open https://kroma.example/reset".into(),
            html: "<a href=\"https://kroma.example/reset\">x</a>".into(),
        }
    }

    #[test]
    fn a_send_carries_the_grant_and_the_message_and_never_an_address() {
        let body = send_body("v1.SEALED", &rendered());

        assert_eq!(body["grant"], "v1.SEALED");
        assert_eq!(body["subject"], "Reset");
        assert!(body.get("to").is_none());
        assert!(body.get("from").is_none());
    }

    #[test]
    fn an_enrolment_names_the_mailbox_the_server_and_the_token() {
        let body = enrol_body(&Enrolment {
            address: "u@b.c",
            origin: "https://kroma.example",
            server_name: "Home",
            locale: "fr",
            token: "tok",
        });

        assert_eq!(body["address"], "u@b.c");
        assert_eq!(body["origin"], "https://kroma.example");
        assert_eq!(body["locale"], "fr");
        assert_eq!(body["token"], "tok");
    }

    #[test]
    fn a_delivery_hands_back_the_renewed_grant() {
        assert_eq!(
            outcome(200, r#"{"delivered":true,"grant":"v1.NEW"}"#).unwrap(),
            Some("v1.NEW".to_string())
        );
        assert_eq!(outcome(204, "").unwrap(), None);
    }

    #[test]
    fn only_the_permanent_statuses_retire_a_grant() {
        assert_eq!(outcome(401, r#"{"error":"invalid grant"}"#), Err(RelayError::Gone));
        assert_eq!(outcome(410, "").unwrap_err(), RelayError::Gone);
        for transient in [429, 500, 502, 503, 504] {
            assert!(
                matches!(outcome(transient, "").unwrap_err(), RelayError::Transient(_)),
                "{transient} must not retire the grant"
            );
        }
    }

    #[test]
    fn a_refusal_carries_the_relays_own_words() {
        let err = outcome(422, r#"{"error":"html: a link leads off https://kroma.example"}"#);

        assert_eq!(
            err,
            Err(RelayError::Refused(
                "html: a link leads off https://kroma.example".into()
            ))
        );
        assert_eq!(outcome(400, "not json"), Err(RelayError::Refused("HTTP 400".into())));
    }

    #[tokio::test]
    async fn a_relay_that_is_not_there_is_transient_and_keeps_the_grant() {
        let err = send("http://127.0.0.1:1", "v1.SEALED", &rendered())
            .await
            .unwrap_err();

        assert!(matches!(err, RelayError::Transient(_)), "{err}");
    }
}

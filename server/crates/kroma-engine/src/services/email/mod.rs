//! Sending the account emails (credential reset, address verification). Three
//! ways out, the owner's choice per server: `manual`, where the owner copies
//! the link by hand; the operator's own SMTP server; or the kroma.tv mail relay,
//! which only writes to a mailbox that told it this server may. For a reset the
//! link alone is not enough: the user must also enter the short code the owner
//! read to them, so intercepting the email gives nothing. A send failure never
//! fails the mint.

mod relay;
mod render;
mod smtp;

pub use relay::{Enrolment, RelayError, RELAY_URL};
pub use render::{render_html, render_strings, ResetStrings};
pub use smtp::send_test;

use crate::services::settings::{email_delivery, EmailDelivery, Settings};

/// Which email the skeleton carries. Both share the layout; a verification has
/// no out-of-band code (reading the mailbox is itself the proof), so its
/// code-note block is dropped.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum EmailKind {
    Reset,
    Verify,
}

pub struct OutboundEmail {
    pub to: String,
    /// Resolved with [`crate::i18n::user_locale`] by the caller.
    pub locale: &'static str,
    pub url: String,
    pub server_name: String,
    pub kind: EmailKind,
}

/// One message, fully rendered: what SMTP sends and what the relay carries.
pub struct Rendered {
    pub subject: String,
    pub text: String,
    pub html: String,
}

pub fn render(email: &OutboundEmail) -> Rendered {
    let strings = render_strings(email.kind, email.locale, &email.server_name, &email.url);
    let html = render_html(email.locale, &strings, &email.server_name, &email.url);
    Rendered {
        subject: strings.subject,
        text: strings.text,
        html,
    }
}

/// How the message left, as the wire spells it. `Unconfirmed` is the relay's
/// answer for a mailbox that has not yet allowed this server: the owner carries
/// the link by hand, and a verification is what asks the mailbox.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Delivery {
    Manual,
    Smtp,
    Relay,
    Unconfirmed,
}

impl Delivery {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Smtp => "smtp",
            Self::Relay => "relay",
            Self::Unconfirmed => "unconfirmed",
        }
    }
}

#[derive(Debug)]
pub struct Sent {
    pub delivery: Delivery,
    /// The fresher grant the relay handed back, for the caller to store.
    pub renewed_grant: Option<String>,
}

#[derive(Debug)]
pub enum SendError {
    /// The relay retired the grant: drop it, and let the mailbox re-consent.
    GrantGone,
    Failed(String),
}

impl std::fmt::Display for SendError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::GrantGone => f.write_str("the relay retired this grant"),
            Self::Failed(why) => f.write_str(why),
        }
    }
}

/// Deliver by the configured mode. `grant` is the recipient's stored relay
/// grant, consulted only in relay mode. `manual` never fails.
pub async fn send(
    settings: &Settings,
    relay_url: &str,
    email: &OutboundEmail,
    grant: Option<&str>,
) -> Result<Sent, SendError> {
    match email_delivery(settings) {
        EmailDelivery::Manual => Ok(Sent {
            delivery: Delivery::Manual,
            renewed_grant: None,
        }),
        EmailDelivery::Smtp => {
            smtp::send_smtp(settings, &email.to, &render(email))
                .await
                .map_err(SendError::Failed)?;
            Ok(Sent {
                delivery: Delivery::Smtp,
                renewed_grant: None,
            })
        }
        EmailDelivery::Relay => {
            let Some(grant) = grant else {
                return Ok(Sent {
                    delivery: Delivery::Unconfirmed,
                    renewed_grant: None,
                });
            };
            match relay::send(relay_url, grant, &render(email)).await {
                Ok(renewed) => Ok(Sent {
                    delivery: Delivery::Relay,
                    renewed_grant: Some(renewed),
                }),
                Err(RelayError::Gone) => Err(SendError::GrantGone),
                Err(e) => Err(SendError::Failed(e.to_string())),
            }
        }
    }
}

/// Ask the relay to ask a mailbox for consent, on this server's behalf.
pub async fn enrol(relay_url: &str, enrolment: &Enrolment<'_>) -> Result<(), RelayError> {
    relay::enrol(relay_url, enrolment).await
}

/// A short probe through the owner's own grant: proves the relay, the grant and
/// deliverability in one shot. Returns the renewed grant.
pub async fn relay_test(relay_url: &str, grant: &str, locale: &str) -> Result<String, RelayError> {
    let text = crate::i18n::t(locale, "email.test.text", &[]);
    let rendered = Rendered {
        subject: crate::i18n::t(locale, "email.test.subject", &[]),
        html: format!("<p>{text}</p>"),
        text,
    };
    relay::send(relay_url, grant, &rendered).await
}

#[cfg(test)]
mod tests {
    use kroma_db::testing::TempPool;
    use kroma_db::Pool;
    use serde_json::{json, Value};

    use super::*;

    const NOWHERE: &str = "http://127.0.0.1:1";

    fn settings() -> (TempPool, Settings) {
        let pool = crate::db::testing::temp_pool("email");
        let settings = Settings::load(&pool);
        (pool, settings)
    }

    fn configure(pool: &Pool, settings: &Settings, patch: &[(&str, Value)]) {
        settings.set_patch(
            pool,
            patch
                .iter()
                .map(|(k, v)| ((*k).to_string(), v.clone()))
                .collect(),
        );
    }

    fn outbound() -> OutboundEmail {
        OutboundEmail {
            to: "user@example.test".to_string(),
            locale: "fr",
            url: "https://x/reset?token=abc".to_string(),
            server_name: "Home".to_string(),
            kind: EmailKind::Reset,
        }
    }

    fn failure(result: Result<Sent, SendError>) -> String {
        match result {
            Err(SendError::Failed(why)) => why,
            Err(SendError::GrantGone) => panic!("the grant was retired"),
            Ok(sent) => panic!("delivered as {:?}", sent.delivery),
        }
    }

    #[tokio::test]
    async fn an_unconfigured_server_reports_manual_rather_than_failing() {
        let (_pool, settings) = settings();

        let sent = send(&settings, NOWHERE, &outbound(), None)
            .await
            .expect("a delivery");

        assert_eq!(sent.delivery, Delivery::Manual);
        assert_eq!(sent.delivery.as_str(), "manual");
    }

    #[tokio::test]
    async fn sending_without_a_from_address_names_the_missing_setting() {
        let (pool, settings) = settings();
        configure(
            &pool,
            &settings,
            &[
                ("emailDelivery", json!("smtp")),
                ("smtpHost", json!("localhost")),
            ],
        );

        let err = failure(send(&settings, NOWHERE, &outbound(), None).await);

        assert!(err.contains("smtpFrom"), "{err}");
    }

    #[tokio::test]
    async fn sending_without_a_host_names_the_missing_setting() {
        let (pool, settings) = settings();
        configure(
            &pool,
            &settings,
            &[
                ("smtpEnabled", json!(true)),
                ("smtpFrom", json!("kroma@example.test")),
            ],
        );

        let err = failure(send(&settings, NOWHERE, &outbound(), None).await);

        assert!(err.contains("smtpHost"), "{err}");
    }

    #[tokio::test]
    async fn an_unparseable_recipient_is_a_refusal_not_a_panic() {
        let (pool, settings) = settings();
        configure(
            &pool,
            &settings,
            &[
                ("emailDelivery", json!("smtp")),
                ("smtpHost", json!("localhost")),
                ("smtpFrom", json!("kroma@example.test")),
            ],
        );
        let mut email = outbound();
        email.to = "not an address".to_string();

        let err = failure(send(&settings, NOWHERE, &email, None).await);

        assert!(err.starts_with("to:"), "{err}");
    }

    #[tokio::test]
    async fn on_the_relay_a_mailbox_that_never_consented_is_unconfirmed() {
        let (pool, settings) = settings();
        configure(&pool, &settings, &[("emailDelivery", json!("relay"))]);

        let sent = send(&settings, NOWHERE, &outbound(), None)
            .await
            .expect("a delivery");

        assert_eq!(sent.delivery, Delivery::Unconfirmed);
        assert!(sent.renewed_grant.is_none());
    }

    #[tokio::test]
    async fn an_unreachable_relay_fails_the_send_and_keeps_the_grant() {
        let (pool, settings) = settings();
        configure(&pool, &settings, &[("emailDelivery", json!("relay"))]);

        let err = send(&settings, NOWHERE, &outbound(), Some("v1.SEALED"))
            .await
            .expect_err("a failure");

        assert!(matches!(err, SendError::Failed(_)), "{err}");
    }

    #[tokio::test]
    async fn a_test_probe_refuses_before_it_dials_when_the_address_is_junk() {
        let (pool, settings) = settings();
        configure(
            &pool,
            &settings,
            &[
                ("smtpHost", json!("localhost")),
                ("smtpFrom", json!("kroma@example.test")),
            ],
        );

        let err = send_test(&settings, "not an address", "en")
            .await
            .expect_err("a refusal");

        assert!(err.starts_with("to:"), "{err}");
        assert!(send_test(&settings, "owner@example.test", "en")
            .await
            .is_err());
    }

    #[tokio::test]
    async fn a_test_probe_needs_a_from_address_too() {
        let (_pool, settings) = settings();

        let err = send_test(&settings, "owner@example.test", "en")
            .await
            .expect_err("a refusal");

        assert!(err.contains("smtpFrom"), "{err}");
    }
}

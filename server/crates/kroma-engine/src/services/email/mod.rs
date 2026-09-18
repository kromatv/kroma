//! Sending the account emails (credential reset, address verification). Three
//! ways out, the owner's choice per server: `manual`, where the owner copies
//! the link by hand; the operator's own SMTP server; or the kroma.tv mail relay,
//! which carries what this server wrote once the owner has activated this
//! server there, and before that only the question asking them to. Every word
//! of every message is rendered here.
//! For a reset the link alone is not enough: the user must also enter the
//! short code the owner read to them, so intercepting the email gives nothing.
//! A send failure never fails the mint.

mod identity;
mod relay;
mod render;
mod smtp;

pub use identity::{ensure_identity, RelayIdentity, INSTANCE, INSTANCE_ORIGIN, IDENTITY_KEY};
pub use relay::{RelayError, RELAY_URL};
pub use render::{render_html, render_strings, ResetStrings};
pub use smtp::send_test;

use serde_json::json;

use crate::db::Pool;
use crate::services::settings::{email_delivery, EmailDelivery, Settings};

/// Which email the skeleton carries. All share the layout; only a reset has
/// an out-of-band code, so the others drop the code-note block.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum EmailKind {
    Reset,
    Verify,
    /// The relay's question to the owner, in this server's words: may this
    /// server send email through the relay?
    Activate,
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

/// How the message left, as the wire spells it. `Inactive` is the relay's
/// answer while nobody has activated this server there: the owner carries the
/// link by hand, and the relay test is what asks them. `Refused` is a mailbox
/// closed to this server: it opted out, bounced, or reported it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Delivery {
    Manual,
    Smtp,
    Relay,
    Inactive,
    Refused,
}

impl Delivery {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Smtp => "smtp",
            Self::Relay => "relay",
            Self::Inactive => "inactive",
            Self::Refused => "refused",
        }
    }
}

/// The relay this server speaks to, and the origin it speaks for: the public
/// address its links are built on, which the relay binds the identity to.
pub struct RelayTarget<'a> {
    pub url: &'a str,
    pub origin: &'a str,
}

/// This server's standing with the relay, registering when it has none yet or
/// its public address moved since.
async fn session(
    settings: &Settings,
    pool: &Pool,
    target: &RelayTarget<'_>,
) -> Result<relay::Session, RelayError> {
    let identity = ensure_identity(settings, pool).map_err(|e| RelayError::Transient(e.to_string()))?;
    let stored = settings.get_str(INSTANCE, "");
    if !stored.is_empty() && settings.get_str(INSTANCE_ORIGIN, "") == target.origin {
        return Ok(relay::Session {
            instance: stored,
            identity,
        });
    }
    register(settings, pool, target, identity).await
}

async fn register(
    settings: &Settings,
    pool: &Pool,
    target: &RelayTarget<'_>,
    identity: RelayIdentity,
) -> Result<relay::Session, RelayError> {
    let instance = relay::register(target.url, target.origin, &identity).await?;
    settings.set_internal(pool, INSTANCE, json!(instance));
    settings.set_internal(pool, INSTANCE_ORIGIN, json!(target.origin));
    tracing::info!(origin = target.origin, "registered with the mail relay");
    Ok(relay::Session { instance, identity })
}

/// One call the relay answers under a session.
enum Call<'a> {
    Send { to: &'a str, rendered: &'a Rendered },
    Activate { to: &'a str, token: &'a str },
}

enum Answer {
    Sent,
    Link(String),
}

async fn perform(base: &str, session: &relay::Session, call: &Call<'_>) -> Result<Answer, RelayError> {
    match call {
        Call::Send { to, rendered } => relay::send(base, session, to, rendered)
            .await
            .map(|()| Answer::Sent),
        Call::Activate { to, token } => relay::activate(base, session, to, token)
            .await
            .map(Answer::Link),
    }
}

/// Run one relay call, registering afresh and retrying once when the relay
/// has forgotten this server.
async fn with_session(
    settings: &Settings,
    pool: &Pool,
    target: &RelayTarget<'_>,
    call: Call<'_>,
) -> Result<Answer, RelayError> {
    let session = session(settings, pool, target).await?;
    match perform(target.url, &session, &call).await {
        Err(RelayError::Unregistered) => {
            let session = register(settings, pool, target, session.identity).await?;
            perform(target.url, &session, &call).await
        }
        other => other,
    }
}

/// Deliver by the configured mode. `target` is needed only on the relay, and
/// only exists once the server has a public address. `manual` never fails.
pub async fn send(
    settings: &Settings,
    pool: &Pool,
    target: Option<&RelayTarget<'_>>,
    email: &OutboundEmail,
) -> Result<Delivery, String> {
    match email_delivery(settings) {
        EmailDelivery::Manual => Ok(Delivery::Manual),
        EmailDelivery::Smtp => smtp::send_smtp(settings, &email.to, &render(email))
            .await
            .map(|_| Delivery::Smtp),
        EmailDelivery::Relay => {
            let Some(target) = target else {
                return Ok(Delivery::Manual);
            };
            let rendered = render(email);
            let call = Call::Send {
                to: &email.to,
                rendered: &rendered,
            };
            match with_session(settings, pool, target, call).await {
                Ok(_) => Ok(Delivery::Relay),
                Err(RelayError::Inactive) => Ok(Delivery::Inactive),
                Err(RelayError::Gone) => Ok(Delivery::Refused),
                Err(e) => Err(e.to_string()),
            }
        }
    }
}

/// Ask the owner, through the relay, to activate this server there: the relay
/// mints the link, this server writes the message around it. The click
/// verifies the owner's address too, so `token` is the verification being minted.
pub async fn ask_activation(
    settings: &Settings,
    pool: &Pool,
    target: &RelayTarget<'_>,
    email: &OutboundEmail,
    token: &str,
) -> Result<Delivery, String> {
    let call = Call::Activate {
        to: &email.to,
        token,
    };
    let url = match with_session(settings, pool, target, call).await {
        Ok(Answer::Link(url)) => url,
        Ok(Answer::Sent) => return Err("the relay answered a question with a delivery".into()),
        Err(e) => return Err(e.to_string()),
    };
    let question = OutboundEmail {
        to: email.to.clone(),
        locale: email.locale,
        url,
        server_name: email.server_name.clone(),
        kind: EmailKind::Activate,
    };
    let rendered = render(&question);
    let call = Call::Send {
        to: &email.to,
        rendered: &rendered,
    };
    with_session(settings, pool, target, call)
        .await
        .map(|_| Delivery::Relay)
        .map_err(|e| e.to_string())
}

/// A short probe to the owner's own address through the relay: proves the
/// registration, the relay and deliverability in one shot.
pub async fn relay_test(
    settings: &Settings,
    pool: &Pool,
    target: &RelayTarget<'_>,
    to: &str,
    locale: &str,
) -> Result<(), RelayError> {
    let text = crate::i18n::t(locale, "email.test.text", &[]);
    let rendered = Rendered {
        subject: crate::i18n::t(locale, "email.test.subject", &[]),
        html: format!("<p>{text}</p>"),
        text,
    };
    with_session(settings, pool, target, Call::Send { to, rendered: &rendered })
        .await
        .map(|_| ())
}

#[cfg(test)]
mod tests {
    use kroma_db::testing::TempPool;
    use serde_json::Value;

    use super::*;

    const NOWHERE: RelayTarget<'static> = RelayTarget {
        url: "http://127.0.0.1:1",
        origin: "https://kroma.test",
    };

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

    #[tokio::test]
    async fn an_unconfigured_server_reports_manual_rather_than_failing() {
        let (pool, settings) = settings();

        let delivery = send(&settings, &pool, Some(&NOWHERE), &outbound())
            .await
            .expect("a delivery");

        assert_eq!(delivery, Delivery::Manual);
        assert_eq!(delivery.as_str(), "manual");
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

        let err = send(&settings, &pool, None, &outbound())
            .await
            .expect_err("a refusal");

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

        let err = send(&settings, &pool, None, &outbound())
            .await
            .expect_err("a refusal");

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

        let err = send(&settings, &pool, None, &email)
            .await
            .expect_err("a refusal");

        assert!(err.starts_with("to:"), "{err}");
    }

    #[tokio::test]
    async fn on_the_relay_a_server_with_no_public_address_falls_back_to_hand_delivery() {
        let (pool, settings) = settings();
        configure(&pool, &settings, &[("emailDelivery", json!("relay"))]);

        let delivery = send(&settings, &pool, None, &outbound())
            .await
            .expect("a delivery");

        assert_eq!(delivery, Delivery::Manual);
    }

    #[tokio::test]
    async fn an_unreachable_relay_fails_the_send_and_mints_the_identity_anyway() {
        let (pool, settings) = settings();
        configure(&pool, &settings, &[("emailDelivery", json!("relay"))]);

        let err = send(&settings, &pool, Some(&NOWHERE), &outbound())
            .await
            .expect_err("a failure");

        assert!(err.contains("unreachable"), "{err}");
        assert!(!settings.get_str(IDENTITY_KEY, "").is_empty());
        assert!(settings.get_str(INSTANCE, "").is_empty());
    }

    #[tokio::test]
    async fn a_stored_instance_for_another_origin_is_not_reused() {
        let (pool, settings) = settings();
        configure(&pool, &settings, &[("emailDelivery", json!("relay"))]);
        settings.set_internal(&pool, INSTANCE, json!("v1.OLD"));
        settings.set_internal(&pool, INSTANCE_ORIGIN, json!("https://elsewhere.test"));

        let err = send(&settings, &pool, Some(&NOWHERE), &outbound())
            .await
            .expect_err("a registration attempt that fails");

        assert!(err.contains("unreachable"), "{err}");
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

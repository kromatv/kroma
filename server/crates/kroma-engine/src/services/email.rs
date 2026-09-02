//! Sending the account emails (credential reset, address verification). Delivery
//! is the operator's own SMTP server when configured, else `manual`: the owner
//! copies the link by hand. For a reset the link alone is not enough — the user
//! must also enter the short code the owner read to them — so intercepting the
//! email gives nothing. A send failure never fails the mint.
//!
//! Every word is rendered here, in the recipient's language, from the shared
//! catalogs, into the skeleton under `packages/core/assets/email/`. The logo
//! rides inside the message as a CID inline part: no asset is hosted anywhere.

use crate::i18n;
use crate::services::settings::Settings;

// The email's shared assets: one skeleton plus its fragments, compiled in.
const SKELETON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../packages/core/assets/email/reset.template.html"
));
const FRAGMENT_LOGO: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../packages/core/assets/email/fragments/logo.template.html"
));
const FRAGMENT_CODE_NOTE: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../packages/core/assets/email/fragments/code-note.template.html"
));
const LOGO_PNG: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../packages/core/assets/email/logo.png"
));

/// The Content-ID the skeleton's `<img src="cid:…">` references.
const LOGO_CID: &str = "logo";

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
    /// Resolved with [`i18n::user_locale`] by the caller.
    pub locale: &'static str,
    pub url: String,
    pub server_name: String,
    pub kind: EmailKind,
}

/// The words of the email, fully rendered in the recipient's language.
pub struct ResetStrings {
    pub subject: String,
    pub text: String,
    pub preheader: String,
    pub heading: String,
    /// Keeps the literal `{name}` token: the renderer substitutes it with the
    /// styled, escaped server name.
    pub intro: String,
    pub button_label: String,
    /// Keeps the literal `{code}` token, substituted with the styled code label.
    pub code_note: String,
    pub code_label: String,
    pub footer: String,
}

pub fn render_strings(
    kind: EmailKind,
    locale: &str,
    server_name: &str,
    url: &str,
) -> ResetStrings {
    let prefix = match kind {
        EmailKind::Reset => "email.reset",
        EmailKind::Verify => "email.verify",
    };
    let t = |key: &str| i18n::t(locale, &format!("{prefix}.{key}"), &[]);
    let (code_note, code_label) = match kind {
        EmailKind::Reset => (t("codeNote"), t("codeLabel")),
        EmailKind::Verify => (String::new(), String::new()),
    };
    ResetStrings {
        subject: i18n::t(locale, &format!("{prefix}.subject"), &[("name", server_name)]),
        text: i18n::t(
            locale,
            &format!("{prefix}.text"),
            &[("name", server_name), ("url", url)],
        ),
        preheader: t("preheader"),
        heading: t("heading"),
        intro: t("intro"),
        button_label: t("button"),
        code_note,
        code_label,
        footer: t("footer"),
    }
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// `{{> name}}` partials inline a trusted fragment verbatim; `{{token}}` values
/// are escaped. Partials first, so a fragment may itself carry value tokens. The
/// `code-note` partial is conditional: an empty `code_note` drops the block.
pub(crate) fn render_html(locale: &str, strings: &ResetStrings, server_name: &str, url: &str) -> String {
    let out = SKELETON
        .replace("{{> logo}}", FRAGMENT_LOGO.trim_end())
        .replace(
            "{{> code-note}}",
            if strings.code_note.is_empty() {
                ""
            } else {
                FRAGMENT_CODE_NOTE.trim_end()
            },
        );
    let name_span = format!(
        "<span style=\"color:#F4F3F0;font-weight:600;\">{}</span>",
        escape_html(server_name)
    );
    let code_span = format!(
        "<span style=\"color:#F4B642;font-weight:600;\">{}</span>",
        escape_html(&strings.code_label)
    );
    let intro = escape_html(&strings.intro).replace("{name}", &name_span);
    let code_note = escape_html(&strings.code_note).replace("{code}", &code_span);
    let url = escape_html(url);
    out
        .replace("{{lang}}", &escape_html(locale))
        .replace("{{subject}}", &escape_html(&strings.subject))
        .replace("{{preheader}}", &escape_html(&strings.preheader))
        .replace("{{heading}}", &escape_html(&strings.heading))
        .replace("{{intro}}", &intro)
        .replace("{{url}}", &url)
        .replace("{{buttonLabel}}", &escape_html(&strings.button_label))
        .replace("{{codeNote}}", &code_note)
        .replace("{{footer}}", &escape_html(&strings.footer))
        .replace("{{serverName}}", &escape_html(server_name))
}

/// Delivers via the operator's own SMTP server when configured, else reports
/// `manual`: the owner copies the link (and code, for a reset) by hand. The
/// kroma.tv relay returns as a third mode once server identity lands.
pub async fn send(settings: &Settings, email: &OutboundEmail) -> Result<&'static str, String> {
    if settings.get_bool("smtpEnabled", false) {
        return send_smtp(settings, email).await.map(|_| "smtp");
    }
    Ok("manual")
}

async fn send_smtp(settings: &Settings, email: &OutboundEmail) -> Result<(), String> {
    use lettre::{
        message::{Attachment, MultiPart, SinglePart},
        AsyncTransport, Message,
    };

    let strings = render_strings(email.kind, email.locale, &email.server_name, &email.url);
    let html = render_html(email.locale, &strings, &email.server_name, &email.url);

    // multipart/related: the alternative text+html pair, plus the logo as an
    // inline CID part, so the message is self-contained and no asset is hosted.
    let logo = Attachment::new_inline(LOGO_CID.to_string()).body(
        LOGO_PNG.to_vec(),
        "image/png".parse().map_err(|e| format!("logo mime: {e}"))?,
    );
    let msg = Message::builder()
        .from(smtp_from(settings)?.parse().map_err(|e| format!("from: {e}"))?)
        .to(email.to.parse().map_err(|e| format!("to: {e}"))?)
        .subject(strings.subject.clone())
        .multipart(
            MultiPart::related()
                .singlepart(SinglePart::plain(strings.text.clone()))
                .singlepart(SinglePart::html(html))
                .singlepart(logo),
        )
        .map_err(|e| e.to_string())?;

    smtp_transport(settings)?
        .send(msg)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// A short plain-text probe to the admin's own address, proving host, port,
/// TLS, auth and deliverability in one shot — the "Test" button of the Email
/// settings group. Deliberately not the skeleton: this diagnoses the channel,
/// not the template.
pub async fn send_test(settings: &Settings, to: &str, locale: &str) -> Result<(), String> {
    use lettre::{message::SinglePart, AsyncTransport, Message};

    let msg = Message::builder()
        .from(smtp_from(settings)?.parse().map_err(|e| format!("from: {e}"))?)
        .to(to.parse().map_err(|e| format!("to: {e}"))?)
        .subject(i18n::t(locale, "email.test.subject", &[]))
        .singlepart(SinglePart::plain(i18n::t(
            locale,
            "email.test.text",
            &[],
        )))
        .map_err(|e| e.to_string())?;

    smtp_transport(settings)?
        .send(msg)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn smtp_from(settings: &Settings) -> Result<String, String> {
    let from = settings.get_str("smtpFrom", "");
    if from.is_empty() {
        return Err("smtpFrom is empty".into());
    }
    Ok(from)
}

fn smtp_transport(
    settings: &Settings,
) -> Result<lettre::AsyncSmtpTransport<lettre::Tokio1Executor>, String> {
    use lettre::{AsyncSmtpTransport, Tokio1Executor};

    let host = settings.get_str("smtpHost", "");
    if host.is_empty() {
        return Err("smtpHost is empty".into());
    }
    let port = settings.get_i64("smtpPort", 587) as u16;
    let creds = lettre::transport::smtp::authentication::Credentials::new(
        settings.get_str("smtpUsername", ""),
        settings.get_str("smtpPassword", ""),
    );
    Ok(AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&host)
        .map_err(|e| e.to_string())?
        .port(port)
        .credentials(creds)
        .build())
}

#[cfg(test)]
mod tests {
    use kroma_db::testing::TempPool;
    use kroma_db::Pool;
    use serde_json::{json, Value};

    use super::*;

    fn strings() -> ResetStrings {
        render_strings(EmailKind::Reset, "fr", "Home", "https://x/reset?token=abc")
    }

    #[test]
    fn html_escapes_values_and_keeps_only_the_styled_tokens() {
        let mut s = strings();
        s.intro = "Sur {name} <script>alert(1)</script>.".to_string();
        let html = render_html("fr", &s, "Home <b>x</b>", "https://x/reset?token=a\"b");
        assert!(!html.contains("<script>"));
        assert!(html.contains("&lt;script&gt;"));
        assert!(html.contains("token=a&quot;b"));
        assert!(html.contains("<span style=\"color:#F4F3F0;font-weight:600;\">Home &lt;b&gt;x&lt;/b&gt;</span>"));
        assert!(html.contains("<span style=\"color:#F4B642;font-weight:600;\">code à 8 caractères</span>"));
    }

    #[test]
    fn html_expands_fragments_and_leaves_no_token_behind() {
        let html = render_html("fr", &strings(), "Home", "https://x/reset?token=abc");
        assert!(html.contains("cid:logo"));
        assert!(!html.contains("{{"));
        assert!(html.contains("#0A0A0C"));
        assert!(html.contains("#F4B642"));
        assert!(html.contains("https://x/reset?token=abc"));
    }

    #[test]
    fn a_verification_email_drops_the_code_note_block() {
        let s = render_strings(EmailKind::Verify, "fr", "Home", "https://x/verify-email?token=abc");
        assert!(s.code_note.is_empty());
        let html = render_html("fr", &s, "Home", "https://x/verify-email?token=abc");
        assert!(!html.contains("{{"));
        assert!(!html.contains("#1C1C22"));
        assert!(html.contains("cid:logo"));
    }

    #[test]
    fn strings_follow_the_recipient_locale() {
        let fr = render_strings(EmailKind::Reset, "fr", "Home", "https://x");
        let en = render_strings(EmailKind::Reset, "en", "Home", "https://x");
        assert!(fr.subject.starts_with("Réinitialisez"));
        assert!(en.subject.starts_with("Reset your password"));
        assert!(en.text.contains("https://x"));

        let fr = render_strings(EmailKind::Verify, "fr", "Home", "https://x");
        let en = render_strings(EmailKind::Verify, "en", "Home", "https://x");
        assert!(fr.subject.contains('·'));
        assert!(en.subject.contains("Home"));
        assert_ne!(fr.heading, en.heading);
    }

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

    #[tokio::test]
    async fn an_unconfigured_server_reports_manual_rather_than_failing() {
        let (_pool, settings) = settings();

        let mode = send(&settings, &outbound()).await.expect("a delivery mode");

        assert_eq!(mode, "manual");
    }

    #[tokio::test]
    async fn sending_without_a_from_address_names_the_missing_setting() {
        let (pool, settings) = settings();
        configure(
            &pool,
            &settings,
            &[("smtpEnabled", json!(true)), ("smtpHost", json!("localhost"))],
        );

        let err = send(&settings, &outbound()).await.expect_err("a refusal");

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

        let err = send(&settings, &outbound()).await.expect_err("a refusal");

        assert!(err.contains("smtpHost"), "{err}");
    }

    #[tokio::test]
    async fn an_unparseable_recipient_is_a_refusal_not_a_panic() {
        let (pool, settings) = settings();
        configure(
            &pool,
            &settings,
            &[
                ("smtpEnabled", json!(true)),
                ("smtpHost", json!("localhost")),
                ("smtpFrom", json!("kroma@example.test")),
            ],
        );
        let mut email = outbound();
        email.to = "not an address".to_string();

        let err = send(&settings, &email).await.expect_err("a refusal");

        assert!(err.starts_with("to:"), "{err}");
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

    fn outbound() -> OutboundEmail {
        OutboundEmail {
            to: "user@example.test".to_string(),
            locale: "fr",
            url: "https://x/reset?token=abc".to_string(),
            server_name: "Home".to_string(),
            kind: EmailKind::Reset,
        }
    }
}

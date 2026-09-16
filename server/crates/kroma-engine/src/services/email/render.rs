//! Every word of an account email, rendered here in the recipient's language
//! from the shared catalogs into the skeleton under `packages/core/assets/email/`.
//! The logo rides inside the message as a CID inline part: no asset is hosted.

use crate::i18n;

use super::EmailKind;

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
pub(super) const LOGO_PNG: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../packages/core/assets/email/logo.png"
));

/// The Content-ID the skeleton's `<img src="cid:…">` references.
pub(super) const LOGO_CID: &str = "logo";

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
        EmailKind::Consent => "email.consent",
    };
    let t = |key: &str| i18n::t(locale, &format!("{prefix}.{key}"), &[]);
    let (code_note, code_label) = match kind {
        EmailKind::Reset => (t("codeNote"), t("codeLabel")),
        EmailKind::Verify | EmailKind::Consent => (String::new(), String::new()),
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
pub fn render_html(locale: &str, strings: &ResetStrings, server_name: &str, url: &str) -> String {
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

#[cfg(test)]
mod tests {
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
    fn the_consent_email_links_only_to_the_relay_and_names_the_server() {
        let url = "https://mail.kroma.tv/confirm/v1.abc";
        let s = render_strings(EmailKind::Consent, "fr", "Home", url);
        let html = render_html("fr", &s, "Home", url);

        assert!(s.code_note.is_empty());
        assert!(s.text.contains(url));
        assert!(s.text.contains("Home"));
        assert!(html.contains(url));
        assert!(!html.contains("{{"));
        assert_eq!(html.matches("https://").count(), 2);
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
}

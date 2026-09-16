//! Delivery through the operator's own SMTP server.

use lettre::{
    message::{Attachment, MultiPart, SinglePart},
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};

use crate::i18n;
use crate::services::settings::Settings;

use super::render::{LOGO_CID, LOGO_PNG};
use super::Rendered;

pub(super) async fn send_smtp(
    settings: &Settings,
    to: &str,
    rendered: &Rendered,
) -> Result<(), String> {
    let logo = Attachment::new_inline(LOGO_CID.to_string()).body(
        LOGO_PNG.to_vec(),
        "image/png".parse().map_err(|e| format!("logo mime: {e}"))?,
    );
    let msg = Message::builder()
        .from(smtp_from(settings)?.parse().map_err(|e| format!("from: {e}"))?)
        .to(to.parse().map_err(|e| format!("to: {e}"))?)
        .subject(rendered.subject.clone())
        .multipart(
            MultiPart::related()
                .singlepart(SinglePart::plain(rendered.text.clone()))
                .singlepart(SinglePart::html(rendered.html.clone()))
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
/// TLS, auth and deliverability in one shot: the "Test" button of the Email
/// settings group. Deliberately not the skeleton: this diagnoses the channel,
/// not the template.
pub async fn send_test(settings: &Settings, to: &str, locale: &str) -> Result<(), String> {
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

fn smtp_transport(settings: &Settings) -> Result<AsyncSmtpTransport<Tokio1Executor>, String> {
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

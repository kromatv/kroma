//! Delivery through the operator's own SMTP server.

#![expect(
    clippy::disallowed_types,
    reason = "the SMTP client: deliver asks the egress gate before it dials and records its exchange"
)]

use std::time::Instant;

use kroma_http::address::WebTarget;
use kroma_http::egress::{self, Decision, Exchange, Outgoing, Route, Ruling, BLOCKED};
use lettre::{
    message::{Attachment, MultiPart, SinglePart},
    transport::smtp::{authentication::Credentials, response::Response, Error},
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};

use crate::i18n;
use crate::services::settings::Settings;

use super::render::{LOGO_CID, LOGO_PNG};
use super::{Rendered, PURPOSE};

const METHOD: &str = "SMTP";
const NO_PROXY: &str = "mail cannot be sent through a proxy";

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

    deliver(settings, msg).await
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

    deliver(settings, msg).await
}

fn smtp_from(settings: &Settings) -> Result<String, String> {
    let from = settings.get_str("smtpFrom", "");
    if from.is_empty() {
        return Err("smtpFrom is empty".into());
    }
    Ok(from)
}

async fn deliver(settings: &Settings, msg: Message) -> Result<(), String> {
    let host = settings.get_str("smtpHost", "");
    if host.is_empty() {
        return Err("smtpHost is empty".into());
    }
    let port = settings.get_i64("smtpPort", 587) as u16;
    let started = Instant::now();
    let Ruling { decision, rule } = egress::decide(&Outgoing {
        purpose: PURPOSE,
        method: METHOD,
        target: WebTarget {
            https: false,
            host: host.clone(),
            port,
        },
    });
    let mut exchange = Exchange {
        purpose: PURPOSE,
        method: METHOD,
        host,
        port,
        route: Route::Direct,
        status: None,
        bytes_in: 0,
        bytes_out: 0,
        duration_ms: 0,
        error: None,
        rule,
    };
    let refusal = match decision {
        Decision::Direct => None,
        Decision::Block(reason) => Some(reason),
        Decision::Proxy(_) => Some(NO_PROXY.to_string()),
    };
    let outcome = match refusal {
        Some(reason) => {
            exchange.route = Route::Blocked;
            Err(format!("{BLOCKED}: {reason}"))
        }
        None => {
            exchange.bytes_out = msg.formatted().len() as u64;
            let sent = send(settings, &exchange.host, port, msg).await;
            exchange.status = match &sent {
                Ok(response) => Some(response.code().into()),
                Err(error) => error.status().map(u16::from),
            };
            sent.map(|_| ()).map_err(|e| e.to_string())
        }
    };
    exchange.duration_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    exchange.error = outcome
        .as_ref()
        .err()
        .map(|e| egress::scrubbed(e, "", &exchange.host));
    egress::record(exchange);
    outcome
}

async fn send(settings: &Settings, host: &str, port: u16, msg: Message) -> Result<Response, Error> {
    let credentials = Credentials::new(
        settings.get_str("smtpUsername", ""),
        settings.get_str("smtpPassword", ""),
    );
    AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host)?
        .port(port)
        .credentials(credentials)
        .build()
        .send(msg)
        .await
}

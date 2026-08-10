//! Which browser origins this server answers to.
//!
//! A page open in a browser on the household's own network reaches this server
//! from inside it, so the address it arrives from vouches for nothing. What is
//! left to decide is who may READ the answer, and that is CORS.

use std::net::IpAddr;

use axum::extract::{Request, State};
use axum::http::{header, StatusCode, Uri};
use axum::middleware::Next;
use axum::response::Response;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};

use crate::api::error::json_error;
use crate::state::SharedState;

// KROMA's own televisions-in-a-browser client. An ordinary page on the web, and
// trusted for one reason: this project publishes it.
const OFFICIAL_CLIENTS: &[&str] = &["https://tv.kroma.tv"];

/// The CORS policy for the whole API. An origin that is not this machine, this
/// network, a shell loaded off a device or one the operator named is answered
/// without an `Access-Control-Allow-Origin`, so a page on the web can make the
/// request (it always could) but never read what came back.
pub fn cors(named: &[String]) -> CorsLayer {
    let named = named.to_vec();
    CorsLayer::new()
        .allow_methods(Any)
        .allow_headers(Any)
        .expose_headers(Any)
        .allow_origin(AllowOrigin::predicate(move |origin, _| {
            origin.to_str().is_ok_and(|origin| may_read(origin, &named))
        }))
}

// Where an origin leaves the caller: somewhere this install can point at, an
// origin that names nobody, or a page on the web.
enum Placement {
    Placed,
    Unplaceable,
    Refused,
}

/// Carried on every beacon request [`require_beacon_origin`] lets through, and
/// true when the origin named nobody. Such a beacon is granted only against the
/// check string printed on the television's own screen, which is the one thing
/// a page wearing the same origin has nowhere to print.
#[derive(Clone, Copy)]
pub struct ConfirmRequired(pub bool);

/// Keeps the beacon routes to callers this install can either place or hold to
/// a screen. Announcing hands back a secret that redeems an account the moment
/// somebody taps the row, so a page on the web is refused outright and an
/// origin that names nobody announces flagged.
///
/// A caller sending no `Origin` at all is a native client, not a page, and is
/// left alone.
pub async fn require_beacon_origin(
    State(state): State<SharedState>,
    mut req: Request,
    next: Next,
) -> Response {
    let placement = match req.headers().get(header::ORIGIN) {
        Some(origin) => origin
            .to_str()
            .map_or(Placement::Refused, |o| may_announce(o, &state.config.allowed_origins)),
        None => Placement::Placed,
    };
    if matches!(placement, Placement::Refused) {
        return json_error(StatusCode::FORBIDDEN, "this origin may not announce a device");
    }
    req.extensions_mut().insert(ConfirmRequired(matches!(placement, Placement::Unplaceable)));
    next.run(req).await
}

fn may_read(origin: &str, named: &[String]) -> bool {
    !matches!(may_announce(origin, named), Placement::Refused)
}

// `null` is what a current engine reports for a document loaded off the device,
// which is every packaged television shell, AND what any page on the web gets by
// sandboxing an iframe. Nothing in the request tells the two apart, so it is
// admitted and flagged rather than believed or refused; an operator who names it
// in `KROMA_ALLOWED_ORIGINS` has taken that risk back and it is placed like any
// other name.
fn may_announce(origin: &str, named: &[String]) -> Placement {
    let placed = named.iter().any(|entry| entry.eq_ignore_ascii_case(origin))
        || OFFICIAL_CLIENTS.iter().any(|client| client.eq_ignore_ascii_case(origin))
        || from_a_device(origin)
        || on_this_network(origin);
    match (placed, origin) {
        (true, _) => Placement::Placed,
        (false, "null") => Placement::Unplaceable,
        _ => Placement::Refused,
    }
}

// Every page on the web is at `http(s)://something`; a shell loaded from the
// device it runs on carries its own scheme (`file://`, `tauri://localhost`),
// which no page can present.
fn from_a_device(origin: &str) -> bool {
    origin.split_once("://").is_some_and(|(scheme, _)| {
        !scheme.eq_ignore_ascii_case("http") && !scheme.eq_ignore_ascii_case("https")
    })
}

fn on_this_network(origin: &str) -> bool {
    let Some(host) = host_of(origin) else {
        return false;
    };
    // RFC 6761 §6.3: `localhost` and anything under it resolve to loopback,
    // which is where a Tauri window on Windows lives (`http://tauri.localhost`).
    if host == "localhost" || host.ends_with(".localhost") {
        return true;
    }
    host.parse::<IpAddr>().is_ok_and(behind_one_router)
}

// An address nothing routes across the internet: whoever serves that page is
// already on this network, and needed no browser to reach the server.
fn behind_one_router(ip: IpAddr) -> bool {
    match ip.to_canonical() {
        IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local(),
        // fc00::/7 (unique local) and fe80::/10 (link local); stable std has
        // neither predicate.
        IpAddr::V6(v6) => {
            let head = v6.segments()[0];
            v6.is_loopback() || head & 0xfe00 == 0xfc00 || head & 0xffc0 == 0xfe80
        }
    }
}

fn host_of(origin: &str) -> Option<String> {
    let uri: Uri = origin.parse().ok()?;
    Some(uri.host()?.trim_start_matches('[').trim_end_matches(']').to_ascii_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOBODY_NAMED: &[String] = &[];

    fn read(origin: &str) -> bool {
        may_read(origin, NOBODY_NAMED)
    }

    fn placed(origin: &str) -> bool {
        matches!(may_announce(origin, NOBODY_NAMED), Placement::Placed)
    }

    fn refused(origin: &str) -> bool {
        matches!(may_announce(origin, NOBODY_NAMED), Placement::Refused)
    }

    #[test]
    fn a_page_on_the_web_may_neither_read_nor_announce() {
        for origin in [
            "https://evil.example",
            "http://evil.example:8080",
            "https://tv.kroma.tv.evil.example",
        ] {
            assert!(!read(origin), "{origin} could read");
            assert!(refused(origin), "{origin} could announce");
        }
    }

    #[test]
    fn a_sandboxed_page_and_a_packaged_shell_share_one_null() {
        assert!(read("null"), "a Samsung or LG set could not read its own answers");
        // Admitted, and flagged: nothing in the request separates the two, so
        // the grant asks for what only a real screen can show.
        assert!(matches!(may_announce("null", NOBODY_NAMED), Placement::Unplaceable));
    }

    #[test]
    fn a_shell_loaded_off_the_device_may_do_both() {
        for origin in ["file://", "tauri://localhost", "capacitor://localhost"] {
            assert!(read(origin), "{origin} could not read");
            assert!(placed(origin), "{origin} could not announce");
        }
    }

    #[test]
    fn this_machine_and_this_network_may_do_both() {
        for origin in [
            "http://localhost:5174",
            "http://127.0.0.1:3000",
            "http://[::1]:5175",
            "http://tauri.localhost",
            "http://192.168.1.20:5174",
            "http://10.8.0.4:5174",
            "http://[fd00::1]:5174",
        ] {
            assert!(read(origin), "{origin} could not read");
            assert!(placed(origin), "{origin} could not announce");
        }
    }

    #[test]
    fn a_public_address_is_not_this_network() {
        assert!(refused("http://203.0.113.7:4040"));
        assert!(refused("http://[2001:db8::1]:4040"));
    }

    #[test]
    fn the_official_client_is_trusted_where_a_lookalike_is_not() {
        assert!(placed("https://tv.kroma.tv"));
        assert!(refused("http://tv.kroma.tv"));
    }

    #[test]
    fn a_named_origin_may_do_both_however_it_is_written() {
        let named = vec!["https://kroma.example".to_string()];
        assert!(matches!(may_announce("https://KROMA.example", &named), Placement::Placed));
        assert!(may_read("https://kroma.example", &named));
        assert!(matches!(may_announce("https://other.example", &named), Placement::Refused));
    }

    #[test]
    fn naming_null_is_how_an_operator_takes_the_risk_back() {
        // Named, so it is placed outright and the grant asks for no check.
        let named = vec!["null".to_string()];
        assert!(matches!(may_announce("null", &named), Placement::Placed));
    }

    // An `Origin` header is whatever the caller wrote. One that names no host at
    // all must place nobody rather than fall through as "not an address I can
    // rule out", which is how a permissive default gets written by accident.
    #[test]
    fn an_origin_with_no_host_is_on_nobodys_network() {
        assert!(!on_this_network("http://"));
        assert!(!on_this_network("not an origin"));
        assert!(!on_this_network(""));
        assert!(refused("http://"));
    }
}

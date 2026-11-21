// Vite content-hashes every built asset, so hashed files are immutable (cache
// a year) while the shell and unhashed files revalidate. Without this the TV
// re-downloads the whole bundle on every app launch. `/api/*` is left untouched.
pub(super) async fn spa_cache_headers(
    req: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    use axum::http::{HeaderValue, header};

    let path = req.uri().path().to_string();
    let mut res = next.run(req).await;
    if path.starts_with("/api/") || res.headers().contains_key(header::CACHE_CONTROL) {
        return res;
    }
    let policy = if is_hashed_asset(&path) {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    res.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static(policy));
    res
}

pub(super) fn accepts_html(headers: &axum::http::HeaderMap) -> bool {
    headers
        .get(axum::http::header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.contains("text/html"))
}

// A Vite content-hashed asset (`Poster-BKMFTghM.js`, `assets/index-DXQwrN_7.css`,
// `cast-B6-ecRbX.js`): a `-<hash>` stem suffix and a non-HTML extension. The hash
// is base64url, so it may itself hold a `-`.
fn is_hashed_asset(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or("");
    if name.ends_with(".html") {
        return false;
    }
    let Some((stem, _ext)) = name.rsplit_once('.') else {
        return false;
    };
    let plain = stem.rsplit_once('-').is_some_and(|(_, h)| {
        h.len() >= HASH_LEN && h.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
    });
    plain || ends_in_base64url_hash(stem.as_bytes())
}

const HASH_LEN: usize = 8;

fn ends_in_base64url_hash(stem: &[u8]) -> bool {
    let Some(sep) = stem.len().checked_sub(HASH_LEN + 1) else {
        return false;
    };
    let hash = &stem[sep + 1..];
    stem[sep] == b'-'
        && hash
            .iter()
            .all(|&b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        && hash
            .iter()
            .any(|&b| b.is_ascii_uppercase() || b.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};
    use axum::http::StatusCode;

    use super::*;
    use crate::api::test_support::{raw, test_app_with_web};

    const NAVIGATION: &[(&str, &str)] = &[("accept", "text/html,application/xhtml+xml,*/*;q=0.8")];

    #[tokio::test]
    async fn a_client_side_route_falls_back_to_the_spa_shell_without_shadowing_the_api() {
        let t = test_app_with_web(&[
            ("_shell.html", "<!doctype html><title>KROMA</title>"),
            ("assets/index-DXQwrN_7.js", "console.log(1)"),
        ]);

        let (status, headers, _) =
            raw(&t.app, "GET", "/assets/index-DXQwrN_7.js", None, None, &[]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            headers[CACHE_CONTROL],
            "public, max-age=31536000, immutable"
        );

        let (status, headers, _) = raw(&t.app, "GET", "/movies", None, None, NAVIGATION).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(headers[CONTENT_TYPE], "text/html");
        assert_eq!(headers[CACHE_CONTROL], "no-cache");

        let (status, body) = crate::api::test_support::get(&t.app, "/api/auth/config", None).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.get("hasAccounts").is_some(), "{body}");
    }

    #[tokio::test]
    async fn a_missing_file_that_is_not_a_page_navigation_is_not_found() {
        let t = test_app_with_web(&[("_shell.html", "<!doctype html><title>KROMA</title>")]);

        for path in [
            "/robots.txt",
            "/llms.txt",
            "/.well-known/ard.json",
            "/assets/gone-DXQwrN_7.js",
        ] {
            let (status, _, _) = raw(&t.app, "GET", path, None, None, &[("accept", "*/*")]).await;

            assert_eq!(status, StatusCode::NOT_FOUND, "{path}");
        }
    }

    #[test]
    fn only_a_content_hashed_asset_may_be_cached_forever() {
        assert!(is_hashed_asset("/assets/index-DXQwrN_7.css"));
        assert!(is_hashed_asset("/assets/Poster-BKMFTghM.js"));
        assert!(!is_hashed_asset("/index.html"));
        assert!(!is_hashed_asset("/assets/entry-BKMFTghM.html"));
        assert!(!is_hashed_asset("/movies"));
        assert!(!is_hashed_asset("/favicon.ico"));
        assert!(!is_hashed_asset("/assets/logo-dark.svg"));
    }

    #[test]
    fn a_hash_holding_a_dash_is_still_a_content_hash() {
        assert!(is_hashed_asset("/assets/cast-B6-ecRbX.js"));
        assert!(is_hashed_asset("/assets/ui-L_FT-_o-.js"));
        assert!(is_hashed_asset("/assets/nav-UvXRyM2-.js"));
        assert!(is_hashed_asset("/assets/use-focus-ring-DTxN-gJP.js"));
        assert!(!is_hashed_asset("/assets/sun-and-moon.svg"));
        assert!(!is_hashed_asset("/assets/x-ab.js"));
    }
}

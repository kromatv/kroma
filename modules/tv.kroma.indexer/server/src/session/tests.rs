use super::*;

#[test]
fn jar_path_is_sanitized_and_stable() {
    let dir = Path::new("/data");
    let a = cookie_jar_path(dir, "torrent-leech");
    assert_eq!(a, cookie_jar_path(dir, "torrent-leech"));
    assert_eq!(a, Path::new("/data/indexers/torrent_leech.cookies"));
}

#[test]
fn flaresolverr_request_shape() {
    let body = flaresolverr_body("request.get", "https://x.to/s?q=a", None);
    assert_eq!(body["cmd"], "request.get");
    assert_eq!(body["url"], "https://x.to/s?q=a");
    assert_eq!(body["maxTimeout"], 60000);
    assert!(body.get("postData").is_none());
    let post = flaresolverr_body("request.post", "https://x.to/login", Some("u=a&p=b".into()));
    assert_eq!(post["postData"], "u=a&p=b");
}

#[test]
fn append_query_and_form_encode() {
    let q = vec![
        ("q".to_string(), "the matrix".to_string()),
        ("cat".to_string(), "1,2".to_string()),
    ];
    assert_eq!(
        append_query("https://x/a", &q),
        "https://x/a?q=the%20matrix&cat=1%2C2"
    );
    assert_eq!(
        append_query("https://x/a?p=1", &q),
        "https://x/a?p=1&q=the%20matrix&cat=1%2C2"
    );
    assert_eq!(append_query("https://x/a", &[]), "https://x/a");
}

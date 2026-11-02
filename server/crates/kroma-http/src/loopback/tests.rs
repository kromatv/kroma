use super::*;

#[derive(Debug)]
struct Stub(&'static str);

impl Transport for Stub {
    fn name(&self) -> &'static str {
        "stub"
    }

    fn accepts(&self, url: &str) -> bool {
        url.starts_with(self.0)
    }

    fn send(&self, request: &Request<'_>) -> Result<Response> {
        Ok(Response {
            status: 200,
            headers: vec![("x-transport".into(), self.name().into())],
            body: format!("{} {}", request.method.as_str(), request.url).into_bytes(),
        })
    }
}

#[test]
fn a_url_no_transport_claims_is_an_error_naming_it() {
    let err = Loopback::new()
        .get("http://example.com/_port/x")
        .unwrap_err()
        .to_string();
    assert!(err.contains("example.com"), "{err}");
}

#[test]
fn a_registered_transport_takes_the_urls_it_claims() {
    register(Arc::new(Stub("stub://")));

    let resp = Loopback::new().get("stub://peer/_port/x").unwrap();

    assert_eq!(resp.status, 200);
    assert_eq!(resp.header("x-transport"), Some("stub"));
    assert_eq!(resp.text(), "GET stub://peer/_port/x");
}

#[test]
fn a_post_carries_its_query_rather_than_dropping_it() {
    register(Arc::new(Stub("stub://")));

    let resp = Loopback::new()
        .query("id", "a b")
        .post_json("stub://peer/_port/x", &serde_json::json!({}))
        .unwrap();

    assert_eq!(resp.text(), "POST stub://peer/_port/x?id=a+b");
}

#[test]
fn a_query_goes_before_a_fragment_rather_than_inside_it() {
    let call = Loopback::new().query("k", "v");
    assert_eq!(
        call.with_query("http://127.0.0.1:9/x#frag"),
        "http://127.0.0.1:9/x?k=v#frag"
    );
}

#[test]
fn a_query_is_form_encoded_onto_the_url() {
    let call = Loopback::new()
        .query("q", "the matrix")
        .query("cat", "2000&2010");

    assert_eq!(
        call.with_query("http://127.0.0.1:9/search"),
        "http://127.0.0.1:9/search?q=the+matrix&cat=2000%262010"
    );
}

#[test]
fn a_url_that_already_carries_a_query_gains_the_pairs_rather_than_a_second_question_mark() {
    let call = Loopback::new().query("key", "a b");
    assert_eq!(
        call.with_query("http://127.0.0.1:9/setting?scope=x"),
        "http://127.0.0.1:9/setting?scope=x&key=a+b"
    );
    assert_eq!(
        Loopback::new().with_query("http://127.0.0.1:9/setting"),
        "http://127.0.0.1:9/setting"
    );
}

#[test]
fn the_builder_accumulates_headers_and_a_budget() {
    let call = Loopback::new()
        .header("authorization", "Bearer tok")
        .header("x-extra", "1")
        .max_time(5);
    assert_eq!(call.headers.len(), 2);
    assert_eq!(call.max_time_secs, 5);
    assert_eq!(Loopback::new().max_time_secs, DEFAULT_MAX_TIME_SECS);
}

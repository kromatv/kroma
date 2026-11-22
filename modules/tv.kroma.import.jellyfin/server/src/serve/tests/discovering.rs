use super::*;

struct OneServerAnswers;

impl Lan for OneServerAnswers {
    fn ask(
        &self,
        _to: std::net::SocketAddr,
        _message: &[u8],
        _wait: std::time::Duration,
    ) -> std::io::Result<Vec<kroma_lan_probe::Answer>> {
        let answer = br#"{"Address":"http://192.168.1.2:8096","Id":"srv","Name":"Den"}"#;
        Ok(vec![("192.168.1.2:7359".parse().unwrap(), answer.to_vec())])
    }
}

#[tokio::test]
async fn discover_answers_the_servers_found_on_the_network() {
    let host = StubHost::with_db("import-jellyfin-discover");
    let app = routes_reaching::<StubHost>(Reach {
        web: Arc::new(Recorded::jellyfin()),
        lan: Arc::new(OneServerAnswers),
        dialect: &JELLYFIN,
    })
    .with_state(host);

    let (status, answer) = post(&app, "discover", &json!({ "waitMs": 500 })).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        answer,
        json!({ "Ok": { "servers": [{ "id": "srv", "name": "Den", "address": "http://192.168.1.2:8096" }] } })
    );
}

use super::*;

fn found(servers: Value) -> Value {
    json!({ "Ok": { "servers": servers } })
}

fn den() -> Value {
    json!({ "id": "srv", "name": "Den", "address": "http://192.168.1.2:8096" })
}

#[test]
fn discover_asks_the_importer_for_the_servers_it_finds_within_a_short_wait() {
    let (importers, sent) = answering(found(json!([den()])));

    let servers = importers.discover(IMPORTER);

    assert_eq!(
        servers,
        Ok(vec![Server {
            id: "srv".to_string(),
            name: "Den".to_string(),
            address: Some("http://192.168.1.2:8096".to_string()),
        }])
    );
    assert_eq!(sent_once(&sent), ("discover".to_string(), json!({ "waitMs": 1500 })));
}

#[test]
fn an_answer_past_32_servers_is_unreadable() {
    let many: Vec<Value> = (0..33)
        .map(|n| json!({ "id": format!("srv-{n}"), "name": "Den", "address": "http://10.0.0.2:8096" }))
        .collect();
    let (importers, _) = answering(found(Value::Array(many)));

    let servers = importers.discover(IMPORTER);

    assert!(matches!(servers, Err(Unanswered::Unreadable(_))), "{servers:?}");
}

#[test]
fn a_found_server_without_an_id_or_a_plain_web_address_is_unreadable() {
    let answers = [
        json!([{ "id": "", "name": "Den", "address": "http://10.0.0.2:8096" }]),
        json!([{ "id": "srv", "name": "Den" }]),
        json!([{ "id": "srv", "name": "Den", "address": "javascript:alert(1)" }]),
        json!([{ "id": "srv", "name": "Den", "address": "http://10.0.0.2:8096 x" }]),
    ];

    let refused: Vec<_> = answers
        .into_iter()
        .map(|servers| answering(found(servers)).0.discover(IMPORTER))
        .collect();

    assert!(
        refused.iter().all(|answer| matches!(answer, Err(Unanswered::Unreadable(_)))),
        "{refused:?}"
    );
}

#[test]
fn an_importer_that_finds_nothing_answers_no_server() {
    let (importers, _) = answering(found(json!([])));

    let servers = importers.discover(IMPORTER);

    assert_eq!(servers, Ok(Vec::new()));
}

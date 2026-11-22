use std::sync::Mutex;
use std::time::Duration;

use kroma_lan_probe::Answer;

use super::*;

use crate::dialect::{EMBY, JELLYFIN};

struct Heard {
    answers: Vec<(SocketAddr, &'static str)>,
    asked: Mutex<Vec<(SocketAddr, Vec<u8>, Duration)>>,
}

impl Heard {
    fn answering(answers: &[(&str, &'static str)]) -> Self {
        Self {
            answers: answers
                .iter()
                .map(|(from, text)| (from.parse().unwrap(), *text))
                .collect(),
            asked: Mutex::default(),
        }
    }
}

impl Lan for Heard {
    fn ask(&self, to: SocketAddr, message: &[u8], wait: Duration) -> std::io::Result<Vec<Answer>> {
        self.asked.lock().unwrap().push((to, message.to_vec(), wait));
        Ok(self
            .answers
            .iter()
            .map(|(from, text)| (*from, text.as_bytes().to_vec()))
            .collect())
    }
}

const LIVING_ROOM: &str =
    r#"{"Address":"http://192.168.1.2:8096","Id":"5f2c1d3e4b6a4c8e9d0f1a2b3c4d5e6f","Name":"Living room","EndpointAddress":null}"#;

fn found(lan: &Heard, dialect: &Dialect) -> Vec<Server> {
    discover(lan, dialect, &DiscoverAsk::default()).unwrap().servers
}

#[test]
fn a_jellyfin_discovery_is_its_question_broadcast_on_7359() {
    let lan = Heard::answering(&[]);

    found(&lan, &JELLYFIN);

    let asked = lan.asked.lock().unwrap();
    assert_eq!(asked[0].0, "255.255.255.255:7359".parse().unwrap());
    assert_eq!(asked[0].1, b"who is JellyfinServer?");
}

#[test]
fn an_emby_discovery_asks_for_emby() {
    let lan = Heard::answering(&[]);

    found(&lan, &EMBY);

    assert_eq!(lan.asked.lock().unwrap()[0].1, b"who is EmbyServer?");
}

#[test]
fn a_server_that_answers_is_found_by_its_id_and_name() {
    let lan = Heard::answering(&[("192.168.1.2:7359", LIVING_ROOM)]);

    let servers = found(&lan, &JELLYFIN);

    assert_eq!(
        servers,
        [Server {
            id: "5f2c1d3e4b6a4c8e9d0f1a2b3c4d5e6f".to_string(),
            name: "Living room".to_string(),
            address: "http://192.168.1.2:8096".to_string(),
        }]
    );
}

#[test]
fn the_address_is_the_one_the_answer_came_from_with_the_port_it_names() {
    let lying = r#"{"Address":"https://elsewhere.example:8920/jellyfin","Id":"abc","Name":"Den"}"#;
    let lan = Heard::answering(&[("192.168.1.7:7359", lying)]);

    let servers = found(&lan, &JELLYFIN);

    assert_eq!(servers[0].address, "https://192.168.1.7:8920");
}

#[test]
fn an_answer_from_another_port_or_without_an_id_is_not_a_server() {
    let lan = Heard::answering(&[
        ("192.168.1.2:40000", LIVING_ROOM),
        ("192.168.1.3:7359", r#"{"Address":"http://192.168.1.3:8096","Name":"No id"}"#),
        ("192.168.1.4:7359", "not json"),
        ("192.168.1.5:7359", r#"{"Address":"ftp://192.168.1.5","Id":"ftp"}"#),
    ]);

    let servers = found(&lan, &JELLYFIN);

    assert!(servers.is_empty(), "{servers:?}");
}

#[test]
fn a_server_that_answers_twice_is_found_once() {
    let lan = Heard::answering(&[("192.168.1.2:7359", LIVING_ROOM), ("10.0.0.2:7359", LIVING_ROOM)]);

    let servers = found(&lan, &JELLYFIN);

    assert_eq!(servers.len(), 1);
}

#[test]
fn a_server_with_no_name_is_named_by_its_address() {
    let lan = Heard::answering(&[("192.168.1.2:7359", r#"{"Address":"http://x:8096","Id":"abc"}"#)]);

    let servers = found(&lan, &JELLYFIN);

    assert_eq!(servers[0].name, "192.168.1.2:8096");
}

#[test]
fn the_wait_asked_for_is_held_to_three_seconds() {
    let lan = Heard::answering(&[]);

    discover(&lan, &JELLYFIN, &DiscoverAsk { wait_ms: Some(60_000) }).unwrap();

    assert_eq!(lan.asked.lock().unwrap()[0].2, Duration::from_secs(3));
}

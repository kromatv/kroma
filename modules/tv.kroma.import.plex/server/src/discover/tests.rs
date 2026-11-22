use std::sync::Mutex;
use std::time::Duration;

use kroma_lan_probe::Answer;

use super::*;

struct Heard {
    answers: Vec<(SocketAddr, String)>,
    asked: Mutex<Vec<(SocketAddr, Vec<u8>)>>,
}

impl Heard {
    fn answering(answers: &[(&str, &str)]) -> Self {
        Self {
            answers: answers
                .iter()
                .map(|(from, text)| (from.parse().unwrap(), text.replace('\n', "\r\n")))
                .collect(),
            asked: Mutex::default(),
        }
    }
}

impl Lan for Heard {
    fn ask(&self, to: SocketAddr, question: &[u8], _wait: Duration) -> std::io::Result<Vec<Answer>> {
        self.asked.lock().unwrap().push((to, question.to_vec()));
        Ok(self
            .answers
            .iter()
            .map(|(from, text)| (*from, text.as_bytes().to_vec()))
            .collect())
    }
}

const LIVING_ROOM: &str = "HTTP/1.0 200 OK
Content-Type: plex/media-server
Resource-Identifier: 646ab0aa8a01c543e94ba975f6fd6efadc36b7
Name: Living room
Port: 32400
Host: 53f4b5b6023d41182fe88a99b0e714ba.plex.direct
Updated-At: 1585769946
Version: 1.18.8.2527-740d4c206
";

fn found(lan: &Heard) -> Vec<ServerRef> {
    discover(lan, &DiscoverAsk::default()).unwrap().servers
}

#[test]
fn a_search_is_gdms_m_search_sent_to_its_multicast_group() {
    let lan = Heard::answering(&[]);

    found(&lan);

    assert_eq!(
        lan.asked.lock().unwrap()[0],
        ("239.0.0.250:32414".parse().unwrap(), b"M-SEARCH * HTTP/1.0".to_vec())
    );
}

#[test]
fn a_server_that_answers_is_found_at_its_address_and_port() {
    let lan = Heard::answering(&[("192.168.1.2:32414", LIVING_ROOM)]);

    let servers = found(&lan);

    assert_eq!(
        servers,
        [ServerRef {
            id: "646ab0aa8a01c543e94ba975f6fd6efadc36b7".to_string(),
            name: "Living room".to_string(),
            address: Some("http://192.168.1.2:32400".to_string()),
        }]
    );
}

#[test]
fn a_player_another_port_or_a_refusal_is_not_a_server() {
    let player = LIVING_ROOM.replace("plex/media-server", "plex/media-player");
    let refused = LIVING_ROOM.replace("200 OK", "404 Not Found");
    let lan = Heard::answering(&[
        ("192.168.1.3:32414", player.as_str()),
        ("192.168.1.4:40000", LIVING_ROOM),
        ("192.168.1.5:32414", refused.as_str()),
        ("192.168.1.6:32414", "HTTP/1.0 200 OK\nContent-Type: plex/media-server\nPort: 32400\n"),
    ]);

    let servers = found(&lan);

    assert!(servers.is_empty(), "{servers:?}");
}

#[test]
fn a_server_that_answers_twice_is_found_once_and_one_with_no_name_by_its_address() {
    let unnamed = LIVING_ROOM
        .replace("Name: Living room\n", "")
        .replace("646ab0aa", "746ab0aa");
    let lan = Heard::answering(&[
        ("192.168.1.2:32414", LIVING_ROOM),
        ("192.168.1.2:32414", LIVING_ROOM),
        ("192.168.1.9:32414", unnamed.as_str()),
    ]);

    let servers = found(&lan);

    let names: Vec<&str> = servers.iter().map(|server| server.name.as_str()).collect();
    assert_eq!(names, ["Living room", "192.168.1.9:32400"]);
}

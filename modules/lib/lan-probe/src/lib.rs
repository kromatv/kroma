//! One question asked of the local network: a datagram sent to a broadcast
//! address or a multicast group, and every datagram that answers it before a
//! wait runs out. In a component the host rules both the question and each
//! answer against the module's `net.connect`, so a module declares the port
//! with `"proto": ["udp"]`.

use std::io::{self, ErrorKind};
use std::net::{Ipv4Addr, SocketAddr, UdpSocket};
use std::time::{Duration, Instant};

const LARGEST_ANSWER: usize = 4096;
const MOST_ANSWERS: usize = 32;
const DEFAULT_WAIT: Duration = Duration::from_millis(1500);
const LONGEST_WAIT: Duration = Duration::from_secs(3);

/// The wait a caller asked for, in milliseconds: a second and a half when it
/// named none, and never more than three seconds.
pub fn waited(asked_ms: Option<u32>) -> Duration {
    asked_ms
        .map_or(DEFAULT_WAIT, |ms| Duration::from_millis(ms.into()))
        .min(LONGEST_WAIT)
}

/// One datagram that answered, and the address and port it came from.
pub type Answer = (SocketAddr, Vec<u8>);

/// Where a question goes out and its answers come back.
pub trait Lan: Send + Sync {
    /// Send `question` to `to`, then keep each answer, 32 at most, until
    /// `wait` runs out.
    fn ask(&self, to: SocketAddr, question: &[u8], wait: Duration) -> io::Result<Vec<Answer>>;
}

/// The local network, through one UDP socket on an ephemeral port.
pub struct Udp;

impl Lan for Udp {
    fn ask(&self, to: SocketAddr, question: &[u8], wait: Duration) -> io::Result<Vec<Answer>> {
        let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))?;
        socket.send_to(question, to)?;
        let deadline = Instant::now() + wait;
        let mut heard = Vec::new();
        let mut buffer = [0u8; LARGEST_ANSWER];
        while heard.len() < MOST_ANSWERS {
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                break;
            }
            socket.set_read_timeout(Some(left))?;
            match socket.recv_from(&mut buffer) {
                Ok((read, from)) => heard.push((from, buffer[..read].to_vec())),
                Err(error) if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => break,
                Err(error) => return Err(error),
            }
        }
        Ok(heard)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn answering(answers: usize) -> SocketAddr {
        let peer = UdpSocket::bind("127.0.0.1:0").unwrap();
        let address = peer.local_addr().unwrap();
        std::thread::spawn(move || {
            let mut question = [0u8; 64];
            if let Ok((_, from)) = peer.recv_from(&mut question) {
                for answer in 0..answers {
                    let _ = peer.send_to(format!("answer {answer}").as_bytes(), from);
                }
            }
        });
        address
    }

    #[test]
    fn every_answer_that_comes_back_before_the_wait_runs_out_is_kept() {
        let peer = answering(2);

        let heard = Udp.ask(peer, b"who is there?", Duration::from_millis(500)).unwrap();

        assert_eq!(
            heard,
            [(peer, b"answer 0".to_vec()), (peer, b"answer 1".to_vec())]
        );
    }

    #[test]
    fn a_question_nobody_answers_comes_back_empty_once_the_wait_runs_out() {
        let peer = answering(0);
        let asked = Instant::now();

        let heard = Udp.ask(peer, b"who is there?", Duration::from_millis(200)).unwrap();

        assert!(heard.is_empty());
        assert!(asked.elapsed() >= Duration::from_millis(200));
    }

    #[test]
    fn a_wait_is_a_second_and_a_half_unless_asked_and_never_past_three_seconds() {
        let waits = [waited(None), waited(Some(200)), waited(Some(60_000))];

        assert_eq!(
            waits,
            [Duration::from_millis(1500), Duration::from_millis(200), Duration::from_secs(3)]
        );
    }

    #[test]
    fn at_most_32_answers_are_kept() {
        let peer = answering(40);

        let heard = Udp.ask(peer, b"who is there?", Duration::from_secs(2)).unwrap();

        assert_eq!(heard.len(), 32);
    }
}

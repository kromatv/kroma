use std::net::{Ipv4Addr, Ipv6Addr};

use tokio::net::TcpListener;
use tokio::task::JoinHandle;

use super::*;

#[derive(Clone)]
struct Answers {
    method: Option<u8>,
    auth: u8,
    reply: u8,
    bound: Vec<u8>,
}

impl Default for Answers {
    fn default() -> Self {
        Self {
            method: None,
            auth: 0x00,
            reply: 0x00,
            bound: vec![ATYP_V4, 0, 0, 0, 0, 0, 0],
        }
    }
}

#[derive(Debug, Default)]
struct Seen {
    methods: Vec<u8>,
    credentials: Option<(String, String)>,
    target: Vec<u8>,
}

async fn read_short<S: AsyncReadExt + Unpin>(stream: &mut S) -> String {
    let len = stream.read_u8().await.unwrap();
    let mut bytes = vec![0u8; usize::from(len)];
    stream.read_exact(&mut bytes).await.unwrap();
    String::from_utf8(bytes).unwrap()
}

async fn proxy(answers: Answers) -> (Upstream, JoinHandle<Seen>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap().to_string();
    let serving = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut seen = Seen::default();

        let mut head = [0u8; 2];
        stream.read_exact(&mut head).await.unwrap();
        seen.methods = vec![0u8; usize::from(head[1])];
        stream.read_exact(&mut seen.methods).await.unwrap();
        let method = answers.method.unwrap_or(seen.methods[0]);
        stream.write_all(&[VERSION, method]).await.unwrap();
        if method != seen.methods[0] {
            return seen;
        }
        if method == USER_PASSWORD {
            assert_eq!(stream.read_u8().await.unwrap(), AUTH_VERSION);
            let username = read_short(&mut stream).await;
            let password = read_short(&mut stream).await;
            seen.credentials = Some((username, password));
            stream
                .write_all(&[AUTH_VERSION, answers.auth])
                .await
                .unwrap();
            if answers.auth != 0x00 {
                return seen;
            }
        }

        let mut request = [0u8; 4];
        stream.read_exact(&mut request).await.unwrap();
        seen.target.push(request[3]);
        let len = match request[3] {
            ATYP_V4 => 4,
            ATYP_V6 => 16,
            _ => {
                let len = stream.read_u8().await.unwrap();
                seen.target.push(len);
                usize::from(len)
            }
        };
        let mut rest = vec![0u8; len + 2];
        stream.read_exact(&mut rest).await.unwrap();
        seen.target.extend(rest);

        let mut reply = vec![VERSION, answers.reply, 0x00];
        reply.extend(&answers.bound);
        let _ = stream.write_all(&reply).await;
        let _ = stream.write_all(b"hello").await;
        seen
    });
    let upstream = Upstream {
        address,
        credentials: None,
    };
    (upstream, serving)
}

fn named(name: &str, port: u16) -> Vec<u8> {
    let mut target = vec![ATYP_NAME, name.len() as u8];
    target.extend_from_slice(name.as_bytes());
    target.extend_from_slice(&port.to_be_bytes());
    target
}

async fn first_bytes(mut stream: TcpStream) -> [u8; 5] {
    let mut relayed = [0u8; 5];
    stream.read_exact(&mut relayed).await.unwrap();
    relayed
}

#[tokio::test]
async fn a_name_is_handed_to_the_upstream_to_resolve_without_credentials() {
    let (upstream, serving) = proxy(Answers::default()).await;
    let host = Host::Name("tracker.invalid".into());

    let stream = connect(&upstream, &host, 443).await.unwrap();

    assert_eq!(&first_bytes(stream).await, b"hello");
    let seen = serving.await.unwrap();
    assert_eq!(seen.methods, [NO_AUTH]);
    assert_eq!(seen.credentials, None);
    assert_eq!(seen.target, named("tracker.invalid", 443));
}

#[tokio::test]
async fn the_upstream_credentials_are_presented_before_the_destination() {
    let (mut upstream, serving) = proxy(Answers::default()).await;
    upstream.credentials = Some(("kroma".into(), "s3cret".into()));

    connect(&upstream, &Host::Name("tracker.invalid".into()), 80)
        .await
        .unwrap();

    let seen = serving.await.unwrap();
    assert_eq!(seen.methods, [USER_PASSWORD]);
    assert_eq!(seen.credentials, Some(("kroma".into(), "s3cret".into())));
    assert_eq!(seen.target, named("tracker.invalid", 80));
}

#[tokio::test]
async fn an_address_is_sent_as_an_address_of_its_family() {
    let v4 = Ipv4Addr::new(198, 51, 100, 7);
    let (upstream, serving) = proxy(Answers::default()).await;
    connect(&upstream, &Host::Ip(v4.into()), 6881)
        .await
        .unwrap();
    let mut expected = vec![ATYP_V4];
    expected.extend_from_slice(&v4.octets());
    expected.extend_from_slice(&6881u16.to_be_bytes());
    assert_eq!(serving.await.unwrap().target, expected);

    let (upstream, serving) = proxy(Answers::default()).await;
    connect(&upstream, &Host::Ip(Ipv6Addr::LOCALHOST.into()), 6881)
        .await
        .unwrap();
    let mut expected = vec![ATYP_V6];
    expected.extend_from_slice(&Ipv6Addr::LOCALHOST.octets());
    expected.extend_from_slice(&6881u16.to_be_bytes());
    assert_eq!(serving.await.unwrap().target, expected);
}

#[tokio::test]
async fn an_upstream_that_picks_another_method_is_refused() {
    let (upstream, _serving) = proxy(Answers {
        method: Some(USER_PASSWORD),
        ..Answers::default()
    })
    .await;

    let refused = connect(&upstream, &Host::Name("tracker.invalid".into()), 443)
        .await
        .unwrap_err();

    assert_eq!(
        refused.to_string(),
        "the upstream proxy refused the authentication method"
    );
}

#[tokio::test]
async fn credentials_the_upstream_refuses_fail_the_connection() {
    let (mut upstream, _serving) = proxy(Answers {
        auth: 0x01,
        ..Answers::default()
    })
    .await;
    upstream.credentials = Some(("kroma".into(), "wrong".into()));

    let refused = connect(&upstream, &Host::Name("tracker.invalid".into()), 443)
        .await
        .unwrap_err();

    assert_eq!(
        refused.to_string(),
        "the upstream proxy refused the credentials"
    );
}

#[tokio::test]
async fn a_failure_reply_names_the_destination_and_the_code() {
    let (upstream, _serving) = proxy(Answers {
        reply: 0x05,
        ..Answers::default()
    })
    .await;

    let refused = connect(&upstream, &Host::Name("tracker.invalid".into()), 443)
        .await
        .unwrap_err();

    assert_eq!(
        refused.to_string(),
        "the upstream proxy could not reach tracker.invalid:443 (reply 5)"
    );
}

#[tokio::test]
async fn a_bound_address_of_any_family_is_read_past_before_relaying() {
    let mut v6 = vec![ATYP_V6];
    v6.extend_from_slice(&[0u8; 18]);
    let mut name = vec![ATYP_NAME, 4];
    name.extend_from_slice(b"exit\x00\x50");

    for bound in [v6, name] {
        let (upstream, _serving) = proxy(Answers {
            bound,
            ..Answers::default()
        })
        .await;

        let stream = connect(&upstream, &Host::Name("tracker.invalid".into()), 443)
            .await
            .unwrap();

        assert_eq!(&first_bytes(stream).await, b"hello");
    }
}

#[tokio::test]
async fn an_unknown_bound_address_type_is_refused() {
    let (upstream, _serving) = proxy(Answers {
        bound: vec![0x09],
        ..Answers::default()
    })
    .await;

    let refused = connect(&upstream, &Host::Name("tracker.invalid".into()), 443)
        .await
        .unwrap_err();

    assert_eq!(
        refused.to_string(),
        "the upstream proxy answered an unknown address type 9"
    );
}

#[tokio::test]
async fn an_upstream_that_is_not_listening_says_where_it_was_looked_for() {
    let upstream = Upstream {
        address: "127.0.0.1:1".into(),
        credentials: None,
    };

    let refused = connect(&upstream, &Host::Name("tracker.invalid".into()), 443)
        .await
        .unwrap_err();

    assert_eq!(
        refused.to_string(),
        "reach the upstream proxy at 127.0.0.1:1"
    );
}

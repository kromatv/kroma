use tokio::io::{duplex, AsyncWriteExt, DuplexStream};

use super::*;

async fn caller_sent(bytes: &[u8]) -> (DuplexStream, DuplexStream) {
    let (mut caller, gateway) = duplex(256);
    caller.write_all(bytes).await.unwrap();
    (caller, gateway)
}

#[tokio::test]
async fn a_greeting_of_another_socks_version_is_refused() {
    let (_caller, mut stream) = caller_sent(&[0x04, 1, USER_PASSWORD]).await;

    let refused = accept_credentials(&mut stream).await.err().unwrap();

    assert_eq!(refused.to_string(), "not a SOCKS5 greeting");
}

#[tokio::test]
async fn a_negotiation_of_another_version_is_refused() {
    let (_caller, mut stream) = caller_sent(&[VERSION, 1, USER_PASSWORD, 0x09, 0, 0]).await;

    let refused = accept_credentials(&mut stream).await.err().unwrap();

    assert_eq!(refused.to_string(), "not a username/password negotiation");
}

#[tokio::test]
async fn a_request_of_another_socks_version_is_refused() {
    let mut request: &[u8] = &[0x04, CONNECT, 0, ATYP_V4, 1, 2, 3, 4, 0, 80];

    let refused = read_connect(&mut request).await.err().unwrap();

    assert_eq!(refused.to_string(), "not a SOCKS5 request");
}

#[tokio::test]
async fn an_unknown_address_type_is_answered_address_not_supported() {
    let mut request: &[u8] = &[VERSION, CONNECT, 0, 0x09];

    let answer = read_connect(&mut request).await.unwrap();

    assert_eq!(answer, Err(Reply::AddressNotSupported));
}

#[tokio::test]
async fn a_v6_destination_is_read_as_an_address() {
    let mut request = vec![VERSION, CONNECT, 0, ATYP_V6];
    request.extend_from_slice(&Ipv6Addr::LOCALHOST.octets());
    request.extend_from_slice(&443u16.to_be_bytes());

    let answer = read_connect(&mut request.as_slice()).await.unwrap();

    assert_eq!(answer, Ok((Host::Ip(IpAddr::V6(Ipv6Addr::LOCALHOST)), 443)));
}

#[test]
fn a_string_longer_than_255_bytes_cannot_be_encoded() {
    let refused = encode_short(&"a".repeat(256)).err().unwrap();

    assert_eq!(refused.to_string(), "a SOCKS5 string longer than 255 bytes");
}

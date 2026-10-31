//! The server side of SOCKS5 (RFC 1928) with username/password
//! authentication (RFC 1929), CONNECT only.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

use anyhow::{bail, Context, Result};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use crate::Host;

pub(crate) const VERSION: u8 = 0x05;
const NO_ACCEPTABLE_METHOD: u8 = 0xff;
pub(crate) const USER_PASSWORD: u8 = 0x02;
pub(crate) const AUTH_VERSION: u8 = 0x01;
const CONNECT: u8 = 0x01;
pub(crate) const ATYP_V4: u8 = 0x01;
pub(crate) const ATYP_NAME: u8 = 0x03;
pub(crate) const ATYP_V6: u8 = 0x04;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Reply {
    Succeeded = 0x00,
    NotAllowed = 0x02,
    HostUnreachable = 0x04,
    ConnectionRefused = 0x05,
    CommandNotSupported = 0x07,
    AddressNotSupported = 0x08,
}

pub(crate) struct Credentials {
    pub(crate) username: String,
    pub(crate) password: String,
}

// An anonymous connection has no caller to decide for, so it is refused before
// it names a destination.
pub(crate) async fn accept_credentials<S>(stream: &mut S) -> Result<Credentials>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let mut head = [0u8; 2];
    stream.read_exact(&mut head).await?;
    if head[0] != VERSION {
        bail!("not a SOCKS5 greeting");
    }
    let mut methods = vec![0u8; usize::from(head[1])];
    stream.read_exact(&mut methods).await?;
    if !methods.contains(&USER_PASSWORD) {
        stream.write_all(&[VERSION, NO_ACCEPTABLE_METHOD]).await?;
        bail!("the caller offered no username/password authentication");
    }
    stream.write_all(&[VERSION, USER_PASSWORD]).await?;

    let mut version = [0u8; 1];
    stream.read_exact(&mut version).await?;
    if version[0] != AUTH_VERSION {
        bail!("not a username/password negotiation");
    }
    let username = read_short_string(stream).await?;
    let password = read_short_string(stream).await?;
    Ok(Credentials { username, password })
}

pub(crate) async fn answer_credentials<S: AsyncWrite + Unpin>(
    stream: &mut S,
    ok: bool,
) -> Result<()> {
    stream
        .write_all(&[AUTH_VERSION, if ok { 0x00 } else { 0x01 }])
        .await?;
    Ok(())
}

pub(crate) async fn read_connect<S>(
    stream: &mut S,
) -> Result<std::result::Result<(Host, u16), Reply>>
where
    S: AsyncRead + Unpin,
{
    let mut head = [0u8; 4];
    stream.read_exact(&mut head).await?;
    if head[0] != VERSION {
        bail!("not a SOCKS5 request");
    }
    let host = match head[3] {
        ATYP_V4 => {
            let mut octets = [0u8; 4];
            stream.read_exact(&mut octets).await?;
            Host::Ip(IpAddr::V4(Ipv4Addr::from(octets)))
        }
        ATYP_V6 => {
            let mut octets = [0u8; 16];
            stream.read_exact(&mut octets).await?;
            Host::Ip(IpAddr::V6(Ipv6Addr::from(octets)))
        }
        ATYP_NAME => Host::Name(read_short_string(stream).await?),
        _ => return Ok(Err(Reply::AddressNotSupported)),
    };
    let mut port = [0u8; 2];
    stream.read_exact(&mut port).await?;
    if head[1] != CONNECT {
        return Ok(Err(Reply::CommandNotSupported));
    }
    Ok(Ok((host, u16::from_be_bytes(port))))
}

pub(crate) async fn reply<S: AsyncWrite + Unpin>(stream: &mut S, reply: Reply) -> Result<()> {
    stream
        .write_all(&[VERSION, reply as u8, 0x00, ATYP_V4, 0, 0, 0, 0, 0, 0])
        .await?;
    Ok(())
}

async fn read_short_string<S: AsyncRead + Unpin>(stream: &mut S) -> Result<String> {
    let mut len = [0u8; 1];
    stream.read_exact(&mut len).await?;
    let mut bytes = vec![0u8; usize::from(len[0])];
    stream.read_exact(&mut bytes).await?;
    String::from_utf8(bytes).context("a SOCKS5 string that is not UTF-8")
}

pub(crate) fn encode_short(value: &str) -> Result<Vec<u8>> {
    let len = u8::try_from(value.len()).context("a SOCKS5 string longer than 255 bytes")?;
    let mut out = Vec::with_capacity(value.len() + 1);
    out.push(len);
    out.extend_from_slice(value.as_bytes());
    Ok(out)
}

#[cfg(test)]
mod tests;

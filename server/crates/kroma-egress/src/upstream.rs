//! The client side of SOCKS5, to chain a connection through an upstream proxy
//! that resolves the name on its own side of the tunnel.

use anyhow::{bail, Context, Result};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use crate::protocol::{
    encode_short, ATYP_NAME, ATYP_V4, ATYP_V6, AUTH_VERSION, USER_PASSWORD, VERSION,
};
use crate::{Host, Upstream};

const NO_AUTH: u8 = 0x00;

pub(crate) async fn connect(upstream: &Upstream, host: &Host, port: u16) -> Result<TcpStream> {
    let mut stream = TcpStream::connect(&upstream.address)
        .await
        .with_context(|| format!("reach the upstream proxy at {}", upstream.address))?;
    stream.set_nodelay(true)?;
    let method = if upstream.credentials.is_some() {
        USER_PASSWORD
    } else {
        NO_AUTH
    };
    stream.write_all(&[VERSION, 1, method]).await?;
    let mut chosen = [0u8; 2];
    stream.read_exact(&mut chosen).await?;
    if chosen != [VERSION, method] {
        bail!("the upstream proxy refused the authentication method");
    }
    if let Some((username, password)) = &upstream.credentials {
        let mut auth = vec![AUTH_VERSION];
        auth.extend(encode_short(username)?);
        auth.extend(encode_short(password)?);
        stream.write_all(&auth).await?;
        let mut status = [0u8; 2];
        stream.read_exact(&mut status).await?;
        if status[1] != 0x00 {
            bail!("the upstream proxy refused the credentials");
        }
    }

    let mut request = vec![VERSION, 0x01, 0x00];
    match host {
        Host::Name(name) => {
            request.push(ATYP_NAME);
            request.extend(encode_short(name)?);
        }
        Host::Ip(std::net::IpAddr::V4(v4)) => {
            request.push(ATYP_V4);
            request.extend_from_slice(&v4.octets());
        }
        Host::Ip(std::net::IpAddr::V6(v6)) => {
            request.push(ATYP_V6);
            request.extend_from_slice(&v6.octets());
        }
    }
    request.extend_from_slice(&port.to_be_bytes());
    stream.write_all(&request).await?;

    let mut head = [0u8; 4];
    stream.read_exact(&mut head).await?;
    if head[1] != 0x00 {
        bail!(
            "the upstream proxy could not reach {host}:{port} (reply {})",
            head[1]
        );
    }
    let bound = match head[3] {
        ATYP_V4 => 4,
        ATYP_V6 => 16,
        ATYP_NAME => {
            let mut len = [0u8; 1];
            stream.read_exact(&mut len).await?;
            usize::from(len[0])
        }
        other => bail!("the upstream proxy answered an unknown address type {other}"),
    };
    let mut rest = vec![0u8; bound + 2];
    stream.read_exact(&mut rest).await?;
    Ok(stream)
}

#[cfg(test)]
mod tests;

# HTTPS, reverse proxies and remote access

On your home network, KROMA answers on plain HTTP, port `4040`, and needs no
setup. This page is for the rest: watching from outside your home, putting
KROMA behind your own domain name, and turning on HTTPS.

## Watch from outside your home

Your phone on mobile data, or a TV at a friend's place, cannot reach an
address such as `192.168.1.50`. To reach KROMA from the internet, choose one of
these:

| Way | Needs | Good for |
| --- | --- | --- |
| [Remote access module](#with-the-remote-access-module) | a free Cloudflare account and a domain on Cloudflare | most people: no port to open on your router |
| [Your own reverse proxy](#behind-your-own-reverse-proxy) | a domain name, a reverse proxy such as Caddy or nginx, port 443 open on your router | people who already run one |
| A VPN to your home, such as WireGuard or Tailscale | the VPN app on each device | people who do not want KROMA on the internet at all |

> [!WARNING]
> Do not forward port `4040` from your router to KROMA. Plain HTTP sends your
> password and your session in clear text across the internet. Use one of the
> ways above, which all encrypt the connection.

### With the remote access module

The **Remote access** module publishes KROMA at an HTTPS address of your
choice through a Cloudflare Tunnel, which needs no open port on your router.

1. Create a tunnel in the Cloudflare dashboard and copy its connector token.
   Cloudflare's
   [tunnel guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-remote-tunnel/)
   shows how. Point its public hostname, for example `kroma.example.com`, at
   `http://localhost:4040`.
2. In KROMA, open **Server** > **Modules** and install **Remote access**.
3. Open **Server** > **Remote access**.
4. In **Custom URL**, enter `https://kroma.example.com`.
5. Under **Managed connector (Cloudflare Tunnel)**, turn on
   **Enable remote access**, paste the token in **Tunnel token**, and select
   **Save**.

KROMA starts the connector and shows **Connected**. If you already run a tunnel
yourself, leave **Enable remote access** off and only fill **Custom URL**.

### Behind your own reverse proxy

Point the proxy at `http://SERVER_IP:4040`. Then tell KROMA its public
address, so that the links it sends, such as password resets and TV sign-in
links, use it: set **Custom URL** in **Server** > **Remote access**, or
set `KROMA_WEB_URL`, which invitation links use too.

KROMA reads the visitor's real address from `X-Forwarded-For` only when the
request comes from a proxy it trusts. A proxy on the same computer is always
trusted, unless KROMA runs in Docker: a proxy on the host then reaches the
container through Docker's network, like a proxy anywhere else. Such a proxy,
in another container or on another machine, must be named:

```bash
KROMA_TRUSTED_PROXIES="172.18.0.0/16"
```

Use the proxy's own address, or the range of its Docker network. Separate
several with commas.

> [!IMPORTANT]
> Without this setting, KROMA sees every visitor as the proxy. Two things then
> break: TV sign-in from a phone treats everyone as one network, and the
> protection against password guessing counts everyone as one visitor. Name
> only the proxy: any address in the list can claim to be anyone.

The proxy must add the visitor's address to the end of `X-Forwarded-For`, not
replace the header. Caddy and Traefik do this by default. In nginx:

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

KROMA also reads `CF-Connecting-IP`, from Cloudflare, when no
`X-Forwarded-For` header came with the request.

## Turn on HTTPS on your home network

Browsers only allow passkeys, and some other security features, on an HTTPS
address or on `localhost`. To use them at an address such as
`http://192.168.1.50:4040`, KROMA can also serve HTTPS with a certificate it
makes itself.

1. Set `KROMA_HTTPS=1`. In Docker, also publish port `4443`:

   ```yaml
       ports:
         - "4040:4040"
         - "4443:4443"
       environment:
         KROMA_HTTPS: "1"
         KROMA_TLS_SANS: "192.168.1.50,nas.home"
   ```

2. List in `KROMA_TLS_SANS` every address you use to open KROMA. Outside
   Docker, KROMA finds the computer's own address and name by itself. Inside
   Docker it cannot, so list them.
3. Restart KROMA, then open `https://192.168.1.50:4443`.
4. The browser warns that the certificate is not trusted, because KROMA made
   it. To trust it on a device, download it from
   `http://192.168.1.50:4040/api/tls/cert.pem` and install it on that device.

HTTP on port `4040` keeps working. TV apps keep using it, because many TVs
cannot trust a certificate you made.

KROMA keeps the certificate in its data folder, under `tls`. After you change
`KROMA_TLS_SANS`, delete that folder and restart, so KROMA makes a new one.

To send every HTTP visitor to HTTPS, also set `KROMA_HTTPS_REDIRECT=1`. Leave it
off if you use a TV app.

## Serve the web app from another address

A browser only lets a page read KROMA's answers if the page comes from an
address KROMA trusts: KROMA itself, your home network, `tv.kroma.tv`, the
address in `KROMA_WEB_URL`, and the HTTPS address a trusted proxy serves KROMA
at. The apps for phones, TVs and computers are not affected.

If you host a KROMA web client yourself at another address, add it:

```bash
KROMA_ALLOWED_ORIGINS="https://kroma.example"
```

Every address in this list can act as a signed-in client of your server, so
list only addresses you control.

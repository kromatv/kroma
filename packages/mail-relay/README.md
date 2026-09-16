# KROMA mail relay

The Cloudflare Worker at mail.kroma.tv that emails a self-hosted KROMA server's
users on its behalf: credential resets, address verifications.

## Why this exists

A KROMA server is self-hosted by anybody, and most of them have no mail server.
The alternative today is the owner copying a reset link by hand. The relay lets
a server send from `no-reply@kroma.tv` without holding any credential at all.

## Why it is not an open mailer

The server's source is public, so there is no shared secret to authenticate it
with, and an open mailer under kroma.tv would be everyone's spam cannon. So the
**mailbox** authorises, not the server:

1. The server asks the relay to ask a mailbox (`POST /v1/enrol`). The relay
   sends one fixed consent email. The server chose only its name; the only link
   in it is the relay's own.
2. The recipient opens the link and clicks **Allow**. The relay mints a grant,
   an AES-256-GCM sealed blob naming exactly that address and that server's
   origin, and sends the browser back to the server with it. The click is also
   the address verification: reaching the mailbox was the proof.
3. The server spends the grant (`POST /v1/send`) for every later message. The
   relay opens it, checks that every link in the message leads back to the
   consented origin, and sends. Each delivery hands back a renewed grant.

A grant can do one thing: write to its mailbox on behalf of its server. It
cannot be forged without `GRANT_SECRET`, it cannot be read, and a message spent
with it cannot link anywhere but the server the recipient said yes to. A
compromised server can be noisy to its own consenting users, briefly, and to
nobody else.

What bounds the one unsolicited email:

| Limit | Value | Where |
|---|---|---|
| Consent requests per mailbox | 3 a day | KV counter |
| Consent requests per caller | 5 a minute | `ENROL_IP` |
| Sends per mailbox | 10 a minute, 50 a day | `SEND_ADDR`, KV counter |
| Sends per caller | 60 a minute | `SEND_IP` |
| Sends, all callers | 2000 a day | KV counter |
| Bodies | 8 KB enrol, 96 KB send | refused off the declared length; a body with no declared length is refused outright |

Counters are keyed on an HMAC of the address under `LIMIT_SECRET`, so the relay
keeps no address and no mail, only how many times a mailbox was written to
today. See `worker/content.ts` for what a message may contain, `worker/consent.ts`
for the blobs, `@kromatv/relay-grant` for the sealing both relays share.

## Routes

| Route | Body | Answers |
|---|---|---|
| `POST /v1/enrol` | `{address, origin, serverName, locale, token}` | `204` · `429` |
| `GET /confirm/:blob` | | the consent page |
| `POST /confirm/:blob` | | `303` to `<origin>/verify-email?token=…&grant=…` |
| `POST /v1/send` | `{grant, subject, text, html}` | `{delivered, grant}` · `401` bad grant · `410` mailbox gone · `422` content refused · `429` |
| `GET /health` | | `{ok, email}` |

`401` and `410` are the statuses a server acts on: it drops the grant, and the
mailbox re-consents through a new verification. Everything else is transient.

`origin` is https anywhere, or http on a host that is not on the public
internet (a LAN address, `.local`, `localhost`). Grants are bound to it: an
operator who moves their server to a new domain asks their users to consent
again.

## Deploy

Once, before the first deploy:

```sh
cd packages/mail-relay/worker
bunx wrangler email sending enable kroma.tv     # onboards the domain: SPF, DKIM, DMARC
bunx wrangler kv namespace create COUNTERS      # paste the id into wrangler.jsonc
openssl rand -base64 48 | bunx wrangler secret put GRANT_SECRET
openssl rand -base64 48 | bunx wrangler secret put LIMIT_SECRET
```

Then, and every time after:

```sh
bunx wrangler deploy
```

`GRANT_SECRET` is **not** the push relay's. Rotating it retires every grant in
the field: every mailbox has to consent again. Keep a copy in your password
manager; Worker secrets are write-only.

## Verifying the whole chain

```sh
curl -s https://mail.kroma.tv/health
# {"ok":true,"email":true}

curl -s -w '\n[%{http_code}]\n' -X POST https://mail.kroma.tv/v1/enrol \
  -H 'content-type: application/json' \
  -d '{"address":"you@example.com","origin":"https://kroma.example","serverName":"Home","locale":"en","token":"tok-1234567890"}'
# [204], and a consent email in your inbox
```

Click through: the page shows "Home" and `kroma.example`, the button sends the
browser to `https://kroma.example/verify-email?token=tok-1234567890&grant=v1.…`.
Take the grant off that URL and spend it:

```sh
curl -s -w '\n[%{http_code}]\n' -X POST https://mail.kroma.tv/v1/send \
  -H 'content-type: application/json' \
  -d '{"grant":"v1.…","subject":"Hello","text":"Open https://kroma.example/x","html":"<a href=\"https://kroma.example/x\">x</a>"}'
# {"delivered":true,"grant":"v1.…"}  [200]
```

The same body with `https://evil.example` in it answers `422`; a grant sealed
under another secret answers `401`.

## On the server

Admin → Settings → Email → Delivery: `relay`. A server reaches the relay at
`https://mail.kroma.tv` unless `KROMA_MAIL_RELAY_URL` names an operator's own
copy of this Worker. The rest is the member editor: **Send verification** asks
the mailbox, and once it said yes, **Reset access** emails the reset link (the
code still travels by voice).

## Tests

```sh
bunx vitest run packages/mail-relay/ packages/relay-grant/
```

`content.test.ts` is the phishing boundary, `consent.test.ts` and
`@kromatv/relay-grant`'s `seal.test.ts` the forgery one.

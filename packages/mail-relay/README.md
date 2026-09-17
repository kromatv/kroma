# KROMA mail relay

The Cloudflare Worker at mail.kroma.tv that carries a self-hosted KROMA
server's account email (credential resets, address verifications) to its
users. It is a carrier, not a mailer: it writes nothing, and it sends only
where a mailbox has said yes.

## Why this exists

A KROMA server is self-hosted by anybody, and most of them have no mail server.
The alternative is the owner copying a reset link by hand. The relay lets a
server send from `no-reply@kroma.tv` without holding any credential at all,
and every word of every message stays the server's: templates, catalogs and
logo live in the server repo, rendered at runtime by the server.

## Why it is not an open mailer

The server's source is public, so there is no shared secret to authenticate it
with, and an open mailer under kroma.tv would be everyone's spam cannon. Two
things stand in for the secret:

1. **An identity per server.** The server mints a P-256 key once and registers
   it with its origin (`POST /v1/register`). A public origin must prove it holds
   the key: the relay fetches `https://<origin>/api/mail/relay-challenge?nonce=…`
   and expects the nonce back, signed. A private origin (a LAN address,
   `.local`, `localhost`) is taken at its word, because nobody can be lured to
   it. The answer is a sealed **instance** naming the origin and the key; every
   later call is that instance plus a signature over its payload. The origin is
   read from the instance, never from the request.
2. **A yes per mailbox.** A message goes to a mailbox only if that mailbox has
   allowed that origin. The mark is kept by the relay under an HMAC of
   (origin, mailbox), so a server needs nothing but the address to send, like
   SMTP. Until the mark exists, the only message that may go is the question:
   the server asks for a consent link (`POST /v1/consent`), writes its own
   message around it, and the relay sends it only if every link in it is that
   one link. The recipient clicks, sees the question on the **server's** page,
   and the yes is recorded when that page posts back to the relay.

What one server can then do: write to the mailboxes that allowed it, with
links that lead back to its own origin only; nothing in a message may run,
submit, embed or redirect. What a stranger can do: register an origin they
control and ask a mailbox, three times a day at most, with a message whose only
link is the relay's, sent under `"<their host> via KROMA"`. Every message
carries the real host of the origin as the sender's display name.

| Limit | Value | Where |
|---|---|---|
| Consent links per mailbox | 3 a day | KV counter |
| Consent links per origin | 50 a day | KV counter |
| Registrations and consent requests per caller | 5 a minute | `ENROL_IP` |
| Sends per mailbox | 10 a minute, 50 a day | `SEND_ADDR`, KV counter |
| Sends per caller | 60 a minute | `SEND_IP` |
| Sends to mailboxes that said yes, all callers | 2000 a day | KV counter |
| Questions, all callers | 500 a day, a budget of their own so questions can never starve deliveries | KV counter |
| Signed payloads | within 5 minutes of their timestamp | |
| Bodies | 8 KB register and consent, 256 KB send | refused off the declared length; a body with no declared length is refused outright |

Counters and marks are keyed on HMACs under `LIMIT_SECRET`, so the relay keeps
no address and no mail, only how often a mailbox was asked or written to, and
which (origin, mailbox) pairs said yes. An origin can be shut out with
`wrangler kv key put --binding COUNTERS ban:<key> 1`, where `<key>` is the
HMAC of the origin (`budgetKey` in `worker/limits.ts`).

See `worker/content.ts` for what a message may contain, `worker/identity.ts`
and `worker/challenge.ts` for who may call, `worker/consent.ts` for the yes,
`@kromatv/relay-grant` for the sealing both relays share.

## Routes

| Route | Body | Answers |
|---|---|---|
| `POST /v1/register` | `{origin, publicKey}` | `{instance, expiresAt}` · `403` the origin did not answer for the key |
| `POST /v1/consent` | signed `{to, token, ts}` | `{url, expiresAt}` · `429` |
| `POST /v1/send` | signed `{to, subject, text, html, attachments, ts}` | `{delivered}` · `403 consent required` · `410` mailbox gone · `422` content refused · `429` |
| `GET /confirm/:blob` | | `303` to `<origin>/verify-email?token=…&consent=…` |
| `POST /confirm/:blob` | | records the yes, `303` to `<origin>/verify-email?token=…` |
| `GET /health` | | `{ok, email}` |

A signed body is `{instance, payload, signature}`: `payload` is the JSON text
the server signed (ECDSA P-256, SHA-256, raw `r || s`, base64url), parsed only
once the signature holds. `401` means the instance is unknown: register again.
`403 consent required` means the mailbox has not said yes: ask it, or carry
the link by hand. `410` means the mailbox bounced and its yes was withdrawn.

`origin` is https anywhere, or http on a host that is not on the public
internet. An operator who moves their server to a new domain registers again
on first use, and their users say yes again.

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

`GRANT_SECRET` is **not** the push relay's. Rotating it retires every instance
and consent link in the field: every server registers again on its next send.
Rotating `LIMIT_SECRET` forgets every yes: every mailbox is asked again. Keep
copies in your password manager; Worker secrets are write-only.

## Verifying the whole chain

Run the relay locally (`bunx wrangler dev`, the mail binding writes each
message under `.wrangler/tmp/email/`) and a server with
`KROMA_MAIL_RELAY_URL=http://127.0.0.1:8787` and a public address. In
Admin → Settings → Email choose `relay`, then from the member editor send
yourself a verification: the relay log shows the consent message, its only link
the relay's. Open the link (rewrite the host to the local relay), click Allow on
the server's page, and the address turns verified. Mint a reset: the message
goes out under the grant of that yes, every link on your origin, the code note
present and the code absent.

## On the server

Admin → Settings → Email → Delivery: `relay`. A server reaches the relay at
`https://mail.kroma.tv` unless `KROMA_MAIL_RELAY_URL` names an operator's own
copy of this Worker. It needs a public address (`KROMA_WEB_URL` or Remote
access) to register under. The rest is the member editor: **Send
verification** asks the mailbox, and once it said yes, **Reset access** emails
the reset link (the code still travels by voice).

## Tests

```sh
bunx vitest run packages/mail-relay/ packages/relay-grant/
```

`content.test.ts` is the phishing boundary, `identity.test.ts`,
`challenge.test.ts` and `register.test.ts` the impersonation one,
`send.test.ts` the consent one.

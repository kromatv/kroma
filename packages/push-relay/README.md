# KROMA push relay

The Cloudflare Worker at **push.kroma.tv** that lets a self-hosted KROMA server
notify a phone.

## Why this exists

A KROMA server is self-hosted by anybody. The KROMA app is published by one team.
Apple and Google only accept credentials **they** issued to the account that owns
the app — so an operator's own Apple key can never push to `tv.kroma.mobile`, no
matter what they paste into an admin form. That is why the admin console asks for
nothing: the question was unanswerable, not merely tedious.

The relay holds the published app's credentials so a server does not have to.

## Why it is not an open push service

The server's source is public, so there is no shared secret to authenticate it
with — anything committed is world-readable the day it lands. Instead the relay
issues **capabilities**:

1. The app trades its raw APNs/FCM token at `POST /v1/grant` for a **grant** —
   an AES-256-GCM sealed blob naming exactly one device.
2. The app registers that grant with whatever server the reader signed into.
3. The server spends it at `POST /v1/push`.

A grant can do one thing: notify its device. It cannot be forged without
`GRANT_SECRET` (which never leaves the relay), and it cannot be *read* — so a
leaked server database is not a pile of push tokens, because the server never
learned them. Compromising one server yields grants for that server's own users,
who already trusted it and whom it could already reach.

Rate limits key on a **hash of the device token**, so re-minting a grant buys no
fresh budget.

See `worker/grant.ts` for the seal, `worker/index.ts` for the routes.

## Routes

| Route | Body | Answers |
|---|---|---|
| `POST /v1/grant` | `{transport, token}` | `{grant, expiresAt}` |
| `POST /v1/push` | `{grant, notification}` | `{delivered}` · `410` gone · `401` bad grant |
| `GET /health` | — | `{ok, apns, fcm}` |

`410` is the only status a server acts on: it evicts the subscription. Everything
else is transient and must not cost a reader their registration.

## Deploy

```sh
cd packages/push-relay/worker
bunx wrangler deploy
```

## Secrets

None of these may ever be committed — the whole point of the relay is that they
exist in exactly one place.

| Secret | What it is |
|---|---|
| `GRANT_SECRET` | Seals grants. `openssl rand -base64 48`. **Rotating it invalidates every grant in the field**, forcing every device to re-register. |
| `APNS_KEY_P8` | Contents of `AuthKey_XXXXXXXXXX.p8` |
| `APNS_KEY_ID` | The ten characters in that filename |
| `APNS_TEAM_ID` | The Apple team — `29729UWWP2` |
| `FCM_SERVICE_ACCOUNT` | The whole Firebase service-account JSON |

`APNS_TOPIC` is a plain var in `wrangler.jsonc`, not a secret: it is the app's
bundle id, `tv.kroma.mobile`. It must change in lockstep with the bundle id.

### Cloudflare is not a backup

Worker secrets are **write-only** — `wrangler secret list` returns names, never
values. Keep a readable copy of every secret in your own password manager, and
pipe it in from there so it never lands on disk:

```sh
<your secret manager, reading GRANT_SECRET> | bunx wrangler secret put GRANT_SECRET
```

A value that exists only in Cloudflare is a value nobody can ever recover. That
matters most for the APNs `.p8`, which Apple also refuses to re-issue.

---

## Creating the Apple credential

### The trap, first

Apple names **two different things** `AuthKey_XXXXXXXXXX.p8`, and both are P-256
PKCS#8 private keys. The file itself cannot tell you which you have:

- an **APNs auth key** — Developer portal → Certificates, Identifiers & Profiles
  → **Keys**. This is the one that sends pushes.
- an **App Store Connect API key** — App Store Connect → Users and Access →
  **Integrations**. This is for the API and CI. It will *never* send a push.

Using the wrong one gives `403 InvalidProviderToken`, which looks like a
misconfiguration rather than the wrong file. Always probe before uploading.

### Steps

1. <https://developer.apple.com/account/resources/authkeys/list> → **+**
2. **Key Name** — no `@ & * ' " - .` allowed. e.g. `KROMA Push Relay`
3. Tick **Apple Push Notifications service (APNs)**, then **Configure**:

   | Field | Choose | Why |
   |---|---|---|
   | Environment | **Sandbox & Production** | The relay serves every server at once, so it sees TestFlight and Xcode tokens in the same second. It tries production and falls back to sandbox per token (`worker/apns.ts`). Apple suggests separate per-environment keys; that advice assumes one key per workflow and does not fit a shared relay. |
   | Key Restriction | **Team Scoped (All Topics)** | Survives a bundle-id rename. A topic-scoped key dies permanently if `tv.kroma.mobile` is ever renamed, and cannot be edited. |

   **Both settings are irreversible once saved.** Apple says so on the page.
4. **Continue** → **Register** → **Download**.

   The download happens **once** — Apple deletes its copy. Back the file up
   somewhere durable before doing anything else.

### Verify before uploading

```sh
bun packages/push-relay/scripts/probe-apns.ts \
  ~/Downloads/AuthKey_XXXXXXXXXX.p8 XXXXXXXXXX 29729UWWP2 tv.kroma.mobile
```

It pushes to a deliberately bogus device token (64 zeros), so nothing reaches a
real phone. The rejection is the answer:

| Response | Meaning |
|---|---|
| `400 BadDeviceToken` on **both** hosts | ✅ the key is good, and both environments are enabled |
| `403 InvalidProviderToken` | wrong kind of key, or wrong team |
| `403 TopicDisallowed` | valid APNs key, wrong bundle id |

The script shells out to `curl --http2`: APNs refuses HTTP/1.1 outright, and
Bun's `fetch` cannot speak HTTP/2 (`Malformed_HTTP_Response`).

### Upload

```sh
cd packages/push-relay/worker
cat ~/Downloads/AuthKey_XXXXXXXXXX.p8 | bunx wrangler secret put APNS_KEY_P8
printf 'XXXXXXXXXX' | bunx wrangler secret put APNS_KEY_ID
printf '29729UWWP2' | bunx wrangler secret put APNS_TEAM_ID
```

Apple allows **two** APNs keys per account. Revoking is the only way to free a
slot, and it kills every push signed with that key immediately.

---

## Creating the Google credential

Android needs **two** things, and only one of them is the relay's. Without the
first, `getDevicePushTokenAsync()` cannot mint a token at all and the relay never
gets a chance to matter.

### 1. The app side — `google-services.json`

The app must be registered in a Firebase project under the exact package name in
`expo.android.package`.

1. <https://console.firebase.google.com> → the project (KROMA is `kroma-media`)
   → **Project settings** → **General**
2. Under **Your apps**, select the Android app whose package is
   **`tv.kroma.mobile`**, or **Add app** if it is not there
3. Download **`google-services.json`** to `clients/mobile/`
4. Point the app at it in `clients/mobile/app.json`:

```jsonc
"android": {
  "package": "tv.kroma.mobile",
  "googleServicesFile": "./google-services.json"
}
```

This is a **native** change: `expo prebuild` + `expo run:android`, not a JS
reload. A build made before this lands cannot register for push no matter what
the relay holds.

One file can serve several packages — KROMA's carries both `tv.kroma.mobile` and
`tv.kroma.androidtv`. It is safe to commit: the Android API key inside it is
public by design (it ships inside the APK) and is scoped by package name. FCM
does **not** need a SHA-1 fingerprint registered; other Firebase products do.

### 2. The relay side — the service account

Project settings → **Service accounts** → **Generate new private key**, or reuse
the existing `firebase-adminsdk` key if you have it.

```sh
cd packages/push-relay/worker
bunx wrangler secret put FCM_SERVICE_ACCOUNT < ~/Downloads/<project>-firebase-adminsdk-*.json
```

The JSON already carries `project_id`, `client_email` and `private_key`, so
there is nothing else to configure — `worker/fcm.ts` reads all three and trades
the key for an OAuth2 access token.

### Verifying

Mint an `fcm` grant against a junk token and spend it. Read the *wording* of the
failure, because two very different things both surface as a non-2xx:

| Relay says | Meaning |
|---|---|
| `push service returned 400` | ✅ auth worked. Google authenticated the request and rejected the fake token — `"The registration token is not a valid FCM registration token"` |
| `upstream push service failed` | ❌ the OAuth2 exchange itself failed — bad or unauthorised service account |

`bunx wrangler tail` shows Google's full reply in the `relay.rejected` log line.

Note that FCM answers a bad token with **400 `INVALID_ARGUMENT`**, not 404, and
`worker/fcm.ts` deliberately does **not** treat that as "device gone" — the same
400 also means *our* payload was malformed, and evicting on that would
unsubscribe every Android device at once. Only `404`/`UNREGISTERED` evicts;
everything else is left to the consecutive-failure counter in `push_subs`.

---

## Verifying the whole chain

```sh
curl -s https://push.kroma.tv/health
# {"ok":true,"apns":true,"fcm":true}

G=$(curl -s -X POST https://push.kroma.tv/v1/grant -H 'content-type: application/json' \
  -d '{"transport":"apns","token":"'$(printf '0%.0s' {1..64})'"}' | jq -r .grant)

curl -s -w '\n[%{http_code}]\n' -X POST https://push.kroma.tv/v1/push \
  -H 'content-type: application/json' \
  -d "{\"grant\":\"$G\",\"notification\":{\"id\":\"e2e\",\"title\":\"Hello\"}}"
# {"delivered":false,"gone":true}
# [410]
```

`410` on a bogus token is the **success** case for an end-to-end check: the relay
sealed and opened a grant, signed a real ES256 assertion, reached Apple, flipped
to the other host, and mapped the verdict. A real device token returns
`{"delivered":true}`.

## Tests

```sh
bunx vitest run packages/push-relay/worker/
```

`grant.test.ts` is the security boundary — forgery, tampering, expiry, IV reuse,
and that a grant never reveals the token it carries.

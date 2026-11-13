# RFC 657: sign in with an OpenID Connect provider

- Status: **DRAFT**
- PR: #657
- Issue: #653
- Affects: `docs/spec/accounts/README.md`, `docs/setup/single-sign-on.md`,
  `docs/setup/configuration.md`, `docs/reference/sign-in-providers.md`. Areas
  `area/server`, `area/web`, `area/mobile`, `area/docs`

## Summary

An operator who already runs an identity provider (Authentik, Keycloak, Pocket ID,
Microsoft Entra ID) pastes its address into Admin, and a "Continue with <provider>"
button appears on the sign-in screen. A person who signs in there lands in an ordinary
KROMA account with an ordinary session.

The provider proves who someone is. It never decides, by itself, that they may come in.
A person the server has not seen before becomes a **join request** that an admin
approves with one tap, choosing their permissions and libraries the way an invitation
does. An operator who manages membership at the provider can skip the approval, require
a group, or take new people by invitation only.

The same page decides which ways in the server offers at all. Passwords, passkeys and
each provider are one ordered list of sign-in methods: an admin turns each on or off
and puts them in the order the sign-in screen shows them.

The server is the OIDC client. It lives in the core and adds no new kind of session.
Televisions need no change, because they already borrow a session from a signed-in
phone or browser.

## Motivation

#653 asks for it, and the request is the common one among people who self-host. A
household that runs Authentik in front of ten services has one place where a person is
created, given a second factor and removed. KROMA is the service that ignores it, so
every person has a second password that the provider's policy never reaches.

The usual workaround does not fit KROMA. Putting the server behind the provider's
forward-auth proxy works for a browser and breaks everything else. The phone app, the
desktop app and every television call `/api` directly and cannot follow a login
redirect, so the operator ends up excluding `/api` from the proxy, which removes the
protection it was installed for.

The spec is also already behind the code. ACCT-5 says a username and password is the
only credential the server stores, and passkeys have shipped since. The model that
actually exists is "an account, and several ways to prove you hold it". A provider
identity is one more of those.

## Proposal

### Who gets in

This is the question that decides the rest. A provider answers "who is this", and for
many providers the honest answer to "who can get an account there" is "anyone". So the
default must hold even when the operator configured nothing at the provider.

A provider identity is the pair (issuer, subject). Each sign-in ends one of four ways.

1. **The identity is linked to an account.** The person is signed in.
2. **The person arrived on an invitation link.** The invitation page offers the
   provider button beside the password form. The account takes the invitation's
   permissions and is linked to the identity. Invitations work exactly as today.
3. **The identity is unknown.** What happens is the provider's **New people** setting:
   - **Invitation only**, the default. The person is turned away unless case 2 applies.
   - **Ask me first.** The server files a join request and tells the
     person it was sent. Accounts holding `users.manage` get a notification, and
     Admin → Users shows the request with the name and email the provider gave.
     Approving opens the invitation form (name, permissions, libraries) and creates the
     account. Declining blocks that identity from asking again, until an admin lifts
     it. The person signs in again after approval and is in.
   - **Create their account.** The account is created at once with the permissions
     and libraries the admin picked in this setting.
4. **The identity is unknown and the person already has a KROMA account.** The screen
   that says so offers "I already have an account". They sign in once with their
   password or passkey, and the identity is linked to that account. Account settings
   carry the same link and unlink actions beside the passkeys.

A join request grants nothing. The server keeps at most 20, one per identity, for 30
days, so a provider that lets the whole internet through cannot fill the list.

**Required groups** narrow all of it. Empty by default. When set, a provider sign-in is
refused unless the person is in one of them. It applies to every case above and on
every sign-in, so removing someone from the group stops them signing in again. The
claim that lists groups defaults to `groups`; a dotted path reads a nested one
(`realm_access.roles`). The server asks for the `groups` scope whenever the provider's
discovery document offers it, and a field takes extra scopes for a provider that names
it otherwise.

That gives three places to say "only these people", and they stack: who the provider
lets reach the KROMA application, the required groups, and the approval. The default
needs none of the provider-side ones.

The server never links or creates by matching an email. An email claim is whatever the
provider's operator or its user typed, and matching on it is how one account takes over
another. A new account takes its username from `preferred_username` (a number is
appended when taken) and its email from `email`. An email another account already holds
does not create a second account. It sends the person to case 4.

Claims are read once, when the account is created. After that the username and the
email are KROMA's. Group membership is the exception, checked on every sign-in.

No claim grants a permission. Admin rights and library visibility are set in KROMA.

### Setting it up

The operator's whole job, in order:

1. In Admin → Sign-in, add a provider and copy the redirect URI shown there. Create an
   application at the provider with it.
2. Paste the issuer URL and press Check. The server reads the discovery document and
   the signing keys and says what it found, or what failed, in words.
3. Paste the client id, and the client secret if the provider issued one. A provider
   that registers KROMA as a public client needs no secret, since the flow uses PKCE
   either way.
4. Save, then press **Test sign-in**. The admin goes through the real flow. The page
   shows who they signed in as, the groups that came back, and whether that person
   would pass the required groups. A test admits nobody and links nothing.

The button reaches the sign-in screen only after a test passed with the current
connection. Changing the issuer, the client, the secret, the scopes or the group claim
takes it away until a test passes again. Changing who gets in does not.

One provider can also come from the environment (`KROMA_OIDC_ISSUER`,
`KROMA_OIDC_CLIENT_ID`, `KROMA_OIDC_CLIENT_SECRET`, `KROMA_OIDC_LABEL`) for people who
keep their setup in a compose file. It is live without a test, and Admin edits who it
lets in but not its connection.

A server takes up to eight providers. Each picks a **preset** or none. A preset is a
provider the server knows by name: it fills the form with what that provider starts from
(its name, the shape of its address, the claim its groups are in), links to the page
where the provider has an application made and to its guide, and gives the button that
provider's mark and look. A preset changes nothing about how the provider is spoken to.
Each is a folder of the server's source, a manifest and its marks, so adding one touches
no list: `server/crates/kroma-engine/src/services/sso/presets/README.md` says how. The look belongs to the preset: the
server holds it beside the mark, and nobody sets one. Google's and Microsoft's buttons
follow the guidelines each publishes, with a dark and a light form. A provider that
publishes a brand colour and a mark for dark grounds gets the one under the other. Any
other preset, and a provider with none, has the screen's own button, with its mark on a
white tile or an icon the admin picks from a short list.
Nobody uploads a picture: the marks ship with the server, which serves them under a
policy that runs nothing in them.

### One list of methods

The password form, the passkey button and each provider are entries of one list, of
three kinds. The list's order decides the sign-in screen: the buttons are one group, the
password form another, the group listed first leads and carries the main action, and the
buttons keep the list's order. There is always exactly
one password entry and one passkey entry, which can be turned off and never removed.
The sign-in screen is told the usable entries in order, each with its kind, and draws
by kind. A kind a client does not know is skipped, so a later one does not break an
older app.

### The flow

Authorization code with PKCE. No app ever holds a provider token.

1. The client asks the server to start a sign-in and gets back a flow id, a secret and
   the provider URL to open. The secret stays in the client that started the flow.
2. The person authenticates at the provider, which redirects to the server's callback.
3. The server exchanges the code, verifies the ID token and resolves the outcome from
   "Who gets in". It parks the result under the flow id and sends the browser back to
   the client with a one-time code.
4. The client collects the result with its secret and that code. A sign-in has the
   shape a password sign-in returns.

Collecting takes both halves, and each closes one attack. The address the browser lands
on carries the code and not the secret, so a proxy log or a browser history holds
nothing that redeems a session. And whoever started a flow holds the secret and not the
code: an attacker who starts one and sends the provider's link to a victim gets nothing
when the victim signs in, because the code went to the victim's browser. An earlier
draft let the starter collect by polling, which is exactly that attack. A link to an
account is written when the flow is collected and not when the provider answers, so
it falls under the same rule.

### Security rules

These are requirements, each with a test.

- The ID token's signature is checked against the provider's published keys. RS256 and
  ES256 are accepted. `none` and every HMAC algorithm are refused, whatever the
  discovery document advertises. An RSA key under 2048 bits verifies nothing.
- Issuer, audience (with `azp` when a token is shared), expiry and nonce are checked.
  The issuer in the discovery document must equal the one the operator typed.
- `state`, the nonce and the PKCE verifier are random per flow and never leave the
  server. A flow lives ten minutes, a `state` answers one callback, and an outcome is
  given once. The server caps open flows overall and per address.
- The redirect URI is the server's callback under an origin the operator named (the
  web URL or the Remote Access URL), the rule passkeys follow. With neither set, the
  request origin is used so a LAN-only server works.
- The issuer and every endpoint it lists must be https unless the host is on the local
  network, in the sense `docs/networking.md` gives that phrase.
- The client secret is stored server-side only. Admin shows whether one is stored, and
  no module can read it.
- The server stores no provider token and asks for no refresh token.
- The owner account is never created through the provider. First run stays local and
  password-based.
- An account cannot remove its last way to sign in.
- Calls to the provider leave through the one way out (RFC 480) under the `sign-in`
  purpose, so the firewall view shows them.

Token validation is written here, on the `rsa` and `p256` crates the server already
links. The `openidconnect` crate was the first choice and was dropped after counting
what it pulls in: `oauth2`, `chrono`, `serde_with`, `ed25519-dalek`, `p384` and a second
copy of the elliptic-curve stack (`p256` 0.14 beside the 0.13 push uses). The verifier
is one file with a closed algorithm list, and its tests feed it every forgery named
above.

### What a provider sign-in ends in

An ordinary session, the same way pairing does (ACCT-11). It is PIN-verified at birth
like a password sign-in. It does not expire on a clock (ACCT-7), it shows in the device
list, and it revokes like any other.

### Passwords and passkeys

Each has a switch on its row in Admin → Sign-in. Passwords go off only while a provider
is live.
An account that can change server settings keeps its password whatever the switch says,
so a provider that is down or misconfigured never locks the server. An account without
a password that needs one gets it through the existing reset link (ADMIN-79).

### Each shell

Every shell signs in through one object, `createAuth` in `@kromatv/core`:

```ts
const methods = await auth.methods();
await auth.signIn.password(identifier, password);
await auth.signIn.passkey();
const end = await auth.signIn.with(provider);
```

A shell supplies two things: how it opens a browser, and where it keeps the half of a
flow it holds. Everything else is shared.

- **Web.** The sign-in gate draws the two groups with a rule between them. A provider's
  button takes the tab to the provider, and the page it comes back to resumes the flow.
- **Phone.** The app opens the provider in the system's authentication browser and
  comes back on `kroma://sso`, which carries the one-time code to the app that began
  the flow. A route in the app collects a return that reaches it as a link instead.
  The app tells the server which address it reaches it on, since an app has no origin,
  and that address passes the same check a browser's origin does. Polling is not an
  option, for the reason given under "The flow". This is built from Expo's
  documentation and has not been run on a phone: see
  `docs/reference/sign-in-providers.md`.
- **Desktop.** Not in this change.
- **Television.** Nothing new. A television signs in through Quick Connect or a
  handoff, approved from a phone or a browser, and it does not matter how that device
  signed in.

### For contributors

Nobody needs an Authentik to work on this. `kroma-engine` carries, behind its `testing`
feature, an in-process provider that serves a discovery document, keys, a token
endpoint with PKCE and single-use codes, and user info. The integration tests
(`it_sso*.rs`) run whole sign-ins through the real router against it, including the
hostile cases. `bun run dev:sso` starts the same provider beside the dev server,
already configured, with a page that asks which made-up person to sign in as.

## What this costs

- **Token verification in the core, forever.** A mistake here is a sign-in bypass. It
  is our code and not a library's, so its tests are the only review it gets for free.
- **Whoever runs the provider can sign in as any linked account**, the owner's
  included if the owner linked it. That is what trusting a provider means.
- **Provider quirks become our bug reports.** Keycloak 26.4 and Authentik 2025.10 were
  run end to end. Every other provider rests on the standard, and the guide names only
  those two as tested.
- **Removing someone at the provider does not end their sessions here.** With a
  required group it stops their next sign-in. Sessions already open live until an admin
  ends them, which follows from ACCT-7 and from storing no provider tokens.
- **A dead provider locks out accounts that have no password**, until it returns or an
  admin issues a reset link.
- **Join requests are a new list an admin has to look at.**
- **Desktop users see no provider button** until that shell gets the flow.
- **The server is not yet a library.** The sketch of one method per trait behind an
  `Auth::builder` was not built. The three kinds flow too differently for one trait to
  carry more than a name today, so the server keeps plain handlers over one settings
  model, and the uniform surface is the HTTP one and `createAuth`. Extracting a
  `kroma-auth` crate is a later step, once this has run.

## Compatibility

- Existing libraries, paired devices and installed modules: nothing changes. No module
  sees any of this.
- A server with no provider configured behaves exactly as today.
- An app that predates this shows no button. Accounts with a password sign in as
  before. An account without one signs in on the web and approves the device through
  Quick Connect until the app updates.
- The database gains two tables: the (issuer, subject) links, and the join requests
  with the blocked identities. Changing a provider's issuer orphans the links to it,
  with no warning today.
- ACCT-3 ("never self-signup") is reworded. With "Invitation only", the default,
  nothing changes. With "Ask me first" an admin still admits every person. With "Create their account" the provider's access policy and
  the required group stand in for the invitation.

## Alternatives

**Do nothing.** KROMA stays the one service outside the household's provider, and the
forward-auth workaround keeps failing for every client that is not a browser. The
request will come back.

**A module.** Rejected. A module can look a session up and cannot mint one, and the
capability it would need is "sign in as any account", the worst grant the host could
hand out. The sign-in screen is also drawn before any account exists, and no shell
loads a module's frontend there. Jellyfin's SSO is a third-party plugin, and its
official apps do not offer it.

**Invitation only, as the one rule.** The first draft of this RFC. It is safe, and it
makes the operator invite by hand everyone the provider already knows, then explain why
the button refused them. It is the default, and the two other settings are one click
away for an operator who wants the provider to bring people in.

**Create an account for anyone the provider lets through, by default.** What most
self-hosted apps do. It is safe only when the operator restricted the application at
the provider, and nothing tells them when they did not.

**Trust a header from the reverse proxy** (`Remote-User`). Less code, and it has the
forward-auth problem in full, since apps and televisions do not pass through the
proxy's login. A server that trusts the header while reachable around the proxy lets
anyone type a username.

**LDAP.** The password still passes through KROMA, there is no single sign-on, and the
provider's second factor does not apply.

**Let the provider's groups grant admin or libraries.** It moves authorisation out of
the product to a claim format that differs per provider.

## Unresolved

The owner decides these in review.

1. **Back-channel logout.** Whether the server should accept the provider's logout
   notification and end that person's sessions. It would answer the fourth cost above,
   and few household providers send it.
2. **Telling the requester they were approved.** Today they try again. By mail when the
   server has mail delivery is the obvious next step.
3. **Group claims granting permissions.** Left out on purpose, see Alternatives.
4. **A first password for an account created through a provider.** Today that takes a
   reset link from an admin.
5. **More real providers.** Pocket ID, Authelia, Entra ID and Synology SSO Server each
   need one run before the guide names them as tested.
6. **A phone.** The phone flow needs one run on iOS and one on Android.
7. **Bundled logos.** Each preset's `preset.json` says where its mark was read. Google's,
   Microsoft's, Keycloak's, authentik's and Authelia's are their owners' own files. The
   others come from icon sets that follow the owner: SVG Logos (CC0), selfh.st/icons
   (CC BY 4.0), theSVG (MIT) and Simple Icons (CC0). The marks belong to their owners.
   Whether to ship them is the owner's call.
8. **Untested presets.** Only Keycloak and Authentik were run against KROMA. Every other
   preset's address was read from the provider's documentation or its live discovery
   document, and Synology's from neither. A preset is a starting point, and the test
   sign-in is what takes a provider live.

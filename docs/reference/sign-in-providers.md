# Sign-in providers: what the code relies on

What the provider sign-in relies on outside this repository: how the phone app
opens a system browser and comes back, and how real providers behaved when
KROMA was run against them. Each fact names its source. Read 2026-11-13 and
2026-11-14.

## Sources

- **X1**: Expo SDK 58 documentation, `expo-web-browser`,
  <https://docs.expo.dev/versions/latest/sdk/webbrowser/>.
- **X2**: Expo documentation, "Authentication",
  <https://docs.expo.dev/guides/authentication/>.
- **K**: Keycloak 26.4 (`quay.io/keycloak/keycloak:26.4`, `start-dev`) run
  locally on 2026-11-13, a realm with one confidential client, two users and
  one group, driven through KROMA's web client.
- **A**: Authentik 2025.10 (`ghcr.io/goauthentik/server:2025.10`) run locally
  on 2026-11-13, one OAuth2/OpenID provider and application, two users and one
  group, driven through KROMA's web client.

The runs below were made on 2026-11-14, each provider in a container on the
machine KROMA ran on, one confidential client and one person, driven through
**Test sign-in** in KROMA's web client. Each ended on "It works".

- **Dx**: Dex v2.47.0 (`ghcr.io/dexidp/dex`), a static client and a static
  password.
- **Gt**: Gitea 28.3.0 (`gitea/gitea`), an OAuth2 application made through
  its API.
- **Fj**: Forgejo 11.0.16 (`codeberg.org/forgejo/forgejo:11`), the same.
- **Pk**: Pocket ID 2.19.2 (`ghcr.io/pocket-id/pocket-id`), signed in to with
  a passkey from Chrome's virtual authenticator.
- **Ra**: Rauthy 0.37.2 (`ghcr.io/sebadob/rauthy`), over HTTPS.
- **Al**: Authelia v4.39.28 (`authelia/authelia`), over HTTPS with a
  certificate from a test CA, one client in its configuration file.
- **Zi**: ZITADEL v4.20.3 (`ghcr.io/zitadel/zitadel`), a Web application
  with the Basic authentication method.
- **Nc**: Nextcloud 35.0.2 (`nextcloud`) with the OIDC Identity Provider app
  2.6.2, a client made with `occ oidc:create`.
- **Lg**: Logto 1.46.0 (`svhd/logto`), a Traditional web application made
  through its Management API.
- **Fa**: FusionAuth 1.70.2 (`fusionauth/fusionauth-app`), an application
  made by a kickstart file.
- **Cd**: Casdoor 4.27.1 (`casbin/casdoor-all-in-one`), its built-in
  application.
- **K2**: Keycloak 26.4 again, with a Group Membership mapper on the client.

Nothing below was run on a phone. The phone app's flow is built from X1 and X2
and has its return path covered twice for the part they leave unsaid.

## The phone app's browser

- `WebBrowser.openAuthSessionAsync(url, redirectUrl, options)` resolves to
  `{ type: 'success', url }` or to `{ type }` with `cancel`, `dismiss`,
  `locked` or `opened` (X1).
- On iOS it opens the address "with Safari in a modal using
  `ASWebAuthenticationSession`", and "the user will be asked whether to allow
  the app to authenticate using the given url" (X1).
- On Android it is "done using a custom Chrome tabs browser, AppState, and
  Linking APIs" (X1).
- It resolves with `cancel` when the user refuses or closes the browser, and
  with `dismiss` when the browser is closed from code (X1).
- X1 does not say when it resolves with `success`, nor what `url` then holds.
  The app treats `success` as "came back on the redirect address" and reads
  the two query values from `url`. Anything else is a flow with no return.
- "To handle redirection back to the mobile application, the redirect URI set
  in the authentication server has to use the protocol provided as the scheme
  in app.json `expo.scheme`" (X1). The app's scheme is `kroma`, and the server
  redirects an app flow to `kroma://sso`.
- "If your project uses Expo Router, deep links are handled automatically"
  (X1). So a return link can also reach the router as a route. The app has a
  route at `sso` that collects the flow when the link is all that arrives, and
  the auth object gives two collectors of one flow the same answer.
- X1 says a `Linking.addEventListener` handler is "not needed and can have side
  effects" for the iOS session, and elsewhere tells apps without Expo Router to
  add one. It does not say which holds on Android. The app adds none and
  relies on the route.
- "Expo Go cannot be used for local development and testing of OAuth", and a
  development build "supports OAuth redirects back to your app" (X2).
- The package ships a config plugin. X1 does not say the plugin is required for
  `openAuthSessionAsync`. It is listed in `clients/mobile/app.json`.
- X1 lists Android, iOS and Web. It does not mention tvOS or Android TV, and no
  television shell uses it.

## Keycloak

- The issuer is `http(s)://HOST/realms/REALM` (K).
- A new confidential client signs ID tokens with RS256 and accepts the client
  secret both as HTTP Basic and in the body (K: discovery document).
- A user's groups are not in the ID token until the client has a "Group
  Membership" protocol mapper. With one whose claim is named `groups`, and full
  path off, KROMA reads the group names (K).
- The discovery document lists no `groups` scope, so KROMA asks for none (K).
- A test sign-in, a sign-in that creates the account, a second sign-in that
  reaches the same account, and the refusal of a user outside the required
  group all behaved as designed (K).

## Authentik

- The issuer is `http(s)://HOST/application/o/SLUG/`, with a trailing slash.
  Typing it without the slash also works: the discovery document is found, and
  its own spelling of the issuer is the one tokens are checked against (A).
- A provider with a signing key signs ID tokens with RS256. A provider with no
  signing key advertises `HS256` only and publishes no key, which KROMA refuses
  when the address is read (A).
- A user's groups arrive under `groups` with the `profile` scope, with no extra
  mapping (A).
- Authentik's login page keeps a hidden second password field. It matters only
  to a script that drives the page (A).
- The same four behaviours as Keycloak held (A).

## The other providers that were run

- **Dex.** The issuer is whatever its configuration names, a path included:
  `http://127.0.0.1:5556/dex` here (Dx).
- **Gitea and Forgejo.** The issuer is the instance's address. Gitea writes it
  with no slash after it and Forgejo with one (Gt, Fj). Both ask the person to
  authorize the application the first time (Gt, Fj).
- **Pocket ID.** A new client lets nobody in: the sign-in ends on "You are not
  allowed to access this service" until the client's access is set to all
  users or to chosen groups (Pk).
- **Rauthy.** The issuer is `https://HOST/auth/v1/`, slash included. ID tokens
  are signed EdDSA. Groups arrive under `groups` (Ra).
- **Authelia.** It answers over HTTPS only, so the KROMA server has to trust
  its certificate. Groups arrive under `groups` once the client's scopes list
  `groups` (Al).
- **ZITADEL.** The issuer is the instance's address (Zi).
- **Keycloak.** With the mapper in place, the groups arrived (K2).
- **Nextcloud.** The issuer is the instance's address with no slash after it,
  and the discovery document answers at `/.well-known/openid-configuration`
  under it. ID tokens are signed RS256. The person is asked to approve the
  application, and the page says the approval lasts 90 days. Groups arrive
  under `groups` (Nc).
- **Logto.** The issuer is the Logto endpoint followed by `/oidc`. ID tokens
  are signed ES384 and nothing else is offered. A person's roles arrive under
  `roles` once the `roles` scope is asked for (Lg).
- **FusionAuth.** A new tenant's issuer is `https://example.com`, which KROMA
  refuses as an address that does not match. A new application signs its ID
  tokens HS256, which KROMA refuses. With the tenant's issuer set to the
  instance's address and an RS256 key chosen for the application's ID token,
  the sign-in passed. A person's roles arrived under `roles` with the
  application's scope handling set to Compatibility and did not with Strict,
  the default (Fa).
- **Casdoor.** The issuer is the instance's address. A group arrives under
  `groups` written `organisation/group`. An instance opened on
  `localhost:8000` with no `origin` configured sends the browser to port 7001
  to sign in (Cd).

## A certificate from a private CA

The server's HTTP client is the `curl` program. With `CURL_CA_BUNDLE` naming a
bundle that held the test CA, the server reached Authelia and Rauthy (Al, Ra).

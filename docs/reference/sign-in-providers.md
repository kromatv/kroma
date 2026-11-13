# Sign-in providers: what the code relies on

What the provider sign-in relies on outside this repository: how the phone app
opens a system browser and comes back, and how two real providers behaved when
KROMA was run against them. Each fact names its source. Read 2026-11-13.

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

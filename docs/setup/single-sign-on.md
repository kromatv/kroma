# Sign in with your identity provider

For a household that already runs an identity provider, such as Authentik,
Keycloak or Pocket ID. When you finish, the KROMA sign-in screen has a
"Continue with" button for it, and you decide who that button lets in.

KROMA speaks OpenID Connect. Any provider that publishes a discovery document
and signs its ID tokens with RS256 or ES256 works. It has been run against
Keycloak 26 and Authentik 2025.10.

## Before you begin

- You can sign in to KROMA with an account that can change settings.
- You can create an application (some providers say "client") at your
  provider.
- You know the address your household opens KROMA on, for example
  `https://kroma.example.com` or `http://192.168.1.50:4040`.

## Create the application at your provider

1. In KROMA, open **Admin → Sign-in** and select **Add a provider**.
2. Copy the **Redirect URI** shown under the list.
3. At your provider, create an OpenID Connect application for KROMA. Paste the
   redirect URI where the provider asks for it.
4. Choose a signing key for the application if your provider asks. KROMA
   refuses a token signed with a shared secret (HS256).
5. Keep the provider's page open. You need three values from it: the issuer
   URL, the client ID and the client secret.

If people open KROMA on two addresses, one at home and one from outside,
register a redirect URI for each. Set `KROMA_WEB_URL` or a Remote Access
address first, so KROMA lists the addresses it accepts.

## Add the provider in KROMA

1. In **Provider**, choose yours. This sets the button's logo and shows an
   example of the address KROMA expects. Choose **Another provider** if yours
   is not listed: it works the same way.
2. In **Name**, type what the button should say after "Continue with".
3. In **Provider address (issuer)**, paste the issuer URL and select
   **Check**. KROMA reads the provider and says what it found, or what is
   wrong with the address.
4. Paste the **Client ID** and the **Client secret**. Leave the secret empty
   if your provider registered KROMA as a public client.
5. Select **Save**.

The provider now shows **Not tested**. Nobody sees its button yet.

## Test it

1. Select **Test sign-in** on the provider.
2. Sign in at your provider as yourself.

You come back to KROMA. A passing test shows who you signed in as and the
groups your provider sent, and the provider turns **Live**. The button is now
on the sign-in screen.

A failing test says which step broke. See
[If the test fails](#if-the-test-fails).

A test never creates an account and never signs anyone in.

## Choose who gets in

The provider proves who someone is. KROMA decides whether they come in. Two
settings on the provider control it.

**Required groups.** Leave it empty to accept everyone your provider lets
through. Type one or more group names, separated by commas, to accept only
their members. KROMA checks this at every sign-in, so removing someone from
the group stops their next sign-in. Use the names the test showed you.

**New people** decides what happens to someone KROMA has never seen:

| Setting | What happens |
| --- | --- |
| Ask me first | They file a join request. You approve it in **Admin → Users** and choose their permissions and libraries. This is the default. |
| Create their account | They get an account at once, with the permissions and libraries you choose here. |
| Invitation only | They are turned away unless they open an invitation link first. |

With **Create their account**, anyone your provider lets through gets in.
Restrict who can reach the KROMA application at your provider, or set a
required group.

## Choose the order and the look

**Admin → Sign-in** is one list: the password form, the passkey button and
each provider. Use the arrows on a row to move it.

The sign-in screen keeps the buttons together and the password form together,
with "or" between the two. Whichever you list first goes on top and gets the
highlighted button: put a provider above the password form and people see
"Continue with" your provider first. The buttons stay in the list's order.

A provider's button shows the logo of the provider you chose. To use a picture
of your own, open the provider and drop an SVG, PNG, JPEG or WebP file of at
most 256 KB on **Button picture**. Save the provider first: a picture is
stored at once.

## Link the accounts you already have

An existing account does not link itself by email. Each person links their
own:

1. Sign in to KROMA the usual way.
2. Open **Account**, find **Sign-in providers** and select **Link**.
3. Sign in at the provider.

A person who selects the provider button first, before linking, is told an
account already uses their email. They select **I already have an account**
and sign in once with their password to link it.

## Turn other methods off

In **Admin → Sign-in**, the switches on the **Password** and **Passkeys** rows
turn each one off.

Passwords can only go off while a provider is live. Accounts that can change
settings keep their password whatever the switch says, so a provider that is
down never locks you out of your server.

## Set it up from the environment

To keep the setup in a compose file, set these variables on the server. The
provider is live without a test, and its address cannot be edited in Admin.

| Variable | Value |
| --- | --- |
| `KROMA_OIDC_ISSUER` | The issuer URL |
| `KROMA_OIDC_CLIENT_ID` | The client ID |
| `KROMA_OIDC_CLIENT_SECRET` | The client secret. Leave it out for a public client. |
| `KROMA_OIDC_LABEL` | What the button says after "Continue with" |

## Sign in on a TV

Nothing changes. Sign in on your phone or in a browser, with the provider if
you like, then approve the TV from there. [TVs](tv.md) explains how.

## Sign in on a phone

The phone app shows the provider buttons under the password form. A button
opens your phone's browser on the provider, and brings you back to KROMA when
you have signed in. The app must reach the server on an address KROMA accepts:
the one you registered a redirect URI for.

The phone app does not sign in with passkeys, and you link a provider to an
existing account from the web.

The desktop app does not show the provider buttons yet. Sign in to it with a
password.

## If the test fails

| KROMA says | What to check |
| --- | --- |
| Nothing answered at this address | The issuer URL, and that the KROMA server can reach the provider. |
| The address answers, but it serves no OpenID Connect discovery document | The issuer URL. It is the address that, followed by `/.well-known/openid-configuration`, returns a document. |
| The provider refused the client ID or the client secret | Both values, copied again from the provider. |
| The provider refused the sign-in code | The redirect URI at the provider. It must match the one KROMA shows, character for character. |
| The provider signs with an algorithm this server refuses | The application's signing key at the provider. Choose RS256 or ES256. Authentik signs with a shared secret until you give the provider a signing key. |
| The ID token had already expired | The clock of the KROMA server and of the provider. |

## Provider notes

These come from running KROMA against each provider.

**Keycloak.** The issuer is `https://HOST/realms/REALM`. To use required
groups, add a **Group Membership** mapper to the client, name its claim
`groups` and turn **Full group path** off.

**Authentik.** The issuer is `https://HOST/application/o/SLUG/`. Select a
**signing key** on the provider. Groups need no setup.

## What KROMA does not do

- It does not sign people out when you remove them at your provider. Their
  open sessions keep working. A required group stops their next sign-in, and
  deleting their KROMA account ends every session at once.
- It does not give permissions from a group. You set permissions and libraries
  in KROMA.

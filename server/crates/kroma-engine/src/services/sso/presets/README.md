# Sign-in presets

One folder per provider the server knows by name. The build gathers them, so
adding a provider is adding a folder: nothing lists them, in Rust or in the
web client. The admin page reads the whole catalog from the server.

```
presets/
  google/
    preset.json    what the form starts with, the two links, the button's look
    light.png      the G on the light theme's fill
    dark.png       the G on the dark theme's fill
  authentik/
    preset.json
    mark.svg
    white.svg      a second mark, for a button filled with the brand's colour
```

## Add a provider

```bash
bun run server:preset zitadel \
  --name ZITADEL \
  --issuer https://INSTANCE.zitadel.cloud \
  --docs https://zitadel.com/docs/guides/integrate/login/oidc/login-users \
  --mark selfhst:zitadel
```

That writes the folder. `--mark` takes an icon from
[Iconify](https://icones.js.org) as `set:name`, or a path to an SVG or a PNG
you downloaded from the provider. Then check it:

```bash
cd server && cargo test -p kroma-engine presets
```

The tests read every folder and name what is wrong with one: a field the
manifest does not know, a colour that is not `#rrggbb`, a mark that is
missing, carries a script or is not the kind of file its name says, a link
that is not https.

## `preset.json`

| Field | Needed | What it is |
| --- | --- | --- |
| `name` | yes | The provider's name, written as its owner writes it. |
| `label` | no | What the button reads after "Continue with", where that is not `name`: `Microsoft` for Microsoft Entra ID. |
| `issuer` | yes | What the address field starts with. The real address where every server shares one (`https://accounts.google.com`), else a pattern: `example.com` for the operator's own host, capitals for an id to replace (`TENANT_ID`). |
| `docs` | yes | The provider's own page on registering an OpenID Connect application. |
| `console` | no | Where the application is made, when that is one address for everybody. |
| `scopes` | no | Scopes to ask for on top of `openid profile email`. The server adds `groups` by itself when the provider offers it. |
| `groupClaim` | no | The claim that lists a person's groups in the ID token. `groups` when left out. |
| `icon` | no | The kit glyph a client draws where it cannot draw the mark. `key` when left out. |
| `mark` | no | The file drawn on a white tile, where no button is. `mark.svg` when left out. An SVG, or a PNG where the owner publishes its mark as nothing else. |
| `brand` | no | How the button is painted. Left out, it looks like the others on the screen. |
| `sources` | yes | Where the facts were read. `mark` is asked of every preset; `brand` and `issuer` say where those came from. |

`brand` is one look for every ground, or one for each:

```json
"brand": { "fill": "#fd4b2d", "ink": "#ffffff", "mark": "white.svg" }

"brand": {
  "dark": { "fill": "#131314", "stroke": "#8e918f", "ink": "#e3e3e3", "mark": "mark.svg" },
  "light": { "fill": "#ffffff", "stroke": "#747775", "ink": "#1f1f1f", "mark": "mark.svg" }
}
```

`fill` is the button, `stroke` its edge when the provider draws one, `ink` its
label, and `mark` the file that sits on the fill.

## What a button may look like

A preset shows another company's brand, so the brand's owner decides:

1. **The owner publishes rules for a sign-in button.** Follow them, and take
   the mark from the owner's own files, untouched. Google and Microsoft do.
2. **The owner publishes a mark for dark grounds and a brand colour.** Fill the
   button with the colour and put that mark on it. authentik and Keycloak do.
3. **Neither.** Leave `brand` out. The button is the screen's own and wears the
   mark on a white tile, which reads on any ground.

Never recolour a mark, redraw one or keep an old one. Take it from the owner
first, then from an icon set that follows the owner, and write which in
`sources`.

A phone draws a mark with its system's SVG renderer, which knows paths,
shapes, gradients and masks. It does not draw a blur filter or a
`foreignObject`. A mark that needs either ships as the owner's PNG: Google's
does.

## What a preset does not do

It changes nothing about how the provider is spoken to. A provider KROMA
cannot sign in with gets no preset: one whose tokens are not signed RS256,
ES256, ES384 or EdDSA, or that publishes no discovery document under its
issuer.

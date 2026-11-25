# Inspecting a screen

The kit can say what it has on screen: the kit components that are mounted,
under their public names (`Dialog.Footer`, `ChoiceList.Item`), with a short
summary of their props and the box each one occupies. A developer tool reads it
in a browser. A television in a release build has no debugger, so an admin reads
it through the server instead, over the event socket the television already
keeps open while it is signed in.

## What the reader returns

`describeScreen()` (`@kromatv/ui/inspect`) walks every tree mounted under a
`KitProvider` once and returns a tree:

```ts
{ fibers: number; nodes: KitNode[] }
// KitNode = { name, props, box, focused?, children: KitNode[] }
```

- `fibers` is how many React fibers the walk read.
- `name` is the name the kit's door exports the component under. A component the
  kit does not export (an app component, a host view) is not a node: its kit
  children are lifted to the nearest kit parent. A subtree React keeps mounted
  but hidden (a suspended boundary's content, a hidden `<Activity>`) is left
  out.
- `props` holds at most 24 entries plus a `…` entry counting the rest. A prop
  name is cut at 40 characters and a string at 120, a number that is not finite
  becomes a string, and anything that is not a primitive becomes a tag
  (`[element]`, `[array 3]`, `[object]`, `[function]`). What was typed into a
  field that hides it (a password, a PIN, a one-time code) is reported as
  `[secret]`.
- `box` is `{ x, y, width, height }` in the viewport's pixels, measured from the
  component's first host element, or `null` when it has none.
- `focused` is `true` on the kit component that holds the focus: the nearest
  kit component around the element the remote or the keyboard is on. That is
  usually the `Focusable` inside a control, so the node above it says which
  control it is (`Button`, `MediaCard`). No other node has the key, and none
  has it when nothing holds the focus. A control records its element as it
  takes the focus and forgets it as it loses it, so a render does nothing more.

`screenRows(tree)` from the same entry flattens it for the wire: rows in
document order, a parent before its children, each with its `depth`. It keeps at
most 2,000 rows and at most 1,000,000 bytes of JSON, and says `truncated: true`
when it stopped early:

```json
{
  "fibers": 771,
  "truncated": false,
  "rows": [
    { "depth": 0, "name": "KitProvider", "props": { "children": "[element]", "config": "[object]" }, "box": { "x": 0, "y": 0, "width": 0, "height": 0 } },
    { "depth": 1, "name": "PerfProvider", "props": { "children": "[element]", "debug": true }, "box": { "x": 0, "y": 0, "width": 1920, "height": 0 } }
  ]
}
```

The row of the component that holds the focus carries `focused`, and no other
row has the key:

```json
{ "depth": 16, "name": "Focusable", "props": { "autoFocus": true, "label": "Play" }, "box": { "x": 61, "y": 586, "width": 155, "height": 71 }, "focused": true }
```

## In a browser

Every mounted `KitProvider` exposes the reader on the page. It loads on its
first call:

```js
await __KROMA_UI__.describeScreen(); // the tree above
await __KROMA_UI__.screenText(); // the same screen as text
```

This works in the web client, the desktop shell and the browser TV shells, on a
development server and in a release build, from the developer tools console or
from anything that can evaluate in the page.

`screenText()` is the form to read. It writes one component a line, indented
two spaces a level: its name, `(focused)` on the one that holds the focus, its
box as `x,y widthxheight`, then its props. A prop that is `true` is its name
alone, and one that is not a primitive (a function, an element, an object) is
left out. On the home screen of the browser TV shell it is 136 lines, half the
characters of the tree as JSON:

```
FocusRegion  64,587 510x68
  Button  61,586 155x71  size="tv" autoFocus icon="player-play-filled" label="Play"
    Focusable (focused)  61,586 155x71  autoFocus asChild=false disabled=false inert=false focusScale=1.04 label="Play"
      Icon  103,610 23x23  name="player-play-filled" color="var(--kroma-accent-ink)" size=22
      Text  135,605 40x31  children="Play"
```

A script that drives the page reads it the same way. With Playwright, pressing
a key and reading where the focus went is two lines:

```js
await page.keyboard.press('ArrowDown');
console.log(await page.evaluate(() => globalThis.__KROMA_UI__.screenText()));
```

`screenText(rows)` from `@kromatv/ui/inspect` writes rows in the same form,
for the ones a television answers with through the server.

## On a television, through the server

A signed-in television says `screen.hello` on its event socket once per
connection, with the id it also uses for cast. The server lists it for as long
as that socket stays open. Both routes need an account with an admin
capability, and they only reach screens signed in as that same account: another
account's screen answers like one that does not exist. The server ignores the
hello of an account with no admin capability, so its screens are never listed.

`GET /api/admin/diagnostics/screens` lists the caller's live screens:

```sh
curl -H "Authorization: Bearer $TOKEN" https://kroma.example/api/admin/diagnostics/screens
```

```json
{ "screens": [{ "id": "tv-349b9fd6-f626-41d5-93d8-ccd226b1ac74", "name": "Salon", "platform": "Tizen" }] }
```

`POST /api/admin/diagnostics/screens/{id}` asks one of them and waits for the
answer, which is the rows above:

```sh
curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://kroma.example/api/admin/diagnostics/screens/tv-349b9fd6-f626-41d5-93d8-ccd226b1ac74
```

| Status | Meaning |
| --- | --- |
| 200 | The screen answered. The body is `{ fibers, truncated, rows }`. |
| 403 | The account has no admin capability. |
| 404 | No live screen with that id on this account. |
| 429 | Four requests are already open on this account. |
| 504 | The screen did not answer within 5 seconds, or its socket closed first. |

The television loads the reader only when a request reaches it, so a screen
nobody asks pays for one hello per connection and nothing else. An answer over
1 MiB is dropped by the server, which is why `screenRows` stops short of it.

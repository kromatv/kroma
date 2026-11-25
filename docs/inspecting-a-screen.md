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
// KitNode = { name, props, box, children: KitNode[] }
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

## In a browser

Every mounted `KitProvider` exposes the reader on the page. It loads on its
first call:

```js
await __KROMA_UI__.describeScreen();
```

This works in the web client, the desktop shell and the browser TV shells, from
the developer tools console or from anything that can evaluate in the page.

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

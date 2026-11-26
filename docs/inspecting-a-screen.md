# Inspecting a screen

The kit can say what it has on screen: the kit components that are mounted,
under their public names (`Dialog.Footer`, `ChoiceList.Item`), with a short
summary of their props, the box each one occupies, and which texts that box
cuts off. A developer tool reads it
in a browser. A television in a release build has no debugger, so an admin reads
it through the server instead, over the event socket the television already
keeps open while it is signed in.

In a browser it can also change what a control holds. A Switch, a Checkbox or a
Disclosure says which setters and actions it takes, and a call runs one by name:
the function the component itself calls on a press, with no press simulated.

## What the reader returns

`describeScreen()` (`@kromatv/ui/inspect`) walks every tree mounted under a
`KitProvider` once and returns a tree:

```ts
{ fibers: number; nodes: KitNode[] }
// KitNode = { name, props, box, focused?, clipped?, control?, children: KitNode[] }
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
- `clipped` is on a `Text` its own box cuts, as `{ width, height }`: how many
  pixels of the text lie past the box across and down, whether a `lines` clamp
  (an ellipsis, a line clamp) or an `overflow` in its style cuts them. No other
  node has the key, and neither does a text that fits. Across, a pixel of
  rounding does not count. Down, the cut has to pass half a line, so a line box
  shorter than its font is not taken for a dropped line: the reader cannot
  tell a cut accent from spare room above the letters, so neither is reported.
  A text that fits its own box while a parent cuts that box is not marked
  either. In a browser the reader measures the text's element: how far its
  content scrolls past its client box, on each axis its computed `overflow`
  does not leave `visible`. Under React Native (Apple TV, Android TV, the
  phones) it does not measure it yet and no node has the key: a paragraph lays
  out only the lines it keeps, and `onTextLayout` does not say on every
  platform whether it dropped any.
- `control` is on a component that runs a control (`useControl`, see
  [`DESIGN.md`](../packages/ui/src/components/DESIGN.md) §5), as
  `{ ref, kind, state, actions }`. `ref` names the control in a call: `c4`, its
  own for as long as it is mounted. `kind` is the name its definition was given.
  `state` is every key it holds, reduced like props, whether the control or the
  app owns the key, except that a list or a record reads as one, two levels
  deep: `value: ["fr", "en"]`, a list of records of primitives. What lies
  deeper is its tag, a list keeps 24 entries and ends with `"…+N"` for the
  rest, and a record keeps 24 plus a `…` entry. Under a field that hides what
  was typed, a list or a record at `value` reads `[secret]` like a string.
  `actions` is what a call may ask of it now: its setters, its
  actions that take arguments, and its other actions when they would change
  something. An action is a pure function, so the reader tries it on the state
  as it is. A disabled component lists none. An app component that runs a
  control is a node too, under the control's kind. On a page with a second
  `KitProvider` tree, that tree's refs are `2:c4`.

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

The row of a text its box cuts carries `clipped`, here a German label 8 pixels
wider than its column:

```json
{ "depth": 12, "name": "Text", "props": { "children": "Gefolgt", "lines": 1 }, "box": { "x": 412, "y": 188, "width": 60, "height": 20 }, "clipped": { "width": 8, "height": 0 } }
```

`bun run shots:clip` reads every page of the web client and the main screens
of the TV app this way, in every language the product offers, and lists each
clipped text: see [`packages/shots/README.md`](../packages/shots/README.md#clipped-text).

A row keeps the `control` of its node:

```json
{ "depth": 9, "name": "Switch", "props": { "size": "sm", "label": "Subtitles" }, "box": { "x": 316, "y": 221, "width": 46, "height": 28 }, "control": { "ref": "c1", "kind": "switch", "state": { "checked": false }, "actions": ["setChecked", "toggle"] } }
```

## In a browser

Every mounted `KitProvider` exposes the reader on the page. It loads on its
first call:

```js
await __KROMA_UI__.describeScreen(); // the tree above
await __KROMA_UI__.screenText(); // the same screen as text
await __KROMA_UI__.snapshot(); // the controls on screen
await __KROMA_UI__.act({ steps: [{ ref: 'c1', action: 'toggle' }] }); // change one
```

This works in the web client, the desktop shell and the browser TV shells, on a
development server and in a release build, from the developer tools console or
from anything that can evaluate in the page.

`screenText()` is the form to read. It writes one component a line, indented
two spaces a level: its name, `(focused)` on the one that holds the focus,
`(clipped +WxH)` on a text its box cuts by W pixels across and H down, its box
as `x,y widthxheight`, then its props. A prop that is `true` is its name
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

A text its box cuts says by how much, after its name:

```
Text (clipped +8x0)  412,188 60x20  children="Gefolgt" lines=1
```

A component that runs a control has its ref after its name and ends with its
state and the actions a call may ask of it now. Its state is not repeated among
its props, and a list or a record in it is written as compact JSON
(`value=["fr","en"]`):

```
Switch [c1]  316,221 46x28  size="sm" label="Subtitles"  state: checked=false  actions: setChecked, toggle
```

`screenText(rows)` from `@kromatv/ui/inspect` writes rows in the same form,
for the ones a television answers with through the server.

## Changing what a control holds

`snapshot()` is the controls of the screen and nothing else, in document order:

```json
[
  {
    "ref": "c1",
    "name": "Switch",
    "kind": "switch",
    "state": { "checked": false },
    "actions": ["setChecked", "toggle"],
    "box": { "x": 316, "y": 221, "width": 46, "height": 28 }
  }
]
```

`act(call)` runs the steps of a call in order. A step names a control by its
`ref`, one of its `actions`, and the arguments that takes:

```js
await __KROMA_UI__.act({
  steps: [
    { ref: 'c1', action: 'toggle' },
    { ref: 'c8', action: 'setOpen', args: [false] },
  ],
});
```

```json
{
  "ok": true,
  "steps": [
    { "step": 0, "ref": "c1", "action": "toggle", "outcome": "changed" },
    { "step": 1, "ref": "c8", "action": "setOpen", "outcome": "changed" }
  ],
  "controls": [
    { "ref": "c1", "name": "Switch", "kind": "switch", "state": { "checked": true }, "actions": ["setChecked", "toggle"], "box": { "x": 316, "y": 221, "width": 46, "height": 28 } },
    { "ref": "c8", "name": "Disclosure.Root", "kind": "disclosure", "state": { "open": false }, "actions": ["setOpen", "toggle"], "box": { "x": 316, "y": 254, "width": 420, "height": 51 } }
  ]
}
```

A step takes the path every change takes. The app's `on<Key>Change(next,
details)` runs with `details.source === 'tool'`, so it can tell the call from a
person and `details.cancel()` it, and a key the app owns moves only if the app
moves it. `outcome` is `changed` when the control took the value or asked the
app to, `unchanged` when it already held it, and `canceled` when the app
refused. `controls` is every control the steps named as it reads afterwards,
which is where to check what a key the app owns ended up holding. Each step
waits for React to commit before the next one runs.

Before anything is written, a step is tried on the state as it is, which an
action allows because it is a pure function. The call stops at the first step
that cannot run, with `ok: false` and an `error` that says what to send
instead. The steps before it stay done.

| A step is refused when | `error.message` |
| --- | --- |
| no mounted control has that ref | `c9: no such control is mounted. Read the screen again for its refs.` |
| the component is disabled | `c1.toggle: the switch is disabled.` |
| the control has no such setter or action | `c1.press: the switch has no such action. It takes: setChecked, toggle.` |
| a key would get a value of another kind | `c1.setChecked: checked holds a boolean, and "yes" is not one.` |
| a setter gets no value or several | `c1.setChecked: it takes one value, the checked to hold.` |
| an action gets more arguments than it takes | `c1.toggle: it takes no argument.` |
| the action throws | `c1.halve: it threw "odd".` |
| the app's callback throws | `c1.toggle: the app threw "offline".` |

A call is at most 50 steps of at most 8 arguments each. One that is not
`{ steps: [{ ref, action, args }] }` is refused whole, with an example in the
message. Every kit component whose value or open state an app can also own
runs a control: Switch, Checkbox, Disclosure, TextField, TextArea, OtpField,
PinField, Command, Menu, Select, Stepper, Chart, Cropper and Resizable. A
Field's value is held by the entry it renders. The television routes below
carry the rows without `control` (with `clipped`), and have no route for a call
yet.

## As WebMCP tools

In a browser that exposes WebMCP (`document.modelContext`), the first
`KitProvider` on a page also registers the reader and `act` there as three
tools. Chrome DevTools, an extension or an agent the browser runs can then call
them by name, without evaluating anything in the page:

| Tool | Takes | Answers with |
| --- | --- | --- |
| `read_screen` | nothing | `screenText()` |
| `list_controls` | nothing | `snapshot()` |
| `change_controls` | `{ steps: [{ ref, action, args }] }` | `act(call)` |

`change_controls` describes what it takes with the JSON Schema of the zod schema
`act` parses a call with, so the two cannot drift. Every tool is marked
`debugging`, so an agent that acts for a user can leave it out, and
`untrustedContentHint`, because what a screen shows (a title, a name, what was
typed) comes from files and people the page does not control. The two reads are
also marked `readOnlyHint`.

Chrome exposes WebMCP behind a flag, or to an origin that carries an origin
trial token, which a self-hosted server does not. To call the tools:

1. Open `chrome://flags/#enable-webmcp-testing`, set **WebMCP for testing** to
   **Enabled**, and relaunch Chrome.
2. Open the page, then DevTools, **Application**, **WebMCP**. The three tools
   are under **Available tools**. Select one to see what it declares, fill in
   its parameters under **Run tool**, and press **Run tool** to call it. Every
   call, from there or from an agent, is listed above the tools with its
   status, what it was given and what it answered.

Chrome DevTools MCP lists a tool marked `debugging` as a third-party developer
tool: `list_3p_developer_tools` and `execute_3p_developer_tool`, once it runs
with `--categoryExperimentalThirdParty`.

Where the browser has no WebMCP, nothing is registered and nothing more loads:
the tools' code loads with their registration. The tools are what
`__KROMA_UI__` already gives the page, in a release build as on a development
server. A read shows what a person sees, with what a field hides as
`[secret]`. A change takes the path a press takes, signed `tool`, for the app's
callback to refuse.

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

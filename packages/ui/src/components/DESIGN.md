# Designing a component's API

This document owns **the shape of a component's public surface**: what becomes a
part, what stays a prop, what those things are called, and how a caller gets out
when the API does not cover them.

It deliberately does not repeat what other documents own. One link each:

- The six levels and what earns a place at each: [`README.md`](./README.md).
- `sv`, `<Box>`, `styles()`, themes, tokens, the 1920x1080 stage:
  [`packages/ui/README.md`](../../README.md).
- Stories and demos: [`@kroma/workbench`](../../../workbench/README.md).
- Comments, naming, file size: [`CODE_STYLE.md`](../../../../CODE_STYLE.md).

The rules below are drawn from Radix, Base UI, Ark UI, shadcn/ui and React Aria,
and from the two facts that make this kit different from all of them: it is
authored against React Native, and it is driven by a D-pad as often as by a
pointer.

---

## 1. One vocabulary, and it is law

A component that is a set of parts exposes them as a **namespace object**:

```tsx
const Select = { Root, Trigger, Value, Item, Indicator };
export { Select };
```

Not `Object.assign(Select, { … })`. The bare name is never renderable, so there
is exactly one way to write every component and no ambiguity about whether
`<Select>` means anything. A face lives on the **part** that names it (§4), never
on a callable root.

**The object is not tree-shakable, and that is accepted knowingly.** Measured on
the repo's own Vite: a five-part namespace whose parts are 9.8 KB each emits
50,106 bytes when a caller touches one of them, against 9,825 for the same parts
exported individually. `/*#__PURE__*/`, `Object.freeze` and getters change
nothing; exporting the parts beside the object recovers the bytes only for a
caller who stops writing `Select.Root`, which is the API. What it costs in this
kit is small, because a compound's parts are nearly always used together: the
worst is `InputGroup` at 4.0 KB gzipped (its `Textarea`, `Button` and
`IconButton` parts are the only reason those atoms enter the graph), then `Field`
at 0.7 KB, and every other compound is under 300 bytes. Do not trade the
vocabulary for that.

Part names come from this table. A name denotes a **role**, never a position,
never an input device, never a boolean spelled as a string.

| Part | Means | Notes |
| --- | --- | --- |
| `Root` | Owns state, semantics and context. | Required. Every compound has one. |
| `Trigger` | The control that opens or toggles the thing. | Required for anything that opens a surface. |
| `Panel` | A region the surface swaps in: expanding, collapsing, or taking the whole stage over. | Accordion, tabs, collapsible, and a player's stopped-state takeover. Not `Backdrop`, which is the inert scrim and never holds a control. |
| `Popup` | The floating, styled, animated box. | Mounts itself into the overlay host. |
| `Backdrop` | The scrim over inert content. | Not `Overlay`, which reads as the popup. |
| `Item` | One selectable or actionable entry. | Namespaced (`Menu.Item`), never prefixed. |
| `Leading` / `Trailing` | The head and tail of a row: media, a face, a chevron. | Named for the end of the row, not for what is put there. Neither is a second focus stop. |
| `Indicator` | The selected/checked face. | **Never pressable.** See §2. |
| `Label` | The accessible name for the control. | |
| `GroupLabel` | A section heading inside the surface. | Never overload `Label` for this. |
| `Hint` | Help text about a CONTROL, wired to the description role. | The one spelling. `Description` and `HelperText` are banned as synonyms. |
| `Subtitle` | The second line of a HEADING. | Not a synonym for `Hint`: a hint describes a control to assistive tech, a subtitle is part of the title block. If it is not attached to a control, it is a subtitle. |
| `Detail` | The technical particular behind the hint: an error's cause, a code. | Distinct from `Hint`. `Hint` helps a user act; `Detail` is what they paste into a bug report. |
| `Actions` | The controls a surface offers: pinned to the end of a header, or under an empty state. | Always plural, even when it holds one button. It is a region, and `Action` beside `Actions` is a name one letter from another name. |
| `Input` / `Textarea` | The text entry a field owns. | Named for the entry, not the field. |
| `Value` | The thing being reported: a selection inside a trigger, a readout beside its `Label`. | Reports, never controls. `Select.Value` and `DataField.Value` are the same role. |
| `Media` | The mark that stands for the thing: a glyph, a poster, an avatar, an illustration. | A leaf: `name` for a glyph the kit can size, children for media it cannot. shadcn's `EmptyMedia` is the same idea. |
| `Icon` | A glyph that is an affordance on a control. | A **prop** (`<Button icon>`), never a part. Where the mark is the subject rather than an affordance, it is `Media`. |
| `Group` / `Separator` | A section of items; a divider. | A separator is always semantic. |
| `Slot` | One fixed position in a composite value: a character of a code. | Never pressable. Its place comes from its position in its `Group`, never from an index prop, because a hand-written index duplicates what the tree already says and a wrong one fails silently. |
| `Close` / `Title` | Dismisses; names the surface. | |
| `List` | The scrollable container of items. | Only where a virtualiser needs a real node. |
| `Empty` | What a collection shows in place of itself when it holds nothing. | A sibling of the `List`, never a child of it: exactly one of the two draws. Distinct from `<EmptyState>`, the molecule it is usually made of. |
| `Handle` | The grip on a boundary a reader may move: a seam between panels. | The WHOLE strip is the control, so nothing inside it is pressable. Not `Resizer`, not `Splitter`, not `Divider` - a divider draws, a handle moves. |
| `Addon` | A member of a group that nothing can press, shaped like the controls beside it: a protocol, a unit, a suffix. | Named for the role, not the content. `InputGroup.Addon` and `ButtonGroup.Addon` are the same thing. |
| `Previous` / `Next` | A step backwards or forwards through a sequence. | Named for the direction, never for the glyph that draws it. |
| `Pages` / `Ellipsis` / `Status` | The run of page entries; the gap standing for the pages it skips; the "12 of 40" readout. | Pagination's own three. `Status` reports, it does not control. |
| `Header` / `Footer` | Layout regions of a surface. | Layout, not semantics. |

**Banned**: `Content` (meant a floating box in one library and an in-flow region
in another) and `Viewport` (meant two different things in two libraries). Use
`Panel` or `Popup`, and `List`.

`Portal`, `Positioner` and `Anchor` are **not parts here**. React Native has no
portal, so a `Portal` part a caller must remember to write is a native bug
waiting to happen. `Popup` mounts itself. A positioner's transform is owned by
the layout engine and must not also be a caller's; keep it internal. An anchor
is one node with one position and no children, so it is a prop on the Root
(`anchor={ref}`).

Adding a part means adding a row to this table **in the same commit**.

---

## 2. The Root owns; a part is a face

A caller must not be able to arrange the parts into something that lies to a
screen reader or steals a D-pad stop.

- **The Root draws the group role**, the parts carry their own. Nobody can
  compose a `radiogroup` that contains checkboxes.
- **The whole row is the control.** A television has one D-pad stop per row and a
  pointer deserves a hit area the size of the thing it is aiming at. So an
  indicator is a FACE (`<CheckboxFace>`, `<SwitchFace>`) with nothing pressable
  about it, and the row carries the semantics.
- **A container DECLARES to its parts; it cannot read them.** There is no
  `:first-child` here and Yoga has no `order`. A Root that needs to know its own
  contents walks its **direct** children once, sorts them, and publishes what it
  learned through context: a position (`first`/`middle`/`last`), a padding, the
  layout the shell takes. `<ButtonGroup>` and `<InputGroup>` are both this.

The corollary is real API, and it must be documented on the component: a part
must be a **direct child** to be sorted, and only a part that reads the context
takes part in the shape.

---

## 3. Composition by default; data by named exception

Composition is the default. Take a `data` array plus a render function **only**
when one of these six tests forces it, and say which test in the commit
message, so the exception does not spread by imitation.

| Test | When it forces data |
| --- | --- |
| **T1 Leaf** | The part has no addressable child and exactly one sensible position. `<Button icon>` beats `<Button.Icon>`. Ask: could a caller want two, or one elsewhere? If no, it is a prop. |
| **T2 Virtualiser** | The collection can be long enough to need windowing. `FlatList`/`FlashList` **require** a `data` array; materialising N children to hand to a virtualiser defeats it. |
| **T3 Provenance** | The collection comes off the wire: a server-driven menu, a module manifest, a locale catalogue. Rendering data as children means writing a JSX interpreter over a parsed array. |
| **T4 Order-is-policy** | The arrangement must vary by locale, direction or platform. Dialog action order and RTL are policy; a caller cannot be asked to encode policy in JSX order, and there is no `order` to fix it afterwards. |
| **T5 Invalid arrangement** | Some arrangement a caller could write would break semantics or D-pad traversal. Then do not expose the parts that permit it. |
| **T6 Identity** | A data collection needs stable ids. If you cannot name one, you probably have a static collection and children are correct. |

T2 is the boundary that does not exist on the web, and it is the one that bites
hardest here. React Aria kept children syntax for collections and paid for it
with an entire fake-DOM implementation: a miniature `createElement`/
`appendChild` that the collection renders into before a second pass into the real
tree. That cost is the proof: children *and* data is not free. Do not pay it.

---

## 4. A face is written as its part

**If a part exists for a face, that face has no prop.** There is one spelling,
and it is the part:

```tsx
<ChoiceList.Item value="fr">
  <ChoiceList.Label>Francais</ChoiceList.Label>
  <ChoiceList.Hint>128 titres</ChoiceList.Hint>
</ChoiceList.Item>
```

This document used to say the opposite: keep a `label`/`hint` shorthand so the
common row stays one line. That is withdrawn, for three reasons the kit paid for
before the rule changed.

**Two spellings are two APIs.** Every reader learns both, every review allows
both, and they drift. The shorthand was the road nearly every call site took, so
the parts were the untested one: `<Callout>`'s `title` and `<Callout.Title>` were
kept in step by a test asserting the two render byte-identical HTML, which is the
cost of the second API written down.

**The shorthand hides the shape.** A caller who only ever writes `title=` never
learns the component is a set of parts, so the first time the design wants a badge
beside the title they ask for another prop. That is how `<PageHeader.Root>`
arrived at `title`, `suffix`, `icon`, `subtitle` and `actions`: five props
forwarding to three parts, two of them existing only to decorate one of the
others. Written as parts it is `<PageHeader.Title icon suffix>` and the question
never comes up.

**A prop cannot be arranged.** The moment a row is a label AND a badge, or a
title with a chip after it, the shorthand is spent and the caller rewrites the
whole call site into parts anyway. Composition is what the component is for; the
shorthand only delays reaching it.

### The test that survives, inverted

The old rule's test was: delete the sugar and every behaviour must still be
reachable through the parts. That test is now the migration's obligation.
**Deleting a prop must leave nothing unreachable.** Where it would, the answer is
a **new part**, never the prop back.

`<Drawer.Root>`'s header drew a close button; composing `<Drawer.Header>` silently
dropped it, and nine call sites had already hand-rolled their own and wired
`onClose` a second time. The fix was `<Drawer.Close>`, which reads `onClose` off
the shell context and renders nothing when the sheet cannot be dismissed. The
behaviour became reachable; it did not become a prop again.

Where the thing being deleted was also **semantics**, keep the semantics. A row's
accessible name comes from the plain text of its `<ListRow.Label>`; a row whose
middle column is a component that says its words through props has no text for the
row to read, so `<ListRow.Root label>` survives as a name that draws nothing.

### What is not a face

The rule is about faces. It does not strip the kit of props.

- **A leaf keeps its data props.** `<Button label>` and `<Chip label>` have no
  parts to write, and T1 in §3 is why.
- **Identity and behaviour stay props**: `value`, `id`, `disabled`, `selected`,
  `onPress`, and `icon`. §1's table says an icon is a prop and never a part.
- **The accessible name stays a prop where it is not drawn**: `<ChoiceList.Root
  label>`, `<InputGroup.Root label>`, `<Dialog.Root title>`. These name the thing
  to assistive tech; the fact that a Root may also draw a default header from one
  does not make it a face a part exists for.
- **A `data` collection is §3's question, not this one.**

### The escape-hatch ladder

1. **A named part.**
2. **`render={(props, state) => ReactElement}`**, the **function form only**, on
   **leaf parts only**. The caller spreads explicitly.
3. **An exported context hook** (`useChoiceItem()`, `useMenuItem()`). No prop
   merging at all, and unlike a cloned child it survives arbitrary wrapper depth.

### Do not add `asChild`

`asChild` solves a DOM-only problem: semantics live on the element tag, so a
trigger sometimes has to be an `<a>` and sometimes a `<button>`. Here semantics
are props (`role`, `accessibilityRole`), so that decision does not exist. What
would remain is only the prop merge, and the merge is worse here than on the web:
`style` is a positional array whose precedence is order, press is a family
(`onPress`/`onPressIn`/`onPressOut`/`onLongPress`) with focus and hover on top for
TV, and a host ref is a component instance with `measure`, not a node. An
implicit merge over that surface is guesswork.

This is why rung 3 is the function form only. The element form's entire value is
the automatic merge, which is exactly the part that does not survive. Making the
caller spread explicitly is the feature.

One narrow exception earns a typed, component-specific prop: router delegation.
Name it for what it does (`as={RouterLink}`), never `asChild`.

---

## 5. Controlled and uncontrolled

One signature, everywhere:

```
<thing>            controlled value
default<Thing>     uncontrolled initial value
on<Thing>Change    (next, details) => void
```

Giving the pairs `value`/`defaultValue`/`onValueChange`,
`open`/`defaultOpen`/`onOpenChange`, `checked`/`defaultChecked`/`onCheckedChange`,
`expanded`/`defaultExpanded`/`onExpandedChange`.

- **Never `onChange`.** In React DOM `value` + `onChange` means a form input with
  its own semantics, and reusing it invites `e.target.value`.
- **Controlled-ness is per prop and fixed at mount.** `useControllable`
  (`#ui/lib/use-controllable`) pins the mode on first render for exactly the
  reason React warns about an input flipping between the two.
- **Value first, details second.** `(next, details)` keeps the 95% call site as
  `onValueChange={setPicked}`; a details-only object costs every call site a
  destructure.
- **A dismissal carries its reason.** One `onOpenChange(open, details)` with
  `reason` beats four separate outside/escape/focus handlers, and this kit has a
  reason the web does not: `reason: 'back'`, the remote's Back button.

---

## 6. Telling a caller what state a part is in

There is no CSS and no attribute selector on native, so `data-state` has no
equivalent. Three channels, in order:

1. **The recipe.** `sv` paints `_hover`/`_focus`/`_press`/`_disabled`. The
   component computes the state; the recipe paints it. This covers almost
   everything and costs nothing.
2. **Render-prop-with-state**, for a caller who must render *differently* rather
   than paint differently: `children` as a function of a state object.
3. **An exported context hook**, for a subtree several levels below the part,
   where a render prop at every level is unbearable.

Use **one state vocabulary** across all three, matching the recipe: `hover`,
`focus`, `press`, `disabled`, bare and unprefixed. Extend the render-prop state
object with the semantic states the recipe treats as variants: `selected`,
`open`, `checked`, `expanded`, `invalid`, `first`, `last`.

The distinction that decides which is which: **interaction state is a state,
semantic state is a variant.** A toggle's pressed-in reading is owned by the
component's props, not by the pointer.

On react-native-web targets, also emit `dataSet` for the same states. It costs a
prop and it gives the web shells stable selectors without test ids.

---

## 7. Prop naming

| Use | Not |
| --- | --- |
| `label` | `title`, `text`, `name` (for the accessible name) |
| `hint` | `description`, `helperText` (`subtitle` is a different role, see §1) |
| `icon` | `glyph`, `iconName` |
| `tone` | `color`, `intent`, `status`, `severity` |
| `size` | `scale`, `density` |
| `disabled` | `isDisabled`, `enabled` |
| `multiple` | `type="multiple"`, `mode="multi"` |
| `onValueChange` | `onChange`, `onSelect`, `onUpdate` |

Four laws behind the table:

1. **No boolean spelled as a string.** `multiple`, not `type="single"`.
2. **No `is` prefix** on a prop. It reads as a question, not a state.
3. **The same role gets the same name in every component**, or the vocabulary is
   worthless.
4. **No abbreviations.** `Submenu`, not `Sub`.

Law 3 is the one this kit has broken worst, and `size` is where. It has meant a
control size, two different distance scales, a px diameter and a px thickness.
**`size` means the shell step in
[`lib/field-shell`](../lib/field-shell.ts) (`sm | md | tv`) and nothing else.** A
component whose "size" is a raw measurement takes a measurement, named for what
it measures: `thickness` on `<Divider>` and `<Progress>`, `diameter`, `w`. A
component that genuinely has its own ladder names its own type, but keeps the
same three words.

A prop that is only ever set one way is deleted, not defaulted. A handler whose
only job is to redirect focus takes the target, not the event.

---

## 8. Adding, promoting, renaming

**Adding.** The trigger is: *has this arrangement now been written twice?* Then
it earns a level. Which level is [`README.md`](./README.md)'s question, not this
document's.

**Promoting from an app.** A component moves out of `clients/*/src` or
`packages/tv/src` and into the kit when it is a reusable arrangement rather than
a product decision. Move the folder, bring its story and its demos with it, and
delete the original. A promoted component that leaves a copy behind has made
things worse. If it names a route, a server call or a session, it is a page and
it stays where it is.

**Renaming.** Rename in one commit across the whole tree; there are no
deprecation shims. Every call site is in this repo, `bun run typecheck` is the
gate, and a shim that outlives the migration is a second API nobody is
maintaining.

---

## 9. The checklist

Before a component is done:

- [ ] Parts are a namespace object; the bare name renders nothing.
- [ ] Every part name is in §1's table, or the table grew in this commit.
- [ ] The Root owns state, semantics and behaviour; no indicator is pressable.
- [ ] A `data` prop, if any, names which of the six tests forced it.
- [ ] No prop writes a face a part exists for. Every `label`, `hint`, `title`,
      `subtitle`, `detail`, `actions` or `footer` on a compound is either a part
      or a name nothing draws.
- [ ] Nothing is reachable only through a prop. Where a part could not express
      something, the part grew; the prop did not come back.
- [ ] `value`/`defaultValue`/`onValueChange`; no `onChange`.
- [ ] The shape comes from `lib/field-shell`, not from the component's own
      paddings.
- [ ] It has a story, and the story passes `variants` so the controls derive.
- [ ] It works under a D-pad and under a pointer without the caller writing
      anything different.

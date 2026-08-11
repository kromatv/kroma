# Atoms

Level 2. The indivisible controls: `Button`, `Text`, `Icon`, `Switch`, `Img`,
`Focusable`. Take one apart and you do not get smaller components, you get
nothing usable.

**What earns a place here**

- It owns ONE visual idea.
- It composes nothing but React Native hosts (`View`, `Text`, `Image`) and other
  atoms.
- It knows about [tokens](../../core/tokens) and about focus. It knows nothing
  about the app: no server, no router, no feature names, no copy.

**What does not**

- Anything that arranges two atoms into a shape the design has a name for — that
  is a [molecule](../molecules).
- Anything that owns real behaviour: scrolling, windowing, sampling frames. That
  is an [organism](../organisms).

`Focusable` is the one to read first. Every remote-reachable control in the whole
system is one, which is why a single component can be a mouse button in a browser
and a D-pad target on a television, and why the amber ring looks identical
everywhere.

Variants are declared once per file with `sv` (see [`lib/sv.ts`](../../lib/sv.ts)),
so a component's design is a table at the top of its file rather than conditionals
sprinkled through its JSX — and the workbench derives its controls and its variant
matrix from that same table, which is why neither can drift.

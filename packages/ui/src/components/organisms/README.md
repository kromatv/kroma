# Organisms

Level 4. A whole, recognisable region of a screen — and, unlike the levels below,
usually something that BEHAVES.

- **`Rail`** — a titled horizontal row that mounts its children in chunks and
  scrolls by measured offset as focus moves (`scrollIntoView` does not exist
  outside a browser). `Rail.List` is its windowed row, for a strip long enough
  that mounting it whole costs frames.
- **`Virtual`** — `VirtualRail` / `VirtualGrid`: the windowing `Rail.List` runs
  on, for a library that is thousands of tiles long.
- **`Dialog`** — a modal that takes the remote: it declares a focus SCOPE so the
  D-pad cannot wander back into the page behind, and its backdrop is what a
  pointer user closes it with.
- **`Resizable`** — panels a reader re-proportions and the seams between them.
  The layout is a list of shares, so a panel dragged wide on a desk survives a
  laptop; the seam is one D-pad stop that takes the arrow keys when pressed,
  because react-resizable-panels is DOM-only and a television is not.
- **`Command`** — the ⌘K palette: a ranked, grouped list with a cursor the
  arrows and the pointer share. Its rows are data rather than children, which is
  [`DESIGN.md`](../DESIGN.md) §3's T2 and T5.
- **`PerfHud`** — the on-device frame read-out. A television is the only place its
  numbers mean anything and the hardest place to attach a profiler, so the app
  carries its own.

**The test:** would a designer point at it and call it *part of the page*, rather
than a control *on* the page?

**Why the distinction is worth keeping.** A molecule is safe to drop anywhere; an
organism usually is not. `Rail` measures itself and owns a scroll position,
`Dialog` takes the remote hostage. Knowing which is which tells you whether you
can put two of them side by side without thinking about it.

The player chrome in [`../../player/`](../../player) is a family of organisms that
has not moved here yet: it is big enough to be its own folder and is documented
there.

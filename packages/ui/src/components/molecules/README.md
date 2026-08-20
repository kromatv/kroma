# Molecules

Level 3. A few atoms bonded into one arrangement the design names: `PosterCard`
(artwork + scrim + progress + title), `Field` (label + entry + hint-or-error),
`ListRow` (glyph well + label + trailing affordance), `OtpField` (a row of code
slots).

The test for adding one is whether this arrangement has now been written twice.
`ListRow` earned its place after the third copy: the TV profile menu, the
signed-out settings, and the admin lists had each grown their own.

## What a molecule owns

An arrangement, and the rules that arrangement implies. `Field` enforces that an
error REPLACES the hint rather than stacking under it, because two lines of small
text under an entry is how a form starts looking broken. That rule lives in one
place so no screen can get it wrong.

## What it does not own

- Where its data came from. It may know the SHAPE it lays out, a title or a
  progress fraction, but never the server, the router or the session.
- Behaviour that makes it a region of a screen: scrolling, windowing, holding the
  remote. That is an [organism](../organisms).

`media.test.tsx` sits at this level rather than in a component folder on purpose.
It checks the cards against each other, and it belongs to none of them.

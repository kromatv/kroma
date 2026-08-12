# House rules that keep being broken

## Do not add comments

The default is **no comment**. This is already in `CODE_STYLE.md` and the root
`CLAUDE.md`, and it is the rule most often ignored.

Concretely, do not write:

- a comment explaining what a line does, or why a fix was made
- a comment justifying a type, a guard, a fallback or a constant
- a header block on a test file explaining what it pins
- a rationale paragraph above a function that is not exported API

The reasoning belongs in the commit message and the PR, never in the source.

Document **exported API only**: a `/** */` on an exported function, type or
component that a caller outside the file uses. Nothing else.

The one exception, because it is real API: **a kit component's props**. A prop on
a component exported from `@kroma/ui` takes ONE line when its contract is not
visible from its name and its type: a default, a unit, a fallback chain, how it
interacts with another prop. A prop whose name already says it takes nothing.
This does not extend to app components or to any other interface member. See
`CODE_STYLE.md`.

When editing existing code, match the file's density. A file that already
carries prose comments is not licence to add more.

# Project skills

Skills and agents this repository ships to any Claude Code session opened in it.
They are checked in so a clone gets them, and so a change to one is reviewed like
any other change.

Every one of them states a **generic rule**, so the same directory can be dropped
into another repository and still be right. What is specific to a project stays in
that project's own docs, and a skill points at them rather than restating them.
For this repository that means [`CLAUDE.md`](../../CLAUDE.md),
[`CONVENTIONS.md`](../../CONVENTIONS.md), [`CODE_STYLE.md`](../../CODE_STYLE.md),
[`ARCHITECTURE.md`](../../ARCHITECTURE.md) and
[`docs/TICKETS.md`](../../docs/TICKETS.md).

## Writing

| Skill | What it does |
|-------|--------------|
| `unslop` | Cuts AI tells from prose before it ships: puffery, "not just X but Y", em dashes, rule of three, chatbot filler. For docs, commit messages, PR descriptions and copy. |
| `spec-writing` | Writing a product spec: what belongs there rather than in architecture, the status vocabulary, requirement IDs and keeping them stable, sizing one so it becomes one story. |
| `ticket-writing` | Issues and PR descriptions: the epic and sub-issue structure, linking a requirement instead of copying spec text, reading the project's labels and templates rather than guessing them. |

## Code

| Skill | What it does |
|-------|--------------|
| `file-structure` | One file, one job: the size policy, what a natural seam is, where a split lands against the project's dependency rules, and the signals a file is already two files. |
| `naming` | A file named after its export, a suffix that is a resolution instruction, index files that only re-export, and the symbol names that are always wrong. |
| `typescript-best-practices` | Discriminated unions, branded types, `unknown` over `any`, no `as`, exhaustiveness, strict compiler options, errors as values, no floating promises. Examples in `references/patterns.md`. |
| `rust-best-practices` | The same table one language over: enums with data, newtypes, errors by layer, borrow in and own out, nothing blocking the async runtime, `SAFETY:` on every unsafe. |
| `no-comments` | Runs the comment hunter over a diff and acts on what it finds. Slash-only, it never fires on its own. |

## Tests and the gate

| Skill | What it does |
|-------|--------------|
| `tdd` | The failing test first, for new behaviour and for bug fixes, and when to skip the loop and say so. |
| `typescript-tests` | The name is a sentence, the body is setup, mock, test and verify blocks separated by blank lines, no comments, and the runner's config decides where the file goes. |
| `rust-tests` | Cargo tests: the same block shape, sentence names, shared setup in a named test-support module, unit tests beside the code. |
| `sonar-loop` | Drives a PR to the project's quality targets, then watches the checks until every one passes. |

## Agents

| Agent | What it does |
|-------|--------------|
| [`house-style`](../agents/house-style.md) | Does the work with the writing, naming and structure skills loaded first, picks up the language and test ones the task needs, and hunts its own comments before handing back. |
| [`comment-hunter`](../agents/comment-hunter.md) | Hunts comments that narrate code, spares the few that carry a reason, edits comment lines only. |
| [`spec-reviewer`](../agents/spec-reviewer.md) | Reviews `docs/spec` for readability, status and ID nomenclature, architecture leakage, and whether a requirement is atomic enough to become work. |

`no-comments` and `comment-hunter` exist because the rule they enforce is the one
this repo breaks most often. See `CODE_STYLE.md` and `.claude/CLAUDE.md`.

## Reusing them elsewhere

Copy the directory. `.claude/skills` in another repository, or `~/.claude/skills`
to load them in every project on this machine. Nothing here reads a path, a script
name or a threshold that only exists in this repo.

Two of them assume a tool rather than a repo, and that is the honest limit of the
genericness: `sonar-loop` wants SonarCloud and the `gh` CLI, and `ticket-writing`
wants GitHub issues. `spec-reviewer` is the one agent that stays specific, because
it reviews this repo's `docs/spec` layout.

Where a project states a threshold of its own, the project wins. A skill that
names a default says so at the point it names it.

## Editing one

A skill is prose an agent reads, so the bar is the same as any other doc here: no
em dashes, no comments narrating the work, and no reference to a skill or agent
that is not in this tree. A rule that only makes sense in this repository belongs
in the repository's docs with the skill pointing at it, not in the skill.

Check a change before committing it:

```bash
claude plugin validate .claude/skills --strict
claude plugin validate .claude/agents --strict
```

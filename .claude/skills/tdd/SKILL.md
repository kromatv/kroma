---
name: tdd
description: Write the failing test before the code that satisfies it, for new behaviour and for bug fixes, and stop when the test path is not worth its cost. Covers the red-green loop, what a first test should assert, when to skip the loop honestly, and the evidence to report. Use when starting behaviour that has a cheap test path, or fixing a bug that can be reproduced in a test. Triggers - "tdd", "write a failing test first", "regression test", "reproduce this in a test", "test first".
---

# TDD

Make the behaviour executable before making it work. The point is not ceremony:
a test written first describes what the caller needs, while a test written after
describes what the code happens to do.

Write the test in the style the project already uses. Where the project ships a
test skill for the language, that skill wins. Failing that, read two neighbouring
test files and follow them. Failing both, the shape is: named as a sentence, built
from setup, mock, test and verify blocks separated by blank lines, and carrying no
comments.

That shape is also the fastest way to write step 2. Name the behaviour, write the
verify block first, then work backwards to the setup that makes it reachable.

## The loop

1. **Name the behaviour.** One sentence, in the caller's terms. That sentence is
   the test name, and if it will not come out as a sentence the behaviour is not
   understood well enough to write yet.
2. **Write the smallest failing test.** It asserts the behaviour, never the
   implementation you are about to write.
3. **Run it, and read the failure.** It must fail for the reason you expect. A
   test that passes immediately is testing something else. A test that fails on a
   missing import is not evidence yet.
4. **Write the smallest code that passes.** Not the general case, not the version
   with the options object nobody asked for.
5. **Run it again.** Green.
6. **Clean up while green.** Both sides: the code, and the test that is now
   longer than it needs to be.
7. **Repeat** for the next behaviour, not the next line.

For a bug, the same loop with step 1 fixed for you: the test is the reproduction,
and it must fail before the fix and pass after it.

## What the first test asserts

The behaviour a caller would notice. Not the shape of an intermediate value, not
the number of times a collaborator was called, not a snapshot of a structure.

Start at the boundary that is cheap to call. The unit is whatever has a real
seam, which is often a function two layers in rather than the exported one.

## When to skip

Do not force a test. Skip the loop when the only available test would need broad
harness setup, brittle mocks, slow end-to-end infrastructure, production-only
state, or a fixture churn larger than the change.

Skipping is a decision you say out loud, not one you make silently. Name why the
test path is not worth it and what you did instead: a script, a manual
reproduction, a screenshot from the real app, a log assertion.

**Prefer no test to a bad test.** A bad test is one that mostly exercises mocks,
encodes the implementation, depends on timing or global state, or would be
deleted the moment it had proved the fix.

## Guardrails

- Never change an existing test to match a wrong implementation.
- Never weaken an assertion to get to green. Either the behaviour changed, and
  the test name changes with it, or there is a bug.
- Keep a regression test focused on its bug. Unrelated coverage is a separate
  change.
- A flaky bug still gets a deterministic test. Pin the signal, not the timing.
- If the bug is one of a class, land the focused test first and consider the
  siblings after.

## Report the evidence

Not "added a test". Name the test, the failure it produced before the fix, and
the run that passed after. If failing-first could not be shown, say why, and name
the check used instead.

---
name: typescript-tests
description: Write TypeScript tests. A test name is a sentence, the body is setup, mock, test and verify blocks separated by blank lines with no comments, and the runner's config decides where the file goes. Covers naming, the block shape, size, fixtures, what not to assert, DOM opt-in, multiple runner projects, coverage, and running one test. Use when adding or changing any .test.ts or .test.tsx, or when coverage has to come up. Triggers - "write a test", "add tests", "test this", "vitest", "jest", "how do I test", "cover this file".
---

# TypeScript tests

A test earns its place by being read, not by existing. Three rules carry most of
it: **the name is the sentence**, **the body is blocks separated by blank lines**,
and **there are no comments**.

```ts
it('falls back to the handed shape when the stage measures zero', () => {
  const node = stage('stage-b', 0, 0);

  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ width: 0, height: 0 } as DOMRect);

  const { result } = renderHook(() => useStageRatio('stage-b', 4 / 3));

  expect(result.current).toBeCloseTo(4 / 3, 6);
});
```

The name says what is guaranteed and the blank lines say where each phase ends,
so nothing is left for a comment to say.

Examples here use vitest. Jest, node:test and bun:test take the same shape; read
two neighbouring test files for the project's runner, import style and helpers
before writing a third.

## Naming

The name completes "it ...", describes the behaviour, and never mentions the
implementation.

```ts
it('rejects a range past EOF', ...)                 // good
it('marks a file absent rather than deleting it', ...)  // good

it('should work', ...)                              // says nothing
it('test parseRange', ...)                          // names the function, not the behaviour
it('returns false when the second argument is undefined', ...)  // describes the code
```

If you cannot name it in a sentence, the test is doing two things. Split it.

## The four blocks

A body is up to four blocks, always in this order, one blank line between them:

| Block | Holds |
|-------|-------|
| **setup** | Fixtures, state, the world the behaviour needs |
| **mock** | Stubs, spies, fakes, and what they are told to return |
| **test** | The one action under test |
| **verify** | The assertions |

Rules that keep the shape readable:

- **A blank line only ever separates two blocks.** Never one inside a block, and
  never two in a row. A stray blank line reads as a phase boundary that is not
  there.
- **An empty block is absent, not blank.** A test with nothing to mock has three
  blocks. A one-line setup and a one-line assertion is two.
- **No comment names a block.** `// Arrange`, `// Act`, `// Assert`, `// setup`
  and `// given` are all the blank line written twice. The order is the label.
- **One action in the test block.** Two calls under test means two tests, unless
  the second is the only way to observe the first.
- **Every assertion in verify.** An `expect` sitting in the setup block is a
  precondition check, and a precondition worth checking is its own test.

```ts
it('marks a file absent rather than deleting its history', async () => {
  const library = await seedLibrary({ files: ['a.mkv'] });
  await library.watch('a.mkv', { seconds: 640 });

  vi.spyOn(fs, 'stat').mockRejectedValue(new Error('ENOENT'));

  await rescan(library);

  expect(library.get('a.mkv')).toMatchObject({ absent: true });
  expect(library.progress('a.mkv')).toEqual({ seconds: 640 });
});
```

Two assertions, because "marks absent" and "history survives" are one behaviour
seen from two sides. Three unrelated assertions would be three tests.

## Size

A test that runs past roughly fifteen lines is usually one of three things:

- Two tests sharing a body. Split them.
- A fixture that wants extracting into a named helper above the `describe`.
- Production code that needs three collaborators to say anything, which is a
  design signal, not a testing problem.

Keep the helper small and name it after what it builds:

```ts
function stage(id: string, width: number, height: number): HTMLElement {
  const node = document.createElement('div');
  node.id = id;
  node.getBoundingClientRect = () => ({ width, height }) as DOMRect;
  document.body.append(node);
  NODES.push(node);
  return node;
}
```

## No comments

The rule holds hardest here, because a test comment is nearly always the name
saying it should have been rewritten, or a block label the blank line already
gave. No file header explaining what the suite pins, no note above a case, no
rationale paragraph.

The one comment that survives is a genuinely non-obvious fixture value: why *this*
byte, why *this* timestamp. One line, stating the reason, not the value.

## Assert behaviour, not shape

- Assert what a caller would notice. A snapshot of an internal structure fails on
  every refactor and catches nothing.
- Never assert a mock was called when you can assert what the call produced.
- A test that still passes with the implementation deleted tests nothing. Check
  by deleting it, briefly, when you are unsure.
- Do not weaken an assertion to make a suite green. Either the behaviour changed,
  and the name changes with it, or there is a bug.

## Where the file goes

Beside the code it covers, named after it. The runner's config owns the rest, so
read it rather than guessing: it holds the include globs, the default environment,
and whether the project splits its suites into more than one project.

Two things to check in that config before naming a file:

- **The environment.** Many projects default to `node` and make a DOM opt-in, per
  file, on the first line:

  ```ts
  // @vitest-environment jsdom
  ```

- **Multiple projects.** A repo that ships to more than one platform often runs
  the same suites twice under different module resolution, with a suffix deciding
  which project owns a file. Where that is true, the suffix is the only thing
  making a test run at all, and a file named for the wrong project silently never
  executes.

Where the file goes on disk, and what its suffix means, belong to the **naming**
skill.

## Running one

Read the manifest scripts for the project's wrapper, then narrow:

```bash
<test script> path/to/one.test.ts
<test script> -t 'rejects a range'
<test script> --project <name> -t 'rejects a range'
```

Run the narrow form while writing and the full suite before handing the work
back. A test that passes alone and fails in the suite is sharing state.

## Coverage

Write the test where it reaches the logic. If the logic sits somewhere no test can
call, move the logic rather than excluding the file: new logic goes where a test
can reach it.

Two traps worth knowing before trusting a percentage:

- **A coverage tool that only instruments what the tests loaded reads far higher
  than a scanner that counts every file in scope.** A file no test imports is
  absent from the first number and a zero in the second. Check which one the
  project's gate uses.
- **Some branches are unreachable under the runner.** A `require()` fallback or a
  build-time environment branch cannot be taken, so a test that appears to cover
  it passes without asserting anything.

Check the runner's coverage config for excluded paths before writing a test that
cannot count. Where a file type is excluded, behaviour worth pinning belongs in
one that is not.

// The recorder: start it, do something, stop it, read the result.
//
//   const run = record();
//   render(<Keyboard />);
//   fireEvent.click(key);
//   const result = run.stop();
//
//   result.churn      // [['Key', 42]]  destroyed and rebuilt by that click
//   result.rerenders  // fibers that ran again
//   result.elements   // host elements on screen, by type
//
// Start BEFORE rendering. The first commit is the mount, and `churn` needs it.
//
// HOW IT KNOWS WHAT REACT DID, which is the only subtle thing in this library.
// React clones a fiber only when it works on one, and cloning is also the only
// time `flags` is reset and an `alternate` linked. So a subtree that bails out
// keeps the flags and the null alternate it was BORN with, and reading either
// one directly reports every deep bail-out as a fresh mount. In a 766-fiber
// keyboard that is 691 false positives, every commit, forever.
//
// The fix is to establish WHICH fibers React just wrote before reading anything
// off them. A clone swaps a fiber's identity for its alternate, so a fiber that
// is in this commit's tree and was not in the previous one is exactly a fiber
// React has touched. On those, and only those, `flags` and `alternate` mean what
// they look like they mean.

import { type Commit, churn, components, hosts, rerenders, type Work } from './analyse';
import { type Fiber, isHost, nameOf, performedWork, type Root, walk } from './fiber';
import { onCommit, onUnmount } from './hook';

interface Result {
  /** Every commit, in order. The first is the mount. */
  commits: readonly Commit[];
  /** Components destroyed while the screen still needed them, worst first.
   * Empty is the only good answer. */
  churn: ReadonlyArray<readonly [string, number]>;
  /** Fibers that ran again after the mount. */
  rerenders: number;
  /** Every component that did work, worst first. */
  components: ReadonlyArray<readonly [string, Work]>;
  /** Host elements on screen, by type, most numerous first. */
  elements: ReadonlyArray<readonly [string, number]>;
  /** How many host elements in total. */
  elementCount: number;
}

interface Pass {
  commit: Commit;
  live: Set<Fiber>;
}

function readCommit(root: Root, previous: Set<Fiber>, deleted: Record<string, number>): Pass {
  const work: Record<string, Work> = {};
  const census: Record<string, number> = {};
  const hostsByType: Record<string, number> = {};
  const live = new Set<Fiber>();
  let touched = 0;

  for (const fiber of walk(root)) {
    live.add(fiber);
    const name = nameOf(fiber);
    if (name) {
      census[name] = (census[name] ?? 0) + 1;
      if (isHost(fiber)) hostsByType[name] = (hostsByType[name] ?? 0) + 1;
    }

    // Not written this commit: whatever its flags say is left over from whenever
    // React last cloned it, which may be its original mount.
    if (previous.has(fiber) || !performedWork(fiber)) continue;
    touched += 1;
    if (!name) continue;
    work[name] ??= { mounted: 0, updated: 0 };
    if (fiber.alternate == null) work[name].mounted += 1;
    else work[name].updated += 1;
  }

  return {
    commit: {
      touched,
      work,
      census,
      hosts: hostsByType,
      deleted,
      ms: root.current.actualDuration ?? 0,
    },
    live,
  };
}

/** Reads a set of commits without recording them, for a caller holding its own. */
function resultOf(commits: readonly Commit[]): Result {
  return {
    commits,
    get churn() {
      return churn(commits);
    },
    get rerenders() {
      return rerenders(commits);
    },
    get components() {
      return components(commits);
    },
    get elements() {
      return hosts(commits);
    },
    get elementCount() {
      return hosts(commits).reduce((sum, [, count]) => sum + count, 0);
    },
  };
}

/** Records every commit until `stop` is called. */
function record(): { stop: () => Result } {
  const commits: Commit[] = [];
  let previous = new Set<Fiber>();
  // React deletes fibers during the commit phase, before it announces the
  // commit, so they arrive first and belong to the commit that follows them.
  let pending: Record<string, number> = {};

  const offUnmount = onUnmount((fiber) => {
    const name = nameOf(fiber);
    if (name) pending[name] = (pending[name] ?? 0) + 1;
  });
  const offCommit = onCommit((root) => {
    const pass = readCommit(root, previous, pending);
    pending = {};
    previous = pass.live;
    commits.push(pass.commit);
  });

  return {
    stop: () => {
      offCommit();
      offUnmount();
      return resultOf(commits);
    },
  };
}

export type { Commit, Result, Work };
export { record, resultOf };

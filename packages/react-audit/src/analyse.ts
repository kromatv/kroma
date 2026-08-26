// Pure readings of a set of commits. Nothing here touches React.

/** Per component: fibers built from scratch, and fibers that re-rendered. */
interface Work {
  mounted: number;
  updated: number;
}

interface Commit {
  /** Fibers React actually wrote in this commit. Not the size of the tree. */
  touched: number;
  work: Readonly<Record<string, Work>>;
  /** Every component on screen after this commit, and how many of each. */
  census: Readonly<Record<string, number>>;
  /** Elements the platform draws, by type: `div` under react-dom, `RCTView`
   * under React Native. */
  hosts: Readonly<Record<string, number>>;
  /** Components React deleted on the way into this commit. */
  deleted: Readonly<Record<string, number>>;
  /** What React spent on this commit, by its own accounting. Wall-clock under a
   * test runner is noisy, so this ranks; it does not gate. */
  ms: number;
}

const add = (into: Record<string, number>, from: Readonly<Record<string, number>>) => {
  for (const [name, count] of Object.entries(from)) into[name] = (into[name] ?? 0) + count;
};

const cost = (work: Work) => work.mounted * 10 + work.updated;

/** Every component that did work, worst first. A remount counts for more than a
 * re-render because it costs more: the fiber, its host node and its state all
 * go, and no memoisation softens it. */
function components(commits: readonly Commit[]): ReadonlyArray<readonly [string, Work]> {
  const total: Record<string, Work> = {};
  for (const commit of commits) {
    for (const [name, work] of Object.entries(commit.work)) {
      total[name] ??= { mounted: 0, updated: 0 };
      total[name].mounted += work.mounted;
      total[name].updated += work.updated;
    }
  }
  return Object.entries(total).sort(([, a], [, b]) => cost(b) - cost(a));
}

/**
 * Components React destroyed and then had on screen again: rebuilt, not removed.
 *
 * Pressing a button that opens a menu mounts a menu, and pressing it again
 * deletes one. Neither is churn. What is never right is a component being
 * destroyed while the screen still needs it, because a remount throws away the
 * host node, the state, the animated values and the focus, and no memoisation
 * softens that.
 *
 * Read from React's own deletion callback rather than inferred, because every
 * inference here is a trap: React clones a fiber only when it works on one, so a
 * bailed-out subtree keeps the `flags` and the null `alternate` it was born with
 * and looks exactly like a fresh mount forever.
 *
 * The first commit is taken as the mount, so a recording has to start BEFORE the
 * tree is rendered for this to mean anything.
 */
function churn(commits: readonly Commit[]): ReadonlyArray<readonly [string, number]> {
  const [first, ...rest] = commits;
  if (!first || rest.length === 0) return [];
  const after = rest.at(-1)?.census ?? {};

  const deleted: Record<string, number> = {};
  for (const commit of rest) add(deleted, commit.deleted);

  return Object.entries(deleted)
    .filter(([name]) => (after[name] ?? 0) > 0)
    .sort(([, a], [, b]) => b - a);
}

/** Fibers that ran again, across every commit after the mount. */
function rerenders(commits: readonly Commit[]): number {
  return commits
    .slice(1)
    .reduce(
      (sum, commit) =>
        sum + Object.values(commit.work).reduce((inner, work) => inner + work.updated, 0),
      0,
    );
}

/** Elements the platform is drawing once everything has settled, by type, most
 * numerous first. The count a DOM or native tree is actually judged on. */
function hosts(commits: readonly Commit[]): ReadonlyArray<readonly [string, number]> {
  const last = commits.at(-1);
  if (!last) return [];
  return Object.entries(last.hosts).sort(([, a], [, b]) => b - a);
}

export type { Commit, Work };
export { churn, components, hosts, rerenders };

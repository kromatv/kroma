import { dependents, type Graph } from './graph';

// The projects a changed path sits inside — the deepest owning directory wins, so
// a change under clients/tizen/ is the tizen project, not a parent.
export function directlyChanged(changedPaths: string[], graph: Graph): Set<string> {
  const hit = new Set<string>();
  for (const path of changedPaths) {
    let owner: string | null = null;
    let ownerDirLength = -1;
    for (const project of graph.projects) {
      const inside = path === project.dir || path.startsWith(`${project.dir}/`);
      if (inside && project.dir.length > ownerDirLength) {
        owner = project.name;
        ownerDirLength = project.dir.length;
      }
    }
    if (owner) hit.add(owner);
  }
  return hit;
}

// Every project that must be rebuilt/re-released for a set of changed paths: the
// directly-changed ones, plus everything that (transitively) depends on them. A
// dependency bump is a change to the dependency's project, so its dependents fall
// out of this walk automatically.
export function affected(changedPaths: string[], graph: Graph): Set<string> {
  const result = directlyChanged(changedPaths, graph);
  const reverse = dependents(graph);
  const queue = [...result];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) continue;
    for (const dependent of reverse.get(current) ?? []) {
      if (!result.has(dependent)) {
        result.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return result;
}

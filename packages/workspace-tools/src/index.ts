// Public API. Import these to analyse any workspace: build a graph, find the
// projects a change affects (transitively), and verify the dependency edges.

export { affected, directlyChanged } from './core/affected';
export { byName, dependents, type Graph, type Project } from './core/graph';
export { type Violation, type ViolationKind, verify } from './core/verify';
export { changedFiles, type Exec } from './io/git';
export { loadGraph } from './io/load';

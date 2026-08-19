import { satisfies } from '@kroma/registry';
import { byName, type Graph } from './graph';

export type ViolationKind = 'missing-dep' | 'range' | 'min-server';

export interface Violation {
  project: string;
  kind: ViolationKind;
  detail: string;
}

// Check that every declared dependency actually resolves against the versions in
// the graph: each `dependencies` range is satisfied by the current version of the
// depended project, and each `engines.server` range is met by the server. Returns the list
// of violations (empty = the dependency graph is coherent). Pure.
export function verify(graph: Graph): Violation[] {
  const projects = byName(graph);
  const violations: Violation[] = [];

  for (const project of graph.projects) {
    for (const [dep, range] of Object.entries(project.ranges ?? {})) {
      const target = projects.get(dep);
      if (!target) {
        violations.push({
          project: project.name,
          kind: 'missing-dep',
          detail: `depends on "${dep}", which is not in the workspace`,
        });
        continue;
      }
      if (!satisfies(target.version, range)) {
        violations.push({
          project: project.name,
          kind: 'range',
          detail: `needs ${dep}@${range}, but ${dep} is ${target.version}`,
        });
      }
    }

    if (project.serverRange) {
      if (!graph.server) {
        violations.push({
          project: project.name,
          kind: 'min-server',
          detail: `requires server ${project.serverRange}, but no server is in the workspace`,
        });
      } else if (!satisfies(graph.server.version, project.serverRange)) {
        violations.push({
          project: project.name,
          kind: 'min-server',
          detail: `requires server ${project.serverRange}, but server is ${graph.server.version}`,
        });
      }
    }
  }
  return violations;
}

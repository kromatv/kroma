#!/usr/bin/env bun
// Reference consumer. Subcommands:
//   affected --since <range>   list the projects a change affects (transitively)
//   verify                     check every dependency edge + engine range resolves
// The analysis lives in the tested core; this only loads the repo and prints.

import { affected } from './core/affected';
import { verify } from './core/verify';
import { changedFiles } from './io/git';
import { loadGraph } from './io/load';

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function cmdAffected(argv: string[]): number {
  const since = flag(argv, '--since');
  if (!since) {
    console.error('usage: workspace-tools affected --since <range> [--build]');
    return 2;
  }
  const graph = loadGraph({ root: process.cwd() });
  const names = affected(changedFiles(since), graph);
  const projects = graph.projects.filter((p) => names.has(p.name));
  if (projects.length === 0) {
    console.log('No projects affected.');
    return 0;
  }
  for (const p of projects) console.log(`${p.name}\t${p.dir}`);
  return 0;
}

function cmdVerify(): number {
  const graph = loadGraph({ root: process.cwd() });
  const violations = verify(graph);
  if (violations.length === 0) {
    console.log(`Dependencies OK — ${graph.projects.length} projects, every edge resolves.`);
    return 0;
  }
  console.error(`${violations.length} dependency problem(s):`);
  for (const v of violations) console.error(`  ✗ [${v.kind}] ${v.project}: ${v.detail}`);
  return 1;
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'affected') process.exit(cmdAffected(rest));
  else if (command === 'verify') process.exit(cmdVerify());
  else {
    console.error('usage: workspace-tools <affected|verify> [options]');
    process.exit(2);
  }
}

main();

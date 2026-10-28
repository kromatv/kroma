import { summary } from './actions';
import { blockers, LaneOf, Needs } from './required';

function readJson(variable: string): unknown {
  const raw = process.env[variable];
  if (!raw) throw new Error(`${variable} is not set`);
  return JSON.parse(raw);
}

export function main(): void {
  const needs = Needs.parse(readJson('NEEDS'));
  const laneOf = LaneOf.parse(readJson('LANE_OF'));
  const found = blockers(needs, laneOf);
  if (found.length === 0) {
    summary('**Required**: every job passed or had its lane off.');
    return;
  }
  const lines = found.map((line) => `- ${line}`).join('\n');
  summary(`**Required** is red:\n\n${lines}`);
  throw new Error(found.join('; '));
}

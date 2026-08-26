// The interaction worklist: every story view pressed once, worst first.
//
// Not a gate. The absolute rules live in audit.test.tsx; this is read and worked
// down. Inert unless `bun run kit:perf` asks for it.

import { it } from 'vitest';
import { sweepKit } from './sweep';

const only = (process.env.KROMA_PERF_ONLY ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const wanted = Boolean(process.env.KROMA_PERF);
const limit = Number(process.env.KROMA_PERF_LIMIT ?? 15);

it.skipIf(!wanted)(
  'presses one control in every story view',
  () => {
    const pressed = sweepKit(only);
    const churning = pressed.filter((view) => view.churned > 0);
    const fibers = churning.reduce((sum, view) => sum + view.churned, 0);

    console.log(`\n  ${pressed.length} views have something to press\n`);

    console.log('  CHURN  destroyed and rebuilt though the screen still needed them');
    for (const view of churning.slice(0, limit)) {
      const worst = view.churn
        .slice(0, 3)
        .map(([name, count]) => `${name}x${count}`)
        .join(' ');
      console.log(`    ${String(view.churned).padStart(5)}  ${view.id}/${view.view}  ${worst}`);
    }
    if (churning.length > limit) console.log(`    ... and ${churning.length - limit} more`);
    console.log(`    ${fibers} fibers across ${churning.length} views\n`);

    // Once churn is rare this is the column that names the next thing to fix: a
    // press that re-runs a whole grid rather than the one control it touched.
    const busiest = [...pressed]
      .sort((a, b) => b.rerendered - a.rerendered)
      .filter((view) => view.rerendered > 0);
    const renders = busiest.reduce((sum, view) => sum + view.rerendered, 0);

    console.log('  RE-RENDERS  fibers that ran again on one press');
    for (const view of busiest.slice(0, limit)) {
      console.log(`    ${String(view.rerendered).padStart(5)}  ${view.id}/${view.view}`);
    }
    console.log(`    ${renders} fibers across ${busiest.length} views\n`);
  },
  300_000,
);

// Post-build guard for a shell's LEGACY tier: the bundle must stay parseable +
// renderable on old TV engines (Chromium 53, the tier's floor). Authors keep
// writing normal Tailwind v4 / modern TS; this catches a pipeline regression
// (someone bumps build.target, a shim stops matching Tailwind's output, ...) at
// build time instead of as a black screen on a 2018 TV.
//
// Run from the SHELL directory (cwd): `bun ../tv-build/check-legacy.ts`.
// Exits non-zero with the offending excerpt on the first violation.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = (p: string): string => join(process.cwd(), 'dist', p);

type Check = [RegExp, string];

// The JS patterns dodge known lookalikes: `?.` before a digit is a ternary
// (`x?.5:.1`), `(??` only appears inside regex literals (core-js feature
// probes), and `async function*` only inside core-js probe STRINGS (evaluated
// in try/catch at runtime, safe on old engines).
const JS_CHECKS: Check[] = [
  [/[\w$)\]]\?\.[[($A-Za-z_]/, 'optional chaining (?.) is ES2020 - Chromium 53 fails to parse'],
  [/[\w$)\]"']\?\?[^?=/]/, 'nullish coalescing (??) is ES2020 - Chromium 53 fails to parse'],
  [/\?\?=/, 'logical assignment (??=) is ES2021 - Chromium 53 fails to parse'],
  [/\basync function(?!\*)|\basync\s+\w+\s*=>/, 'async (ES2017) must be lowered to generators'],
  // A classic script has no `import.meta`, so the IIFE build substitutes `{}`
  // for it - and every `new URL(asset, import.meta.url)` Vite emits (the brand
  // intro's film and sting, today) becomes `new URL(asset, 'undefined')`, which
  // THROWS at module init. Nothing renders: the tier is dead on every TV it
  // exists for, while the build says "built in 1.10s". shell.ts defines
  // `import.meta.url` as `document.baseURI` to prevent it; this is the tripwire.
  [
    /\{\s*\}\s*\.url/,
    '`import.meta.url` was substituted with `{}` - asset URLs throw at module init',
  ],
];

const CSS_CHECKS: Check[] = [
  [/@layer[\s{]/, '@layer survives (Chrome 99) - old engines drop the whole block'],
  [/aspect-ratio\s*:/, 'aspect-ratio survives (Chrome 88) - the ::before shim did not run'],
  [
    /(^|[;{])\s*(gap|row-gap|column-gap)\s*:/,
    'flex gap survives (Chrome 84) - the margin shim did not run',
  ],
  [
    /(^|[;{])\s*(scale|translate|rotate)\s*:/,
    'scale/translate/rotate properties survive (Chrome 104)',
  ],
  [
    /grid-template|grid-column|grid-row|grid-area|grid-auto/,
    'CSS grid layout survives (Chrome 57) - use flex-wrap instead',
  ],
  [/oklch\(|oklab\(/, 'oklch/oklab survives (Chrome 111) - Lightning CSS down-level did not run'],
];

let failed = false;

function check(path: string, checks: Check[]): void {
  const text = readFileSync(dist(path), 'utf8');
  for (const [re, why] of checks) {
    const m = re.exec(text);
    if (!m) continue;
    const at = m.index ?? 0;
    console.error(`\n[check-legacy] dist/${path}: ${why}`);
    console.error(`  ...${text.slice(Math.max(0, at - 80), at + 80).replaceAll('\n', ' ')}...`);
    failed = true;
  }
}

check(join('legacy', 'index.js'), JS_CHECKS);
check(join('legacy', 'style.css'), CSS_CHECKS);

// The loader must actually reference the legacy bundle.
if (!readFileSync(dist('index.html'), 'utf8').includes('./legacy/index.js')) {
  console.error('[check-legacy] dist/index.html does not gate to ./legacy/index.js');
  failed = true;
}

if (failed) process.exit(1);
console.log('[check-legacy] legacy bundle OK for Chromium 53');

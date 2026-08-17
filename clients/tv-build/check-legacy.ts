// Post-build guard for a shell's legacy tier: the bundle must stay parseable and
// renderable on Chromium 53, the tier's floor. Run from the shell directory.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { syntaxAboveDeepFloor } from '@kroma/bundler/deep-tier';

const dist = (p: string): string => join(process.cwd(), 'dist', p);

type Check = [RegExp, string];

// The JS patterns dodge known lookalikes: `?.` before a digit is a ternary
// (`x?.5:.1`), `(??` only appears inside regex literals (core-js feature probes),
// and `async function*` only inside core-js probe strings.
const JS_CHECKS: Check[] = [
  [/[\w$)\]]\?\.[[($A-Za-z_]/, 'optional chaining (?.) is ES2020 - Chromium 53 fails to parse'],
  [/[\w$)\]"']\?\?[^?=/]/, 'nullish coalescing (??) is ES2020 - Chromium 53 fails to parse'],
  [/\?\?=/, 'logical assignment (??=) is ES2021 - Chromium 53 fails to parse'],
  [/\basync function(?!\*)|\basync\s+\w+\s*=>/, 'async (ES2017) must be lowered to generators'],
  // A classic script has no `import.meta`, so the IIFE build substitutes `{}` and
  // every `new URL(asset, import.meta.url)` Vite emits throws at module init.
  // shell.ts defines `import.meta.url` as `document.baseURI` to prevent it.
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

// The deep tier (Chromium 47) on top of everything above. Custom properties are
// M49 outright; the JS side is an AST walk instead of a pattern, because this
// bundle carries generated code inside string literals that a scan misreads.
const DEEP_CSS_CHECKS: Check[] = [
  [/var\(--/, 'custom properties survive (Chrome 49) - the flatten pass did not run'],
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

// Only the shells whose tv.target sets `deepLegacyChrome` emit this tier.
const hasDeep = existsSync(dist('deep'));
if (hasDeep) {
  check(join('deep', 'index.js'), JS_CHECKS);
  check(join('deep', 'style.css'), [...CSS_CHECKS, ...DEEP_CSS_CHECKS]);
  const above = syntaxAboveDeepFloor(readFileSync(dist(join('deep', 'index.js')), 'utf8'));
  if (above.length > 0) {
    console.error(
      `\n[check-legacy] dist/deep/index.js: ${above.join(', ')} survive (M49) - the Babel pass did not run`,
    );
    failed = true;
  }
}

const html = readFileSync(dist('index.html'), 'utf8');
for (const dir of hasDeep ? ['legacy', 'deep'] : ['legacy']) {
  if (html.includes(`./${dir}/index.js`)) continue;
  console.error(`[check-legacy] dist/index.html does not gate to ./${dir}/index.js`);
  failed = true;
}

if (failed) process.exit(1);
console.log(
  hasDeep
    ? '[check-legacy] legacy bundle OK for Chromium 53, deep bundle OK for Chromium 47'
    : '[check-legacy] legacy bundle OK for Chromium 53',
);

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) {
  console.error('Usage: bun run lint:rule:new <kebab-case-name>');
  process.exit(1);
}
const directory = fileURLToPath(new URL(`../drafts/${name}/`, import.meta.url));
if (existsSync(`${directory}rule.mjs`)) {
  console.error(`Draft already exists: ${directory}rule.mjs`);
  process.exit(1);
}
mkdirSync(directory, { recursive: true });
const guidance = {
  description: 'TODO: State the observable requirement.',
  why: 'TODO: Name the concrete failure this prevents and cite the house rule.',
  scope: 'TODO: Name the files, syntax, and symbols checked.',
  repair: 'TODO: Give ordered repair steps, public APIs, and dependency changes.',
  exceptions: 'TODO: State permitted cases, known blind spots, and fix safety.',
  verification: 'TODO: Give exact lint, typecheck, and focused test commands.',
  invalid: ['TODO: Smallest rejected example.'],
  valid: ['TODO: Equivalent accepted example.'],
};
writeFileSync(
  `${directory}rule.mjs`,
  `import { defineRule } from '../../src/define-rule.mjs';\n\nexport default defineRule(${JSON.stringify(name)}, ${JSON.stringify(guidance, null, 2)}, {\n  meta: { messages: { violation: 'TODO: Explain the violation, consequence, and repair command.' } },\n  create() {\n    throw new Error('Implement AST visitors and tests before registering ${name}.');\n  },\n});\n`,
  { flag: 'wx' },
);
console.log(
  `Created ${directory}rule.mjs. Complete the guidance and visitors, add RuleTester cases, then move into src/rules, register in src/index.mjs, and enable in .oxlintrc.json. Drafts are not loaded.`,
);

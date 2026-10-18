import plugin from '../src/index.mjs';

const args = process.argv.slice(2);
const requested = args.find((arg) => arg !== '--json')?.replace(/^kroma\//, '');
if (requested && !plugin.rules[requested]) {
  console.error(`Unknown rule: ${requested}. Available: ${Object.keys(plugin.rules).join(', ')}`);
  process.exit(1);
}
const rules = Object.entries(plugin.rules)
  .filter(([name]) => !requested || name === requested)
  .map(([, rule]) => rule.guidance);
if (args.includes('--json')) {
  console.log(JSON.stringify(rules, null, 2));
} else {
  for (const rule of rules) {
    console.log(`# ${rule.id}\n\n${rule.description}`);
    for (const field of ['why', 'scope', 'repair', 'exceptions', 'verification']) {
      console.log(`\n## ${field}\n\n${rule[field]}`);
    }
    for (const kind of ['invalid', 'valid']) {
      console.log(
        `\n## ${kind}\n\n${rule[kind].map((code) => `\x60\x60\x60ts\n${code}\n\x60\x60\x60`).join('\n\n')}`,
      );
    }
  }
}

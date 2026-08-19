#!/usr/bin/env bun
// Validate every module manifest against the ONE definition of it, the zod
// `Manifest` in `@kroma/registry`:
//   - each modules/<id>/module.json  (packable modules)
//   - the YAML frontmatter of each modules/*.module.md source
// Strict, unlike the reader: a document off a registry is parsed leniently
// because dropping a key beats refusing to render, but a manifest being
// AUTHORED here should hear about a typo rather than lose the field silently.
// Exits non-zero with a report on any violation, so it can gate CI / the build.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Manifest, MODULE_SCHEMA_VERSION, REVERSE_DNS_ID } from '@kroma/registry';
import { frontmatter } from './format';
import { root as ROOT } from './root';
import { byCodeUnit } from './sort';

const Authored = Manifest.strict().refine(
  (m) => m.schemaVersion === MODULE_SCHEMA_VERSION,
  `schemaVersion must be ${MODULE_SCHEMA_VERSION}`,
);

const errors: string[] = [];
const seen = new Map<string, string[]>();

function optionalReaddir(dir: string): string[] {
  try {
    return readdirSync(dir).sort(byCodeUnit);
  } catch {
    return [];
  }
}

function check(value: unknown, label: string): void {
  const read = Authored.safeParse(value);
  if (!read.success) {
    for (const issue of read.error.issues) {
      const at = issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
      errors.push(`${label}${at}: ${issue.message}`);
    }
    return;
  }
  if (!REVERSE_DNS_ID.test(read.data.id)) {
    errors.push(`${label}: id "${read.data.id}" is not reverse-DNS`);
  }
  seen.set(read.data.id, [...(seen.get(read.data.id) ?? []), label]);
}

for (const id of optionalReaddir(join(ROOT, 'modules'))) {
  const path = join(ROOT, 'modules', id, 'module.json');
  try {
    if (!statSync(path).isFile()) continue;
  } catch {
    continue;
  }
  try {
    check(JSON.parse(readFileSync(path, 'utf8')), `modules/${id}/module.json`);
  } catch (e) {
    errors.push(`modules/${id}/module.json: invalid JSON (${(e as Error).message})`);
  }
}

// Single-file sources: the frontmatter is the manifest.
for (const file of optionalReaddir(join(ROOT, 'modules')).filter((f) => f.endsWith('.module.md'))) {
  const fm = frontmatter(readFileSync(join(ROOT, 'modules', file), 'utf8'));
  if (!fm) {
    errors.push(`modules/${file}: missing YAML frontmatter`);
    continue;
  }
  check(fm, `modules/${file}`);
}

for (const [id, labels] of seen) {
  if (labels.length > 1) errors.push(`duplicate module id "${id}" in: ${labels.join(', ')}`);
}

if (errors.length) {
  console.error(`module manifest validation failed (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('all module manifests valid');

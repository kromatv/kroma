// The prop reader (`propDocs` in clients/tv-build) pointed at the real components,
// so a refactor that empties the inspector's Props tab fails a test.

import { fileURLToPath } from 'node:url';
import { readPropDocs } from '@kroma/bundler/props-docs';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

const docs = await readPropDocs(
  `${repoRoot}packages/ui/tsconfig.json`,
  (file) => file.includes('/packages/ui/src/') && !/\.(stories|demo|test)\.tsx$/.test(file),
);

describe('the prop docs read off the kit', () => {
  it('finds the design system, not a handful of it', () => {
    expect(Object.keys(docs).length).toBeGreaterThan(50);
  });

  it('reads a real component, so the format cannot drift silently', () => {
    const button = docs.Button ?? [];
    const byName = Object.fromEntries(button.map((prop) => [prop.name, prop]));
    expect(byName.label?.docs).toMatch(/accessibility name/);
    expect(byName.variant?.optional).toBe(true);
  });

  it('follows `extends`, which is the whole reason a checker reads these', () => {
    // These four are declared on FocusableProps, in another file.
    const names = (docs.Button ?? []).map((prop) => prop.name);
    expect(names).toEqual(expect.arrayContaining(['onPress', 'disabled', 'autoFocus', 'ref']));
  });

  it('keeps a type AS WRITTEN rather than resolving the alias', () => {
    // The checker would expand `IconName` to its 6215-member union.
    const icon = (docs.Button ?? []).find((prop) => prop.name === 'icon');
    expect(icon?.type).toBe('IconName');
  });

  it('drops @tag LINES from the prose: they document the author, not the prop', () => {
    const opensWithATag = Object.values(docs)
      .flat()
      .find((prop) => prop.docs?.startsWith('@'));
    expect(opensWithATag).toBeUndefined();
  });

  it('keeps an inline {@link}, which is prose rather than a tag line', () => {
    const linked = Object.values(docs)
      .flat()
      .find((prop) => prop.docs?.includes('{@link'));
    expect(linked?.docs).toBeDefined();
  });
});

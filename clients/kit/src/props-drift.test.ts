// The prop reader, pointed at the real components in this repo.
//
// The reader itself is `propDocs` in clients/tv-build, driving TypeScript's own
// checker. What a unit test of it could not check is the thing that actually
// breaks: whether it still understands the way the kit's own components are
// written. A props interface refactored into an `extends`, a doc comment moved,
// a type aliased somewhere new - each should fail a test rather than quietly
// emptying the inspector's Props tab, and the only place that can be checked is
// against the components themselves.
//
// It is also the regression test for what the old regex parser got wrong: it
// could not follow `extends`, so <Button> documented ten props while taking
// eighteen.

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readPropDocs } from '../../tv-build/props-docs';

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
    // ButtonProps extends Omit<FocusableProps, ...>: these four are declared on
    // FocusableProps, in another file, and a text parser never saw them.
    const names = (docs.Button ?? []).map((prop) => prop.name);
    expect(names).toEqual(expect.arrayContaining(['onPress', 'disabled', 'autoFocus', 'ref']));
  });

  it('keeps a type AS WRITTEN rather than resolving the alias', () => {
    // The checker would expand `IconName` to its 6215-member union. The panel
    // has to show what the author wrote.
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

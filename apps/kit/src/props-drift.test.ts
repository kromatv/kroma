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
    const names = (docs.Button ?? []).map((prop) => prop.name);
    expect(names).toEqual(expect.arrayContaining(['onPress', 'disabled', 'autoFocus', 'ref']));
  });

  it('keeps a type AS WRITTEN rather than resolving the alias', () => {
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

describe('what the panel is spared', () => {
  it('drops what a component only reaches by extending a platform type', () => {
    const box = (docs.Box ?? []).map((prop) => prop.name);
    expect(box).toEqual(expect.arrayContaining(['row', 'gap', 'bg', 'dataSet']));
    expect(box).not.toContain('onPointerEnterCapture');
    expect(box).not.toContain('onStartShouldSetResponder');
    expect(box).not.toContain('accessibilityLabel');
  });

  it('keeps a platform prop the component re-declares as its own', () => {
    // <View> has an `onFocus`; <TextField> declares its own over it.
    const onFocus = (docs.TextField ?? []).find((prop) => prop.name === 'onFocus');
    expect(onFocus?.type).toBe('() => void');
    expect(onFocus?.docs).toMatch(/takes focus/);
  });

  it('leaves no flat twin of a part its namespace already documents', () => {
    expect(docs['Field.Root']).toBeDefined();
    expect(docs.FieldRoot).toBeUndefined();
    expect(docs.DialogActions).toBeUndefined();
  });
});

describe('a compound component, read off its namespace object', () => {
  const partsOf = (name: string) =>
    Object.keys(docs)
      .filter((key) => key.startsWith(`${name}.`))
      .map((key) => key.slice(name.length + 1));

  it('documents every part, in the order the namespace declares them', () => {
    expect(partsOf('Dialog')).toEqual(['Root', 'Header', 'Panel', 'Footer', 'Actions']);
  });

  it('reads the Root the story renders, not the story’s own name', () => {
    const open = (docs['Dialog.Root'] ?? []).find((prop) => prop.name === 'open');
    expect(open?.optional).toBe(false);
    expect(docs.Dialog).toBeUndefined();
  });

  it('follows a part to the component it points at, whatever that is called', () => {
    const group = (docs['ListRow.Group'] ?? []).map((prop) => prop.name);
    expect(group).toEqual(expect.arrayContaining(['size', 'divider']));
  });

  it('documents a part whose props are written inline, with no interface to name', () => {
    expect((docs['Dialog.Header'] ?? []).map((prop) => prop.name)).toEqual(['children']);
  });
});

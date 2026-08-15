import { describe, expect, it } from 'vitest';
import { compileMdx } from './mdx.mjs';

const STORY = `import { Row } from './row';

export const story = { name: 'Row', group: 'Input' };

Some prose.

<Scene name="Live">
  A live take.

  {story.take((args) => <Row {...args} tone="calm" />)}
</Scene>

<Scene name="Fixed">
  <Row tone="loud">
    <Row.Label>Loud</Row.Label>
  </Row>
</Scene>

<Scene name="Merged" args={{ tone: 'loud' }} />
`;

const compileStory = (value: string) => compileMdx(value, '/kit/row.story.mdx');

describe('the lifted scenes', () => {
  it('exports one entry per scene, in document order', async () => {
    const code = await compileStory(STORY);

    expect(code).toContain('const __scenes =');
    expect(code.indexOf('"Live"')).toBeGreaterThan(-1);
    expect(code.indexOf('"Live"')).toBeLessThan(code.indexOf('"Fixed"'));
    expect(code.indexOf('"Fixed"')).toBeLessThan(code.indexOf('"Merged"'));
  });

  it('keeps an arrow take whole, because the parameter is where the controls reach', async () => {
    const code = await compileStory(STORY);

    expect(code).toContain('code: "(args) => <Row {...args} tone=\\"calm\\" />"');
  });

  it('gives a JSX take its source as written, dedented', async () => {
    const code = await compileStory(STORY);

    const at = code.indexOf('code: "<Row tone=\\"loud\\">');
    expect(at).toBeGreaterThan(-1);
    expect(code.slice(at, at + 120)).toContain('\\n  <Row.Label>');
  });

  it('moves the take onto the element, leaving the prose as its children', async () => {
    const code = await compileStory(STORY);

    const doc = code.slice(code.indexOf('function _createMdxContent'));
    expect(doc).toContain('render:');
    expect(doc).toContain('example:');
    expect(doc).toContain('A live take.');
    expect(doc).not.toContain('tone="calm"');
  });

  it('leaves every other mdx file untouched', async () => {
    const code = await compileMdx(STORY, '/kit/row.docs.mdx');

    expect(code).not.toContain('__scenes');
  });

  it('refuses a scene with no name', async () => {
    await expect(compileStory('<Scene args={{ a: 1 }} />\n')).rejects.toThrow(/name/);
  });

  it('refuses the take as a prop, which has one spelling and it is the child', async () => {
    await expect(compileStory('<Scene name="Prop" render={(a) => <b />} />\n')).rejects.toThrow(
      /child/,
    );
  });

  it('refuses two takes in one scene', async () => {
    await expect(
      compileStory('<Scene name="Two">\n  <b />\n\n  <i />\n</Scene>\n'),
    ).rejects.toThrow(/one take/);
  });

  it('refuses args on a fixed take, which they could not move', async () => {
    await expect(
      compileStory('<Scene name="Fixed" args={{ a: 1 }}>\n  <b />\n</Scene>\n'),
    ).rejects.toThrow(/move nothing/);
  });

  it('refuses a bare arrow, so the typed spelling is the only one', async () => {
    await expect(
      compileStory('<Scene name="Bare">\n  {(args) => <b />}\n</Scene>\n'),
    ).rejects.toThrow(/story\.take/);
  });

  it('refuses a live take that ignores the args', async () => {
    await expect(
      compileStory('<Scene name="Still">\n  {story.take(() => <b />)}\n</Scene>\n'),
    ).rejects.toThrow(/arrow reading the args/);
  });

  it('pairs a do and the dont beside it into one guidance block', async () => {
    const code = await compileStory('<Do>\n- Keep it.\n</Do>\n\n<Dont>\n- Lose it.\n</Dont>\n');

    expect(code).toContain('Guidance');
    // One wrapper holding both, rather than two loose siblings.
    expect(code.match(/_components\.Guidance|Guidance,/g)?.length).toBeGreaterThan(0);
    expect(code.indexOf('Guidance')).toBeLessThan(code.indexOf('Keep it.'));
  });

  it('leaves a lone card wrapped too, so one column reads like the pair', async () => {
    const code = await compileStory('<Do>\n- Keep it.\n</Do>\n');
    expect(code).toContain('Guidance');
  });
});

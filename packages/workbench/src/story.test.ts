import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { controlsRole, story } from './story';

function Chip(props: Readonly<{ label: string; tone?: 'calm' | 'loud' }>): ReactElement | null {
  void props;
  return null;
}

describe('the compiled render', () => {
  const built = story({
    name: 'Poster card',
    group: 'Media',
    args: { title: 'Declared' },
    render: (args) => `render:${args.title}` as unknown as null,
  });

  it('slugs the name into a stable id', () => {
    expect(built.id).toBe('poster-card');
  });

  it('passes the live args straight through to the story author’s function', () => {
    expect(built.render({ title: 'Live' })).toBe('render:Live');
  });
});

describe('a story that names its component', () => {
  const built = story({ name: 'Chip', group: 'Actions', component: Chip, args: { label: 'HDR' } });

  it('renders the component itself, with the live args', () => {
    const element = built.render({ label: 'Live' }) as ReactElement<{ label: string }>;
    expect(element.type).toBe(Chip);
    expect(element.props.label).toBe('Live');
  });

  it('is live, so its controls can never be the dead kind', () => {
    expect(built.live).toBe(true);
    expect(built.controls.map((control) => control.key)).toEqual(['label']);
  });

  it('rejects an arg whose value the component cannot take', () => {
    const typed = story({
      name: 'Typed',
      group: 'Actions',
      component: Chip,
      // @ts-expect-error `tone` is 'calm' | 'loud'
      args: { label: 'HDR', tone: 'shouty' },
    });
    expect(typed.args.tone).toBe('shouty');
  });

  // The likelier mistake, and the one that used to pass: `A` is inferred FROM
  // `args`, so a name the component has no prop for simply widened `A` and a
  // control appeared for something nothing reads.
  it('rejects an arg the component has no prop for at all', () => {
    const typed = story({
      name: 'Misnamed',
      group: 'Actions',
      component: Chip,
      // @ts-expect-error `Chip` has no `bogusProp`
      args: { label: 'HDR', bogusProp: 1 },
    });
    expect(typed.args.bogusProp).toBe(1);
  });
});

describe('live', () => {
  it('is true for a render that takes the args', () => {
    expect(story({ name: 'Reads', group: 'Media', render: (args) => args.title }).live).toBe(true);
  });

  it('is false for a render that ignores them, which is what hides the dead panel', () => {
    expect(story({ name: 'Ignores', group: 'Media', render: () => null }).live).toBe(false);
  });

  it('survives compilation, which gives every render an argument of its own', () => {
    const built = story({
      name: 'Wrapped',
      group: 'Media',
      args: { title: 'Declared' },
      render: () => null,
      scenes: [
        { name: 'Reads', render: (args) => args.title as unknown as null },
        { name: 'Ignores', render: () => null },
      ],
    });
    expect(built.render).toHaveLength(1);
    expect(built.scenes.map((scene) => scene.live)).toEqual([true, false]);
  });

  it('is false for a scene written as a fixed example', () => {
    const built = story({
      name: 'Fixed',
      group: 'Media',
      args: { title: 'Declared' },
      render: (args) => args.title as unknown as null,
      scenes: [{ name: 'Composed', example: () => 'composed' as unknown as null }],
    });
    expect(built.scenes[0]?.live).toBe(false);
    expect(built.scenes[0]?.render({ title: 'Live' })).toBe('composed');
  });

  it('is inherited by a scene that only overrides the args', () => {
    const reads = story({
      name: 'Inherits',
      group: 'Media',
      args: { title: 'Declared' },
      render: (args) => `render:${args.title}` as unknown as null,
      scenes: [{ name: 'With action', args: { title: 'Scene' } }],
    });
    const ignores = story({
      name: 'Inherits nothing',
      group: 'Media',
      render: () => null,
      scenes: [{ name: 'With action' }],
    });
    expect(reads.scenes[0]?.live).toBe(true);
    expect(ignores.scenes[0]?.live).toBe(false);
  });
});

describe('scenes and matrix opt-out', () => {
  const built = story({
    name: 'Empty state',
    group: 'State',
    variants: { options: { tone: ['calm', 'loud'] }, defaults: { tone: 'calm' } },
    matrix: false,
    args: { title: 'Nothing' },
    render: (args) => `render:${args.title}` as unknown as null,
    scenes: [{ name: 'With action', args: { title: 'Scene' } }],
  });

  it('drops the matrix when asked', () => {
    expect(built.matrix).toEqual([]);
    // The controls survive: only the grid was suppressed.
    expect(built.controls.length).toBeGreaterThan(0);
  });

  it('merges a scene args over the live ones', () => {
    expect(built.scenes[0]?.render({ title: 'Live' })).toBe('render:Scene');
  });
});

describe('controlsRole', () => {
  const built = story({
    name: 'Mixed',
    group: 'Media',
    args: { title: 'Declared' },
    render: (args) => args.title as unknown as null,
    scenes: [
      { name: 'Reads', render: (args) => args.title as unknown as null },
      { name: 'Ignores', render: () => null },
    ],
  });

  it('offers the controls on the story’s own views', () => {
    expect(controlsRole(built, 'preview')).toEqual({ show: true, reset: true });
    expect(controlsRole(built, 'matrix').show).toBe(true);
  });

  it('follows the scene being shown rather than the story', () => {
    expect(controlsRole(built, 'scene:0')).toEqual({ show: true, reset: true });
    expect(controlsRole(built, 'scene:1')).toEqual({ show: false, reset: false });
  });

  it('hides them for a demo, and for a scene index that does not exist', () => {
    expect(controlsRole(built, 'demo:0').show).toBe(false);
    expect(controlsRole(built, 'scene:9').show).toBe(false);
  });

  it('keeps Reset off where there is nothing to put back', () => {
    const bare = story({ name: 'Bare', group: 'Media', render: (args) => args.title });
    expect(controlsRole(bare, 'preview')).toEqual({ show: true, reset: false });
  });
});

describe('play', () => {
  const press = async () => {};

  it('is carried onto the story and onto each scene', () => {
    const built = story({
      name: 'Played',
      group: 'Media',
      render: () => null,
      play: press,
      scenes: [{ name: 'Alone', example: () => null, play: press }],
    });
    expect(built.play).toBe(press);
    expect(built.scenes[0]?.play).toBe(press);
  });
});

// @vitest-environment jsdom

import { onScreen } from '@kroma/ui/testing';
import { cleanup, render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import * as sample from './fixtures/sample.story.mdx';
import { MdxDoc } from './mdx';
import { StoryDocContext } from './story-blocks';
import { storyFromMdx } from './story-mdx';

afterEach(cleanup);

const render = (ui: ReactNode) => renderRaw(onScreen(ui as ReactElement));

const story = storyFromMdx(sample);

describe('a story compiled from its .story.mdx', () => {
  it('declares itself through meta', () => {
    expect(story.id).toBe('sample');
    expect(story.name).toBe('Sample');
    expect(story.group).toBe('Input');
  });

  it('derives its controls from the args, as the object format did', () => {
    expect(story.controls.map((control) => control.key)).toEqual(['label', 'loud']);
    expect(story.live).toBe(true);
  });

  it('keeps the matrix opt-in', () => {
    expect(story.matrix).toEqual([]);
  });

  it('lists the lifted scenes in document order, each knowing its liveness', () => {
    expect(story.scenes.map((scene) => scene.name)).toEqual(['Loud', 'Fixed', 'Merged']);
    expect(story.scenes.map((scene) => scene.live)).toEqual([true, false, true]);
  });

  it('carries each written scene the source it was written as', () => {
    expect(story.scenes[0]?.code).toContain('(args) =>');
    expect(story.scenes[1]?.code?.startsWith('<Box')).toBe(true);
  });

  it("hands an args-only scene the story's own source, which is what renders it", () => {
    expect(story.code).toContain('<Text variant="body">');
    expect(story.scenes[2]?.code).toBe(story.code);
  });

  it('merges an args-only scene over the live args', () => {
    render(story.scenes[2]?.render(story.args));
    expect(screen.getByText('Pause')).toBeTruthy();
  });

  it('renders the preview from the exported render', () => {
    render(story.render(story.args));
    expect(screen.getByText('Play')).toBeTruthy();
  });

  it('refuses a module with no identity', () => {
    expect(() => storyFromMdx({ ...sample, story: { name: '', group: '' } })).toThrow(
      /defineStory/,
    );
  });

  // MDX is not typechecked, so this is the check `story()`'s types would have
  // made: an arg the story has no control for moves nothing on the canvas.
  it('refuses a scene setting an arg the story does not have', () => {
    const typo = { ...sample, __scenes: [{ name: 'Typo', args: { labell: 'Play' } }] };
    expect(() => storyFromMdx(typo, 'a/sample.story.mdx')).toThrow(/labell/);
  });

  it('names what the story does know, so the typo is obvious', () => {
    const typo = { ...sample, __scenes: [{ name: 'Typo', args: { labell: 'Play' } }] };
    expect(() => storyFromMdx(typo, 'a/sample.story.mdx')).toThrow(/label, loud/);
  });
});

describe('the document half', () => {
  it('shows every scene as a live specimen fed by the story scope', () => {
    const Docs = story.docs;
    if (typeof Docs !== 'function') throw new Error('the docs did not compile to a component');
    render(
      <StoryDocContext.Provider value={{ args: story.args, render: story.render }}>
        <MdxDoc content={Docs} />
      </StoryDocContext.Provider>,
    );

    expect(screen.getByText('Play!')).toBeTruthy();
    expect(screen.getByText('Frozen')).toBeTruthy();
    expect(screen.getByText('Pause')).toBeTruthy();
    expect(screen.getByText('Keep it short.')).toBeTruthy();
    expect(screen.getByText('Shout.')).toBeTruthy();
  });

  // The two cards are written as two blocks and read as one pair; the header
  // is what carries the verdict, which is why the lines inside need not.
  it('heads each guidance card with its own verdict', () => {
    const Docs = story.docs;
    if (typeof Docs !== 'function') throw new Error('the docs did not compile to a component');
    render(<MdxDoc content={Docs} />);

    expect(screen.getByText('Do')).toBeTruthy();
    expect(screen.getByText("Don't")).toBeTruthy();
  });
});

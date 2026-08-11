// @vitest-environment jsdom

import { cleanup, render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Chip } from '#ui/components/atoms/chip';
import { Text } from '#ui/components/atoms/text';
import { onScreen } from '#ui/testing';
import { Section } from './section';

const render = (ui: ReactElement) => renderRaw(onScreen(ui));

const markup = (ui: ReactElement): string => {
  const { container } = render(ui);
  const html = container.innerHTML;
  cleanup();
  return html;
};

const hairlines = (root: HTMLElement): Element[] =>
  [...root.querySelectorAll('div')].filter((el) => getComputedStyle(el).height === '1px');

afterEach(cleanup);

describe('the one-line Section', () => {
  it('draws the same tree as the parts it stands for', () => {
    const sugar = markup(
      <Section.Root title="Playback" actions={<Text>See all</Text>}>
        <Text>First line</Text>
      </Section.Root>,
    );
    const parts = markup(
      <Section.Root>
        <Section.Header>
          <Section.Title>Playback</Section.Title>
          <Section.Actions>
            <Text>See all</Text>
          </Section.Actions>
        </Section.Header>
        <Text>First line</Text>
      </Section.Root>,
    );
    expect(parts).toBe(sugar);
  });

  it('lifts the header out of the content whatever order it was written in', () => {
    const written = markup(
      <Section.Root>
        <Text>First line</Text>
        <Section.Header>
          <Section.Title>Playback</Section.Title>
        </Section.Header>
      </Section.Root>,
    );
    const sorted = markup(
      <Section.Root title="Playback">
        <Text>First line</Text>
      </Section.Root>,
    );
    expect(written).toBe(sorted);
  });
});

describe('the rule', () => {
  it('comes with the header', () => {
    const { container } = render(
      <Section.Root title="Playback">
        <Text>First line</Text>
      </Section.Root>,
    );
    expect(hairlines(container)).toHaveLength(1);
  });

  it('is not drawn over a band that has no header', () => {
    const { container } = render(
      <Section.Root>
        <Text>First line</Text>
      </Section.Root>,
    );
    expect(hairlines(container)).toHaveLength(0);
    expect(screen.getByText('First line')).toBeTruthy();
  });
});

describe('Section.Actions', () => {
  it('pushes itself to the far end of the header row', () => {
    render(
      <Section.Root title="Playback" actions={<Chip variant="subtle" label="See all" />}>
        <Text>First line</Text>
      </Section.Root>,
    );
    const row = screen.getByText('Playback').parentElement as HTMLElement;
    const actions = row.lastElementChild as HTMLElement;
    expect(actions.contains(screen.getByText('See all'))).toBe(true);
    expect(getComputedStyle(actions).marginLeft).toBe('auto');
  });
});

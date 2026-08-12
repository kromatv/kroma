// @vitest-environment jsdom

import { cleanup, fireEvent, render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { clearPressGuard } from '#ui/lib/press-guard';
import { onScreen } from '#ui/testing';
import { Disclosure } from './disclosure';

const render = (ui: ReactElement) => renderRaw(onScreen(ui));

const markup = (ui: ReactElement): string => {
  const { container } = render(ui);
  const html = container.innerHTML;
  cleanup();
  return html;
};

afterEach(() => {
  cleanup();
  clearPressGuard();
});

describe('a section written without its panel', () => {
  it('draws the same tree as the one that names it', () => {
    const loose = markup(
      <Disclosure.Root defaultOpen>
        <Disclosure.Trigger>Advanced</Disclosure.Trigger>
        <Text>Custom endpoint</Text>
      </Disclosure.Root>,
    );
    const named = markup(
      <Disclosure.Root defaultOpen>
        <Disclosure.Trigger>Advanced</Disclosure.Trigger>
        <Disclosure.Panel>
          <Text>Custom endpoint</Text>
        </Disclosure.Panel>
      </Disclosure.Root>,
    );
    expect(named).toBe(loose);
  });
});

describe('the panel', () => {
  it('is unmounted while the section is closed', () => {
    render(
      <Disclosure.Root>
        <Disclosure.Trigger>Advanced</Disclosure.Trigger>
        <Text>Custom endpoint</Text>
      </Disclosure.Root>,
    );
    expect(screen.queryByText('Custom endpoint')).toBeNull();
  });

  it('opens on a press of the trigger, which is the whole row', () => {
    render(
      <Disclosure.Root>
        <Disclosure.Trigger>Advanced</Disclosure.Trigger>
        <Text>Custom endpoint</Text>
      </Disclosure.Root>,
    );
    fireEvent.click(screen.getByLabelText('Advanced'));
    expect(screen.getByText('Custom endpoint')).toBeTruthy();
  });

  it('reports the state a controlled caller owns', () => {
    const { rerender } = render(
      <Disclosure.Root open={false}>
        <Disclosure.Trigger>Advanced</Disclosure.Trigger>
        <Text>Custom endpoint</Text>
      </Disclosure.Root>,
    );
    expect(screen.queryByText('Custom endpoint')).toBeNull();
    rerender(
      onScreen(
        <Disclosure.Root open>
          <Disclosure.Trigger>Advanced</Disclosure.Trigger>
          <Text>Custom endpoint</Text>
        </Disclosure.Root>,
      ),
    );
    expect(screen.getByText('Custom endpoint')).toBeTruthy();
  });
});

describe('the rule', () => {
  it('comes with the trigger, so a section written without one carries none', () => {
    const { container } = render(
      <Disclosure.Root>
        <Disclosure.Panel>
          <Text>Custom endpoint</Text>
        </Disclosure.Panel>
      </Disclosure.Root>,
    );
    const hairlines = [...container.querySelectorAll('div')].filter(
      (el) => getComputedStyle(el).height === '1px',
    );
    expect(hairlines).toHaveLength(0);
  });
});

describe('the trigger', () => {
  it('names itself from a plain-text heading, and says whether it is open', () => {
    render(
      <Disclosure.Root defaultOpen>
        <Disclosure.Trigger>Advanced</Disclosure.Trigger>
      </Disclosure.Root>,
    );
    const trigger = screen.getByLabelText('Advanced');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('takes the name a heading richer than a string cannot give it', () => {
    render(
      <Disclosure.Root>
        <Disclosure.Trigger label="Advanced">
          <Text>Advanced</Text>
        </Disclosure.Trigger>
      </Disclosure.Root>,
    );
    expect(screen.getByLabelText('Advanced').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('a part outside its Root', () => {
  it('says so rather than rendering nothing', () => {
    expect(() => render(<Disclosure.Panel>orphan</Disclosure.Panel>)).toThrow(
      '<Disclosure.Panel> must be used inside <Disclosure.Root>',
    );
  });
});

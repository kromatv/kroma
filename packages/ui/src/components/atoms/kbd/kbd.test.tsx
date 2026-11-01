// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { onScreen } from '#ui/testing';
import { Kbd } from './kbd';

const glyphs = (container: Element) => container.querySelectorAll('svg').length;

afterEach(cleanup);

describe('Kbd', () => {
  it('spells a key out', () => {
    render(onScreen(<Kbd>esc</Kbd>));

    expect(screen.getByText('esc')).toBeTruthy();
  });

  it('draws a key’s symbol rather than typing it', () => {
    const { container } = render(onScreen(<Kbd icon="corner-down-left" />));

    expect(glyphs(container)).toBe(1);
    expect(container.textContent).toBe('');
  });

  it('holds a symbol and a word together', () => {
    const { container } = render(onScreen(<Kbd icon="command">K</Kbd>));

    expect(glyphs(container)).toBe(1);
    expect(screen.getByText('K')).toBeTruthy();
  });

  it('leaves a node it was handed as it is', () => {
    render(
      onScreen(
        <Kbd>
          <Text>custom</Text>
        </Kbd>,
      ),
    );

    expect(screen.getByText('custom')).toBeTruthy();
  });
});

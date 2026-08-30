// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FocusRoot } from './focus-root';

const hosts = (root: HTMLElement) => root.querySelectorAll('[tabindex]').length;

describe('the screen root', () => {
  it('draws the key host that holds the platform focus', () => {
    const { container } = render(<FocusRoot>{null}</FocusRoot>);

    expect(hosts(container)).toBe(1);
  });

  it('draws none where it reuses the transport of another root', () => {
    const { container } = render(<FocusRoot bridge={false}>{null}</FocusRoot>);

    expect(hosts(container)).toBe(0);
  });
});

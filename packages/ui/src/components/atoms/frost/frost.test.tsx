// @vitest-environment jsdom

import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Box } from '#ui/components/atoms/box';
import { declared } from '#ui/testing';
import { Frost, setFrostEnabled } from './frost';

afterEach(() => setFrostEnabled(true));

function frosted() {
  const { container } = render(
    <Frost amount={12}>
      <Box radius="lg" />
    </Frost>,
  );
  return container.firstElementChild as HTMLElement;
}

describe('the app-wide frost switch', () => {
  it('reaches a surface that is already on screen', () => {
    const node = frosted();
    expect(declared(node, 'backdropFilter')).toContain('blur');

    // The switch is thrown from a settings row while the surface it affects is
    // drawn behind it: a module flag alone would only take on the next render.
    act(() => setFrostEnabled(false));
    expect(declared(node, 'backdropFilter')).toBeNull();

    act(() => setFrostEnabled(true));
    expect(declared(node, 'backdropFilter')).toContain('blur');
  });
});

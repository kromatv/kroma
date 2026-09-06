// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { declared } from '#ui/testing';
import { Box } from './box';

afterEach(cleanup);

describe('<Box asChild>', () => {
  it('renders no element of its own and hands its layout to the child', () => {
    const { container, getByTestId } = render(
      <Box asChild row px={12}>
        <Box testID="child" py={4} />
      </Box>,
    );
    const child = getByTestId('child');
    const style = getComputedStyle(child);

    expect(container.querySelectorAll('*')).toHaveLength(1);
    expect(style.flexDirection).toBe('row');
    expect(style.paddingLeft).toBe('12px');
    expect(style.paddingTop).toBe('4px');
  });

  it("loses to the child's own style, which stays the final word", () => {
    const { getByTestId } = render(
      <Box asChild px={12}>
        <Box testID="child" style={{ paddingLeft: 4 }} />
      </Box>,
    );

    expect(getComputedStyle(getByTestId('child')).paddingLeft).toBe('4px');
  });

  it('is a plain box without the flag', () => {
    const { container } = render(
      <Box px={12}>
        <Box testID="child" />
      </Box>,
    );

    expect(container.querySelectorAll('*')).toHaveLength(2);
  });
});

describe('a box that states its hit testing', () => {
  it('puts it in the style, since the prop of that name is deprecated on the web', () => {
    const { container } = render(<Box pointerEvents="none" testID="hit" />);

    const host = container.firstElementChild as HTMLElement;
    expect(declared(host, 'pointerEvents')).toBe('none');
    expect(host.getAttribute('pointerEvents')).toBeNull();
  });

  it('lets the style a caller passes win over it', () => {
    const { container } = render(<Box pointerEvents="none" style={{ pointerEvents: 'auto' }} />);

    expect(declared(container.firstElementChild as HTMLElement, 'pointerEvents')).toBe('auto');
  });
});

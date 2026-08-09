// @vitest-environment jsdom

// Unscoped (a pointer browser), the rail is a REAL horizontal scroller: the
// browser routes the wheel, so no listener may consume it. The old translated
// row intercepted the wheel and swallowed the page's vertical scroll with it.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Txt } from '#ui/components/atoms/text';
import { VirtualRail } from './virtual-rail';

afterEach(cleanup);

const DATA = Array.from({ length: 24 }, (_, i) => `Tile ${i}`);

function mount() {
  const { container } = render(
    <VirtualRail
      data={DATA}
      itemWidth={200}
      style={{ height: 300 }}
      renderItem={(label) => <Txt>{label}</Txt>}
    />,
  );
  return container;
}

describe('an unscoped rail', () => {
  it('renders a real scroller, not a translated row', () => {
    const container = mount();
    expect(container.querySelector('[style*="translate"]')).toBeNull();
  });

  it('leaves a vertical wheel to the browser', () => {
    const container = mount();
    const over = container.querySelector('div') as HTMLElement;
    const event = new WheelEvent('wheel', { deltaY: 300, cancelable: true, bubbles: true });
    over.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves a horizontal wheel to the browser too', () => {
    const container = mount();
    const over = container.querySelector('div') as HTMLElement;
    const event = new WheelEvent('wheel', { deltaX: 300, cancelable: true, bubbles: true });
    over.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

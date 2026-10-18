// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Box } from '#ui/components/atoms/box';
import { KitProvider } from '#ui/configure';
import { declared } from '#ui/testing';
import { Frost } from './frost';

function Surface({ enabled }: { enabled: boolean }) {
  return (
    <KitProvider config={{ frostEnabled: enabled }}>
      <Frost amount={12}>
        <Box radius="lg" />
      </Frost>
    </KitProvider>
  );
}
describe('root frost preferences', () => {
  it('reaches a surface already on screen through provider updates', () => {
    const root = render(<Surface enabled />);
    const node = root.container.firstElementChild;
    if (!node) throw new Error('expected a surface');
    expect(declared(node, 'backdropFilter')).toContain('blur');
    root.rerender(<Surface enabled={false} />);
    expect(declared(node, 'backdropFilter')).toBeNull();
    root.rerender(<Surface enabled />);
    expect(declared(node, 'backdropFilter')).toContain('blur');
    root.unmount();
  });
  it('keeps different mounted roots independent', () => {
    const a = render(<Surface enabled={false} />);
    const b = render(<Surface enabled />);
    const first = a.container.firstElementChild;
    const second = b.container.firstElementChild;
    if (!(first && second)) throw new Error('expected both surfaces');
    expect(declared(first, 'backdropFilter')).toBeNull();
    expect(declared(second, 'backdropFilter')).toContain('blur');
    a.unmount();
    expect(declared(second, 'backdropFilter')).toContain('blur');
    b.unmount();
  });
});

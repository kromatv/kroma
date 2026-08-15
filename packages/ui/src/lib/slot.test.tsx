// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeSlotProps, Slot } from './slot';

afterEach(cleanup);

describe('mergeSlotProps', () => {
  it('lets the child win a plain prop', () => {
    expect(mergeSlotProps({ id: 'slot', role: 'none' }, { id: 'child' })).toEqual({
      id: 'child',
      role: 'none',
    });
  });

  it('composes style as [slot, child], the RN precedence for an array', () => {
    const merged = mergeSlotProps({ style: { padding: 8 } }, { style: { padding: 4 } });

    expect(merged.style).toEqual([{ padding: 8 }, { padding: 4 }]);
  });

  it('keeps the slot style alone when the child has none to add', () => {
    expect(mergeSlotProps({ style: { padding: 8 } }, { style: null }).style).toEqual({
      padding: 8,
    });
  });

  it('runs both handlers, the child first', () => {
    const calls: string[] = [];
    const merged = mergeSlotProps(
      { onPress: () => calls.push('slot') },
      { onPress: () => calls.push('child') },
    );
    (merged.onPress as () => void)();

    expect(calls).toEqual(['child', 'slot']);
  });

  it('keeps a lone handler from either side', () => {
    const on = vi.fn();

    (mergeSlotProps({ onPress: on }, {}).onPress as () => void)();
    (mergeSlotProps({}, { onPress: on }).onPress as () => void)();

    expect(on).toHaveBeenCalledTimes(2);
  });

  it('does not mistake a data prop for a handler', () => {
    expect(mergeSlotProps({ once: 1 }, { once: 2 }).once).toBe(2);
  });

  it('attaches both refs', () => {
    const a = createRef<null>();
    const b = vi.fn();
    const merged = mergeSlotProps({ ref: b }, { ref: a });
    (merged.ref as (node: unknown) => void)('node');

    expect(a.current).toBe('node');
    expect(b).toHaveBeenCalledWith('node');
  });
});

describe('<Slot>', () => {
  it('renders no element of its own', () => {
    const { container } = render(
      <Slot testID="slot">
        <View testID="child" />
      </Slot>,
    );

    expect(container.children).toHaveLength(1);
    expect(container.querySelectorAll('*')).toHaveLength(1);
  });

  it('hands its style to the child, under the child own declarations', () => {
    const { getByTestId } = render(
      <Slot style={{ padding: 8, margin: 2 }}>
        <View testID="child" style={{ padding: 4 }} />
      </Slot>,
    );
    const style = getComputedStyle(getByTestId('child'));

    expect(style.paddingTop).toBe('4px');
    expect(style.marginTop).toBe('2px');
  });

  it('fires both press handlers through one element', () => {
    const calls: string[] = [];
    const { getByRole } = render(
      <Slot onPress={() => calls.push('slot')}>
        <Pressable role="button" onPress={() => calls.push('child')}>
          <Text>go</Text>
        </Pressable>
      </Slot>,
    );
    fireEvent.click(getByRole('button'));

    expect(calls).toEqual(['child', 'slot']);
  });

  it('refuses more than one child', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      render(
        <Slot>
          <View />
          <View />
        </Slot>,
      ),
    ).toThrow();
    spy.mockRestore();
  });
});

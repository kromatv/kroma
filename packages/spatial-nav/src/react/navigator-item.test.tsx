// @vitest-environment jsdom

import {
  DefaultFocus,
  NavigatorItem,
  NavigatorRoot,
  NavigatorView,
  PointerDeviceProvider,
} from '@kromatv/spatial-nav/react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { View } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

function Pad() {
  return (
    <PointerDeviceProvider>
      <NavigatorRoot>
        <NavigatorView direction="horizontal">
          <DefaultFocus>
            <NavigatorItem>
              {({ focused }) => <View testID={focused ? 'lit' : 'a'} />}
            </NavigatorItem>
          </DefaultFocus>
          <NavigatorItem viewProps={{ testID: 'b-box' }}>
            {({ focused }) => <View testID={focused ? 'lit' : 'b'} />}
          </NavigatorItem>
        </NavigatorView>
      </NavigatorRoot>
    </PointerDeviceProvider>
  );
}

function moveTheMouse() {
  act(() => {
    window.dispatchEvent(new MouseEvent('mousemove'));
  });
}

describe('<NavigatorItem>', () => {
  it('says so rather than degrading when nothing mounted a navigator', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<NavigatorItem>{() => <View />}</NavigatorItem>)).toThrow(
      /No registered spatial navigator/,
    );

    quiet.mockRestore();
  });

  it('selects on a click', () => {
    const onSelect = vi.fn();
    render(
      <NavigatorRoot>
        <NavigatorView direction="horizontal">
          <NavigatorItem onSelect={onSelect} viewProps={{ testID: 'a-box' }}>
            {() => <View testID="a" />}
          </NavigatorItem>
        </NavigatorView>
      </NavigatorRoot>,
    );

    fireEvent.click(screen.getByTestId('a-box'));

    expect(onSelect).toHaveBeenCalled();
  });
});

function Held({
  onSelect,
  onLongSelect,
}: Readonly<{ onSelect: () => void; onLongSelect: () => void }>) {
  return (
    <NavigatorRoot>
      <NavigatorView direction="horizontal">
        <NavigatorItem
          onSelect={onSelect}
          onLongSelect={onLongSelect}
          viewProps={{ testID: 'held-box' }}
        >
          {() => <View />}
        </NavigatorItem>
      </NavigatorView>
    </NavigatorRoot>
  );
}

function holdThePointer(box: HTMLElement, ms: number, button = 0) {
  fireEvent.pointerDown(box, { button });
  act(() => {
    vi.advanceTimersByTime(ms);
  });
  fireEvent.pointerUp(box, { button });
  fireEvent.click(box, { button });
}

describe('a pointer held on an item', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('long-selects it after half a second, and the click its release makes selects nothing', () => {
    const onSelect = vi.fn();
    const onLongSelect = vi.fn();
    render(<Held onSelect={onSelect} onLongSelect={onLongSelect} />);

    holdThePointer(screen.getByTestId('held-box'), 500);

    expect(onLongSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('moves the ring to the item it holds', () => {
    render(
      <NavigatorRoot>
        <NavigatorView direction="horizontal">
          <DefaultFocus>
            <NavigatorItem>
              {({ focused }) => <View testID={focused ? 'lit' : 'a'} />}
            </NavigatorItem>
          </DefaultFocus>
          <NavigatorItem onLongSelect={() => {}} viewProps={{ testID: 'held-box' }}>
            {({ focused }) => <View testID={focused ? 'held-lit' : 'held'} />}
          </NavigatorItem>
        </NavigatorView>
      </NavigatorRoot>,
    );

    holdThePointer(screen.getByTestId('held-box'), 500);

    expect(screen.getByTestId('held-lit')).toBeTruthy();
    expect(screen.getByTestId('a')).toBeTruthy();
  });

  it('selects it on a click shorter than a hold', () => {
    const onSelect = vi.fn();
    const onLongSelect = vi.fn();
    render(<Held onSelect={onSelect} onLongSelect={onLongSelect} />);

    holdThePointer(screen.getByTestId('held-box'), 200);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onLongSelect).not.toHaveBeenCalled();
  });

  it('lets the click after a hold whose release landed elsewhere select again', () => {
    const onSelect = vi.fn();
    const onLongSelect = vi.fn();
    render(<Held onSelect={onSelect} onLongSelect={onLongSelect} />);
    const box = screen.getByTestId('held-box');
    fireEvent.pointerDown(box, { button: 0 });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    holdThePointer(box, 100);

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('holds nothing for a button other than the primary one', () => {
    const onSelect = vi.fn();
    const onLongSelect = vi.fn();
    render(<Held onSelect={onSelect} onLongSelect={onLongSelect} />);

    holdThePointer(screen.getByTestId('held-box'), 800, 2);

    expect(onLongSelect).not.toHaveBeenCalled();
  });

  it('drops the hold when the pointer leaves the item', () => {
    const onSelect = vi.fn();
    const onLongSelect = vi.fn();
    render(<Held onSelect={onSelect} onLongSelect={onLongSelect} />);
    const box = screen.getByTestId('held-box');

    fireEvent.pointerDown(box, { button: 0 });
    fireEvent.pointerLeave(box);
    act(() => {
      vi.advanceTimersByTime(800);
    });

    expect(onLongSelect).not.toHaveBeenCalled();
  });
});

describe('hovering an item', () => {
  it('takes the focus once the mouse has moved', () => {
    render(<Pad />);

    moveTheMouse();
    fireEvent.mouseEnter(screen.getByTestId('b-box'));

    expect(screen.queryByTestId('b')).toBeNull();
  });

  it('still leaves exactly one item lit', () => {
    render(<Pad />);

    moveTheMouse();
    fireEvent.mouseEnter(screen.getByTestId('b-box'));

    expect(screen.queryAllByTestId('lit')).toHaveLength(1);
  });

  it('does nothing while the remote is the device in play', () => {
    render(<Pad />);

    fireEvent.mouseEnter(screen.getByTestId('b-box'));

    expect(screen.getByTestId('b')).toBeTruthy();
  });
});

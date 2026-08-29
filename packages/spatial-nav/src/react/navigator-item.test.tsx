// @vitest-environment jsdom

import {
  DefaultFocus,
  NavigatorItem,
  NavigatorRoot,
  NavigatorView,
  PointerDeviceProvider,
} from '@kroma/spatial-nav/react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { View } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

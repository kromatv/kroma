// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { StyleSheet, Text } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';
import { isStaticText, StaticText } from './static-text';

afterEach(cleanup);

const s = StyleSheet.create({ title: { color: 'white', fontSize: 18, lineHeight: 22 } });

const html = (node: React.ReactElement) => render(node).container.innerHTML;

describe('StaticText', () => {
  it.each([undefined, 1, 3])('draws what a react-native-web Text draws, at %s lines', (lines) => {
    expect(
      html(
        <StaticText style={s.title} lines={lines} testID="t">
          Hello
        </StaticText>,
      ),
    ).toBe(
      html(
        <Text style={s.title} numberOfLines={lines} testID="t">
          Hello
        </Text>,
      ),
    );
  });

  it('is the outer text span when nested in another Text', () => {
    expect(
      html(
        <Text>
          a <StaticText style={s.title}>b</StaticText>
        </Text>,
      ),
    ).toBe(
      html(
        <Text>
          a <Text style={s.title}>b</Text>
        </Text>,
      ),
    );
  });

  it('takes only strings that need nothing else from a Text', () => {
    expect(isStaticText({ children: 'Film', testID: 'x' })).toBe(true);
    expect(isStaticText({ children: ['S', 1, 'E', 2] })).toBe(true);
    expect(isStaticText({})).toBe(true);
    expect(isStaticText({ children: 'Film', onPress: () => {} })).toBe(false);
    expect(isStaticText({ children: <b /> })).toBe(false);
    expect(isStaticText({ children: 'Film', accessibilityRole: 'header' })).toBe(false);
  });
});

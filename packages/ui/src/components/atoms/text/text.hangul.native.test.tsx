// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import type { TextProps } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from './text.component';

const seen = vi.hoisted(() => {
  const props: TextProps[] = [];
  return { props };
});

vi.mock('react-native', async (original) => ({
  ...(await original<typeof import('react-native')>()),
  Text: (props: TextProps) => {
    seen.props.push(props);
    return null;
  },
}));

afterEach(() => {
  cleanup();
  seen.props.length = 0;
});

describe('Text on a native target', () => {
  it('keeps a Hangul word whole when its line wraps', () => {
    render(<Text>한국어 문장을 단어 사이에서만 줄바꿈합니다</Text>);

    expect(seen.props.at(-1)?.lineBreakStrategyIOS).toBe('hangul-word');
  });

  it('lets a caller choose another strategy', () => {
    render(<Text lineBreakStrategyIOS="standard">Line</Text>);

    expect(seen.props.at(-1)?.lineBreakStrategyIOS).toBe('standard');
  });
});

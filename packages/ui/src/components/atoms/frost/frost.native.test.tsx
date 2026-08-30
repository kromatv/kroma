// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { View } from 'react-native';
import { describe, expect, it, vi } from 'vitest';
import { Frost, type FrostBackdropProps, registerFrost } from './frost';

describe('the blur view a native shell registers', () => {
  it('is asked for a strength and a tint, and for no Android blur method', () => {
    const backdrop = vi.fn((_props: FrostBackdropProps) => null);

    registerFrost(backdrop);
    render(
      <Frost amount={12}>
        <View style={{ borderRadius: 12 }} />
      </Frost>,
    );

    const props = backdrop.mock.calls[0]?.[0];

    expect(props).toMatchObject({ intensity: 48, tint: 'dark' });
    expect(props).not.toHaveProperty('blurMethod');
  });
});

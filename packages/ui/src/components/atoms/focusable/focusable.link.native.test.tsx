// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { View } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Focusable } from './focusable';

afterEach(cleanup);

function Anchor({ to, ...host }: Readonly<Record<string, unknown>>) {
  return <View {...(host as object)} {...({ href: to } as object)} />;
}

const host = (label: string) => screen.getByLabelText(label);

describe('a Focusable given a router link on a platform with no document', () => {
  it('renders its own pressable rather than the element it was handed', () => {
    render(<Focusable label="Genres" as={<Anchor to="/genres" />} />);

    expect(host('Genres').getAttribute('href')).toBeNull();
  });

  it('keeps onPress as the way the control is activated', () => {
    const onPress = vi.fn();

    render(<Focusable label="Genres" onPress={onPress} as={<Anchor to="/genres" />} />);
    fireEvent.click(host('Genres'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

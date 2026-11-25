// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { View } from 'react-native';
import { DirectionRoot } from '#ui/lib/direction-root.component';
import { declared } from '#ui/testing';
import { useFlipMotion } from './flip-motion.hook';

afterEach(cleanup);

function Thumb({ on }: Readonly<{ on: boolean }>) {
  const flip = useFlipMotion(on, 20, 0);
  return <View testID="thumb" style={flip.slide} />;
}

const slid = (locale: string) => {
  const { getByTestId } = render(
    <DirectionRoot locale={locale}>
      <Thumb on />
    </DirectionRoot>,
  );
  return declared(getByTestId('thumb'), 'transform');
};

describe('useFlipMotion', () => {
  it('slides the thumb towards the end on the right in a language written left to right', () => {
    expect(slid('en')).toBe('translateX(20px)');
  });

  it('slides the thumb towards the end on the left in a language written right to left', () => {
    expect(slid('ar')).toBe('translateX(-20px)');
  });
});

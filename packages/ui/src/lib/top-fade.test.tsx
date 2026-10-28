// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { Text } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';
import { TopFade } from './top-fade';

afterEach(cleanup);

const bands = (container: HTMLElement) =>
  [...container.querySelectorAll('div')].filter((el) =>
    (el.getAttribute('style') ?? '').includes('linear-gradient'),
  );

describe('TopFade', () => {
  it('draws its band over a page that does not mask itself', () => {
    const { container } = render(
      <TopFade inset={104}>
        <Text>page</Text>
      </TopFade>,
    );

    expect(bands(container)).toHaveLength(1);
  });

  it('leaves the fade to the content where the content masks itself', () => {
    const { container } = render(
      <TopFade inset={104} masked>
        <Text>page</Text>
      </TopFade>,
    );

    expect(bands(container)).toHaveLength(0);
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Text } from './text.component';

afterEach(cleanup);

describe('Text', () => {
  it('leaves the native line-break strategy off the page', () => {
    render(<Text accessibilityRole="header">한국어 문장을 단어 사이에서만 줄바꿈합니다</Text>);

    const host = screen.getByRole('heading');

    expect([...host.attributes].map((attribute) => attribute.name)).not.toContain(
      'linebreakstrategyios',
    );
  });
});

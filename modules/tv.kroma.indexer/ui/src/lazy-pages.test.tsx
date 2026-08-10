// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { createElement, Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import { indexerModule } from './index';

describe('indexerModule pages', () => {
  it('keeps /indexers out of the admin bundle behind a lazy boundary', () => {
    const route = indexerModule.routes?.find((r) => r.path === 'indexers');
    const { container, unmount } = render(
      createElement(Suspense, { fallback: 'pending' }, createElement(route?.component ?? 'div')),
    );

    expect(container.textContent).toBe('pending');
    unmount();
  });
});

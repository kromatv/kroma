// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { createElement, Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import { torrentsModule } from './index';

describe('torrentsModule pages', () => {
  it.each(['downloads', 'naming'])(
    'keeps /%s out of the admin bundle behind a lazy boundary',
    (path) => {
      const route = torrentsModule.routes?.find((r) => r.path === path);
      const { container, unmount } = render(
        createElement(Suspense, { fallback: 'pending' }, createElement(route?.component ?? 'div')),
      );

      expect(container.textContent).toBe('pending');
      unmount();
    },
  );
});

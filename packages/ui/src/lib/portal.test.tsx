// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Portal, PortalHost } from './portal';

describe('a portal', () => {
  it('leaves for the document when nothing hosts it', () => {
    render(
      <Portal>
        <span data-testid="pop">pop</span>
      </Portal>,
    );

    expect(document.body.querySelector('[data-testid="pop"]')).not.toBeNull();
  });

  it('lands in the host it was given instead', () => {
    const into = document.createElement('div');
    document.body.append(into);

    render(
      <PortalHost container={into}>
        <Portal>
          <span data-testid="pop">pop</span>
        </Portal>
      </PortalHost>,
    );

    expect(into.querySelector('[data-testid="pop"]')).not.toBeNull();
  });

  it('takes the document back when the host names none', () => {
    render(
      <PortalHost container={null}>
        <Portal>
          <span data-testid="pop">pop</span>
        </Portal>
      </PortalHost>,
    );

    expect(document.body.querySelector('[data-testid="pop"]')).not.toBeNull();
  });
});

// @vitest-environment jsdom
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandMenuProvider } from '#web/shared/lib/command-menu';
import { CommandMenuButton } from './command-menu-button';

vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ user: { id: 'viewer' } }) }));

const { render, clearPressGuard } = createInputTestHost();

const menu = () => Promise.resolve(() => <div>the menu</div>);

function show(children: ReactNode) {
  render(
    <I18nProvider locale="en">
      <CommandMenuProvider load={menu}>{children}</CommandMenuProvider>
    </I18nProvider>,
  );
}

beforeEach(clearPressGuard);

afterEach(cleanup);

describe('CommandMenuButton', () => {
  it('opens the menu', async () => {
    show(<CommandMenuButton />);

    fireEvent.click(await screen.findByRole('button', { name: 'Quick access' }));

    expect(await screen.findByText('the menu')).toBeTruthy();
  });

  it('teaches the key to whoever hovers it', async () => {
    show(<CommandMenuButton />);
    const button = await screen.findByRole('button', { name: 'Quick access' });

    fireEvent.mouseEnter(button.parentElement as HTMLElement);

    expect((await screen.findByRole('tooltip')).textContent).toMatch(/Quick access .*K$/);
  });
});

// @vitest-environment jsdom
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandMenuProvider } from '#web/shared/lib/command-menu';
import { CommandMenuButton, CommandMenuField } from './command-menu-button';

const mocks = vi.hoisted(() => ({ step: 'sm' }));
vi.mock('@kromatv/ui/kit', async (original) => ({
  ...(await original<typeof import('@kromatv/ui/kit')>()),
  useBreakpoint: () => mocks.step,
}));
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

beforeEach(() => {
  clearPressGuard();
  mocks.step = 'sm';
});

afterEach(cleanup);

describe('CommandMenuButton', () => {
  it('opens the menu on a narrow window', async () => {
    show(<CommandMenuButton />);

    fireEvent.click(await screen.findByRole('button', { name: 'Quick access' }));

    expect(await screen.findByText('the menu')).toBeTruthy();
  });

  it('gives way to the field on a wide window', () => {
    mocks.step = 'lg';

    show(<CommandMenuButton />);

    expect(screen.queryByRole('button', { name: 'Quick access' })).toBeNull();
  });
});

describe('CommandMenuField', () => {
  it('opens the menu', async () => {
    show(<CommandMenuField />);

    fireEvent.click(await screen.findByRole('button', { name: 'Quick access' }));

    expect(await screen.findByText('the menu')).toBeTruthy();
  });

  it('teaches the key', async () => {
    show(<CommandMenuField />);

    expect(await screen.findByText('K')).toBeTruthy();
  });
});

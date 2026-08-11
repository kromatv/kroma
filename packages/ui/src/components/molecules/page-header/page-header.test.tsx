// @vitest-environment jsdom

import { cleanup, fireEvent, render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '#ui/components/atoms/button';
import { Text } from '#ui/components/atoms/text';
import { onScreen } from '#ui/testing';
import { PageHeader } from './page-header';

const render = (ui: ReactElement) => renderRaw(onScreen(ui));

const markup = (ui: ReactElement): string => {
  const { container } = render(ui);
  const html = container.innerHTML;
  cleanup();
  return html;
};

afterEach(cleanup);

describe('the one-line PageHeader', () => {
  it('draws the same tree as the parts it stands for', () => {
    const sugar = markup(
      <PageHeader.Root
        title="Utilisateurs"
        suffix="12"
        subtitle="Comptes et invitations"
        actions={<Text>Inviter</Text>}
      />,
    );
    const parts = markup(
      <PageHeader.Root>
        <PageHeader.Title suffix="12">Utilisateurs</PageHeader.Title>
        <PageHeader.Subtitle>Comptes et invitations</PageHeader.Subtitle>
        <PageHeader.Actions>
          <Text>Inviter</Text>
        </PageHeader.Actions>
      </PageHeader.Root>,
    );
    expect(parts).toBe(sugar);
  });

  it('leaves out the parts it was given nothing for', () => {
    const sugar = markup(<PageHeader.Root title="Utilisateurs" />);
    const parts = markup(
      <PageHeader.Root>
        <PageHeader.Title>Utilisateurs</PageHeader.Title>
      </PageHeader.Root>,
    );
    expect(parts).toBe(sugar);
  });
});

describe('PageHeader.Title', () => {
  it('is the page heading', () => {
    render(
      <PageHeader.Root>
        <PageHeader.Title>Utilisateurs</PageHeader.Title>
      </PageHeader.Root>,
    );
    expect(screen.getByRole('heading', { name: 'Utilisateurs' })).toBeTruthy();
  });

  it('keeps the suffix inside the heading, so it is read as part of it', () => {
    render(<PageHeader.Root title="Utilisateurs" suffix="12" />);
    expect(screen.getByRole('heading').textContent).toBe('Utilisateurs 12');
  });

  it('draws a glyph before the title without lending it the heading name', () => {
    const { container } = render(
      <PageHeader.Root>
        <PageHeader.Title icon="flame">Tendances</PageHeader.Title>
      </PageHeader.Root>,
    );
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.getByRole('heading').textContent).toBe('Tendances');
  });
});

describe('PageHeader.Actions', () => {
  it('sits outside the title column wherever it is written', () => {
    render(
      <PageHeader.Root>
        <PageHeader.Actions>
          <Text>Inviter</Text>
        </PageHeader.Actions>
        <PageHeader.Title>Utilisateurs</PageHeader.Title>
      </PageHeader.Root>,
    );
    const column = screen.getByRole('heading').parentElement as HTMLElement;
    expect(column.contains(screen.getByText('Inviter'))).toBe(false);
  });

  it('keeps its controls pressable', () => {
    const invite = vi.fn();
    render(
      <PageHeader.Root
        title="Utilisateurs"
        actions={<Button label="Inviter" onPress={invite} />}
      />,
    );
    fireEvent.click(screen.getByLabelText('Inviter'));
    expect(invite).toHaveBeenCalledTimes(1);
  });

  it('leaves its controls their own focus', () => {
    render(
      <PageHeader.Root title="Utilisateurs">
        <PageHeader.Actions>
          <Button label="Inviter" />
        </PageHeader.Actions>
      </PageHeader.Root>,
    );
    const invite = screen.getByLabelText('Inviter');
    fireEvent.focus(invite);
    invite.focus();
    expect(document.activeElement).toBe(invite);
  });
});

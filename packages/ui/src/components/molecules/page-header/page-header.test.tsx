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

describe('a header written with nothing but a title', () => {
  it('draws the title column and no other band', () => {
    const bare = markup(
      <PageHeader.Root>
        <PageHeader.Title>Utilisateurs</PageHeader.Title>
      </PageHeader.Root>,
    );
    expect(bare).not.toContain('Comptes');
    expect(bare).toContain('Utilisateurs');
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
    render(
      <PageHeader.Root>
        <PageHeader.Title suffix="12">Utilisateurs</PageHeader.Title>
      </PageHeader.Root>,
    );
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
      <PageHeader.Root>
        <PageHeader.Title>Utilisateurs</PageHeader.Title>
        <PageHeader.Actions>
          <Button label="Inviter" onPress={invite} />
        </PageHeader.Actions>
      </PageHeader.Root>,
    );
    fireEvent.click(screen.getByLabelText('Inviter'));
    expect(invite).toHaveBeenCalledTimes(1);
  });

  it('leaves its controls their own focus', () => {
    render(
      <PageHeader.Root>
        <PageHeader.Title>Utilisateurs</PageHeader.Title>
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

  it('puts the way back before the heading, not among the actions', () => {
    // Reading order is the point: a reader looks to the start of the page to
    // leave it, and the far end is where this page's own controls live.
    const back = vi.fn();
    render(
      <PageHeader.Root>
        <PageHeader.Back label="Modules" onPress={back} />
        <PageHeader.Title>Acquisition</PageHeader.Title>
        <PageHeader.Actions>
          <Button label="Desinstaller" />
        </PageHeader.Actions>
      </PageHeader.Root>,
    );
    const rendered = screen.getByLabelText('Modules');
    const heading = screen.getByRole('heading');
    expect(rendered.compareDocumentPosition(heading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    fireEvent.click(rendered);
    expect(back).toHaveBeenCalledTimes(1);
  });
});

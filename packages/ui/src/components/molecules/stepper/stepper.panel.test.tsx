// @vitest-environment jsdom

import { cleanup, fireEvent, render as renderRaw, screen } from '@testing-library/react';
import { type ReactElement, type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { onScreen } from '#ui/testing';
import { Stepper } from './stepper';

const render = (ui: ReactElement) => renderRaw(onScreen(ui));

afterEach(cleanup);

function Flow({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <Stepper.Root label="Configuration">
      <Stepper.List>
        <Stepper.Item value="account">
          <Stepper.Label>Compte</Stepper.Label>
        </Stepper.Item>
        <Stepper.Item value="library">
          <Stepper.Label>Bibliothèque</Stepper.Label>
        </Stepper.Item>
      </Stepper.List>
      {children}
      <Stepper.Previous />
      <Stepper.Next />
    </Stepper.Root>
  );
}

let built = 0;

function Counted() {
  const [seen] = useState(() => {
    built += 1;
    return built;
  });
  return <Text>{`built ${seen}`}</Text>;
}

describe('a panel that has to survive the trip', () => {
  afterEach(() => {
    built = 0;
  });

  it('builds its children again every time by default', () => {
    render(
      <Flow>
        <Stepper.Panel value="account">
          <Counted />
        </Stepper.Panel>
      </Flow>,
    );

    fireEvent.click(screen.getByLabelText('Suivant'));
    fireEvent.click(screen.getByLabelText('Précédent'));

    expect(screen.getByText('built 2')).toBeTruthy();
  });

  it('takes a kept panel off the page while another step is showing', () => {
    render(
      <Flow>
        <Stepper.Panel value="account" keepMounted>
          <Counted />
        </Stepper.Panel>
      </Flow>,
    );

    fireEvent.click(screen.getByLabelText('Suivant'));

    const kept = screen.getByText('built 1').closest('[role="tabpanel"]');
    expect(kept?.getAttribute('style')).toBe('display: none !important;');
  });

  it('keeps what was typed in it when it asks to stay mounted', () => {
    render(
      <Flow>
        <Stepper.Panel value="account" keepMounted>
          <Counted />
        </Stepper.Panel>
      </Flow>,
    );

    fireEvent.click(screen.getByLabelText('Suivant'));
    fireEvent.click(screen.getByLabelText('Précédent'));

    expect(screen.getByText('built 1')).toBeTruthy();
  });
});

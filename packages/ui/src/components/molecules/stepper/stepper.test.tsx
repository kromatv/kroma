// @vitest-environment jsdom

import { cleanup, fireEvent, render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import { onScreen } from '#ui/testing';
import { Stepper, type StepperRootProps } from './stepper';

const render = (ui: ReactElement) => renderRaw(onScreen(ui));

afterEach(cleanup);

function Flow({
  children,
  ...root
}: Readonly<Partial<StepperRootProps> & { children?: ReactNode }>) {
  return (
    <Stepper.Root label="Configuration" {...root}>
      <Stepper.List>
        <Stepper.Item value="account">
          <Stepper.Label>Compte</Stepper.Label>
        </Stepper.Item>
        <Stepper.Item value="library" disabled={root.value === 'skip'}>
          <Stepper.Label>Bibliothèque</Stepper.Label>
        </Stepper.Item>
        <Stepper.Item value="done">
          <Stepper.Label>Fin</Stepper.Label>
        </Stepper.Item>
      </Stepper.List>
      <Stepper.Panel value="account">
        <Text>Adresse</Text>
      </Stepper.Panel>
      <Stepper.Panel value="library">
        <Text>Dossiers</Text>
      </Stepper.Panel>
      <Stepper.Panel value="done">
        <Text>Prêt</Text>
      </Stepper.Panel>
      {children}
      <Stepper.Previous />
      <Stepper.Next />
    </Stepper.Root>
  );
}

function step(name: RegExp): HTMLElement {
  return screen.getByRole('tab', { name });
}

function disabled(node: HTMLElement): boolean {
  return node.getAttribute('aria-disabled') === 'true';
}

describe('Stepper', () => {
  it('is a named tablist whose current step says so', () => {
    render(<Flow />);

    expect(screen.getByRole('tablist', { name: 'Configuration' })).toBeTruthy();
    expect(step(/Compte/).getAttribute('aria-selected')).toBe('true');
    expect(step(/Compte/).getAttribute('aria-current')).toBe('step');
    expect(step(/Bibliothèque/).getAttribute('aria-current')).toBeNull();
  });

  it('names each step by its position, and says so once it is done', () => {
    render(<Flow />);

    fireEvent.click(screen.getByLabelText('Suivant'));

    expect(screen.getByRole('tab', { name: 'Étape 1 sur 3 : Compte, terminée' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Étape 2 sur 3 : Bibliothèque' })).toBeTruthy();
  });

  it('opens at the first step and draws only its panel', () => {
    render(<Flow />);

    expect(screen.getByText('Adresse')).toBeTruthy();
    expect(screen.queryByText('Dossiers')).toBeNull();
    expect(screen.queryByText('Prêt')).toBeNull();
  });

  it('runs itself from a default step and reports why it moved', () => {
    const onValueChange = vi.fn();
    render(<Flow defaultValue="library" onValueChange={onValueChange} />);

    fireEvent.click(screen.getByLabelText('Suivant'));

    expect(onValueChange).toHaveBeenCalledWith('done', { reason: 'next' });
    expect(screen.getByText('Prêt')).toBeTruthy();
  });

  it('leaves the step where it is when the caller owns the value', () => {
    const onValueChange = vi.fn();
    render(<Flow value="account" onValueChange={onValueChange} />);

    fireEvent.click(screen.getByLabelText('Suivant'));

    expect(onValueChange).toHaveBeenCalledWith('library', { reason: 'next' });
    expect(screen.getByText('Adresse')).toBeTruthy();
  });

  it('dims the step back on the first step and the step forward on the last', () => {
    render(<Flow />);

    expect(disabled(screen.getByLabelText('Précédent'))).toBe(true);
    expect(disabled(screen.getByLabelText('Suivant'))).toBe(false);

    fireEvent.click(screen.getByLabelText('Suivant'));
    fireEvent.click(screen.getByLabelText('Suivant'));

    expect(disabled(screen.getByLabelText('Suivant'))).toBe(true);
    expect(disabled(screen.getByLabelText('Précédent'))).toBe(false);
  });

  it('goes back to a step the flow has already been past', () => {
    render(<Flow />);

    fireEvent.click(screen.getByLabelText('Suivant'));
    fireEvent.click(step(/Compte/));

    expect(screen.getByText('Adresse')).toBeTruthy();
    expect(disabled(step(/Bibliothèque/))).toBe(false);
  });

  it('refuses a step the flow has not reached yet', () => {
    render(<Flow />);

    fireEvent.click(step(/Fin/));

    expect(disabled(step(/Fin/))).toBe(true);
    expect(screen.getByText('Adresse')).toBeTruthy();
  });

  it('takes the caller word for which steps are done', () => {
    render(<Flow complete={['done']} />);

    expect(disabled(step(/Fin/))).toBe(false);
    expect(disabled(step(/Bibliothèque/))).toBe(true);
  });

  it('steps over a step nothing may enter', () => {
    const onValueChange = vi.fn();
    render(<Flow value="skip" onValueChange={onValueChange} />);

    fireEvent.click(screen.getByLabelText('Suivant'));

    expect(onValueChange).toHaveBeenCalledWith('done', { reason: 'next' });
  });

  it('walks the reachable steps with the arrow keys, and stops at the end', () => {
    render(<Flow defaultValue="library" />);

    fireEvent.keyDown(screen.getByRole('tablist', { name: 'Configuration' }), {
      key: 'ArrowRight',
    });

    expect(screen.getByText('Dossiers')).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('tablist', { name: 'Configuration' }), { key: 'ArrowLeft' });

    expect(screen.getByText('Adresse')).toBeTruthy();
  });

  it('refuses to render a part outside its Root', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Stepper.Item value="account" />)).toThrow(
      '<Stepper.Item> must be used inside <Stepper.Root>',
    );

    vi.restoreAllMocks();
  });
});

function OwnSteps() {
  return (
    <Stepper.List>
      <Stepper.Item value="account">
        <Stepper.Label>Compte</Stepper.Label>
      </Stepper.Item>
      <Stepper.Item value="library">
        <Stepper.Label>Bibliothèque</Stepper.Label>
      </Stepper.Item>
    </Stepper.List>
  );
}

function OwnPanels() {
  return (
    <>
      <Stepper.Panel value="account">
        <Text>Adresse</Text>
      </Stepper.Panel>
      <Stepper.Panel value="library">
        <Text>Dossiers</Text>
      </Stepper.Panel>
    </>
  );
}

function MappedSteps({ steps }: Readonly<{ steps: readonly string[] }>) {
  return (
    <Stepper.List>
      {steps.map((step) => (
        <Stepper.Item key={step} value={step}>
          <Stepper.Label>{step}</Stepper.Label>
        </Stepper.Item>
      ))}
    </Stepper.List>
  );
}

describe('where a step comes from', () => {
  it('runs a flow whose steps sit inside a component the caller wrote', () => {
    render(
      <Stepper.Root label="Configuration">
        <OwnSteps />
        <OwnPanels />
        <Stepper.Next />
      </Stepper.Root>,
    );

    expect(step(/Compte/).getAttribute('aria-current')).toBe('step');
    expect(screen.getByText('Adresse')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Suivant'));

    expect(screen.getByText('Dossiers')).toBeTruthy();
    expect(disabled(screen.getByLabelText('Suivant'))).toBe(true);
  });

  it('counts the steps a map rendered, in the order they were rendered', () => {
    render(
      <Stepper.Root label="Configuration">
        <MappedSteps steps={['un', 'deux', 'trois']} />
      </Stepper.Root>,
    );

    expect(screen.getByRole('tab', { name: 'Étape 3 sur 3 : trois' })).toBeTruthy();
  });

  it('says so rather than drawing a dead control when no step joined the flow', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      render(
        <Stepper.Root label="Configuration">
          <Stepper.List />
        </Stepper.Root>,
      ),
    ).toThrow('<Stepper.Root> has no steps');

    vi.restoreAllMocks();
  });
});

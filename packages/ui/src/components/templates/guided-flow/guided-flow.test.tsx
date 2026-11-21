// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '#ui/components/atoms/button';
import { Text } from '#ui/components/atoms/text';
import { ChoiceList } from '#ui/components/molecules/choice-list';
import { KitProvider } from '#ui/configure';
import { BreakpointIndexContext } from '#ui/core/style-context';
import { I18nProvider } from '#ui/services/i18n';
import { declared, layout, measuring, onScreen, wearsRing } from '#ui/testing';
import { GuidedFlow } from './guided-flow.component';

const PHONE = 0;
const WIDE = 1;

afterEach(cleanup);

interface ScreenProps {
  width?: number;
  onBack?: () => void;
  onNext?: () => void;
  onSkip?: () => void;
  children?: ReactNode;
}

function Question({ width = WIDE, onBack, onNext, onSkip, children }: Readonly<ScreenProps>) {
  return (
    <BreakpointIndexContext.Provider value={width}>
      <GuidedFlow.Root label="Configuration">
        <GuidedFlow.Aside>
          <Text>Toutes les étapes</Text>
        </GuidedFlow.Aside>
        <GuidedFlow.Status position={2} count={5}>
          Point de départ
        </GuidedFlow.Status>
        <GuidedFlow.Header>
          <GuidedFlow.Title>Par où commencer ?</GuidedFlow.Title>
          <GuidedFlow.Subtitle>Un seul choix.</GuidedFlow.Subtitle>
        </GuidedFlow.Header>
        <GuidedFlow.Panel>
          <ChoiceList.Root label="Départ" value="fresh" onValueChange={() => {}}>
            <ChoiceList.Item value="fresh">
              <ChoiceList.Label>Partir de zéro</ChoiceList.Label>
            </ChoiceList.Item>
            <ChoiceList.Item value="bring">
              <ChoiceList.Label>Migrer</ChoiceList.Label>
            </ChoiceList.Item>
          </ChoiceList.Root>
        </GuidedFlow.Panel>
        <GuidedFlow.Footer>
          {children}
          {onBack ? <GuidedFlow.Previous onPress={onBack} /> : null}
          <GuidedFlow.Actions>
            {onSkip ? <Button variant="ghost" label="Passer" onPress={onSkip} /> : null}
            <GuidedFlow.Next onPress={onNext ?? (() => {})} />
          </GuidedFlow.Actions>
        </GuidedFlow.Footer>
      </GuidedFlow.Root>
    </BreakpointIndexContext.Provider>
  );
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

describe('GuidedFlow', () => {
  it('is a named region that asks its question under a heading', () => {
    render(onScreen(<Question />));

    expect(screen.getByRole('region', { name: 'Configuration' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Par où commencer ?' })).toBeTruthy();
    expect(screen.getByText('Un seul choix.')).toBeTruthy();
  });

  it('shows the steps beside the question where there is room for them', () => {
    render(onScreen(<Question width={WIDE} />));

    expect(screen.getByText('Toutes les étapes')).toBeTruthy();
    expect(screen.queryByText('Step 2 of 5: Point de départ')).toBeNull();
  });

  it('keeps the steps beside the question in an app that has no remote', () => {
    render(
      <KitProvider config={{ remote: false }}>
        <I18nProvider locale="en">
          <Question width={WIDE} />
        </I18nProvider>
      </KitProvider>,
    );

    const frame = screen.getByRole('region', { name: 'Configuration' }).firstElementChild;

    expect(frame ? declared(frame, 'flexDirection') : null).toBe('row');
  });

  it('shows the position over the question on a phone, in place of the steps', () => {
    render(onScreen(<Question width={PHONE} />));

    expect(screen.queryByText('Toutes les étapes')).toBeNull();
    expect(screen.getByText('Step 2 of 5: Point de départ')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Step 2 of 5: Point de départ' })).toBeTruthy();
  });

  it('lays out for the room it is given rather than for the window', () => {
    const { container } = render(onScreen(<Question width={WIDE} />));

    layout(measuring(container), { width: 390 });

    expect(screen.queryByText('Toutes les étapes')).toBeNull();
    expect(screen.getByText('Step 2 of 5: Point de départ')).toBeTruthy();
  });

  it('shows the steps once the room it is given has space for them', () => {
    const { container } = render(onScreen(<Question width={PHONE} />));

    layout(measuring(container), { width: 900 });

    expect(screen.getByText('Toutes les étapes')).toBeTruthy();
  });

  it('shows the position wherever nothing was written beside the question', () => {
    render(
      onScreen(
        <GuidedFlow.Root label="Configuration">
          <GuidedFlow.Status position={1} count={3} />
        </GuidedFlow.Root>,
      ),
    );

    expect(screen.getByText('Step 1 of 3')).toBeTruthy();
  });

  it('goes back, forward and aside in the words of the catalogue', () => {
    const onBack = vi.fn();
    const onNext = vi.fn();
    const onSkip = vi.fn();
    render(onScreen(<Question onBack={onBack} onNext={onNext} onSkip={onSkip} />));

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Passer' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('speaks the language of the screen it is on', () => {
    render(
      onScreen(
        <I18nProvider locale="fr">
          <Question width={PHONE} onBack={() => {}} />
        </I18nProvider>,
      ),
    );

    expect(screen.getByRole('button', { name: 'Retour' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeTruthy();
    expect(
      screen.getByText('Étape 2 sur 5\u00a0: Point de départ', { normalizer: (text) => text }),
    ).toBeTruthy();
  });

  it('says what going forward will do over the actions', () => {
    render(
      onScreen(
        <Question>
          <GuidedFlow.Hint>Rien ne change sur votre autre serveur.</GuidedFlow.Hint>
        </Question>,
      ),
    );

    expect(screen.getByText('Rien ne change sur votre autre serveur.')).toBeTruthy();
  });

  it('holds the way forward back while the screen is not answered', () => {
    const onNext = vi.fn();
    render(
      onScreen(
        <BreakpointIndexContext.Provider value={WIDE}>
          <GuidedFlow.Root label="Configuration">
            <GuidedFlow.Footer>
              <GuidedFlow.Actions>
                <GuidedFlow.Next label="Créer mon compte" disabled onPress={onNext} />
              </GuidedFlow.Actions>
            </GuidedFlow.Footer>
          </GuidedFlow.Root>
        </BreakpointIndexContext.Provider>,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    expect(onNext).not.toHaveBeenCalled();
  });

  it('refuses to render a part outside its Root', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(onScreen(<GuidedFlow.Panel>{null}</GuidedFlow.Panel>))).toThrow(
      '<GuidedFlow.Panel> must be used inside <GuidedFlow.Root>',
    );

    vi.restoreAllMocks();
  });
});

describe('GuidedFlow under a remote', () => {
  it('walks down the choices to the actions, then along them', () => {
    render(onScreen(<Question onBack={() => {}} />, { remote: true }));

    press('ArrowDown');
    press('ArrowDown');

    expect(wearsRing(screen.getByRole('radio', { name: 'Migrer' }))).toBe(true);

    press('ArrowDown');

    expect(wearsRing(screen.getByRole('button', { name: 'Back' }))).toBe(true);

    press('ArrowRight');

    expect(wearsRing(screen.getByRole('button', { name: 'Continue' }))).toBe(true);
  });

  it('comes back up from the actions to the choice it left', () => {
    render(onScreen(<Question onBack={() => {}} />, { remote: true }));
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');

    press('ArrowUp');

    expect(wearsRing(screen.getByRole('radio', { name: 'Migrer' }))).toBe(true);
  });
});

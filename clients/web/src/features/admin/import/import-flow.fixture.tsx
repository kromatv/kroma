import { I18nProvider } from '@kromatv/ui';
import { GuidedFlow, KitProvider } from '@kromatv/ui/kit';
import { createInputTestHost } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react';
import { type ReactNode, useLayoutEffect } from 'react';
import { type ImportChoices, ImportSession, useImportSession } from './import-session.component';

const inputHost = createInputTestHost();
const SETTLE_MS = 30;
const NOTHING: Partial<ImportChoices> = {};
const TYPED = { entry: { physicalKeyboard: true } };

function Seeded({
  seed,
  children,
}: Readonly<{ seed: Partial<ImportChoices>; children: ReactNode }>) {
  const { update } = useImportSession();
  useLayoutEffect(() => update(seed), [seed, update]);
  return children;
}

function SessionProbe() {
  const { session } = useImportSession();
  return <span data-testid="session">{JSON.stringify(session)}</span>;
}

/** Draws an import screen the way the setup and the console do: inside a
 * session seeded with `seed`, a guided frame, a query cache and English. */
export function showImport(ui: ReactNode, seed: Partial<ImportChoices> = NOTHING) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  inputHost.render(
    <QueryClientProvider client={client}>
      <KitProvider config={TYPED}>
        <I18nProvider locale="en">
          <ImportSession>
            <Seeded seed={seed}>
              <GuidedFlow.Root label="Import">{ui}</GuidedFlow.Root>
              <SessionProbe />
            </Seeded>
          </ImportSession>
        </I18nProvider>
      </KitProvider>
    </QueryClientProvider>,
  );
}

/** The session as the screen left it. */
export function sessionNow(): ImportChoices {
  return JSON.parse(screen.getByTestId('session').textContent ?? '{}');
}

/** Lets the queries answer and the screen draw what they said. */
export async function settle() {
  await act(async () => {
    await new Promise((done) => setTimeout(done, SETTLE_MS));
  });
}

/** Presses the control a screen reader names `name`. */
export async function press(name: string) {
  await act(async () => {
    screen.getByLabelText(name).click();
  });
  await settle();
}

import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { KitProvider } from '#ui/configure';
import { nameComponent } from '../component-names';
import {
  type ChangeDetails,
  type Control,
  createControlEngine,
  defineControl,
  useControl,
} from '../control';
import { createControl } from '../control/control';

export const counter = defineControl('counter', {
  state: { value: 0 },
  options: { step: 1 },
  actions: {
    increment: ({ value, step }) => ({ value: value + step }),
    reset: () => ({ value: 0 }),
    jump: (_now, to: number) => ({ value: to }),
    halve: ({ value }) => {
      if (value % 2 === 1) {
        throw new Error('odd');
      }
      return { value: value / 2 };
    },
  },
});

const NO_LANGUAGES: readonly string[] = [];

export const languages = defineControl('languages', { state: { value: NO_LANGUAGES } });

export type CounterProps = {
  value?: number;
  defaultValue?: number;
  onValueChange?: (next: number, details: ChangeDetails) => void;
  step?: number;
  disabled?: boolean;
};

/** A counter as an engine holds it, on an engine of its own. */
export function counterOf(props: Readonly<CounterProps>): Control {
  const engine = createControlEngine();
  createControl(counter, props, engine).attach();
  const [control] = engine.controls();
  if (!control) {
    throw new Error('The counter did not join its engine');
  }
  return control;
}

/** A component the kit named, on the counter control. */
export function Counter(props: Readonly<CounterProps>) {
  const [{ value }] = useControl(counter, props);
  return <output>{value}</output>;
}

nameComponent(Counter, 'Counter');

/** The same control on a component the kit did not name. */
export function Tally(props: Readonly<CounterProps>) {
  const [{ value }] = useControl(counter, props);
  return <output>{value}</output>;
}

/** A component the kit named, on a control that holds a list. */
export function Languages(props: Readonly<{ defaultValue?: readonly string[] }>) {
  const [{ value }] = useControl(languages, props);
  return <output>{value.join(',')}</output>;
}

nameComponent(Languages, 'Languages');

function Kit({ children }: Readonly<{ children: ReactNode }>) {
  return <KitProvider>{children}</KitProvider>;
}

/** Mounts `ui` under a `KitProvider` of its own. */
export const mount = (ui: ReactNode) => render(ui, { wrapper: Kit });

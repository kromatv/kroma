// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { memo, type ReactNode, Suspense, use } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { nameComponent } from '../component-names';
import { createControlEngine } from '../control';
import { createFocusHolder } from '../focus-holder';
import { describeScreen } from './describe-screen';
import { find, focusedPaths, paths } from './inspect.fixtures';
import { InspectAnchor } from './inspect-anchor';

afterEach(cleanup);

function e({ children }: { children?: ReactNode }) {
  return <div>{children}</div>;
}
const Card = e;
const Part = memo(() => <span>part</span>);
const App = ({ children }: { children?: ReactNode }) => <section>{children}</section>;

nameComponent(e, 'Card');
nameComponent(Part, 'Menu.Part');

const Field = memo(() => <input aria-label="field" />);

nameComponent(Field, 'Field');

function Line({ children }: Readonly<{ children: string }>) {
  return <div style={{ overflowX: 'hidden', overflowY: 'hidden' }}>{children}</div>;
}
const Panel = memo(Line);

nameComponent(Line, 'Text');
nameComponent(Panel, 'Panel');

type Size = { width: number; height: number };

function measured(element: HTMLElement, scroll: Size, client: Size): void {
  Object.defineProperties(element, {
    scrollWidth: { value: scroll.width },
    scrollHeight: { value: scroll.height },
    clientWidth: { value: client.width },
    clientHeight: { value: client.height },
  });
}

const focusedForm = (
  <Card>
    <Part />
    <Field />
  </Card>
);

function mount(ui: ReactNode) {
  const focus = createFocusHolder();
  render(
    <>
      <InspectAnchor focus={focus} controls={createControlEngine()} />
      {ui}
    </>,
  );
  return focus;
}

function read(ui: ReactNode) {
  mount(ui);
  return describeScreen();
}

function readMeasured(ui: ReactNode, scroll: Size) {
  mount(ui);
  measured(screen.getByText('Einstellungen'), scroll, { width: 120, height: 20 });
  return describeScreen().nodes;
}

const never = new Promise<never>(() => {});

function Pending() {
  use(never);
  return null;
}

describe('the tree walk', () => {
  it('keeps the components the kit named and nothing else', () => {
    expect(Card.name).toBe('e');

    const { nodes } = read(
      <App>
        <Card>
          <>
            <App>
              <Part />
            </App>
            <Part />
          </>
        </Card>
      </App>,
    );

    expect(paths(nodes)).toEqual(['Card', 'Card/Menu.Part', 'Card/Menu.Part']);
  });

  it('leaves out what a suspended boundary keeps mounted but hidden', () => {
    const { nodes } = read(
      <Suspense fallback={<Part />}>
        <Card />
        <Pending />
      </Suspense>,
    );

    expect(paths(nodes)).toEqual(['Menu.Part']);
  });

  it('counts every fiber it visits', () => {
    const { fibers } = read(<Card />);

    expect(fibers).toBe(4);
  });

  it('marks the nearest named component around the element that holds the focus', () => {
    const focus = mount(focusedForm);

    focus.hold(screen.getByLabelText('field'));

    expect(focusedPaths(describeScreen().nodes)).toEqual(['Card/Field']);
  });

  it('marks nothing when nothing holds the focus', () => {
    expect(focusedPaths(read(focusedForm).nodes)).toEqual([]);
  });

  it('marks nothing when the element that holds the focus is not on screen', () => {
    const focus = mount(focusedForm);

    focus.hold(document.createElement('input'));

    expect(focusedPaths(describeScreen().nodes)).toEqual([]);
  });

  it('marks a text its box cuts with how far the text reaches past it', () => {
    const nodes = readMeasured(<Line>Einstellungen</Line>, { width: 188, height: 20 });

    expect(find(nodes, 'Text')?.clipped).toEqual({ width: 68, height: 0 });
  });

  it('leaves a text that fits its box unmarked', () => {
    const nodes = readMeasured(<Line>Einstellungen</Line>, { width: 120, height: 20 });

    expect(find(nodes, 'Text')).not.toHaveProperty('clipped');
  });

  it('measures a text and no other component', () => {
    const nodes = readMeasured(<Panel>Einstellungen</Panel>, { width: 188, height: 20 });

    expect(find(nodes, 'Panel')).not.toHaveProperty('clipped');
  });
});

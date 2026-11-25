// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { createRef, memo, type ReactNode, Suspense, use } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { nameComponent } from '../component-names';
import { TreeProbe, paths } from './inspect.fixtures';
import { readScreen } from './screen-tree';

afterEach(cleanup);

function e({ children }: { children?: ReactNode }) {
  return <div>{children}</div>;
}
const Card = e;
const Part = memo(() => <span>part</span>);
const App = ({ children }: { children?: ReactNode }) => <section>{children}</section>;

nameComponent(e, 'Card');
nameComponent(Part, 'Menu.Part');

function read(ui: ReactNode) {
  const probe = createRef<TreeProbe>();
  render(<TreeProbe ref={probe}>{ui}</TreeProbe>);
  const tree = probe.current?.tree();
  return readScreen(tree ? [tree] : []);
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
});

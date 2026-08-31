import { record } from '@kroma/react-audit';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';
import { Box } from '#ui/components/atoms/box';
import { Focusable } from '#ui/components/atoms/focusable';
import { Text } from '#ui/components/atoms/text';
import { I18nProvider } from '#ui/services/i18n';

afterEach(cleanup);

const ROWS = Array.from({ length: 40 }, (_, at) => ({ id: `t${at}`, label: `Title ${at}` }));

function Anchor({
  to,
  children,
  ...rest
}: Readonly<Record<string, unknown>> & { children?: ReactNode }) {
  return (
    <View {...(rest as object)} {...({ href: to } as object)}>
      {children}
    </View>
  );
}

function Grid() {
  return (
    <Box>
      {ROWS.map((row) => (
        <Focusable key={row.id} label={row.label} asChild>
          <Anchor to={`/movies/${row.id}`}>
            <Text variant="meta">{row.label}</Text>
          </Anchor>
        </Focusable>
      ))}
    </Box>
  );
}

function focusOneRow() {
  const run = record();
  const { container } = render(
    <I18nProvider locale="en">
      <Grid />
    </I18nProvider>,
  );
  const first = container.querySelector('a');
  if (!first) throw new Error('the grid rendered no anchor to focus');
  fireEvent.focus(first);
  return run.stop();
}

function workAfterMount(result: ReturnType<typeof focusOneRow>, component: string): number {
  return result.commits
    .slice(1)
    .reduce((sum, commit) => sum + (commit.work[component]?.updated ?? 0), 0);
}

describe('a grid of delegated rows', () => {
  it('re-renders only the row that took the focus', () => {
    const result = focusOneRow();

    expect(workAfterMount(result, 'Focusable')).toBe(1);
    expect(workAfterMount(result, 'LinkForm')).toBe(1);
  });

  it('rebuilds no row it already had on screen', () => {
    const result = focusOneRow();

    expect(result.churn).toEqual([]);
  });

  it('renders the delegated element instead of a pressable of its own', () => {
    const result = focusOneRow();

    expect(result.commits[0]?.census.TouchPressable).toBeUndefined();
    expect(result.commits[0]?.census.Anchor).toBe(ROWS.length);
  });
});

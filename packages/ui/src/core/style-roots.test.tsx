// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { Box } from '../components/atoms/box';
import { Text } from '../components/atoms/text';
import { KitProvider } from '../configure';
import { styles, useStyles } from './styles';
import { createTheme, type ThemeRuntime } from './theme';
import { useThemeControls } from './use-theme';

const PAINT = styles({ panel: { bg: 'accent', px: { base: 8, lg: 32 } } });
function Probe({ capture }: Readonly<{ capture: (controls: ThemeRuntime) => void }>) {
  const s = useStyles(PAINT);
  capture(useThemeControls());
  return (
    <Box testID="panel" style={s.panel}>
      <Text variant="body">Root</Text>
    </Box>
  );
}

describe('owned styling roots', () => {
  it('isolates palettes, responsive declarations and subsequent theme swaps', () => {
    const a = { controls: undefined as ThemeRuntime | undefined };
    const b = { controls: undefined as ThemeRuntime | undefined };
    const first = createTheme({ colors: { accent: '#FF0000' } });
    const second = createTheme({ colors: { accent: '#0000FF' } });
    const left = render(
      <KitProvider config={{ theme: first, designWidth: 320 }}>
        <Probe
          capture={(v) => {
            a.controls = v;
          }}
        />
      </KitProvider>,
    );
    const right = render(
      <KitProvider config={{ theme: second, designWidth: 1920 }}>
        <Probe
          capture={(v) => {
            b.controls = v;
          }}
        />
      </KitProvider>,
    );
    // Both roots are mounted simultaneously; bind queries to their own containers.
    const leftNode = left.container.querySelector('[data-testid="panel"]') as HTMLElement;
    const rightNode = right.container.querySelector('[data-testid="panel"]') as HTMLElement;
    expect(getComputedStyle(leftNode).paddingLeft).toBe('8px');
    expect(getComputedStyle(rightNode).paddingLeft).toBe('32px');
    expect(getComputedStyle(leftNode).backgroundColor).toBe('rgb(255, 0, 0)');
    expect(getComputedStyle(rightNode).backgroundColor).toBe('rgb(0, 0, 255)');
    act(() => a.controls?.setTheme(createTheme({ colors: { accent: '#00FF00' } })));
    expect(getComputedStyle(leftNode).backgroundColor).toBe('rgb(0, 255, 0)');
    expect(getComputedStyle(rightNode).backgroundColor).toBe('rgb(0, 0, 255)');
    expect(b.controls?.activeTheme()).toBe(second);
    left.unmount();
    expect(right.container.querySelector('[data-kroma-theme]')).not.toBeNull();
    right.unmount();
    expect(document.querySelectorAll('style[id^="kroma-theme-"]')).toHaveLength(0);
  });

  it('publishes and removes scoped sheets through StrictMode and nested widths', () => {
    const theme = createTheme({ colors: { accent: '#F01020' } });
    const view = render(
      <StrictMode>
        <KitProvider config={{ theme, ground: 'dark', designWidth: 1920 }}>
          <KitProvider config={{ designWidth: 320 }}>
            <Probe capture={() => {}} />
          </KitProvider>
        </KitProvider>
      </StrictMode>,
    );
    const hosts = view.container.querySelectorAll('[data-kroma-bp]');
    expect(hosts).toHaveLength(2);
    expect(hosts[0]?.getAttribute('data-kroma-bp')).toBe('base md lg tv');
    expect(hosts[1]?.getAttribute('data-kroma-bp')).toBe('base');
    expect(view.container.querySelectorAll('[data-kroma-theme]')).toHaveLength(1);
    expect(document.querySelectorAll('style[id^="kroma-theme-"]')).toHaveLength(1);
    expect(getComputedStyle(view.getByTestId('panel')).paddingLeft).toBe('8px');
    view.unmount();
    expect(document.querySelectorAll('style[id^="kroma-theme-"]')).toHaveLength(0);
  });
});

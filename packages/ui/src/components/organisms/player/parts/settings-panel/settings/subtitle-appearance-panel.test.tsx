// @vitest-environment jsdom
//
// The caption panel is what a certification lab actually opens: Samsung grades an
// "App UI" caption declaration on whether the viewer can reach CEA-708's
// attributes, not on whether the renderer could draw them. So these assertions
// are about REACHABILITY - every edge treatment, every font style, and a colour
// row for each of the three layers.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SUB_APPEARANCE,
  SUB_COLORS,
  type SubtitleAppearance,
} from '#ui/components/organisms/player/lib/subtitle-appearance';
import { I18nProvider } from '#ui/services/i18n';
import { SubtitleAppearancePanel } from './subtitle-appearance-panel';

afterEach(cleanup);

function panel(over: Partial<SubtitleAppearance> = {}) {
  const onAppearanceChange = vi.fn();
  render(
    <I18nProvider locale="en">
      <SubtitleAppearancePanel
        appearance={{ ...DEFAULT_SUB_APPEARANCE, ...over }}
        onAppearanceChange={onAppearanceChange}
        onBack={vi.fn()}
      />
    </I18nProvider>,
  );
  return { onAppearanceChange };
}

describe('SubtitleAppearancePanel', () => {
  it('always offers text, background and window opacity', () => {
    panel();
    expect(screen.getByText('Opacity')).toBeTruthy();
    expect(screen.getByText('Background opacity')).toBeTruthy();
    expect(screen.getByText('Window opacity')).toBeTruthy();
  });

  // A swatch row for a layer nobody can see is noise on a ten-foot panel; a
  // swatch row that never appears is a missing CEA-708 attribute.
  it('reveals each layer’s colour row once that layer is visible', () => {
    panel();
    expect(screen.queryByText('Background color')).toBeNull();
    expect(screen.queryByText('Window color')).toBeNull();
    cleanup();

    panel({ bgOpacity: 50 });
    expect(screen.getByText('Background color')).toBeTruthy();
    expect(screen.queryByText('Window color')).toBeNull();
    cleanup();

    panel({ windowOpacity: 40 });
    expect(screen.getByText('Window color')).toBeTruthy();
  });

  it('names the current edge treatment, for all five', () => {
    for (const [edge, label] of [
      ['none', 'None'],
      ['raised', 'Raised'],
      ['depressed', 'Depressed'],
      ['uniform', 'Uniform'],
      ['shadow', 'Shadow'],
    ] as const) {
      panel({ edge });
      expect(screen.getByText(label)).toBeTruthy();
      cleanup();
    }
  });

  it('names the current font style, for all eight', () => {
    for (const [font, label] of [
      ['default', 'Default'],
      ['monoSerif', 'Monospace serif'],
      ['propSerif', 'Serif'],
      ['monoSans', 'Monospace sans'],
      ['propSans', 'Sans-serif'],
      ['casual', 'Casual'],
      ['cursive', 'Cursive'],
      ['smallCaps', 'Small capitals'],
    ] as const) {
      panel({ font });
      expect(screen.getByText(label)).toBeTruthy();
      cleanup();
    }
  });

  it('offers all eight CEA-708 colours on a visible layer', () => {
    panel({ bgOpacity: 50 });
    // Driven from SUB_COLORS itself rather than a copied list, so dropping a
    // colour from the model fails HERE too - a hand-typed subset of the eight is
    // exactly the regression this is supposed to catch.
    expect(SUB_COLORS).toHaveLength(8);
    for (const hex of SUB_COLORS) {
      // Two rows are visible (text + background), so each swatch appears twice;
      // asserting the count is what makes this fail if a row stops rendering,
      // where `getAllByLabelText(...).length > 0` never could.
      expect(screen.getAllByLabelText(hex)).toHaveLength(2);
    }
  });

  it('says which size and which colour are the current ones', () => {
    panel({ size: 'lg' });
    expect(screen.getByLabelText('L').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByLabelText('M').getAttribute('aria-selected')).toBe('false');
    const [chosen] = screen.getAllByLabelText(DEFAULT_SUB_APPEARANCE.color);
    expect((chosen as HTMLElement).getAttribute('aria-selected')).toBe('true');
  });

  it('names each stepper for the row it steps', () => {
    panel();
    expect(screen.getByLabelText('Increase Opacity')).toBeTruthy();
    expect(screen.getByLabelText('Decrease Size')).toBeTruthy();
  });
});

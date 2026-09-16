// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '#ui/services/i18n';
import { DEFAULT_SUB_APPEARANCE } from './lib/subtitle-appearance';
import { Player } from './player';
import { fakeController } from './player.fixture';
import { NO_GEN } from './player.fixtures';
import { type PlayerController, WEB_FLAGS } from './types';

afterEach(cleanup);

function mount(controller: PlayerController = fakeController()) {
  return render(
    <I18nProvider locale="en">
      <Player.Root controller={controller} flags={WEB_FLAGS} title="Film" onClose={() => {}}>
        <Player.Transport tileAt={() => null} />
        <Player.Subtitles
          appearance={DEFAULT_SUB_APPEARANCE}
          onAppearanceChange={() => {}}
          gen={NO_GEN}
        />
        <Player.Media>
          <video>
            <track kind="captions" />
          </video>
        </Player.Media>
      </Player.Root>
    </I18nProvider>,
  );
}

function press(key: string) {
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  });
}

const labelOf = () => document.activeElement?.getAttribute('aria-label') ?? '';

function walkTo(name: RegExp) {
  for (let step = 0; step < 12 && !name.test(labelOf()); step++) press('Tab');
}

describe('the player chrome and the document focus', () => {
  it('hands the document focus to the control the chrome opens on', () => {
    mount();

    expect(document.activeElement?.getAttribute('role')).toBe('button');
    expect(labelOf()).not.toBe('');
  });

  it('moves the document focus along the controls with Tab, the arrows being a seek', () => {
    const scrubPreview = vi.fn();
    mount(fakeController({ scrubPreview }));
    const start = document.activeElement;

    press('ArrowRight');
    expect(document.activeElement).toBe(start);
    expect(scrubPreview).toHaveBeenCalledWith(174);

    press('Tab');

    expect(document.activeElement).not.toBe(start);
    expect(labelOf()).not.toBe('');
  });

  it('presses the focused control once when OK lands on it', () => {
    const togglePlay = vi.fn();
    mount(fakeController({ togglePlay }));

    press('Enter');

    expect(togglePlay).toHaveBeenCalledTimes(1);
  });

  it('follows the rows of the subtitles menu', () => {
    mount();
    walkTo(/subtitle/i);
    press('Enter');
    const first = document.activeElement;

    press('ArrowDown');

    expect(document.activeElement).not.toBe(first);
    expect(document.activeElement?.getAttribute('role')).toBe('button');
  });
});

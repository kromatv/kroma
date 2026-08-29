import { IconButton } from '@kroma/ui/kit';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { engine } from '../engine/engine';
import { liveState, type Outline, onLiveChange, setLive } from '../live';
import { installHighlight } from '../overlay/highlight';
import { installProbe } from '../overlay/probe';
import { ProbeCard } from '../overlay/probe-card';
import { type DevtoolsSession, readSession, writeSession } from '../session';
import { anchor, place } from './drag';
import { Panel } from './panel';
import { letterOf } from './shortcut';
import { useShortcut } from './use-shortcut';

const KEYS_CODE = 'KeyK';
const OUTLINE_CODE = 'KeyO';
const PANEL_CODE = 'KeyI';

const NEXT_OUTLINE: Record<Outline, Outline> = { off: 'problems', problems: 'all', all: 'off' };

export function Devtools({ host }: Readonly<{ host: HTMLElement }>) {
  const [{ open, editor }, setSession] = useState<DevtoolsSession>(readSession);
  const { keys, outline, locale } = useSyncExternalStore(onLiveChange, liveState, liveState);

  const patch = (fields: Partial<DevtoolsSession>) => {
    setSession((current) => ({ ...current, ...fields }));
    writeSession(fields);
  };

  useEffect(() => {
    const { x, y } = readSession();
    if (open && x !== null && y !== null) place(host, x, y);
    if (!open) anchor(host);
  }, [open, host]);

  useEffect(() => {
    if (outline === 'off') return;
    const stopHighlight = installHighlight(outline);
    const stopProbe = installProbe(outline, editor);
    return () => {
      stopProbe();
      stopHighlight();
    };
  }, [outline, editor]);

  useShortcut(
    [
      { code: KEYS_CODE, run: () => setLive({ keys: !keys }) },
      { code: OUTLINE_CODE, run: () => setLive({ outline: NEXT_OUTLINE[outline] }) },
      { code: PANEL_CODE, run: () => patch({ open: !open }) },
    ],
    () => {
      if (open) patch({ open: false });
    },
  );

  return (
    <>
      {open ? (
        <Panel
          locale={locale ?? engine().activeLocale()}
          keys={keys}
          outline={outline}
          editor={editor}
          onLocale={(next) => setLive({ locale: next === engine().activeLocale() ? null : next })}
          onKeys={(next) => setLive({ keys: next })}
          onOutline={(next) => setLive({ outline: next })}
          onEditor={(next) => patch({ editor: next })}
          onClose={() => patch({ open: false })}
          keysKey={letterOf(KEYS_CODE)}
          outlineKey={letterOf(OUTLINE_CODE)}
          panelKey={letterOf(PANEL_CODE)}
        />
      ) : (
        <Bubble on={keys || outline !== 'off'} onPress={() => patch({ open: true })} />
      )}
      <ProbeCard />
    </>
  );
}

function Bubble({ on, onPress }: Readonly<{ on: boolean; onPress: () => void }>) {
  return (
    <IconButton
      icon="language"
      label="i18n devtools"
      variant="glass"
      active={on}
      onPress={onPress}
    />
  );
}

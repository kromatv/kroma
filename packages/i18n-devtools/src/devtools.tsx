import { activeLocale } from '@kroma/core';
import { installKeyInspector, installLocaleOverride } from '@kroma/i18n';
import { keyLabel } from '@kroma/i18n/devtools';
import { Button } from '@kroma/ui/kit';
import { useEffect, useState } from 'react';
import { Panel } from './panel';
import { type DevtoolsSession, readSession, writeSession } from './session';
import { chordLabel, isApplePlatform } from './shortcut';
import { useShortcut } from './use-shortcut';

const KEYS_CODE = 'KeyK';
const PANEL_CODE = 'KeyI';

export function Devtools() {
  const [{ open, keys, locale }, setSession] = useState<DevtoolsSession>(readSession);

  const patch = (fields: Partial<DevtoolsSession>) => {
    setSession((current) => ({ ...current, ...fields }));
    writeSession(fields);
  };

  useEffect(() => {
    installKeyInspector(keys ? keyLabel : null);
    installLocaleOverride(locale);
  }, [keys, locale]);

  useShortcut(
    [
      { code: KEYS_CODE, run: () => patch({ keys: !keys }) },
      { code: PANEL_CODE, run: () => patch({ open: !open }) },
    ],
    () => {
      if (open) patch({ open: false });
    },
  );

  if (!open) {
    return (
      <Button
        size="sm"
        variant="glass"
        icon="language"
        label="i18n"
        onPress={() => patch({ open: true })}
      />
    );
  }

  const apple = isApplePlatform(navigator.platform);
  return (
    <Panel
      locale={locale}
      appLocale={activeLocale()}
      keys={keys}
      onLocale={(next) => patch({ locale: next })}
      onKeys={(next) => patch({ keys: next })}
      onClose={() => patch({ open: false })}
      keysChord={chordLabel(KEYS_CODE, apple)}
      panelChord={chordLabel(PANEL_CODE, apple)}
    />
  );
}

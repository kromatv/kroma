import { capabilities, type EngineDecision, type PlayEnv } from '@kromatv/core';
import { useMemo, useState } from 'react';
import { getWebEnginePref, type WebEnginePref } from '#web/features/playback/engine-pref';
import type { PlaybackSource } from '#web/features/playback/playback-source';

function detectWebEnv(): PlayEnv {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const safari =
    /^((?!chrome|chromium|android|crios|fxios|edg).)*safari/i.test(ua) ||
    /iP(ad|hone|od)/i.test(ua);
  return { platform: 'web', safari, runtimeCaps: capabilities() };
}

export interface EngineChoice {
  env: PlayEnv;
  decision: EngineDecision;
  enginePref: WebEnginePref;
  setEnginePrefState: React.Dispatch<React.SetStateAction<WebEnginePref>>;
  setForceHls: React.Dispatch<React.SetStateAction<boolean>>;
}

/** Picks direct-play against the HLS remux for this browser, honouring the
 * stored per-device override and the direct-play safety net (`setForceHls`). */
export function useEngineDecision(source: PlaybackSource): EngineChoice {
  const env = useMemo(detectWebEnv, []);
  const [forceHls, setForceHls] = useState(false);
  const [enginePref, setEnginePref] = useState<WebEnginePref>(getWebEnginePref);
  const decision = useMemo<EngineDecision>(
    () => source.decide(env, enginePref, forceHls),
    [source, env, forceHls, enginePref],
  );

  return { env, decision, enginePref, setEnginePrefState: setEnginePref, setForceHls };
}

import {
  capabilities,
  type EngineDecision,
  MSE_CAPS,
  masterNeedsAac,
  type PlayEnv,
  SAFARI_CAPS,
  selectEngine,
} from '@kroma/core';
import { useMemo, useState } from 'react';
import { getWebEnginePref, type WebEnginePref } from '#web/features/playback/engine-pref';
import type { MovieView } from '#web/shared/lib/api';

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
export function useEngineDecision(item: MovieView): EngineChoice {
  const env = useMemo(detectWebEnv, []);
  const [forceHls, setForceHls] = useState(false);
  const [enginePref, setEnginePref] = useState<WebEnginePref>(getWebEnginePref);
  const decision = useMemo<EngineDecision>(() => {
    if (forceHls || enginePref === 'remux' || enginePref === 'shaka') {
      return {
        kind: 'web-mse',
        aacMaster: masterNeedsAac(item, env.safari ? SAFARI_CAPS : MSE_CAPS),
      };
    }
    if (enginePref === 'direct') return { kind: 'direct', aacMaster: false };
    return selectEngine(item, env);
  }, [item, env, forceHls, enginePref]);

  return { env, decision, enginePref, setEnginePrefState: setEnginePref, setForceHls };
}

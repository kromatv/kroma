// The player's injected stylesheet: one rule sizing the in-page <video> a browser
// surface mounts inside the stage.

import { webDocument } from '#ui/lib/dom';

// The surface element is supplied by the client, so the chrome cannot style it
// through a prop. A native surface sizes itself and never sees this rule.
const STAGE_SURFACE = `
#kroma-player-stage > video {
  width: 100%;
  height: 100%;
  background: #000;
  object-fit: contain;
  border-radius: inherit;
}
`;

export const STAGE_STYLE_ID = 'kroma-player-stage-style';

/** Idempotent: injects the stage-surface rule once per document. */
export function injectStageStyles(): void {
  const doc = webDocument();
  if (!doc || doc.getElementById(STAGE_STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = STAGE_STYLE_ID;
  el.textContent = STAGE_SURFACE;
  doc.head.appendChild(el);
}

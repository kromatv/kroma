// The chrome the catalogue's three callable modals share. They predate the kit's
// <Dialog> and paint their own centred panel over the page scrim, and none of
// `position: fixed`, `88vh` or a scrolling pane has a name in the kit's
// vocabulary, so the shell is CSS.

import { color, radius } from '@kroma/ui/kit';
import type { CSSProperties } from 'react';

export const MODAL_LAYER: CSSProperties = {
  pointerEvents: 'none',
  position: 'fixed',
  inset: 0,
  zIndex: 61,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

/** The panel's box: full width up to `maxWidth`, clipped, and never taller than
 *  the window it floats in. */
export function modalPanel(maxWidth: number): CSSProperties {
  return {
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '88vh',
    width: '100%',
    maxWidth,
    overflow: 'hidden',
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color('white/10'),
    background: 'var(--kroma-bg)',
    boxShadow: `0 30px 90px ${color('black/60')}`,
  };
}

export const MODAL_BODY: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  paddingLeft: 28,
  paddingRight: 28,
  paddingTop: 20,
  paddingBottom: 20,
};

export const HEADER_RULE = { borderBottomWidth: 1, borderBottomColor: color('white/7') } as const;

export const FOOTER_RULE = { borderTopWidth: 1, borderTopColor: color('white/7') } as const;

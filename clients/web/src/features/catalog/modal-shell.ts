import { sharedStyle, styles } from '@kroma/ui/kit';
import { SCRIM_Z } from '#web/shared/ui/page';

const s = styles({
  layer: {
    pointerEvents: 'none',
    position: 'fixed',
    inset: 0,
    zIndex: SCRIM_Z + 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    p: 16,
  },
  panel: {
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '88%',
    width: '100%',
    overflow: 'hidden',
    radius: 'xl',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'white/10',
    backgroundColor: 'var(--kroma-bg)',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    flex: true,
    minHeight: 0,
    overflowY: 'auto',
    px: 28,
    py: 20,
  },
  headerRule: { borderBottomWidth: 1, borderBottomColor: 'white/7' },
  footerRule: { borderTopWidth: 1, borderTopColor: 'white/7' },
});

export const MODAL_LAYER = s.layer;

export const MODAL_BODY = s.body;

export const HEADER_RULE = s.headerRule;

export const FOOTER_RULE = s.footerRule;

/** The panel's styles at a width, for `classes(...modalPanel(w))`. */
export function modalPanel(maxWidth: number): object[] {
  return [s.panel, sharedStyle(`modal:width:${maxWidth}`, { maxWidth })];
}

import {
  DEFAULT_STYLE_SCOPE,
  resolveStyles,
  type StyleScope,
  sharedStyle,
  styles,
} from '@kromatv/ui/kit';
import { SCRIM_Z } from '#web/shared/ui/page';

const sDefinition = styles({
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

export const MODAL_LAYER = sDefinition.layer;

export const MODAL_BODY = sDefinition.body;

export const HEADER_RULE = sDefinition.headerRule;

export const FOOTER_RULE = sDefinition.footerRule;

/** The panel's styles at a width, for `classes(...modalPanel(w))`. */
export function modalPanel(maxWidth: number, scope: StyleScope = DEFAULT_STYLE_SCOPE): object[] {
  return [
    resolveStyles(sDefinition, scope).panel,
    sharedStyle(`modal:width:${maxWidth}`, { maxWidth }, scope),
  ];
}

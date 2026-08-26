import { webDocument } from '@kroma/ui/kit';

/**
 * Clears the page's background so a native video plane behind it (mpv, AVPlay)
 * shows through, and hands back the undo.
 *
 * Written as inline declarations rather than as a rule, because they have to
 * outrank the ground a shell's own stage stylesheet paints (see
 * clients/desktop/src/stage.ts), which macOS otherwise leaves opaque over the
 * plane.
 */
export function revealNativeSurface(): () => void {
  const doc = webDocument();
  if (!doc) return () => {};
  const chain = [doc.documentElement, doc.body, doc.getElementById('root')];
  const undo = chain
    .filter((el): el is HTMLElement => el !== null)
    .map((el) => {
      const before = el.style.background;
      el.style.background = 'transparent';
      return () => {
        el.style.background = before;
      };
    });
  return () => {
    for (const restore of undo) restore();
  };
}

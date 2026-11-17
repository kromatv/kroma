import { classGaps } from './class-gaps';
import { createGapLayout, flexGapWorks } from './gap-layout';
import { inlineGaps } from './inline-gaps';

/**
 * Lays out flex `gap` on an engine before Chromium 84, which drops it: the
 * gaps of the build's classes and the ones React sets inline both reach one
 * layout. An engine that reads `gap` is left alone.
 */
export function flexGaps(doc: Document): () => void {
  if (flexGapWorks(doc)) {
    return () => {};
  }
  const layout = createGapLayout(doc);
  const stops = [inlineGaps(doc, layout), classGaps(doc, layout)];
  return () => {
    stops.forEach((stop) => stop());
    layout.dispose();
  };
}

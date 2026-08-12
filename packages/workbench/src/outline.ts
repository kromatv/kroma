// The sections of the article being read: which headings the document drew,
// where each one sits, and which one the reader is inside.
//
// MDX hands over rendered elements, never a table of contents, so the DOCUMENT
// is the source: a heading reports itself as it lays out. That report is the
// same measurement the jump and the scroll spy need, and it is taken at run time
// rather than at compile time, so Vite and Metro cannot disagree about it and a
// television needs no IntersectionObserver it does not have.

import {
  createContext,
  isValidElement,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { slug } from './registry';

/** One heading of the document. `y` is measured from the top of the document,
 * which is `top` below the top of the scroller. */
interface Section {
  /** The slug of the heading's own words, so a link to it is one a reader can
   *  make sense of and paste. */
  id: string;
  label: string;
  level: number;
  y: number;
}

interface OutlineSink {
  /** The id this heading owns, given the ones already claimed above it.
   *  Idempotent per `key`, so a second render never renames a section. */
  claim: (key: string, base: string) => string;
  reportSection: (section: Section) => void;
  reportTop: (y: number) => void;
}

// Absent outside an article: a story's prose renders through the same element
// map inside the inspector, where there is no outline to report to.
const OutlineContext = createContext<OutlineSink | null>(null);

// What a heading with no words of its own is addressed as.
const UNNAMED = 'section';

interface SectionHandle {
  /** Absent outside an article: a story's prose has no address of its own to
   *  give a heading, so it is offered no link to one either. */
  id?: string;
  onLayout?: (event: LayoutChangeEvent) => void;
}

/** A heading's own id and `onLayout`. */
function useSection(level: number, children: ReactNode): SectionHandle {
  const sink = useContext(OutlineContext);
  const key = useId();
  const label = useMemo(() => textOf(children), [children]);
  const id = sink ? sink.claim(key, slug(label) || UNNAMED) : undefined;
  const report = useCallback(
    (event: LayoutChangeEvent) => {
      if (!(sink && id)) return;
      sink.reportSection({ id, label, level, y: event.nativeEvent.layout.y });
    },
    [sink, id, label, level],
  );
  return { id, onLayout: id ? report : undefined };
}

/** Where the document itself starts, which every heading's `y` is relative to. */
function useDocumentTop(): ((event: LayoutChangeEvent) => void) | undefined {
  const sink = useContext(OutlineContext);
  const report = useCallback(
    (event: LayoutChangeEvent) => sink?.reportTop(event.nativeEvent.layout.y),
    [sink],
  );
  return sink ? report : undefined;
}

interface Outline {
  sections: readonly Section[];
  top: number;
  sink: OutlineSink;
}

interface Claims {
  byKey: Map<string, string>;
  byBase: Map<string, number>;
}

/** Collects the outline of the document keyed by `article`, in reading order.
 * Changing the key empties it in the same render, so a page never inherits the
 * sections of the one before it. */
function useOutline(article: string): Outline {
  const [seen, setSeen] = useState<{ article: string; sections: readonly Section[]; top: number }>({
    article,
    sections: [],
    top: 0,
  });
  const claims = useRef<{ article: string; claims: Claims }>({
    article,
    claims: { byKey: new Map(), byBase: new Map() },
  });
  if (seen.article !== article) setSeen({ article, sections: [], top: 0 });
  if (claims.current.article !== article) {
    claims.current = { article, claims: { byKey: new Map(), byBase: new Map() } };
  }

  // Two headings of the same words are two addresses, so the second takes `-2`.
  // Keyed by instance, which is what makes a re-render return the same id
  // instead of numbering the document again.
  const claim = useCallback((key: string, base: string) => {
    const { byKey, byBase } = claims.current.claims;
    const known = byKey.get(key);
    if (known) return known;
    const nth = (byBase.get(base) ?? 0) + 1;
    byBase.set(base, nth);
    const id = nth === 1 ? base : `${base}-${nth}`;
    byKey.set(key, id);
    return id;
  }, []);

  const reportSection = useCallback((next: Section) => {
    setSeen((prev) => {
      const at = prev.sections.findIndex((entry) => entry.id === next.id);
      if (at < 0) return { ...prev, sections: [...prev.sections, next] };
      const found = prev.sections[at];
      if (found?.y === next.y && found.label === next.label) return prev;
      const sections = [...prev.sections];
      sections[at] = next;
      return { ...prev, sections };
    });
  }, []);

  const reportTop = useCallback((y: number) => {
    setSeen((prev) => (prev.top === y ? prev : { ...prev, top: y }));
  }, []);

  const sink = useMemo(
    () => ({ claim, reportSection, reportTop }),
    [claim, reportSection, reportTop],
  );
  // Sorted by position rather than by arrival: layout order is the document's
  // order, and nothing else here knows it.
  const sections = useMemo(
    () => (seen.article === article ? [...seen.sections].sort((a, b) => a.y - b.y) : []),
    [seen, article],
  );
  return { sections, top: seen.article === article ? seen.top : 0, sink };
}

// How far above the top of the window a heading is still the one being read.
const ACTIVE_BAND = 96;

/** The section the reader is inside: the last heading to have passed the top of
 * the window, and nothing while the article is still on its opening lines.
 *
 * `atEnd` hands it to the last section outright, because a document's closing
 * section is usually shorter than the window and would otherwise never reach
 * the top of it - the list would go quiet exactly where the reader stopped. */
function activeSection(
  sections: readonly Section[],
  top: number,
  scrollY: number,
  atEnd = false,
): string | undefined {
  if (atEnd) return sections.at(-1)?.id;
  let active: string | undefined;
  for (const section of sections) {
    if (top + section.y - ACTIVE_BAND > scrollY) break;
    active = section.id;
  }
  return active;
}

/** The flattened text of a heading: MDX gives it as a tree of inline marks, and
 * an outline entry is a string. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

export type { Section };
export {
  ACTIVE_BAND,
  activeSection,
  OutlineContext,
  textOf,
  useDocumentTop,
  useOutline,
  useSection,
};

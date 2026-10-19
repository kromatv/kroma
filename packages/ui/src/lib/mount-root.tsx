import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { webDocument } from '#ui/lib/dom';

/** Renders `node` into the page's `#root`. */
export function mountRoot(node: ReactNode): void {
  const el = webDocument()?.getElementById('root');
  if (!el) throw new Error('KROMA: #root element not found');
  createRoot(el).render(node);
}

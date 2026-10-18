import { everyGlyph } from '#ui/lib/icons/every-glyph';
import '@kromatv/ui/css';
import { createIconLibrary, IconLibraryProvider } from '@kromatv/ui/kit';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Kit } from './config';

function Root() {
  const [library] = useState(() =>
    createIconLibrary({
      loadGlyphs: everyGlyph,
      loadCatalog: async () => (await import('virtual:kroma-icon-catalog')).ICON_CATALOG,
    }),
  );
  return (
    <IconLibraryProvider library={library}>
      <Kit />
    </IconLibraryProvider>
  );
}

const el = document.getElementById('root');
if (!el) throw new Error('KROMA Kit: #root element not found');
createRoot(el).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

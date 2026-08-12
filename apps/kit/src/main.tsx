import './styles.css';
import { setIconCatalogLoader } from '@kroma/ui/kit';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Kit } from './config';

// Registered, not read: a megabyte of metadata for one page, so it is a chunk
// the icons page asks for. Only this entry has it at all - the Metro half of
// the kit runs on a phone and a television, and never fetches.
setIconCatalogLoader(async () => (await import('virtual:kroma-icon-catalog')).ICON_CATALOG);

const el = document.getElementById('root');
if (!el) throw new Error('KROMA Kit: #root element not found');
createRoot(el).render(
  <StrictMode>
    <Kit />
  </StrictMode>,
);

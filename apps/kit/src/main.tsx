import './styles.css';
import { ICON_CATALOG } from 'virtual:kroma-icon-catalog';
import { setIconCatalog } from '@kroma/ui/kit';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Kit } from './config';

// Only this entry has it: the Metro half of the kit runs on a phone and a
// television, where the catalogue is a megabyte of metadata for one story.
setIconCatalog(ICON_CATALOG);

const el = document.getElementById('root');
if (!el) throw new Error('KROMA Kit: #root element not found');
createRoot(el).render(
  <StrictMode>
    <Kit />
  </StrictMode>,
);

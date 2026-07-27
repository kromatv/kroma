// The kit site: the workbench as a deployable page of its own.
//
// Thin on purpose. Everything KROMA-shaped is in `config.tsx`, everything about
// being a workbench is in @kroma/workbench, everything about the components is in
// @kroma/ui. This file only puts the configured component in the page.

import '@kroma/ui/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Kit } from './config';

const el = document.getElementById('root');
if (!el) throw new Error('KROMA Kit: #root element not found');
createRoot(el).render(
  <StrictMode>
    <Kit />
  </StrictMode>,
);

// The kit site: the workbench as a deployable page of its own.

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

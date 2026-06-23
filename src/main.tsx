import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { seedIfEmpty } from './db/seed';

// Seed IndexedDB with initial data on first run (no-op if already seeded).
// Mount React regardless of seed result so a DB error doesn't produce a silent white screen.
seedIfEmpty()
  .catch((err) => console.error('[Amina] seed failed — launching with empty DB:', err))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });

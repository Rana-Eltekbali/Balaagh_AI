import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { setBaseUrl } from '@workspace/api-client-react';

import './index.css';

// In development the API runs at localhost:8000.
// In production (GitHub Pages static deploy) we hit the same origin or an
// explicit URL provided via the VITE_API_BASE_URL env variable.
setBaseUrl(import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:8000' : ''));

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

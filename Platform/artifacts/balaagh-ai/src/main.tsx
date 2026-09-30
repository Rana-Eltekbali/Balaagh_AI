import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { setAuthTokenGetter, setBaseUrl, setUnauthorizedHandler } from '@workspace/api-client-react';
import { configureDemoAccess, rejectDemoToken, requestDemoToken } from '@/lib/demo-access';

import './index.css';

// Development: FastAPI runs locally on port 8000.
// Production: VITE_API_BASE_URL must point to the deployed FastAPI backend.
const apiBase = import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? 'http://localhost:8000' : '');
setBaseUrl(apiBase);
configureDemoAccess(apiBase);
setAuthTokenGetter(requestDemoToken);
setUnauthorizedHandler(rejectDemoToken);

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

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/main.scss';
import App from './app/App';
import ErrorBoundary from './app/CrashScreen';

createRoot(document.getElementById("appRoot")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

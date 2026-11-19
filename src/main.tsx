import './styles/mantine';
import './styles/main.scss';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './app/App';
import ErrorBoundary from './app/CrashScreen';
import { theme } from './app/theme';

createRoot(document.getElementById("appRoot")!).render(
  <StrictMode>
    <MantineProvider theme={theme} forceColorScheme="dark">
      <Notifications position="top-right" limit={3} />
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </MantineProvider>
  </StrictMode>,
);

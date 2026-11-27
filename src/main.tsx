// Starts the app. It listens for updates and the offer to install, then renders `App` inside the theme and a
// crash screen.
import '@fontsource/monda/latin-700.css';  // The Monda font is only for the app's name, so only its Latin letters.
import './styles/mantine';
import './styles/main.scss';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './app/App';
import ErrorBoundary from './app/CrashScreen';
import { reloadOnMissedUpdate } from './app/crashState';
import { theme } from './app/theme';
import { listenForInstallOffer } from './pwa/install';
import { startServiceWorker } from './pwa/updates';

reloadOnMissedUpdate();
listenForInstallOffer();
startServiceWorker();

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

// Testing Library's render, inside the app's Mantine theme.
import { MantineProvider, mergeThemeOverrides } from '@mantine/core';
import { render as baseRender, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

import { theme } from '../app/theme';

// No open/close animations, so dialogs are visible as soon as they're rendered.
const testTheme = mergeThemeOverrides(theme, {
  components: {Modal: {defaultProps: {transitionProps: {duration: 0}}}},
});

function Providers({children}: {children: ReactNode}) {
  return <MantineProvider theme={testTheme} forceColorScheme="dark">{children}</MantineProvider>;
}

export function render(ui: ReactElement, options?: RenderOptions) {
  return baseRender(ui, {wrapper: Providers, ...options});
}

import { useMediaQuery } from '@mantine/hooks';

// Matches the phone mixin in styles/_theme.scss.
export function usePhone(): boolean {
  // Read on the first render, so dialogs don't open centred and then jump to full screen.
  return useMediaQuery("(max-width: 767.98px) and (min-height: 520.02px)", undefined, {getInitialValueInEffect: false}) ?? false;
}

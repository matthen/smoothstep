import { useMediaQuery } from '@mantine/hooks';

// Matches the phone layout in styles/_theme.scss.
export function usePhone(): boolean {
  return useMediaQuery("(max-width: 767.98px)") ?? false;
}

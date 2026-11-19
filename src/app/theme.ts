import { createTheme, type MantineColorsTuple } from '@mantine/core';

// The Dracula palette as Mantine colour scales. `dark` runs from the foreground (0) to the
// darkest background (9); Mantine uses dark[7] for the page and dark[6] for inputs.
const dark: MantineColorsTuple = [
  '#f8f8f2', '#c9cad6', '#999db2', '#7a7e98', '#5c6079', '#44475a', '#343746', '#282a36', '#21222c', '#191a21',
];

const purple: MantineColorsTuple = [
  '#f5effe', '#e8dcfd', '#d9c4fc', '#cbacfa', '#bd93f9', '#a87af0', '#9161e0', '#7a4cc7', '#653ca6', '#512f86',
];

const green: MantineColorsTuple = [
  '#e6fff0', '#c9fdda', '#9ffcbc', '#76fb9c', '#50fa7b', '#35e063', '#24bf50', '#1a9a40', '#147733', '#0e5626',
];

const red: MantineColorsTuple = [
  '#ffe9e9', '#ffcfcf', '#ffa8a8', '#ff8080', '#ff5555', '#f03e3e', '#d62f2f', '#b02424', '#8a1c1c', '#651414',
];

export const theme = createTheme({
  colors: {dark, purple, green, red},
  primaryColor: 'purple',
  primaryShade: {light: 6, dark: 4},
  autoContrast: true,
  luminanceThreshold: 0.45,
  defaultRadius: 'sm',
  cursorType: 'pointer',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMonospace: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  headings: {fontWeight: '600'},
  components: {
    Modal: {
      defaultProps: {centered: true, overlayProps: {backgroundOpacity: 0.6}},
      styles: {title: {fontWeight: 600}},
    },
    Tooltip: {defaultProps: {openDelay: 400, withArrow: true}},
    Menu: {defaultProps: {shadow: 'md', position: 'bottom-start'}},
  },
});

// Lets parts of the app outside App.tsx, such as the tutorial's lessons, open a Help dialog.
export type HelpDialog = "shortcuts" | "inputs";

const EVENT = "smoothstep:help";

export function openHelpDialog(dialog: HelpDialog) {
  window.dispatchEvent(new CustomEvent<HelpDialog>(EVENT, {detail: dialog}));
}

export function onHelpDialog(listener: (dialog: HelpDialog) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<HelpDialog>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

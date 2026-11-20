import { useEffect, useState, type ReactNode } from 'react';

// Browsers only offer navigator.clipboard on https and localhost, so copy through a selected
// text box when it's missing or refuses.
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Inside the open dialog, so its focus trap doesn't pull focus back before the copy.
    const parent = document.activeElement?.closest("[role=dialog]") ?? document.body;
    const box = document.createElement("textarea");
    box.value = text;
    box.setAttribute("readonly", "");
    box.style.cssText = "position: fixed; top: 0; left: 0; opacity: 0;";
    parent.appendChild(box);
    const focused = document.activeElement as HTMLElement | null;
    box.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      box.remove();
      focused?.focus();
    }
  }
}

interface CopyTextProps {
  value: string;
  timeout?: number;
  children(state: {copied: boolean; copy(): void}): ReactNode;
}

// Like Mantine's CopyButton, but it still copies where the clipboard API isn't allowed.
export default function CopyText({value, timeout = 1000, children}: CopyTextProps) {
  // Counts copies, so copying again restarts the timeout.
  const [copies, setCopies] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (copies === 0) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), timeout);
    return () => window.clearTimeout(timer);
  }, [copies, timeout]);

  const copy = () => {
    void copyText(value).then(ok => {
      if (ok) {
        setCopied(true);
        setCopies(n => n + 1);
      }
    });
  };
  return <>{children({copied, copy})}</>;
}

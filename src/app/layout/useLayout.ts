// The device's layout, and the panes' sizes and tabs.
import { useMediaQuery } from '@mantine/hooks';
import { useCallback, useEffect, useRef, useState } from 'react';

import { storedPreviewWidth, storePreviewWidth } from './PaneDivider';
import { useKeyboardInset } from './useKeyboardInset';
import { usePhone, useTouch } from './usePhone';

// Which pane fills the screen below the canvas on a phone.
export type MobileTab = "code" | "animation" | "sliders" | "textures" | "console" | "learn";
export type PanelTab = "animation" | "sliders" | "textures" | "console";

// `learnFirst` shows the tutorial first on a phone.
export function useLayout(learnFirst: boolean) {
  const phone = usePhone();
  const touch = useTouch();
  // The canvas side's width set with the divider, or null for a preset.
  const [previewWidth, setPreviewWidth] = useState<number | null>(storedPreviewWidth);
  const [resizing, setResizing] = useState(false);
  const workspaceRef = useRef<HTMLElement>(null);
  useEffect(() => storePreviewWidth(previewWidth), [previewWidth]);

  // The desktop layout's width, and its height before a keyboard took some of it.
  const wide = useMediaQuery("(min-width: 768px)");
  const keyboard = useKeyboardInset();
  const tabletKeyboard = keyboard.open && touch && wide && keyboard.fullHeight > 520;
  // On a tablet, the code or the bottom panel, whichever the on-screen keyboard is typing in, takes
  // the room above it.
  const [typingIn, setTypingIn] = useState<"code" | "panel" | null>(null);
  useEffect(() => {
    const update = () => {
      const focused = document.activeElement;
      setTypingIn(!tabletKeyboard ? null : focused?.closest(".editorPane") ? "code" :
        focused?.closest(".bottomPanel") ? "panel" : null);
    };
    update();
    document.addEventListener("focusin", update);
    return () => document.removeEventListener("focusin", update);
  }, [tabletKeyboard]);

  const [mobileTab, setMobileTab] = useState<MobileTab>(learnFirst && phone ? "learn" : "code");
  const [panelTab, setPanelTab] = useState<PanelTab>("animation");
  const [showFooter, setShowFooter] = useState(true);
  const chooseMobileTab = (tab: MobileTab) => {
    setMobileTab(tab);
    if (tab !== "code" && tab !== "learn") {
      setPanelTab(tab);
    }
  };
  const showCodeOnPhone = useCallback(() => setMobileTab("code"), []);
  // Shows a tab of the bottom panel, which is a pane of its own on a phone.
  const showPanel = (tab: PanelTab) => {
    if (phone) {
      chooseMobileTab(tab);
    } else {
      setPanelTab(tab);
      setShowFooter(true);
    }
  };
  const consoleShown = phone ? mobileTab === "console" : panelTab === "console" && showFooter;

  return {
    phone, touch, previewWidth, setPreviewWidth, resizing, setResizing, workspaceRef, typingIn,
    mobileTab, setMobileTab, chooseMobileTab, showCodeOnPhone, panelTab, setPanelTab, showFooter, setShowFooter,
    showPanel, consoleShown,
  };
}

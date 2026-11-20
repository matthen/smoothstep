// The "Did you know?" tips on the welcome dialog. Each visit shows the next one.
import { Kbd } from '@mantine/core';
import type { ReactNode } from 'react';

import { MOD_KEY } from '../app/platform';

export const WELCOME_TIPS: ReactNode[] = [
  <>Click a number in your code and drag the slider to change it while the animation plays. Drag up or down to zoom.</>,
  <>Click a colour like <code>vec3(1.0, 0.5, 0.2)</code> in your code for a colour picker, or a <code>vec2</code> for a 2D one.</>,
  <><Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> or <Kbd>{MOD_KEY}</Kbd> + <Kbd>Enter</Kbd> builds your code.</>,
  <>Put <code>#define size iFloat0</code> at the top of your code to give a timeline input a name.</>,
  <>Drag the line at the end of the timeline to make the animation longer or shorter.</>,
  <>Point at the canvas for the aspect ratio menu, to make square, wide or tall videos.</>,
  <>File → Download animation file saves your code, timeline and textures, to back up or share.</>,
  <>Export video makes a WebM, MP4, animated GIF or PNG frames, at the size and frame rate you choose.</>,
  <><code>iPrevFrame</code> is the frame drawn just before. Mix it into the new one for trails, or use it to run a simulation.</>,
  <>You can add your own images in the Textures tab. They stay in this browser, and images up to 4096 px across are kept at full size.</>,
  <>Click a built-in function like <code>smoothstep</code> or <code>mix</code> in your code to see what it does.</>,
  <><Kbd>Space</Kbd> plays and pauses, and the number keys jump through the animation: <Kbd>5</Kbd> goes halfway.</>,
  <>Help → Shader inputs lists everything your shader can use, and Help → Keyboard shortcuts lists the shortcuts.</>,
];

const KEY = "smoothstep.welcomeTip";

// The tip to show now.
export function welcomeTipIndex(): number {
  try {
    const value = Number(window.localStorage.getItem(KEY));
    return Number.isInteger(value) && value >= 0 ? value % WELCOME_TIPS.length : 0;
  } catch {
    return 0;
  }
}

// Remembers that `index` was shown, so the next visit shows the one after it.
export function welcomeTipShown(index: number) {
  try {
    window.localStorage.setItem(KEY, String((index + 1) % WELCOME_TIPS.length));
  } catch {
    // Not stored, so the same tip shows next time.
  }
}

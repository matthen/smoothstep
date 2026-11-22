// The "Did you know?" tips on the welcome dialog. Each visit shows the next one.
import { Kbd } from '@mantine/core';
import type { ReactNode } from 'react';

import { MOD_KEY } from '../app/platform';

export const WELCOME_TIPS: ReactNode[] = [
  <>Click a number in your code for a slider, and drag sideways to change the number while the animation plays. Drag up or down to make its steps finer or coarser.</>,
  <>Click a colour like <code>vec3(1.0, 0.5, 0.2)</code> in your code for a colour picker, or a <code>vec2</code> for a 2D picker.</>,
  <><Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> or <Kbd>{MOD_KEY}</Kbd> + <Kbd>Enter</Kbd> builds your code.</>,
  <>You can give a timeline row a name. A line like <code>#define size iFloat0</code> in your code names the <code>iFloat0</code> row <code>size</code>, and you can then write <code>size</code> in your code instead of <code>iFloat0</code>.</>,
  <>The Sliders tab has a slider for each <code>iFloat</code> your code uses. Drag one to try out values, even ones the timeline animates.</>,
  <>Drag the line at the end of the timeline to make the animation longer or shorter.</>,
  <>The aspect ratio menu in the play bar sets the canvas's shape: square, wide, tall, or any ratio you choose with Custom….</>,
  <>The button at the very end of the play bar shows your animation full screen, like a video. To go back to the editor, press Esc, click the button again, or click the background.</>,
  <>File → Download animation file saves your code, timeline and textures, to back up or move to another computer.</>,
  <>Share gives you a link with the whole animation in it. Anyone who opens it can play it and change their own copy.</>,
  <>Export video makes a WebM, MP4, animated GIF or PNG frames, at the size and frame rate you choose.</>,
  <><code>iPrevFrame</code> is the frame drawn just before. Mix it into the new one for trails, or use it to run a simulation.</>,
  <>The ⊕ above the code adds a buffer: a shader that runs before the Image shader. Every tab can read what it draws as <code>iBuffer0</code>, so buffers can run simulations.</>,
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

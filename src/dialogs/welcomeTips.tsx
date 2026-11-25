// The "Did you know?" tips on the welcome dialog. Each visit shows the next one.
import { Kbd } from '@mantine/core';
import type { ReactNode } from 'react';

import { MOD_KEY } from '../app/platform';
import { GlslCode, JsCode } from '../editor/InlineCode';

export const WELCOME_TIPS: ReactNode[] = [
  <>Click a number in your code for a slider, and drag sideways to change the number while the animation plays. Drag up or down to make its steps finer or coarser.</>,
  <>Click a colour like <GlslCode>vec3(1.0, 0.5, 0.2)</GlslCode> in your code for a colour picker, or a <GlslCode>vec2</GlslCode> for a 2D picker.</>,
  <><Kbd>Shift</Kbd> + <Kbd>Enter</Kbd> or <Kbd>{MOD_KEY}</Kbd> + <Kbd>Enter</Kbd> builds your code.</>,
  <>You can give a timeline row a name. A line like <GlslCode>#define size iFloat0</GlslCode> in your code names the <GlslCode>iFloat0</GlslCode> row <GlslCode>size</GlslCode>, and you can then write <GlslCode>size</GlslCode> in your code instead of <GlslCode>iFloat0</GlslCode>.</>,
  <>The Sliders tab has a slider for each <GlslCode>iFloat</GlslCode> your code uses. Drag one to try out values, even ones the timeline animates.</>,
  <>Drag the line at the end of the timeline to make the animation longer or shorter.</>,
  <>Drag the handle between the code and the canvas to give either more room. Double-click it to go back.</>,
  <>The aspect ratio menu in the play bar sets the canvas's shape: square, wide, tall, or any ratio you choose with Custom….</>,
  <>The button at the very end of the play bar shows your animation full screen, like a video. To go back to the editor, press Esc, click the button again, or click the background.</>,
  <>File → Export downloads your code, timeline and textures as a file, to back up or move to another computer.</>,
  <>Share gives you a link with the whole animation in it. Anyone who opens it can play it and change their own copy.</>,
  <>Render makes a WebM, MP4, animated GIF or PNG frames, at the size and frame rate you choose.</>,
  <><GlslCode>iPrevFrame</GlslCode> is the frame drawn just before. Mix it into the new one for trails, or use it to run a simulation.</>,
  <>The ⊕ above the code can add a buffer: a shader that runs before the image shader. Every tab can read what it draws as <GlslCode>iBuffer0</GlslCode>, so buffers can run simulations.</>,
  <>The ⊕ above the code can also add the Canvas2D layer: JavaScript that draws text, shapes or a physics simulation over the image. Shaders can read its drawing as <GlslCode>iCanvas2D</GlslCode>.</>,
  <>You can add your own images in the Textures tab. They stay in this browser, and images up to 4096 px across are kept at full size.</>,
  <>Click a built-in function like <GlslCode>smoothstep</GlslCode> or <GlslCode>mix</GlslCode> in your code to see what it does.</>,
  <>In the Canvas2D.js tab, click a helper like <JsCode>Disk</JsCode> or a <JsCode>ctx</JsCode> method like <JsCode>fillText</JsCode> to see what it does, and a colour string like <JsCode>"#ffcc00"</JsCode> for a colour picker.</>,
  // Snippet names to type, rather than code.
  <>Type <code>raymarch</code> or <code>feedback</code> in a shader, or <code>drawList</code> in the Canvas2D.js tab, and pick it from Snippets at the end of the completions for code to start from. <Kbd>Tab</Kbd> moves between its blanks.</>,
  <><Kbd>Space</Kbd> plays and pauses, and the number keys jump through the animation: <Kbd>5</Kbd> goes halfway.</>,
  <>smoothstep.io works offline once you've visited it. Chrome and Edge can also install it as an app, with its own window, from Help → Install as an app or the address bar.</>,
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

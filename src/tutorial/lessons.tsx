// The in-app tutorial: lessons made of short steps, each with an optional check that notices when
// you've done it in the editor.
import type { ReactNode } from 'react';

import { openHelpDialog, type HelpDialog } from '../app/helpDialogs';
import { EMPTY_TEXTURE, type AspectRatio, type TextureSlot, type Variable } from '../lib/document';
import { DOCS_URL, EXAMPLES } from '../lib/config';
import type { ShaderId } from '../render/Renderer';
import * as shaders from './shaders';

// What a step's check can see of the editor.
export interface TutorialState {
  code: string;
  builtCode: string;
  // The Shared tab's and each buffer's code, as in the editor and as last built.
  shared: string;
  buffers: string[];
  builtShared: string;
  builtBuffers: string[];
  // Compiled without errors, and the editor hasn't changed since.
  built: boolean;
  isPlaying: boolean;
  time: number;
  variables: Variable[];
  textures: TextureSlot[];
  duration: number;
  aspectRatio: AspectRatio;
}

export interface Step {
  id: string;
  title: string;
  body: ReactNode;
  // Offered with a button that replaces the code in the editor.
  code?: string;
  // In place of `code`, code for several tabs, which the button puts in each, adding buffers as needed.
  tabs?: TabCode[];
  // What the check is waiting for, shown until it passes.
  task?: string;
  // `atStart` is the state when the step was entered.
  check?(now: TutorialState, atStart: TutorialState): boolean;
  // Ids of bundled examples to explore, shown as links.
  examples?: string[];
}

export interface Lesson {
  title: string;
  steps: Step[];
}

export interface TabCode {
  tab: ShaderId;
  code: string;
}

// The code a step offers, for each tab it goes in.
export function stepCode(step: Step): TabCode[] {
  return step.tabs ?? (step.code === undefined ? [] : [{tab: "image", code: step.code}]);
}

// A tab's code in the editor.
export function codeIn(state: TutorialState, tab: ShaderId): string | undefined {
  return tab === "image" ? state.code : tab === "shared" ? state.shared : state.buffers[tab];
}

// A tab's code as last built.
function builtIn(state: TutorialState, tab: ShaderId): string {
  return (tab === "image" ? state.builtCode : tab === "shared" ? state.builtShared : state.builtBuffers[tab]) ?? "";
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function uses(code: string, pattern: RegExp): boolean {
  return pattern.test(stripComments(code));
}

// Built again with a change in any tab.
function rebuilt(now: TutorialState, atStart: TutorialState): boolean {
  const all = (s: TutorialState) => [s.builtCode, s.builtShared, ...s.builtBuffers].join("\0");
  return now.built && all(now) !== all(atStart);
}

// Rebuilt, and with something other than the step's own code: changed with a picker or by hand.
function changedFrom(code: string, now: TutorialState, atStart: TutorialState): boolean {
  return rebuilt(now, atStart) && now.builtCode !== code;
}

function played(now: TutorialState, atStart: TutorialState): boolean {
  return now.isPlaying || now.time !== atStart.time;
}

// Every iFloat<n> the code reads.
export function floatsUsed(code: string): number[] {
  return [...stripComments(code).matchAll(/\biFloat(\d+)\b/g)].map(m => Number(m[1]));
}

function Link({href, children}: {href: string; children: ReactNode}) {
  return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
}

function HelpLink({dialog, children}: {dialog: HelpDialog; children: ReactNode}) {
  return <button type="button" className="linkButton" onClick={() => openHelpDialog(dialog)}>{children}</button>;
}



// The iFloat rows the code reads that have a transition between different values.
function animatedFloats(now: TutorialState): number[] {
  return [...new Set(floatsUsed(now.builtCode))].filter(i =>
    now.variables[i]?.transitions.some(t => t.startValue !== t.endValue));
}

// A texture slot the code reads has an image in it.
function textureChosen(now: TutorialState): boolean {
  return [...stripComments(now.builtCode).matchAll(/\biTexture(\d)\b/g)].some(m => {
    const slot = now.textures[Number(m[1])];
    return slot !== undefined && (slot.isUserUploaded || slot.url !== EMPTY_TEXTURE);
  });
}

const EXPLORE = <p>Examples open in a new tab, so your animation stays here.</p>;

export const LESSONS: Lesson[] = [
  {
    title: "Colour from position",
    steps: [
      {
        id: "gradient",
        title: "A gradient",
        body: <>
          <p>
            A shader is a small program that works out the colour of every pixel on the canvas. In smoothstep
            it's a function called <code>mainImage</code>. Your computer runs it for every pixel at once, many
            times a second.
          </p>
          <p>
            <code>fragCoord</code> is where the pixel is, counted in pixels from the bottom-left corner.
            Whatever you put in <code>fragColor</code> is the colour that pixel gets. A colour is four numbers
            from 0 to 1: red, green, blue, and opacity, where 1 means solid.
          </p>
          <p>
            The canvas can be any size, so the code divides <code>fragCoord</code> by{" "}
            <code>iResolution</code>, the canvas's width and height. That gives <code>uv</code>, which goes
            from 0 at the left edge to 1 at the right, and from 0 at the bottom to 1 at the top. The colour
            uses <code>uv.x</code> for red and <code>uv.y</code> for green, so the canvas gets redder to the
            right and greener towards the top.
          </p>
          <p>
            Put this in the editor, then click Build, or press <kbd>Shift</kbd> + <kbd>Enter</kbd>.
          </p>
        </>,
        code: shaders.GRADIENT,
        task: "Build a shader that uses iResolution.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\biResolution\b/),
      },
      {
        id: "pick-colour",
        title: "Pick a colour",
        body: <>
          <p>
            A <code>vec3</code> is a group of three numbers. Here it holds the red, green and blue of an orange
            colour. The code also makes the colour darker towards the bottom of the canvas. Put this in the
            editor and build it.
          </p>
          <p>
            Then click inside <code>vec3(0.95, 0.45, 0.25)</code> in the editor. A colour picker opens, and
            the canvas changes as you drag around it. Click back in the code to close it.
          </p>
        </>,
        code: shaders.ONE_COLOUR,
        task: "Build it, then change the colour with the picker.",
        check: (now, atStart) => changedFrom(shaders.ONE_COLOUR, now, atStart) && uses(now.builtCode, /\bvec3\b/),
      },
      {
        id: "mix-colours",
        title: "Blend two colours",
        body: <>
          <p>
            <code>mix(a, b, t)</code> blends two colours. When <code>t</code> is 0 you get <code>a</code>, when
            it's 1 you get <code>b</code>, and at 0.5 you get half of each.
          </p>
          <p>
            Here <code>t</code> is <code>uv.x</code>, so the canvas fades from the <code>left</code> colour at
            the left edge to the <code>right</code> colour at the right edge. Put this in the editor and build
            it, then click in each <code>vec3</code> to pick your own two colours.
          </p>
        </>,
        code: shaders.TWO_COLOURS,
        task: "Build a shader that uses mix().",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\bmix\s*\(/),
      },
    ],
  },
  {
    title: "Moving with time",
    steps: [
      {
        id: "itime",
        title: "Animate with iTime",
        body: <>
          <p>
            <code>iTime</code> is the number of seconds since the animation started. Use it in your code and
            the picture changes as the animation plays.
          </p>
          <p>
            As <code>iTime</code> goes up, <code>sin(iTime)</code> goes smoothly up to 1, down to -1, and back,
            over and over. <code>mix</code> needs a number from 0 to 1, so the code halves it, giving -0.5 to
            0.5, and adds 0.5, giving 0 to 1. Using that as <code>t</code> makes the whole canvas fade from one
            colour to the other and back.
          </p>
          <p>Put it in the editor, build it, and press the play button under the canvas.</p>
        </>,
        code: shaders.PULSE,
        task: "Build code that uses iTime, then play it.",
        check: (now, atStart) => now.built && uses(now.builtCode, /\biTime\b/) && played(now, atStart),
      },
      {
        id: "waves",
        title: "Make waves",
        body: <>
          <p>
            In the last step every pixel had the same <code>t</code>, so the whole canvas changed colour
            together. This version also takes away <code>12.0 * uv.x</code> inside the <code>sin</code>, so
            pixels further to the right are a little behind. Each colour reaches them slightly later than the
            pixels to their left, so the colours look like waves moving across the canvas.
          </p>
          <p>
            Build it and play. Then try other numbers: <code>2.0</code> sets how fast the colours change, and{" "}
            <code>12.0</code> sets how many waves fit across.
          </p>
        </>,
        code: shaders.WAVES,
        task: "Build code that uses iTime and play it.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\biTime\b/) &&
          played(now, atStart),
      },
      {
        id: "shimmer",
        title: "A colour shimmer",
        body: <>
          <p>
            A cosine palette is a trick for getting a whole rainbow from one number, <code>t</code>. Red, green
            and blue each rise and fall with a cosine of <code>t</code>. The <code>vec3(0.0, 0.33, 0.67)</code>{" "}
            offsets them, so they peak at different times. As <code>t</code> goes up, the colour goes round
            the rainbow and back to where it started.
          </p>
          <p>
            Here <code>t</code> depends on the pixel's position and on <code>iTime</code>, so the colours drift
            across the canvas as it plays. Build it and play, then change the numbers in the{" "}
            <code>vec3</code> to get a different set of colours.
          </p>
        </>,
        code: shaders.SHIMMER,
        task: "Build a cosine palette that uses iTime.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\bcos\s*\(/) &&
          uses(now.builtCode, /\biTime\b/),
      },
      {
        id: "explore-time",
        title: "Explore",
        body: <>
          <p>The Minimal animation example is a cosine palette too. See how it differs from yours.</p>
          {EXPLORE}
        </>,
        examples: ["534226b1d5ed"],
      },
    ],
  },
  {
    title: "Shapes",
    steps: [
      {
        id: "centred",
        title: "Centred coordinates",
        body: <>
          <p>
            So far <code>uv</code> has started at (0, 0) in the bottom-left corner. For drawing shapes it's
            easier to have (0, 0) in the middle. This code moves it there, with y going from -1 at the bottom
            to 1 at the top. x uses the same scale, so on a wide canvas it goes past 1 at the sides, and circles
            stay round.
          </p>
          <p>
            Put this in the editor and build it. Red shows x and green shows y, so the top-right quarter is
            yellow, where both are positive. Negative numbers show as black, so the bottom-left quarter is
            black.
          </p>
        </>,
        code: shaders.CENTRED,
        task: "Build a shader that uses iResolution.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\biResolution\b/),
      },
      {
        id: "circle",
        title: "A circle",
        body: <>
          <p>
            <code>length(uv)</code> is how far the pixel is from the centre. Take away the radius and you get{" "}
            <code>d</code>, which is negative for pixels inside the circle, 0 on its edge, and positive outside.
            Most shaders draw shapes this way: they work out how far each pixel is from the shape's edge.
          </p>
          <p>
            <code>step(0.0, d)</code> turns <code>d</code> into 0 inside the circle and 1 outside, and{" "}
            <code>mix</code> uses that to choose the inside or outside colour. Build it, then change the
            radius.
          </p>
        </>,
        code: shaders.HARD_CIRCLE,
        task: "Build a shader that draws a circle with length().",
        check: now => now.built && uses(now.builtCode, /\blength\s*\(/),
      },
      {
        id: "soft-edge",
        title: "Soft edges",
        body: <>
          <p>
            Look closely and the circle's edge is jagged, because each pixel is either fully inside or fully
            outside. <code>smoothstep(a, b, d)</code> fixes that. It's 0 when <code>d</code> is below{" "}
            <code>a</code>, 1 when it's above <code>b</code>, and rises smoothly in between, so pixels right on
            the edge get a blend of the two colours. It's the function this app is named after.
          </p>
          <p>
            Build this, then change the <code>0.01</code>. A bigger number spreads the blend over a wider band,
            so the edge looks blurrier.
          </p>
        </>,
        code: shaders.SOFT_CIRCLE,
        task: "Build a shape with a smoothstep edge.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\bsmoothstep\s*\(/),
      },
      {
        id: "move-circle",
        title: "Move it",
        body: <>
          <p>
            To move the circle, measure the distance from a different point: <code>length(uv - centre)</code>.
            Here <code>centre</code> goes left and right with <code>sin(iTime)</code>, so the circle slides
            from side to side. Build it and play.
          </p>
        </>,
        code: shaders.MOVING_CIRCLE,
        task: "Build a circle that moves with iTime.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\biTime\b/) &&
          uses(now.builtCode, /\blength\s*\(/),
      },
      {
        id: "two-circles",
        title: "Two circles",
        body: <>
          <p>
            Now there are two circles, each with its own distance, and <code>min</code> picks the smaller of
            the two. A pixel inside either circle has a negative distance to it, so the smaller one is negative
            too, and the pixel gets the inside colour. Build it and play to watch them slide through each
            other.
          </p>
        </>,
        code: shaders.TWO_CIRCLES,
        task: "Build two shapes joined with min().",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\bmin\s*\(/),
      },
      {
        id: "explore-shapes",
        title: "Explore",
        body: <>
          <p>The Metaballs example blends circles so that they melt into each other as they meet.</p>
          {EXPLORE}
        </>,
        examples: ["3d6489cf0694"],
      },
    ],
  },
  {
    title: "The timeline",
    steps: [
      {
        id: "define-grow",
        title: "A number from the timeline",
        body: <>
          <p>
            The timeline lets you animate numbers by drawing, without writing any maths. It gives you 16
            numbers, <code>iFloat0</code> to <code>iFloat15</code>, each with its own row, and you can use them
            anywhere in your code.
          </p>
          <p>
            <code>#define grow iFloat0</code> gives the first one a name, <code>grow</code>, which makes the
            code easier to read. The timeline shows that name on its row. The circle's radius is{" "}
            <code>0.15 + 0.5 * grow</code>. Build this. <code>grow</code> is 0 until you change it, so the
            circle is small.
          </p>
        </>,
        code: shaders.TIMELINE_CIRCLE,
        task: "Build a shader that uses an iFloat.",
        check: now => now.built && floatsUsed(now.builtCode).length > 0,
      },
      {
        id: "slider",
        title: "Try it with a slider",
        body: <>
          <p>
            Before you animate a number, you can try out values by hand. Open the Sliders tab, or Sliders on a
            phone, and drag the <code>grow</code> slider. The circle changes size as you drag.
          </p>
          <p>
            The value you set is saved with your animation. To change a slider's range, click the number at
            either end and type a new one.
          </p>
        </>,
        task: "Set iFloat0 with its slider.",
        check: now => now.built && floatsUsed(now.builtCode).some(i => (now.variables[i]?.value ?? 0) !== 0),
      },
      {
        id: "transition",
        title: "Make a transition",
        body: <>
          <p>
            A transition changes a number from one value to another over a stretch of time. In the Animation
            tab, drag along the <code>grow</code> row to make one. On a phone, open Timeline and tap where it
            should start, then where it should end.
          </p>
          <p>
            The new transition is selected, and starts from the value you set with the slider. Set its end value
            to 1, or to 0 if it already starts at 1. Then press play and watch the circle change size.
          </p>
        </>,
        task: "Give iFloat0 a transition that changes its value, and play it.",
        check: (now, atStart) => now.built && animatedFloats(now).length > 0 && played(now, atStart),
      },
      {
        id: "transition-types",
        title: "Transition types",
        body: <>
          <p>A transition's type sets how the value gets from start to end:</p>
          <ul>
            <li><b>smoothstep</b> starts slowly, speeds up, then slows down at the end, like the function.</li>
            <li><b>linear</b> moves at the same speed the whole way.</li>
            <li><b>step</b> stays at the start value, then jumps to the end value halfway through.</li>
          </ul>
          <p>
            Try another type. Or add a second transition after the first, for example back to 0. Between
            transitions, the value stays where the last one ended.
          </p>
        </>,
        task: "Change a transition's type, or add a second one.",
        check: now => now.built && floatsUsed(now.builtCode).some(i => {
          const transitions = now.variables[i]?.transitions ?? [];
          return transitions.length >= 2 || transitions.some(t => t.type !== "smoothstep");
        }),
      },
      {
        id: "second-variable",
        title: "A second number",
        body: <>
          <p>
            This version also changes the circle's colour with a second number, <code>warmth</code>, which is{" "}
            <code>iFloat1</code>. At 0 the circle is cool blue, and at 1 it's warm orange. Build it, then give
            the <code>warmth</code> row a transition from 0 to 1.
          </p>
        </>,
        code: shaders.TWO_VARIABLES,
        task: "Animate two iFloats that your code uses.",
        check: now => now.built && animatedFloats(now).length >= 2,
      },
      {
        id: "duration",
        title: "Change the length",
        body: <>
          <p>
            A new animation is 12 seconds long. Type a new length in the box at the end of the play bar, or
            drag the end of the timeline.
          </p>
          <p>
            You can change the canvas's shape too. Move the pointer over the canvas, or tap it on a phone, and
            use the menu in its top-left corner. For example, 16:9 is the shape of a widescreen video.
          </p>
        </>,
        task: "Change the animation's length.",
        check: (now, atStart) => now.duration !== atStart.duration,
      },
      {
        id: "explore-timeline",
        title: "Explore",
        body: <>
          <p>
            In the Wobbling mirror ball example, the timeline sets how hard the ball is pulled out of shape,
            and which shape it's pulled into. Try moving its transitions.
          </p>
          {EXPLORE}
        </>,
        examples: ["c6e454d960df"],
      },
    ],
  },
  {
    title: "Patterns",
    steps: [
      {
        id: "tiles",
        title: "Tiles",
        body: <>
          <p>
            <code>fract</code> keeps only the part of a number after the decimal point: <code>fract(2.7)</code>{" "}
            is 0.7. So as you move across the canvas, <code>fract(3.0 * uv)</code> counts up from 0 to 1, then
            starts again from 0, over and over. That splits the canvas into tiles, each with its own
            coordinates, and the code draws a circle in the middle of each one.
          </p>
          <p>
            The shader still works out just one distance for each pixel, so a hundred circles are no slower to
            draw than one. Build it, and change the <code>3.0</code> to get bigger or smaller tiles.
          </p>
        </>,
        code: shaders.TILES,
        task: "Build code that repeats uv with fract or mod.",
        check: now => now.built && uses(now.builtCode, /\b(fract|mod)\s*\(/),
      },
      {
        id: "rotate",
        title: "Rotate",
        body: <>
          <p>
            To turn the whole pattern, turn <code>uv</code> before making the tiles. A <code>mat2</code> is a
            2 × 2 grid of numbers. Multiplying <code>uv</code> by this one, made from the cosine and sine of an
            angle, turns it by that angle around the centre. The angle grows with <code>iTime</code>, so the
            pattern slowly spins. Build it and play.
          </p>
        </>,
        code: shaders.ROTATED_TILES,
        task: "Build code that turns uv with a mat2.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\bmat2\b/),
      },
      {
        id: "polar",
        title: "Polar coordinates",
        body: <>
          <p>
            So far a position has been x and y: how far across and how far up. Polar coordinates describe it
            another way, by the angle around the centre and the distance out from it.{" "}
            <code>atan(uv.y, uv.x)</code> gives the angle, and <code>length(uv)</code> gives the distance.
          </p>
          <p>
            Make tiles from those instead of x and y, and the tiles curve round into rings. Build it, and try
            other numbers in <code>vec2(12.0, 3.0)</code>. The first sets how many tiles go round each ring,
            and the second sets how close together the rings are.
          </p>
        </>,
        code: shaders.POLAR_TILES,
        task: "Build code that uses atan().",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\batan\s*\(/),
      },
      {
        id: "explore-patterns",
        title: "Explore",
        body: <>
          <p>
            Truchet tiles gives each tile a random turn, and Kaleidoscope mirrors polar coordinates into
            segments.
          </p>
          {EXPLORE}
        </>,
        examples: ["bd2cdbfe233d", "d692b3fe2561"],
      },
    ],
  },
  {
    title: "Textures",
    steps: [
      {
        id: "texture",
        title: "Show an image",
        body: <>
          <p>
            A texture is an image your shader can read. <code>texture(iTexture0, uv)</code> looks up the colour
            of the image in slot <code>iTexture0</code> at the point <code>uv</code>, where 0 to 1 covers the
            whole image.
          </p>
          <p>
            Build this. The canvas is black, because the slot is empty, and empty slots are black. Open the
            Textures tab, click <code>iTexture0</code>, and choose a photo or add your own.
          </p>
        </>,
        code: shaders.TEXTURE,
        task: "Read a texture in your code, and choose an image for it.",
        check: now => now.built && textureChosen(now),
      },
      {
        id: "warp",
        title: "Warp it",
        body: <>
          <p>
            If you change <code>uv</code> before reading the texture, each pixel reads the image from a
            different spot, so the image moves. Here each row of pixels shifts left or right by a wave that
            moves over time, so the image wobbles. Build it and play, then try a bigger number than{" "}
            <code>0.02</code> for a stronger wobble.
          </p>
        </>,
        code: shaders.WARPED_TEXTURE,
        task: "Build code that changes uv before reading the texture.",
        check: (now, atStart) => rebuilt(now, atStart) && textureChosen(now) && uses(now.builtCode, /\bsin\s*\(/),
      },
      {
        id: "fold",
        title: "Fold it",
        body: <>
          <p>
            <code>abs</code> turns negative numbers positive: <code>abs(-0.3)</code> is 0.3.{" "}
            <code>uv - 0.5</code> goes from -0.5 to 0.5, with 0 in the middle of the canvas, so{" "}
            <code>abs(uv - 0.5)</code> is the same on both sides of the middle. Each half of the canvas shows
            the same part of the image, mirrored left to right and top to bottom, like a kaleidoscope. Build it
            and play.
          </p>
        </>,
        code: shaders.FOLDED_TEXTURE,
        task: "Build code that folds uv with abs().",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\babs\s*\(/),
      },
      {
        id: "explore-textures",
        title: "Explore",
        body: <>
          <p>
            Using textures warps a photo with sine waves, and Kaleidoscope folds a painting into turning
            segments.
          </p>
          {EXPLORE}
        </>,
        examples: ["b2482911f435", "d692b3fe2561"],
      },
    ],
  },
  {
    title: "Memory with iPrevFrame",
    steps: [
      {
        id: "fade",
        title: "The previous frame",
        body: <>
          <p>
            So far each frame has been drawn from scratch, with no idea what was drawn before.{" "}
            <code>iPrevFrame</code> changes that. It's the frame drawn just before this one, and you read it
            like the images in the last lesson.
          </p>
          <p>
            This shader reads the previous frame and makes it a little darker. Build it and play. The canvas
            stays black, because the first frame was black, so there's nothing to remember yet.
          </p>
        </>,
        code: shaders.FADE,
        task: "Build a shader that reads iPrevFrame, and play it.",
        check: (now, atStart) => now.built && uses(now.builtCode, /\biPrevFrame\b/) && played(now, atStart),
      },
      {
        id: "trail",
        title: "Leave a trail",
        body: <>
          <p>
            Now add a moving dot on top. Each frame keeps 97% of the brightness of the last one, so everywhere
            the dot has been fades out slowly, leaving a trail.
          </p>
          <p>
            Build it and play. Try <code>0.99</code> in place of <code>0.97</code> for a longer trail. How long
            the trail is depends on how many frames a second your computer draws, but exported videos use the
            frame rate you choose.
          </p>
        </>,
        code: shaders.TRAIL,
        task: "Build it with iPrevFrame, and play it.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\biPrevFrame\b/) &&
          played(now, atStart),
      },
      {
        id: "iframe",
        title: "The first frame",
        body: <>
          <p>
            <code>iFrame</code> counts the frames: 0 for the first one, then 1, 2, 3 and so on. It goes back to
            0 when you build, when the animation loops back to the start, and when you rewind.
          </p>
          <p>
            So the code inside <code>if (iFrame == 0)</code> only runs on the first frame, and you can use it
            to set up a starting picture. This one starts with a gradient, which fades away as the dot moves.
            It also clears the canvas each time the animation loops, so the trail from the end of one loop
            isn't still there at the start of the next.
          </p>
        </>,
        code: shaders.FIRST_FRAME,
        task: "Build code that uses iFrame.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\biFrame\b/),
      },
      {
        id: "explore-memory",
        title: "Explore",
        body: <>
          <p>
            Glowing trails draws many dots this way, and the Game of Life example works out each frame
            entirely from the last.
          </p>
          {EXPLORE}
        </>,
        examples: ["3156da0acaeb", "26d46785c1f6"],
      },
    ],
  },
  {
    title: "Buffers",
    steps: [
      {
        id: "add-buffer",
        title: "Add a buffer",
        body: <>
          <p>
            <code>iPrevFrame</code> remembers the last picture. Sometimes you want to remember something that
            isn't a picture, like how hot each spot is, or which way water is flowing. That's what buffers are
            for.
          </p>
          <p>
            A buffer is an extra shader with its own tab. Each frame it runs before the image, and what it draws
            is kept for the other tabs to read. Add one with the <span aria-label="add">⊕</span> button above
            the code. Its tab is called <code>iBuffer0</code>.
          </p>
        </>,
        task: "Add a buffer with the ⊕ above the code.",
        check: now => now.buffers.length > 0,
      },
      {
        id: "heat",
        title: "Store some heat",
        body: <>
          <p>
            Any tab can read what the buffer drew as <code>iBuffer0</code>, the same way you read a texture. That
            includes the buffer itself, so each frame it can carry on from its last one. This buffer keeps track
            of heat. Each frame it keeps 99% of the heat it had, and adds a little more under a moving dot.
          </p>
          <p>
            Build it. Nothing changes on the canvas yet, because the canvas only shows the Image tab, and the
            image doesn't read the buffer yet.
          </p>
        </>,
        tabs: [{tab: 0, code: shaders.HEAT_BUFFER}],
        task: "Build a buffer that reads iBuffer0.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(builtIn(now, 0), /\biBuffer0\b/),
      },
      {
        id: "heat-image",
        title: "Show the heat",
        body: <>
          <p>
            Now the image reads <code>iBuffer0</code> and turns the heat into colour: black where it's cold,
            then red, yellow, and white where it's hottest. Colours only go from 0 to 1, but a buffer can hold
            bigger numbers, so the heat can keep building up past 1. Build it and play.
          </p>
        </>,
        code: shaders.HEAT_IMAGE,
        task: "Build an image that reads iBuffer0, and play it.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\biBuffer0\b/) && played(now, atStart),
      },
      {
        id: "spread",
        title: "Let it spread",
        body: <>
          <p>
            Real heat spreads out. To copy that, each frame this buffer gives every pixel the average heat of
            itself and its four neighbours: above, below, left and right. Hot pixels share their heat with the
            cooler ones around them, so it spreads out as it cools.
          </p>
          <p>
            Updating every pixel from the last frame like this is how buffers simulate things like heat, smoke
            and water. Build it and play. Try <code>0.995</code> in place of <code>0.99</code> to make it cool
            down more slowly.
          </p>
        </>,
        tabs: [{tab: 0, code: shaders.SPREADING_HEAT_BUFFER}],
        task: "Change the buffer's code and build it.",
        check: (now, atStart) => rebuilt(now, atStart) && builtIn(now, 0) !== builtIn(atStart, 0) &&
          uses(builtIn(now, 0), /\biBuffer0\b/),
      },
      {
        id: "shared",
        title: "Share code between tabs",
        body: <>
          <p>
            Say you want the image to draw the dot too. Both tabs then need to know where the dot is. Rather
            than writing the same code twice, you can put it in the Shared tab, which appears to the left of the
            code tabs once you have a buffer. Functions, constants and <code>#define</code>s there can be used
            in every tab.
          </p>
          <p>
            This puts the dot's path in a function called <code>dotPosition</code> in the Shared tab. The
            buffer uses it to heat the dot, and the image uses it to draw a ring around the dot, so the two
            always line up. This step fills in three tabs, so build it and play.
          </p>
        </>,
        tabs: [
          {tab: "shared", code: shaders.DOT_SHARED},
          {tab: 0, code: shaders.SHARED_HEAT_BUFFER},
          {tab: "image", code: shaders.HEAT_IMAGE_WITH_DOT},
        ],
        task: "Build with dotPosition in the Shared tab, used by the image.",
        check: now => now.built && uses(now.builtShared, /\bdotPosition\b/) && uses(now.builtCode, /\bdotPosition\b/),
      },
      {
        id: "explore-buffers",
        title: "Explore",
        body: <>
          <p>
            Ink in water uses two buffers. <code>iBuffer0</code> moves the water, and <code>iBuffer1</code> carries
            the ink along with it. The Shared tab has the jets that both of them use.
          </p>
          {EXPLORE}
        </>,
        examples: ["5c81f0d3a7e2"],
      },
    ],
  },
  {
    title: "Share it",
    steps: [
      {
        id: "save",
        title: "Save your work",
        body: <>
          <p>
            Give your animation a name in the box at the top, then save it with File → Save, or{" "}
            <kbd>Ctrl</kbd> + <kbd>S</kbd> (<kbd>⌘</kbd> + <kbd>S</kbd> on a Mac). It's saved in this
            browser, and File → Open lists everything you've saved.
          </p>
          <p>
            To keep a copy elsewhere, use File → Download animation file. It holds the code, the timeline and the
            textures, and File → Open → "Open file…" opens it again.
          </p>
        </>,
      },
      {
        id: "share",
        title: "Send it to someone",
        body: <>
          <p>
            Click Share to send your animation to someone. The link it gives you holds the whole animation, so
            nothing is uploaded, and whoever opens it can play it and change their own copy. Share can also show
            the link as a QR code for a phone to scan.
          </p>
          <p>
            A link can't carry images you added yourself. If you used any, download the animation file, put it
            online, for example in a GitHub gist, and paste its address into Share to make a link that opens it.
            {" "}<Link href={DOCS_URL + "/sharing.md"}>Sharing animations</Link> in the docs has the steps.
          </p>
          <p>
            Share also gives you code to put the animation on your own web page, and a player file: a single
            web page that plays your animation, even offline.
          </p>
        </>,
      },
      {
        id: "export",
        title: "Export a video",
        body: <>
          <p>
            Export video makes an MP4 or WebM video, an animated GIF, or a zip of PNG frames. You choose the
            size and the frame rate, and every frame is drawn in full, however long it takes, so the video is
            smooth even when the shader plays slowly here.
          </p>
        </>,
      },
      {
        id: "keep-learning",
        title: "Keep learning",
        body: <>
          <p>
            The examples are a good next step: open one, read its code and change it. smoothstep works much
            like <Link href="https://www.shadertoy.com/">Shadertoy</Link>, so a lot of what's written for
            Shadertoy applies here too.
          </p>
          <ul>
            <li>
              <Link href="https://thebookofshaders.com/">The Book of Shaders</Link>, a gentle guide to shader
              programming.
            </li>
            <li>
              <Link href="https://www.youtube.com/watch?v=u5HAYVHsasc&list=PLGmrMu-IwbguU_nY2egTFmlg691DN7uE5">
                TheArtofCode's Shadertoy tutorials
              </Link>{" "}
              on YouTube.
            </li>
            <li>
              <Link href="https://code.mathforge.org/WebGL/fragment/help_smoothstep.html">
                Andrew Stacey's smoothstep tutorial
              </Link>.
            </li>
            <li>
              <Link href="https://www.shadertoy.com/browse">Shadertoy</Link>, to see how other people make things.
            </li>
          </ul>
          <p>
            Help → <HelpLink dialog="inputs">Shader inputs</HelpLink> lists everything your shader can use, and
            Help → <HelpLink dialog="shortcuts">Keyboard shortcuts</HelpLink> has the shortcuts.
          </p>
        </>,
        examples: EXAMPLES.filter(e => e.group === "showcase").map(e => e.id),
      },
    ],
  },
];

export function lessonTitle(index: number): string {
  return "Tutorial: " + (LESSONS[index]?.title ?? LESSONS[0]!.title);
}

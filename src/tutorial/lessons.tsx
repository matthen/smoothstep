// The in-app tutorial: lessons made of short steps, each with an optional check that notices when
// you've done it in the editor.
import type { ReactNode } from 'react';

import { openHelpDialog, type HelpDialog } from '../app/helpDialogs';
import { EMPTY_TEXTURE, type AspectRatio, type TextureSlot, type Variable } from '../lib/document';
import { DOCS_URL, EXAMPLES } from '../lib/config';
import * as shaders from './shaders';

// What a step's check can see of the editor.
export interface TutorialState {
  code: string;
  builtCode: string;
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

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function uses(code: string, pattern: RegExp): boolean {
  return pattern.test(stripComments(code));
}

function rebuilt(now: TutorialState, atStart: TutorialState): boolean {
  return now.built && now.builtCode !== atStart.builtCode;
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
            A shader is a small program that works out the colour of every pixel. Every smoothstep shader has
            a function called <code>mainImage</code>, which runs once for each pixel, in every frame.
          </p>
          <p>
            <code>fragCoord</code> is the pixel's position, in pixels, and whatever you put in{" "}
            <code>fragColor</code> is the colour it gets: red, green, blue and opacity, each from 0 to 1.
            Dividing by <code>iResolution</code>, the canvas size, gives <code>uv</code>, which runs from 0 to
            1 whatever the canvas size.
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
            A <code>vec3</code> holds three numbers, here the red, green and blue of a colour. Put this in the
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
            <code>mix(a, b, t)</code> blends from <code>a</code> to <code>b</code> as <code>t</code> goes from
            0 to 1. Blending by <code>uv.x</code> puts one colour on the left and the other on the right.
          </p>
          <p>Put this in the editor and build it, then pick your own two colours.</p>
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
            <code>iTime</code> is the time in seconds since the animation started, so anything that uses it
            changes as the animation plays.
          </p>
          <p>
            <code>sin</code> swings smoothly between -1 and 1, so <code>0.5 + 0.5 * sin(iTime)</code> swings
            between 0 and 1. This version blends between the two colours with it.
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
            Now the whole canvas changes at once. Subtract <code>uv.x</code> inside the <code>sin</code>, and
            each column swings a little later than the one to its left, so waves travel across.
          </p>
          <p>Build it, then try other numbers in place of the <code>2.0</code> and <code>12.0</code>.</p>
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
            A cosine palette gives a whole rainbow from one number. Red, green and blue each follow a cosine
            of <code>t</code>, a third of a turn apart, so as <code>t</code> changes the colour cycles.
          </p>
          <p>
            Here <code>t</code> drifts across the canvas and over time. Build it and play. Changing the{" "}
            <code>vec3(0.0, 0.33, 0.67)</code> gives a different palette.
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
            For shapes it helps to put (0, 0) in the middle of the canvas. Dividing by{" "}
            <code>iResolution.y</code> makes y run from -1 to 1, and keeps x in step with it, so circles stay
            round on any shape of canvas.
          </p>
          <p>Put this in the editor and build it. Red shows x and green shows y.</p>
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
            <code>length(uv)</code> is the distance from the centre, so <code>length(uv) - radius</code> is
            negative inside a circle and positive outside. That number, the distance to the edge, is how most
            shaders draw shapes.
          </p>
          <p>
            <code>step(0.0, d)</code> is 0 when <code>d</code> is below 0 and 1 above it, which picks the
            inside or outside colour. Build it, and change the radius.
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
            Look closely and the circle's edge is jagged. <code>smoothstep(a, b, d)</code> rises smoothly from
            0 to 1 as <code>d</code> goes from <code>a</code> to <code>b</code>. It's the function this app is
            named after.
          </p>
          <p>
            Build this, then change the <code>0.01</code>: bigger numbers give a softer, blurrier edge.
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
            Measuring the distance from another point moves the circle there. This one follows{" "}
            <code>sin(iTime)</code> from side to side. Build it and play.
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
            With two distances, <code>min</code> takes whichever is smaller, so a pixel is inside if it's in
            either circle. Build it and play to watch them pass through each other.
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
            The timeline lets you draw how numbers change instead of writing it as maths. It holds 16 of them,{" "}
            <code>iFloat0</code> to <code>iFloat15</code>, which you can use anywhere in your code.
          </p>
          <p>
            <code>#define grow iFloat0</code> gives the first one a name, which the timeline shows on its row, and the
            radius is{" "}
            <code>0.15 + 0.5 * grow</code>. Build this: until you animate it, <code>iFloat0</code> is 0, so
            the circle starts small.
          </p>
        </>,
        code: shaders.TIMELINE_CIRCLE,
        task: "Build a shader that uses an iFloat.",
        check: now => now.built && floatsUsed(now.builtCode).length > 0,
      },
      {
        id: "transition",
        title: "Make a transition",
        body: <>
          <p>
            In the Animation tab, drag along the <code>iFloat0</code> row to make a transition. On a phone, open
            Timeline and tap where it starts, then where it ends.
          </p>
          <p>The new transition is selected. Set its end value to 1, then play and watch the circle grow.</p>
        </>,
        task: "Give iFloat0 a transition that changes its value, and play it.",
        check: (now, atStart) => now.built && animatedFloats(now).length > 0 && played(now, atStart),
      },
      {
        id: "transition-types",
        title: "Transition types",
        body: <>
          <p>The transition menu sets how the value moves:</p>
          <ul>
            <li><b>smoothstep</b> eases in and out, like the function.</li>
            <li><b>linear</b> moves at a steady speed.</li>
            <li><b>step</b> jumps halfway through.</li>
          </ul>
          <p>
            Try another type, or add a second transition after the first, for example back to 0. A value
            holds still between transitions.
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
            This version takes the circle's colour from <code>iFloat1</code>, from cool blue at 0 to warm
            orange at 1. Build it, then give the <code>iFloat1</code> row a transition from 0 to 1.
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
            You can change the shape of the frame too. Point at the canvas and use the menu in its top-left
            corner, for example 16:9 for a widescreen video.
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
            In the Wobbling mirror ball example, <code>iFloat0</code> and <code>iFloat1</code> on the timeline
            pull the ball out of shape and choose its shape. Try moving its transitions.
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
            <code>fract</code> keeps the part of a number after the decimal point, so{" "}
            <code>fract(3.0 * uv)</code> runs from 0 to 1 over and over. Each tile gets its own coordinates,
            and its own circle.
          </p>
          <p>
            The shader still works out one distance for each pixel, so a hundred circles cost no more than
            one. Build it, and change the <code>3.0</code>.
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
            A <code>mat2</code> made of cosines and sines turns coordinates by an angle. Turn{" "}
            <code>uv</code> before tiling and the whole pattern turns. Build it and play.
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
            <code>atan(uv.y, uv.x)</code> is the angle around the centre and <code>length(uv)</code> the
            distance from it. Tile those instead of x and y, and the tiles become segments arranged in rings.
          </p>
          <p>Build it, and try other numbers in <code>vec2(12.0, 3.0)</code>.</p>
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
            Textures are images your shader can read. <code>texture(iTexture0, uv)</code> is the colour of the
            image in slot <code>iTexture0</code> at <code>uv</code>, where 0 to 1 covers the whole image.
          </p>
          <p>
            Build this. The canvas is black, because every slot starts out black. Open the Textures tab, click{" "}
            <code>iTexture0</code> and choose a photo, or add your own.
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
            Change <code>uv</code> before reading the texture and the image moves. Here each row shifts
            sideways by a wave. Build it and play, then try a bigger <code>0.02</code>.
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
            <code>abs</code> turns negative numbers positive, so <code>abs(uv - 0.5)</code> mirrors the canvas
            about its centre, left to right and top to bottom, like a kaleidoscope. Build it and play.
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
            So far each frame starts from scratch. <code>iPrevFrame</code> is the frame drawn just before this
            one, as a texture, so your shader can carry things over from one frame to the next.
          </p>
          <p>
            This reads it and makes it a little darker. Build it and play: it stays black, because there's
            nothing to remember yet.
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
            Now draw a moving dot on top. Each frame keeps most of the last one, so the dot leaves a trail that
            fades away.
          </p>
          <p>
            Build it and play. Try <code>0.99</code> in place of <code>0.97</code> for a longer trail. The
            trail's length depends on the frame rate, which here depends on your computer. Exported videos
            use the frame rate you choose.
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
            <code>iFrame</code> counts the frames since the animation started. It goes back to 0 when you
            build, when the animation loops, and when you go back to the start.
          </p>
          <p>
            Checking <code>iFrame == 0</code> lets a shader set up where it starts. This one starts from a
            gradient, which fades as the dot moves. Without it, the trail would carry over from one loop to the
            next.
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
            Share also gives you code that shows the animation playing on a web page, and a player file: one web
            page that plays it, which works offline.
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

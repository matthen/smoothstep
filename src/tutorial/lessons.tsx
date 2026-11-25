// The in-app tutorial: lessons made of short steps, each with an optional check that notices when
// you've done it in the editor.
import type { ReactNode } from 'react';

import { EMPTY_TEXTURE, type AspectRatio, type TextureSlot, type Variable } from '../lib/document';
import { EXAMPLES } from '../lib/config';
import { DOC_SECTIONS, openDocs, type DocTarget } from '../lib/docLinks';
import { stripComments, uses } from '../lib/glslCode';
import type { ShaderId } from '../render/Renderer';
import { GlslCode, JsCode } from '../editor/InlineCode';
import HighlightedCode from './HighlightedCode';
import * as shaders from './shaders';

// What a step's check can see of the editor.
export interface TutorialState {
  code: string;
  builtCode: string;
  // The shared.glsl tab's and each buffer's code, as in the editor and as last built.
  shared: string;
  buffers: string[];
  builtShared: string;
  builtBuffers: string[];
  // The Canvas2D layer's code, as in the editor and as last built, or null without a layer.
  canvas: string | null;
  builtCanvas: string | null;
  // The Canvas2D tab's "Draw over the image" switch.
  canvasOverlay: boolean;
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
  // For a challenge: shown only when asked for.
  hint?: ReactNode;
}

export interface Lesson {
  title: string;
  steps: Step[];
}

// The tabs the tutorial fills: the shaders' and the Canvas2D layer's, which it adds if needed.
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
  return tab === "image" ? state.code : tab === "shared" ? state.shared : tab === "canvas" ? state.canvas ?? undefined :
    state.buffers[tab];
}

// A tab's code as last built.
function builtIn(state: TutorialState, tab: ShaderId): string {
  return (tab === "image" ? state.builtCode : tab === "shared" ? state.builtShared :
    tab === "canvas" ? state.builtCanvas : state.builtBuffers[tab]) ?? "";
}

// Built again with a change in any tab.
function rebuilt(now: TutorialState, atStart: TutorialState): boolean {
  const all = (s: TutorialState) => [s.builtCode, s.builtShared, s.builtCanvas ?? "", ...s.builtBuffers].join("\0");
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

// Opens a page of the docs in the Docs tab.
function DocsLink({to, children}: {to: DocTarget; children: ReactNode}) {
  return <button type="button" className="linkButton" onClick={() => openDocs(to)}>{children}</button>;
}

// The lines of code a step is about, quoted in its text.
// A few lines of code quoted in a step's text, in GLSL unless `js`.
function Lines({children, js = false}: {children: string; js?: boolean}) {
  return <HighlightedCode code={children} javascript={js} className="learnLine" />;
}


// The iFloat rows the code reads that have a transition between different values.
function animatedFloats(now: TutorialState): number[] {
  return [...new Set(floatsUsed(now.builtCode))].filter(i =>
    now.variables[i]?.transitions.some(t => t.startValue !== t.endValue));
}

// A list inside a drawList's list: one that starts with a Rotate, Translate, Scale or Set, after another
// item or at the start of a list.
const NESTED_LIST = /(\)\s*,|\[)\s*\[\s*(Rotate|Translate|Scale|Set)\s*\(/;

// Canvas2D code whose fillText writes text made from the time.
function writesTime(code: string): boolean {
  // The first argument, skipping over commas inside strings.
  return uses(code, /\bfillText\s*\((?:"[^"]*"|'[^']*'|`[^`]*`|[^,"'`])*\btime\b/);
}

// A texture slot the code reads has an image in it.
function textureChosen(now: TutorialState): boolean {
  return [...stripComments(now.builtCode).matchAll(/\biTexture(\d)\b/g)].some(m => {
    const slot = now.textures[Number(m[1])];
    return slot !== undefined && (slot.isUserUploaded || slot.url !== EMPTY_TEXTURE);
  });
}

const EXPLORE = <p>Examples open in a new tab, so your animation stays here.</p>;

// A lesson's challenges: things to try on your own, with hints but no answers.
function challenges(lesson: string, list: ReactNode, hint: ReactNode): Step {
  return {
    id: "challenges-" + lesson,
    title: "Challenges",
    body: <>
      <p>Try these on your own, starting from the code you have now. There's no single right answer.</p>
      <ul>{list}</ul>
    </>,
    hint: <ul>{hint}</ul>,
  };
}

export const LESSONS: Lesson[] = [
  {
    title: "Colour from position",
    steps: [
      {
        id: "gradient",
        title: "A gradient",
        body: <>
          <p>
            A shader is a small program that works out the colour of every pixel on the canvas. In
            smoothstep.io it's a function called <GlslCode>mainImage</GlslCode>. Your computer runs it for every pixel at
            once, many times a second.
          </p>
          <p>
            <GlslCode>fragCoord</GlslCode> is where the pixel is, counted in pixels from the bottom-left corner.
            Whatever you put in <GlslCode>fragColor</GlslCode> is the colour that pixel gets. A colour is four numbers
            from 0 to 1: red, green, blue, and opacity, where 1 means solid.
          </p>
          <p>
            The canvas can be any size, so the code divides <GlslCode>fragCoord</GlslCode> by{" "}
            <GlslCode>iResolution</GlslCode>, the canvas's width and height. That gives <GlslCode>uv</GlslCode>, which goes
            from 0 at the left edge to 1 at the right, and from 0 at the bottom to 1 at the top. The colour
            uses <GlslCode>uv.x</GlslCode> for red and <GlslCode>uv.y</GlslCode> for green, so the canvas gets redder to the
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
            A <GlslCode>vec3</GlslCode> is a group of three numbers. Here it holds the red, green and blue of an orange
            colour. The code also makes the colour darker towards the bottom of the canvas. Put this in the
            editor and build it.
          </p>
          <p>
            Then click inside <GlslCode>vec3(0.95, 0.45, 0.25)</GlslCode> in the editor. A colour picker opens, and
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
          <p>This step adds a second colour, and blends the two with one new line:</p>
          <Lines>vec3 colour = mix(left, right, uv.x);</Lines>
          <p>
            <GlslCode>mix(a, b, t)</GlslCode> blends two colours. When <GlslCode>t</GlslCode> is 0 you get <GlslCode>a</GlslCode>, when
            it's 1 you get <GlslCode>b</GlslCode>, and at 0.5 you get half of each.
          </p>
          <p>
            Here <GlslCode>t</GlslCode> is <GlslCode>uv.x</GlslCode>, so the canvas fades from the <GlslCode>left</GlslCode> colour at
            the left edge to the <GlslCode>right</GlslCode> colour at the right edge. Put this in the editor and build
            it, then click in each <GlslCode>vec3</GlslCode> to pick your own two colours.
          </p>
        </>,
        code: shaders.TWO_COLOURS,
        task: "Build a shader that uses mix().",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\bmix\s*\(/),
      },
      challenges("colour", <>
        <li><b>Bottom to top.</b> Make the colours blend from the bottom of the canvas to the top.</li>
        <li><b>Sunset.</b> Make the canvas look like the sky at sunset.</li>
      </>, <>
        <li><b>Bottom to top:</b> <GlslCode>uv.x</GlslCode> goes from 0 to 1 left to right. Which number goes from 0 to 1 bottom to top?</li>
        <li><b>Sunset:</b> pick two colours with the colour picker, and blend them bottom to top.</li>
      </>),
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
            This step blends the two colours by a number <GlslCode>t</GlslCode> that changes with time, in place of{" "}
            <GlslCode>uv.x</GlslCode>:
          </p>
          <Lines>{`float t = 0.5 + 0.5 * sin(iTime);
vec3 colour = mix(left, right, t);`}</Lines>
          <p>
            <GlslCode>iTime</GlslCode> is the number of seconds since the animation started. As it goes up,{" "}
            <GlslCode>sin(iTime)</GlslCode> goes smoothly up to 1, down to -1, and back, over and over.{" "}
            <GlslCode>mix</GlslCode> needs a number from 0 to 1, so the code halves it, giving -0.5 to 0.5, and adds
            0.5, giving 0 to 1.
          </p>
          <p>
            Every pixel gets the same <GlslCode>t</GlslCode>, so the whole canvas fades from one colour to the other and
            back.
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
          <p>This step changes one line, the one that works out <GlslCode>t</GlslCode>:</p>
          <Lines>float t = 0.5 + 0.5 * sin(2.0 * iTime - 12.0 * uv.x);</Lines>
          <p>
            Before, <GlslCode>t</GlslCode> depended only on the time, so every pixel was the same colour. Now it also
            depends on <GlslCode>uv.x</GlslCode>, how far across the canvas the pixel is. So at any moment, pixels at
            different places across the canvas get different colours, which makes stripes. And because{" "}
            <GlslCode>t</GlslCode> still depends on <GlslCode>iTime</GlslCode>, the stripes slide along as the animation plays.
          </p>
          <p>
            Build it and play. Then try other numbers: <GlslCode>2.0</GlslCode> sets how fast the stripes move, and{" "}
            <GlslCode>12.0</GlslCode> sets how many fit across.
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
          <p>This step is a new shader. The line that matters works out the colour from a number <GlslCode>t</GlslCode>:</p>
          <Lines>vec3 colour = 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));</Lines>
          <p>
            This is a cosine palette, a trick for getting a whole rainbow from one number. Red, green and blue
            each rise and fall with a cosine of <GlslCode>t</GlslCode>, and the <GlslCode>vec3(0.0, 0.33, 0.67)</GlslCode>{" "}
            offsets them, so they peak at different times. Each time <GlslCode>t</GlslCode> goes up by 1, the colour
            goes round the rainbow and back to where it started.
          </p>
          <p>
            Here <GlslCode>t</GlslCode> depends on the pixel's position and on <GlslCode>iTime</GlslCode>, so the colours drift
            across the canvas as it plays. Build it and play, then change the numbers in the{" "}
            <GlslCode>vec3</GlslCode> to get a different set of colours.
          </p>
        </>,
        code: shaders.SHIMMER,
        task: "Build a cosine palette that uses iTime.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\bcos\s*\(/) &&
          uses(now.builtCode, /\biTime\b/),
      },
      challenges("time", <>
        <li>
          <b>A perfect loop.</b> Play to the end of the animation and watch it start again: the colours jump.
          Change the code so it loops smoothly, with no jump.
        </li>
        <li><b>Rising waves.</b> Go back to the waves, and make them move up the canvas instead of across.</li>
        <li><b>Your own palette.</b> Change the palette's numbers to make colours for the sea, a fire or a forest.</li>
      </>, <>
        <li>
          <b>A perfect loop:</b> <GlslCode>iDuration</GlslCode> is the animation's length in seconds, so{" "}
          <GlslCode>iTime / iDuration</GlslCode> goes from 0 to 1 over the whole animation. The palette comes back
          round each time <GlslCode>t</GlslCode> goes up by 1, and <GlslCode>sin</GlslCode> comes back round every 6.28318.
        </li>
        <li><b>Rising waves:</b> which part of the waves' code makes them depend on how far across a pixel is?</li>
        <li><b>Your own palette:</b> try numbers above 1 in the <GlslCode>vec3</GlslCode>, or put a smaller number in front of the cosine.</li>
      </>),
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
          <p>This step works out <GlslCode>uv</GlslCode> a new way:</p>
          <Lines>vec2 uv = (2.0 * fragCoord - iResolution.xy) / iResolution.y;</Lines>
          <p>
            So far <GlslCode>uv</GlslCode> has started at (0, 0) in the bottom-left corner. For drawing shapes it's
            easier to have (0, 0) in the middle. This line moves it there, with y going from -1 at the bottom
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
          <p>This step draws a circle. The key line works out a number <GlslCode>d</GlslCode> for each pixel:</p>
          <Lines>float d = length(uv) - radius;</Lines>
          <p>
            <GlslCode>length(uv)</GlslCode> is how far the pixel is from the centre. Take away the radius and you get{" "}
            <GlslCode>d</GlslCode>, which is negative for pixels inside the circle, 0 on its edge, and positive outside.
            Most shaders draw shapes this way: they work out how far each pixel is from the shape's edge.
          </p>
          <p>
            <GlslCode>step(0.0, d)</GlslCode> turns <GlslCode>d</GlslCode> into 0 inside the circle and 1 outside, and{" "}
            <GlslCode>mix</GlslCode> uses that to choose the inside or outside colour. Build it, then change the
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
          <p>This step changes <GlslCode>step(0.0, d)</GlslCode> to <GlslCode>smoothstep(0.0, 0.01, d)</GlslCode>.</p>
          <p>
            Look closely at the last step's circle and its edge is jagged, because each pixel is either fully
            inside or fully outside. <GlslCode>smoothstep(a, b, d)</GlslCode> fixes that. It's 0 when <GlslCode>d</GlslCode> is below{" "}
            <GlslCode>a</GlslCode>, 1 when it's above <GlslCode>b</GlslCode>, and rises smoothly in between, so pixels right on
            the edge get a blend of the two colours. It's the function this app is named after.
          </p>
          <p>
            Build this, then change the <GlslCode>0.01</GlslCode>. A bigger number spreads the blend over a wider band,
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
          <p>This step adds a centre point that moves, and measures the distance from it instead of from the middle:</p>
          <Lines>{`vec2 centre = vec2(0.6 * sin(iTime), 0.0);
float d = length(uv - centre) - radius;`}</Lines>
          <p>
            <GlslCode>sin(iTime)</GlslCode> swings between -1 and 1, so <GlslCode>centre</GlslCode> moves between -0.6 and 0.6
            across the canvas, and the circle slides from side to side with it. Build it and play.
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
          <p>This step has two moving centres, <GlslCode>a</GlslCode> and <GlslCode>b</GlslCode>, and works out <GlslCode>d</GlslCode> from both:</p>
          <Lines>float d = min(length(uv - a) - 0.4, length(uv - b) - 0.3);</Lines>
          <p>
            That's the distance to each circle, and <GlslCode>min</GlslCode> picks the smaller of the two. A pixel inside either circle has a negative distance to it, so the smaller one is negative
            too, and the pixel gets the inside colour. Build it and play to watch them slide through each
            other.
          </p>
        </>,
        code: shaders.TWO_CIRCLES,
        task: "Build two shapes joined with min().",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\bmin\s*\(/),
      },
      challenges("shapes", <>
        <li><b>A ring.</b> Draw a ring instead of a filled circle.</li>
        <li><b>An orbit.</b> Make one circle go round and round the middle of the canvas.</li>
        <li><b>A picture.</b> Draw a snowman, a face or a traffic light out of circles.</li>
      </>, <>
        <li>
          <b>A ring:</b> <GlslCode>length(uv) - radius</GlslCode> is 0 on the circle's edge, and{" "}
          <GlslCode>abs</GlslCode> of it is how far a pixel is from the edge, inside or out. What shape is close to
          the edge?
        </li>
        <li><b>An orbit:</b> a point at <GlslCode>vec2(cos(iTime), sin(iTime))</GlslCode> goes round in a circle.</li>
        <li><b>A picture:</b> <GlslCode>min</GlslCode> can join as many shapes as you like, and each can have its own colour.</li>
      </>),
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
            numbers, <GlslCode>iFloat0</GlslCode> to <GlslCode>iFloat15</GlslCode>, each with its own row, and you can use them
            anywhere in your code.
          </p>
          <p>This step's code uses the first one to set the circle's size:</p>
          <Lines>{`#define grow iFloat0
float radius = 0.15 + 0.5 * grow;`}</Lines>
          <p>
            <GlslCode>#define</GlslCode> gives <GlslCode>iFloat0</GlslCode> a name, <GlslCode>grow</GlslCode>, which makes the code
            easier to read, and the timeline shows that name on its row. Build this. <GlslCode>grow</GlslCode> is 0
            until you change it, so the circle is small.
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
            phone, and drag the <GlslCode>grow</GlslCode> slider. The circle changes size as you drag.
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
            A transition changes a number from one value to another over a stretch of time. In the Timeline
            tab, drag along the <GlslCode>grow</GlslCode> row to make one. On a phone, tap where it should start, then
            where it should end.
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
            <li><b>ease in</b> starts slowly and speeds up, like something falling.</li>
            <li><b>ease out</b> starts fast and slows to a stop, like something thrown that comes to rest.</li>
            <li><b>overshoot</b> goes a little past the end value, then settles back, like a spring.</li>
            <li><b>exponential</b> multiplies the value by the same amount each moment, so a zoom from 1 to 100
              looks steady, reaching 10 halfway. With a 0, or values either side of 0, it moves like linear.</li>
          </ul>
          <p>Each transition's block on the timeline draws its curve, so you can see the shape.</p>
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
          <p>This step adds a second number, <GlslCode>warmth</GlslCode>, and uses it for the circle's colour:</p>
          <Lines>{`#define warmth iFloat1
vec3 inside = mix(vec3(0.3, 0.55, 1.0), vec3(1.0, 0.6, 0.2), warmth);`}</Lines>
          <p>
            At 0 the circle is cool blue, and at 1 it's warm orange. Build it, then give the{" "}
            <GlslCode>warmth</GlslCode> row a transition from 0 to 1.
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
            A new animation is 12 seconds long. Type a new length in the duration box in the play bar, or
            drag the end of the timeline.
          </p>
          <p>
            You can change the canvas's shape too, with the menu at the very end of the play bar. For example,
            16:9 is the shape of a widescreen video.
          </p>
        </>,
        task: "Change the animation's length.",
        check: (now, atStart) => now.duration !== atStart.duration,
      },
      challenges("timeline", <>
        <li><b>Slide.</b> Add a third timeline number that slides the circle left and right, and animate it.</li>
        <li><b>A heartbeat.</b> Make the circle beat twice, rest, then beat twice again.</li>
      </>, <>
        <li>
          <b>Slide:</b> give <GlslCode>iFloat2</GlslCode> a name with <GlslCode>#define</GlslCode>, like <GlslCode>grow</GlslCode> and{" "}
          <GlslCode>warmth</GlslCode>. Then measure the distance from a point that moves with it, as in the Move it
          step of the Shapes lesson.
        </li>
        <li><b>A heartbeat:</b> put several short transitions one after another on the <GlslCode>grow</GlslCode> row.</li>
      </>),
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
          <p>This step splits the canvas into tiles with one new line:</p>
          <Lines>vec2 cell = fract(3.0 * uv) * 2.0 - 1.0;</Lines>
          <p>
            <GlslCode>fract</GlslCode> keeps only the part of a number after the decimal point: <GlslCode>fract(2.7)</GlslCode>{" "}
            is 0.7. So as you move across the canvas, <GlslCode>fract(3.0 * uv)</GlslCode> counts up from 0 to 1, then
            starts again from 0, over and over. That splits the canvas into tiles. The{" "}
            <GlslCode>* 2.0 - 1.0</GlslCode> turns each tile's 0 to 1 into -1 to 1, so (0, 0) is in the middle of
            every tile, and the circle code draws a circle there.
          </p>
          <p>
            The shader still works out just one distance for each pixel, so a hundred circles are no slower to
            draw than one. Build it, and change the <GlslCode>3.0</GlslCode> to get bigger or smaller tiles.
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
            This step adds two lines before the tiles, which turn <GlslCode>uv</GlslCode> and so turn the whole
            pattern:
          </p>
          <Lines>{`float angle = 0.3 * iTime;
uv = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * uv;`}</Lines>
          <p>
            A <GlslCode>mat2</GlslCode> is a 2 × 2 grid of numbers. Multiplying <GlslCode>uv</GlslCode> by this one, made from the cosine and sine of an
            angle, turns it by that angle around the centre. The angle grows with <GlslCode>iTime</GlslCode>, so the
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
          <p>This step makes the tiles from polar coordinates instead of x and y:</p>
          <Lines>{`vec2 polar = vec2(atan(uv.y, uv.x) / 6.28318, length(uv));
vec2 cell = fract(polar * vec2(12.0, 3.0)) * 2.0 - 1.0;`}</Lines>
          <p>
            So far a position has been x and y: how far across and how far up. Polar coordinates describe it
            another way, by the angle around the centre and the distance out from it.{" "}
            <GlslCode>atan(uv.y, uv.x)</GlslCode> gives the angle, and dividing by 6.28318 makes one whole turn add up
            to 1. <GlslCode>length(uv)</GlslCode> gives the distance.
          </p>
          <p>
            Tiles made from those curve round into rings. Build it, and try
            other numbers in <GlslCode>vec2(12.0, 3.0)</GlslCode>. The first sets how many tiles go round each ring,
            and the second sets how close together the rings are.
          </p>
        </>,
        code: shaders.POLAR_TILES,
        task: "Build code that uses atan().",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\batan\s*\(/),
      },
      challenges("patterns", <>
        <li><b>A checkerboard.</b> Give every other tile a different colour.</li>
        <li><b>A flower.</b> Make the pattern look like a flower.</li>
        <li><b>Your own pattern.</b> Mix tiles, turns and polar coordinates to make a pattern you like.</li>
      </>, <>
        <li>
          <b>A checkerboard:</b> <GlslCode>floor</GlslCode> keeps the part of a number before the decimal point, so it
          gives each tile its own whole numbers. Add a tile's two numbers together: next-door tiles
          take turns being odd and even. <GlslCode>mod(n, 2.0)</GlslCode> is 0 when <GlslCode>n</GlslCode> is even and 1
          when it's odd.
        </li>
        <li>
          <b>A flower:</b> a circle is everywhere closer to the centre than its radius. Make the radius change
          with the angle round the centre, like <GlslCode>0.5 + 0.2 * cos(5.0 * atan(uv.y, uv.x))</GlslCode>, and the circle
          gets petals.
        </li>
      </>),
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
          <p>This step is a new shader, and its one new line reads an image:</p>
          <Lines>fragColor = texture(iTexture0, uv);</Lines>
          <p>
            A texture is an image your shader can read. <GlslCode>texture(iTexture0, uv)</GlslCode> looks up the colour
            of the image in slot <GlslCode>iTexture0</GlslCode> at the point <GlslCode>uv</GlslCode>, where 0 to 1 covers the
            whole image.
          </p>
          <p>
            Build this. The canvas is black, because the slot is empty, and empty slots are black. Open the
            Textures tab, click <GlslCode>iTexture0</GlslCode>, and choose a photo or add your own.
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
          <p>This step adds one line before reading the texture:</p>
          <Lines>uv.x += 0.02 * sin(10.0 * uv.y + iTime);</Lines>
          <p>
            <GlslCode>+=</GlslCode> adds to <GlslCode>uv.x</GlslCode>, so each pixel reads the image from a spot a little to
            the left or right. The amount depends on <GlslCode>uv.y</GlslCode>, so each row shifts by a different
            amount, and on <GlslCode>iTime</GlslCode>, so it changes as the animation plays and the image wobbles.
          </p>
          <p>
            Build it and play, then try a bigger number than <GlslCode>0.02</GlslCode> for a stronger wobble.
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
            This step adds one line before the wave:
          </p>
          <Lines>uv = abs(uv - 0.5) * 2.0;</Lines>
          <p>
            <GlslCode>abs</GlslCode> turns negative numbers positive: <GlslCode>abs(-0.3)</GlslCode> is 0.3. And{" "}
            <GlslCode>uv - 0.5</GlslCode> is 0 in the middle of the canvas and negative to the left of it, so after{" "}
            <GlslCode>abs</GlslCode> the left half gets the same numbers as the right half. The same happens top to
            bottom, so the image is mirrored into each quarter of the canvas, like a kaleidoscope. Build it and
            play.
          </p>
        </>,
        code: shaders.FOLDED_TEXTURE,
        task: "Build code that folds uv with abs().",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\babs\s*\(/),
      },
      challenges("textures", <>
        <li><b>Black and white.</b> Show the image in black and white.</li>
        <li><b>Underwater.</b> Make the image look like you're seeing it from under water.</li>
      </>, <>
        <li>
          <b>Black and white:</b> a colour is grey when its red, green and blue are the same. Try averaging
          the three.
        </li>
        <li><b>Underwater:</b> wobble the image both ways, up and down as well as sideways, and tint it blue.</li>
      </>),
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
            <GlslCode>iPrevFrame</GlslCode> changes that. It's the frame drawn just before this one, and you read it
            like the images in the last lesson.
          </p>
          <p>This step is a new shader. Its main line reads the previous frame and makes it a little darker:</p>
          <Lines>vec3 colour = 0.97 * texture(iPrevFrame, uv).rgb;</Lines>
          <p>
            <GlslCode>.rgb</GlslCode> takes the red, green and blue, and multiplying by 0.97 makes them 3% darker.
            Build it and play. The canvas
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
            This step adds a block of code, under <GlslCode>// A dot moving in a loop</GlslCode>, that draws a dot on
            top of the faded frame. Each frame keeps 97% of the brightness of the last one, so everywhere the
            dot has been fades out slowly, leaving a trail.
          </p>
          <p>
            Build it and play. Try <GlslCode>0.99</GlslCode> in place of <GlslCode>0.97</GlslCode> for a longer trail. How long
            the trail is depends on how many frames a second your computer draws, but rendered videos use the
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
            <GlslCode>iFrame</GlslCode> counts the frames: 0 for the first one, then 1, 2, 3 and so on. It goes back to
            0 when you build, when the animation loops back to the start, and when you rewind.
          </p>
          <p>This step adds three lines before the dot:</p>
          <Lines>{`if (iFrame == 0) {
  colour = 0.5 * vec3(uv, 1.0);
}`}</Lines>
          <p>
            So the code inside <GlslCode>if (iFrame == 0)</GlslCode> only runs on the first frame, and you can use it
            to set up a starting picture. This one starts with a gradient, which fades away as the dot moves.
            It also clears the canvas each time the animation loops, so the trail from the end of one loop
            isn't still there at the start of the next.
          </p>
        </>,
        code: shaders.FIRST_FRAME,
        task: "Build code that uses iFrame.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\biFrame\b/),
      },
      challenges("memory", <>
        <li><b>Smoke.</b> Make the trail drift upwards, like smoke.</li>
        <li><b>A spiral.</b> Make the dot draw a spiral.</li>
      </>, <>
        <li>
          <b>Smoke:</b> each frame copies the last one from the same place. What if each pixel copied from a
          little below itself instead?
        </li>
        <li><b>A spiral:</b> make the dot go round, and get further from the centre as time goes on.</li>
      </>),
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
            <GlslCode>iPrevFrame</GlslCode> remembers the last picture. Sometimes you want to remember something that
            isn't a picture, like how hot each spot is, or which way water is flowing. That's what buffers are
            for.
          </p>
          <p>
            A buffer is an extra shader with its own tab. Each frame it runs before the image, and what it draws
            is kept for the other tabs to read. Click the <span aria-label="add">⊕</span> above the code and
            choose Add a buffer. Its tab is called <GlslCode>iBuffer0</GlslCode>.
          </p>
        </>,
        task: "Click the ⊕ above the code and choose Add a buffer.",
        check: now => now.buffers.length > 0,
      },
      {
        id: "heat",
        title: "Store some heat",
        body: <>
          <p>
            This step puts code in the <GlslCode>iBuffer0</GlslCode> tab. It keeps track of heat, and its first line
            reads the heat from the buffer's own last frame:
          </p>
          <Lines>float heat = 0.99 * texture(iBuffer0, uv).r;</Lines>
          <p>
            Any tab can read what the buffer drew as <GlslCode>iBuffer0</GlslCode>, the same way you read a texture,
            and that includes the buffer itself. <GlslCode>.r</GlslCode> takes just the first number, which is where
            the heat is kept. So each frame the buffer keeps 99% of the heat it had, then adds a little more
            under a moving dot.
          </p>
          <p>
            Build it. Nothing changes on the canvas yet, because the canvas only shows the Image.glsl tab, and the
            image doesn't read the buffer yet.
          </p>
        </>,
        tabs: [{tab: 0, code: shaders.HEAT_BUFFER}],
        task: "Build a buffer that reads iBuffer0.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(builtIn(now, 0), /\bheat\b/),
      },
      {
        id: "heat-image",
        title: "Show the heat",
        body: <>
          <p>
            This step's image code reads the heat from the buffer, with{" "}
            <GlslCode>float heat = texture(iBuffer0, uv).r;</GlslCode>, and turns it into colour: black where it's cold,
            then red, yellow, and white where it's hottest. Colours only go from 0 to 1, but a buffer can hold
            bigger numbers, so the heat can keep building up past 1. Build it and play.
          </p>
        </>,
        tabs: [{tab: 0, code: shaders.HEAT_BUFFER}, {tab: "image", code: shaders.HEAT_IMAGE}],
        task: "Build an image that reads iBuffer0, and play it.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\biBuffer0\b/) && played(now, atStart),
      },
      {
        id: "spread",
        title: "Let it spread",
        body: <>
          <p>
            This step changes how the buffer reads its last frame. Real heat spreads out, so instead of one
            reading, the buffer now takes five and averages them: the pixel itself and its four neighbours,
            above, below, left and right. Hot pixels share their heat with the
            cooler ones around them, so it spreads out as it cools.
          </p>
          <p>
            Updating every pixel from the last frame like this is how buffers simulate things like heat, smoke
            and water. Build it and play. Try <GlslCode>0.995</GlslCode> in place of <GlslCode>0.99</GlslCode> to make it cool
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
            than writing the same code twice, you can put it in a shared.glsl tab, which sits to the left of
            the shader tabs. The ⊕ adds one, and this step adds it for you. Functions, constants and <GlslCode>#define</GlslCode>s there can be
            used in every shader tab.
          </p>
          <p>
            This puts the dot's path in a function called <GlslCode>dotPosition</GlslCode> in the shared.glsl tab. The
            buffer uses it to heat the dot, and the image uses it to draw a ring around the dot, so the two
            always line up. This step fills in three tabs, so build it and play.
          </p>
        </>,
        tabs: [
          {tab: "shared", code: shaders.DOT_SHARED},
          {tab: 0, code: shaders.SHARED_HEAT_BUFFER},
          {tab: "image", code: shaders.HEAT_IMAGE_WITH_DOT},
        ],
        task: "Build with dotPosition in the shared.glsl tab, used by the image.",
        check: now => now.built && uses(now.builtShared, /\bdotPosition\b/) && uses(now.builtCode, /\bdotPosition\b/),
      },
      challenges("buffers", <>
        <li><b>Two dots.</b> Add a second dot that heats up the buffer too.</li>
        <li><b>Something else.</b> Change the colours so the heat looks like lava, ink, or a thermal camera.</li>
      </>, <>
        <li>
          <b>Two dots:</b> <GlslCode>dotPosition(iTime)</GlslCode> is where the dot is now, so{" "}
          <GlslCode>dotPosition(iTime + 3.0)</GlslCode> is where it will be in 3 seconds: another point on the same
          path.
        </li>
        <li><b>Something else:</b> the colours come from one line in the Image.glsl tab.</li>
      </>),
      {
        id: "explore-buffers",
        title: "Explore",
        body: <>
          <p>
            Ink in water uses two buffers. <GlslCode>iBuffer0</GlslCode> moves the water, and <GlslCode>iBuffer1</GlslCode> carries
            the ink along with it. The shared.glsl tab has the jets that both of them use.
          </p>
          {EXPLORE}
        </>,
        examples: ["5c81f0d3a7e2"],
      },
    ],
  },
  {
    title: "Draw with JavaScript",
    steps: [
      {
        id: "add-canvas",
        title: "Add the layer",
        body: <>
          <p>
            A shader works out the colour of each pixel on its own, so drawing text or a few simple shapes
            with one is fiddly: every pixel has to work out whether it's inside a letter. The Canvas2D layer
            is for that. It's code in JavaScript, the language of web
            pages, that draws on a canvas of its own, over the shader.
          </p>
          <p>
            Click the <span aria-label="add">⊕</span> above the code and choose Add the Canvas2D layer. A{" "}
            <code>Canvas2D.js</code> tab appears, first in the row of tabs, because it draws before the
            shaders. Build it with <kbd>Shift</kbd> + <kbd>Enter</kbd> and press play: the words "Hello, canvas"
            move up and down over the shader.
          </p>
          <p>
            The code has two functions. <JsCode>setup</JsCode> runs once at the start, before the first draw, and
            is for working things out before the drawing starts. Whatever it returns reaches{" "}
            <JsCode>draw</JsCode> as <JsCode>data</JsCode>: here it returns the message, and <JsCode>draw</JsCode> writes{" "}
            <JsCode>data.message</JsCode>. <JsCode>draw</JsCode> runs 60 times a second while the animation plays.{" "}
            <JsCode>ctx</JsCode> is what it draws with, and <JsCode>clear(ctx)</JsCode> rubs out the last drawing first.
          </p>
        </>,
        task: "Click the ⊕ above the code and choose Add the Canvas2D layer.",
        check: now => now.canvas !== null,
      },
      {
        id: "canvas-label",
        title: "Label something",
        body: <>
          <p>This step changes the line that writes the text:</p>
          <Lines js>{`ctx.fillText("Time: " + time.toFixed(1), 80, 160);`}</Lines>
          <p>
            <JsCode>fillText(text, x, y)</JsCode> writes text with its left end at <JsCode>x</JsCode> and its bottom
            at <JsCode>y</JsCode>. The text is now the time: <JsCode>time</JsCode> is the number of seconds since the
            animation started, like <GlslCode>iTime</GlslCode> in a shader. <JsCode>time.toFixed(1)</JsCode> turns it
            into text with one digit after the decimal point, like 2.4, and <JsCode>+</JsCode> joins that onto{" "}
            <JsCode>"Time: "</JsCode>.
          </p>
          <p>
            <JsCode>x</JsCode> and <JsCode>y</JsCode> are in canvas units. The canvas is always 1080 units tall, with{" "}
            <JsCode>y</JsCode> = 0 at the top, going down, so 160 is near the top. How wide it is depends on its
            shape: 1080 for a square canvas, and 1920 for a 16:9 one. The <code>80px</code> in{" "}
            <JsCode>ctx.font</JsCode> is in the same units, so the text is the same size in the preview and in a
            video.
          </p>
          <p>
            Put this in the editor, build it and play. Then try other numbers: <JsCode>80</JsCode> moves the text
            left and right, <JsCode>160</JsCode> moves it up and down, and <code>80px</code> sets how big it is.
          </p>
        </>,
        tabs: [{tab: "canvas", code: shaders.CANVAS_LABEL}],
        task: "Build Canvas2D code that writes the time with fillText.",
        check: (now, atStart) => rebuilt(now, atStart) && writesTime(builtIn(now, "canvas")),
      },
      {
        id: "canvas-shapes",
        title: "Shapes in shader coordinates",
        body: <>
          <p>This step adds a list of shapes after the text:</p>
          <Lines js>{`drawList(ctx, [
  Rotate({angle: time}),
  Set({fillStyle: "orange"}),
  Disk({center: [0, 0], radius: 0.5}),
  ...
]);`}</Lines>
          <p>
            <JsCode>drawList</JsCode> draws each thing in the list in turn. Its coordinates aren't canvas units:
            they're the same as the centred <GlslCode>uv</GlslCode> from the Shapes lesson. (0, 0) is the middle of the
            canvas, y goes up from -1 at the bottom to 1 at the top, and x uses the same scale. So{" "}
            <JsCode>{`Disk({center: [0, 0], radius: 0.5})`}</JsCode> is a circle reaching halfway to the top, just
            where a shader would draw one with <GlslCode>length(uv) - 0.5</GlslCode>.
          </p>
          <p>
            <JsCode>Set</JsCode> picks the colour for what comes after it, and <JsCode>Polygon</JsCode> fills the shape
            through a list of points, here a triangle. <JsCode>{`Rotate({angle: time})`}</JsCode> turns everything
            after it around the middle by <JsCode>time</JsCode> radians, so one whole turn takes about 6.3
            seconds. The orange disk is in the middle, so it looks the same however it's turned, but the
            small white disk goes round it and the triangle spins.
          </p>
          <p>
            Build it and play. Then try other numbers: the <JsCode>0.75</JsCode> in <JsCode>[0.75, 0]</JsCode> sets how
            far out the small disk goes round, and <JsCode>2 * time</JsCode> in place of <JsCode>time</JsCode> spins
            twice as fast.
          </p>
        </>,
        tabs: [{tab: "canvas", code: shaders.CANVAS_SHAPES}],
        task: "Build Canvas2D code that draws with drawList.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(builtIn(now, "canvas"), /\bdrawList\s*\(/),
      },
      {
        id: "canvas-nested",
        title: "Lists inside lists",
        body: <>
          <p>This step moves the small disk into a list of its own, inside the big list:</p>
          <Lines js>{`drawList(ctx, [
  Set({fillStyle: "orange"}),
  [
    Rotate({angle: time}),
    Translate({offset: [0.75, 0]}),
    Set({fillStyle: "white"}),
    Disk({center: [0, 0], radius: 0.1}),
    ...
  ],
  Polygon(...),
]);`}</Lines>
          <p>
            A <JsCode>Rotate</JsCode>, <JsCode>Translate</JsCode> or <JsCode>Set</JsCode> only lasts until the end of the
            list it's in. So now only the small disk turns. The triangle comes after the inner list, so it
            stands still, and it's orange, because the white was set inside the brackets. (This step leaves out
            the big orange disk, so you can see the triangle.)
          </p>
          <p>
            <JsCode>{`Translate({offset: [0.75, 0]})`}</JsCode> moves the starting point 0.75 to the right, so a disk at{" "}
            <JsCode>[0, 0]</JsCode> is drawn there. Because the <JsCode>Rotate</JsCode> comes first, that starting point
            goes round the middle. Inside it is one more list, with a tiny moon. Its{" "}
            <JsCode>{`Rotate({angle: 4 * time})`}</JsCode> turns around the small disk, because that's where the
            starting point is by then, so the moon circles the small disk four times as fast while the small
            disk circles the middle.
          </p>
          <p>
            Build it and play. Then try other numbers: <JsCode>0.2</JsCode> in the moon's{" "}
            <JsCode>[0.2, 0]</JsCode> sets how far it is from the small disk, and the <JsCode>4</JsCode> how fast it
            goes round. Move <JsCode>Polygon</JsCode> into the inner list and watch it follow the small disk.
          </p>
        </>,
        tabs: [{tab: "canvas", code: shaders.CANVAS_ORBIT}],
        task: "Build Canvas2D code with a list inside the drawList.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(builtIn(now, "canvas"), NESTED_LIST),
      },
      {
        id: "canvas-shader",
        title: "Shaders read the drawing",
        body: <>
          <p>
            Every shader can read the layer's drawing as a texture called <GlslCode>iCanvas2D</GlslCode>. This step's
            image shader reads it from a spot that wobbles:
          </p>
          <Lines>{`uv.x += 0.01 * sin(30.0 * uv.y - 4.0 * iTime);
vec4 drawing = texture(iCanvas2D, uv);`}</Lines>
          <p>
            As in the Warp it step of the Textures lesson, each row reads the drawing from a little to the left
            or right, by a wave that moves up the canvas as time goes on. Then{" "}
            <GlslCode>colour * (1.0 - drawing.a) + drawing.rgb</GlslCode> puts the drawing over a dark blue background:{" "}
            <GlslCode>drawing.a</GlslCode> is how solid the drawing is at that pixel. Bending a drawing pixel by pixel
            like this is easy in a shader, and hard with <JsCode>ctx</JsCode>.
          </p>
          <p>
            Put this in the editor, build it and play. The sharp drawing still shows on top, because the layer
            draws over the image. Open the <code>Canvas2D.js</code> tab and turn off Draw over the image, so
            only the shader's wobbly copy shows. Then try other numbers: <GlslCode>0.01</GlslCode> sets how far the
            wobble reaches, and <GlslCode>30.0</GlslCode> how close together the waves are.
          </p>
        </>,
        tabs: [{tab: "canvas", code: shaders.CANVAS_ORBIT}, {tab: "image", code: shaders.CANVAS_WOBBLE}],
        task: "Build an image that reads iCanvas2D, and turn off Draw over the image.",
        check: (now, atStart) => rebuilt(now, atStart) && uses(now.builtCode, /\biCanvas2D\b/) &&
          now.canvas !== null && !now.canvasOverlay,
      },
      challenges("canvas", <>
        <li><b>A clock.</b> Draw a clock face with a hand that goes round once a minute.</li>
        <li><b>A glowing name.</b> Write your name in big letters, and make it glow in the shader.</li>
        <li><b>A starfield.</b> Fill the canvas with stars that twinkle.</li>
        <li><b>Your own.</b> Mix text, shapes and a shader effect into something you like.</li>
      </>, <>
        <li>
          <b>A clock:</b> a <JsCode>Line</JsCode> from <JsCode>[0, 0]</JsCode> is a hand, and <JsCode>Rotate</JsCode> turns
          it. One whole turn is 6.28 radians, and <JsCode>Rotate</JsCode> turns anticlockwise, so think about the
          sign of the angle.
        </li>
        <li>
          <b>A glowing name:</b> read <GlslCode>iCanvas2D</GlslCode> at a few spots around each pixel and add them up,
          so the drawing spreads out softly. <JsCode>ctx.textAlign = "center"</JsCode> centres text on its{" "}
          <JsCode>x</JsCode>.
        </li>
        <li>
          <b>A starfield:</b> a <JsCode>for</JsCode> loop can draw many shapes. <JsCode>seededRandom(7)</JsCode> gives a
          function whose numbers come out the same every step, so each star stays in its place.
        </li>
      </>),
      {
        id: "explore-canvas",
        title: "Explore",
        body: <>
          <p>
            Hypocycloids draws circles rolling inside circles with <JsCode>drawList</JsCode>. Bean machine drops balls
            through pegs with planck.js, a physics library: a line at the top of the Canvas2D code,{" "}
            <JsCode>import planck from "planck";</JsCode>, loads it. Its image shader reads the drawing as{" "}
            <GlslCode>iCanvas2D</GlslCode>.
          </p>
          <p>
            <DocsLink to={DOC_SECTIONS.canvas2d}>The Canvas2D layer</DocsLink> in the docs has everything the layer
            can do.
          </p>
          {EXPLORE}
        </>,
        examples: ["96abdd1ee3d3", "7852e2820a47"],
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
            To keep a copy elsewhere, use File → Export. It downloads a file that holds the code, the timeline
            and the textures, and File → Import adds it to your animations again.
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
            {" "}<DocsLink to={DOC_SECTIONS.sharing}>Sharing animations</DocsLink> in the docs has the steps.
          </p>
          <p>
            Share also gives you code to put the animation on your own web page, and a player file: a single
            web page that plays your animation, even offline.
          </p>
        </>,
      },
      {
        id: "export",
        title: "Render a video",
        body: <>
          <p>
            Render makes an MP4 or WebM video, an animated GIF, or a zip of PNG frames. You choose the
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
            The examples are a good next step: open one, read its code and change it. smoothstep.io works much
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
            Help → <DocsLink to={DOC_SECTIONS.reference}>Shader inputs</DocsLink> lists everything your shader can use, and
            Help → <DocsLink to={DOC_SECTIONS.shortcuts}>Keyboard shortcuts</DocsLink> has the shortcuts.
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

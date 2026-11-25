// The guided tour of the screen, built on driver.js. Loaded on demand, with its styles.
import 'driver.js/dist/driver.css';
import './tour.scss';

import { driver, type DriveStep } from 'driver.js';

import { glslCodeHtml } from '../editor/highlight';
import { MOD_KEY } from './platform';

export interface TourOptions {
  phone: boolean;
  // Shows a pane before its step: the code, or a bottom panel tab.
  showPane(pane: "code" | "animation" | "sliders" | "textures"): void;
  onFinish(): void;
}

function welcome(): DriveStep {
  return {popover: {
    title: "Welcome to smoothstep.io",
    description: "You write a shader, animate its inputs on a timeline, and export the result as a video. " +
      "This tour shows you around in under a minute.",
    showButtons: ["next", "close"],
  }};
}

function finish(): DriveStep {
  return {popover: {
    title: "Over to you",
    description: "Try changing a number in the code and building it. Help → Tutorial teaches you step by " +
      "step. Help → Documentation opens the docs in a tab beside your code, and Help also has the shader " +
      "inputs, the keyboard shortcuts and this tour. File → Open has examples for ideas.",
  }};
}

function desktopSteps({showPane}: TourOptions): DriveStep[] {
  return [
    welcome(),
    {
      element: ".editorPane",
      onHighlightStarted: () => showPane("code"),
      popover: {
        title: "Your shader",
        description: "This is GLSL code. <code>mainImage</code> works out the colour of each pixel. " +
          "Press <kbd>Shift</kbd> + <kbd>Enter</kbd> to build your changes. Click a number, colour or " +
          "<code>vec2</code> in the code for a picker. The ⊕ above it adds a buffer (a shader that draws " +
          "before the image), the Canvas2D layer (JavaScript that draws text and shapes over the image) " +
          "or shared GLSL code (functions that every shader can use).",
        side: "right", align: "start",
      },
    },
    {
      element: "#canvasContainer",
      popover: {
        title: "The canvas",
        description: "Your shader runs here, live. Point at it to see its size and frame rate. Drag the " +
          "handle between the code and the canvas to give either more room.",
        side: "left",
      },
    },
    {
      element: ".playerButtons",
      popover: {
        title: "Play and scrub",
        description: "<kbd>Space</kbd> plays and pauses. On the right are the length in seconds, the " +
          "canvas's shape, and full screen. <code>iTime</code> in your code is the time in seconds.",
        side: "bottom",
      },
    },
    {
      element: ".bottomPanel",
      onHighlightStarted: () => showPane("animation"),
      popover: {
        title: "The timeline",
        description: "Each row is a number you can animate, <code>iFloat0</code> to <code>iFloat15</code>. " +
          "Click or drag in a row to add a transition, then set the values it moves between. Use them in " +
          "your code like any other number. A line like <code>#define size iFloat0</code> names the <code>iFloat0</code> row <code>size</code>. " +
          "<kbd>Ctrl</kbd> and scroll, or pinch, to zoom in.",
        side: "top",
      },
    },
    {
      element: ".bottomPanel",
      onHighlightStarted: () => showPane("sliders"),
      popover: {
        title: "Sliders",
        description: "A slider for each <code>iFloat</code> your code uses. Drag one to try out values while " +
          "you watch. One the timeline animates holds the value you set until you play.",
        side: "top",
      },
    },
    {
      element: ".bottomPanel",
      onHighlightStarted: () => showPane("textures"),
      popover: {
        title: "Textures",
        description: "Image slots, <code>iTexture0</code> to <code>iTexture7</code>. Click one to " +
          "choose a photo, noise, a tiling pattern, a font sheet or your own image, and ⊕ to add a slot.",
        side: "top",
      },
    },
    {
      element: ".headerActions",
      onHighlightStarted: () => showPane("animation"),
      popover: {
        title: "Save, share, render and help",
        description: `File saves your animation in this browser (<kbd>${MOD_KEY}</kbd> + <kbd>S</kbd>), and ` +
          "imports and exports animation files. Share gives you a link with the whole animation in it. " +
          "Render makes a WebM, MP4, GIF or PNG frames. Help has the tutorial, the docs, the shader " +
          "inputs and the keyboard shortcuts.",
        side: "bottom", align: "start",
      },
    },
    finish(),
  ];
}

function phoneSteps({showPane}: TourOptions): DriveStep[] {
  return [
    welcome(),
    {
      element: ".previewPane",
      popover: {
        title: "The canvas",
        description: "Your shader runs here, live. The player below plays it, scrubs through time, sets " +
          "the length and shape, and shows it full screen. <code>iTime</code> in your code is the time in seconds.",
        side: "bottom",
      },
    },
    {
      element: ".mobileTabs",
      onHighlightStarted: () => showPane("code"),
      popover: {
        title: "Code, timeline, sliders and textures",
        description: "Switch between your shader's code, the timeline that animates its inputs, sliders to " +
          "set them by hand, and the images it can use.",
        side: "bottom",
      },
    },
    {
      element: ".editorPane",
      onHighlightStarted: () => showPane("code"),
      popover: {
        title: "Your shader",
        description: "This is GLSL code. <code>mainImage</code> works out the colour of each pixel. " +
          "Tap Build after a change to see it. Tap a number or colour in the code for a picker. The ⊕ above " +
          "it adds a buffer (a shader that draws before the image), the Canvas2D layer (JavaScript that " +
          "draws text and shapes over the image) or shared GLSL code (functions that every shader can use).",
        side: "top",
      },
    },
    {
      element: ".bottomPanel",
      onHighlightStarted: () => showPane("animation"),
      popover: {
        title: "The timeline",
        description: "Each row is a number you can animate, <code>iFloat0</code> to <code>iFloat15</code>. " +
          "Tap where a transition starts, then where it ends, then set the values it moves between. " +
          "A line like <code>#define size iFloat0</code> in your code names the <code>iFloat0</code> row <code>size</code>. Pinch to zoom in.",
        side: "top",
      },
    },
    {
      element: ".headerActions",
      onHighlightStarted: () => showPane("code"),
      popover: {
        title: "File, share, render and help",
        description: "The File menu saves your animation in this browser, and imports and exports animation files. " +
          "Next to it are Share, which gives you a link with the whole animation in it, Render and Help.",
        side: "bottom", align: "end",
      },
    },
    finish(),
  ];
}

// The steps' <code> is all GLSL, coloured as in the editor. Its contents are HTML, so they're decoded first.
const decodeHtml = (html: string) => new DOMParser().parseFromString(html, "text/html").documentElement.textContent;
const highlightCode = (steps: DriveStep[]): DriveStep[] => steps.map(step => step.popover?.description ? {
  ...step,
  popover: {...step.popover, description: step.popover.description.replace(/<code>([^<]*)<\/code>/g,
    (_, c: string) => glslCodeHtml(decodeHtml(c)))},
} : step);

export function startTour(options: TourOptions) {
  const tour = driver({
    steps: highlightCode(options.phone ? phoneSteps(options) : desktopSteps(options)),
    showProgress: true,
    progressText: "{{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    popoverClass: "ssTour",
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 8,
    smoothScroll: true,
    onDestroyed: () => options.onFinish(),
  });
  tour.drive();
  return tour;
}

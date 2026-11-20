// The guided tour of the screen, built on driver.js. Loaded on demand, with its styles.
import 'driver.js/dist/driver.css';
import './tour.scss';

import { driver, type DriveStep } from 'driver.js';

import { MOD_KEY } from './platform';

export interface TourOptions {
  phone: boolean;
  // Shows a pane before its step: the code, or a bottom panel tab.
  showPane(pane: "code" | "animation" | "textures"): void;
  onFinish(): void;
}

function welcome(): DriveStep {
  return {popover: {
    title: "Welcome to smoothstep",
    description: "You write a shader, animate its inputs on a timeline, and export the result as a video. " +
      "This tour shows you around in under a minute.",
  }};
}

function finish(): DriveStep {
  return {popover: {
    title: "Over to you",
    description: "Try changing a number in the code and building it. Help → Tutorial teaches you step by " +
      "step, and Help also has the shader inputs, the keyboard shortcuts and this tour. File → Open has " +
      "examples for ideas.",
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
          "<code>vec2</code> in the code for a picker.",
        side: "right", align: "start",
      },
    },
    {
      element: "#canvasContainer",
      popover: {
        title: "The canvas",
        description: "Your shader runs here, live. Point at it to change the aspect ratio and see the frame " +
          "rate. The arrow beside it makes it wider.",
        side: "left",
      },
    },
    {
      element: ".playerButtons",
      popover: {
        title: "Play and scrub",
        description: "<kbd>Space</kbd> plays and pauses, and the box on the right is the length in seconds. " +
          "<code>iTime</code> in your code is the time in seconds.",
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
          "your code like any other number.",
        side: "top",
      },
    },
    {
      element: ".bottomPanel",
      onHighlightStarted: () => showPane("textures"),
      popover: {
        title: "Textures",
        description: "Eight image slots, <code>iTexture0</code> to <code>iTexture7</code>. Click one to " +
          "choose a photo, noise, a tiling pattern, a font sheet or your own image.",
        side: "top",
      },
    },
    {
      element: ".headerActions",
      onHighlightStarted: () => showPane("animation"),
      popover: {
        title: "Save, share, export and help",
        description: `File saves your animation in this browser (<kbd>${MOD_KEY}</kbd> + <kbd>S</kbd>) and ` +
          "downloads it as a file you can keep. Share gives you a link with the whole animation in it. " +
          "Export video makes a WebM, MP4, GIF or PNG frames. Help has the tutorial, the shader inputs and " +
          "the keyboard shortcuts.",
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
        description: "Your shader runs here, live. The player below plays it and scrubs through time. " +
          "<code>iTime</code> in your code is the time in seconds.",
        side: "bottom",
      },
    },
    {
      element: ".mobileTabs",
      onHighlightStarted: () => showPane("code"),
      popover: {
        title: "Code, timeline and textures",
        description: "Switch between your shader's code, the timeline that animates its inputs, and the " +
          "images it can use.",
        side: "bottom",
      },
    },
    {
      element: ".editorPane",
      onHighlightStarted: () => showPane("code"),
      popover: {
        title: "Your shader",
        description: "This is GLSL code. <code>mainImage</code> works out the colour of each pixel. " +
          "Tap Build after a change to see it. Tap a number or colour in the code for a picker.",
        side: "top",
      },
    },
    {
      element: ".bottomPanel",
      onHighlightStarted: () => showPane("animation"),
      popover: {
        title: "The timeline",
        description: "Each row is a number you can animate, <code>iFloat0</code> to <code>iFloat15</code>. " +
          "Tap where a transition starts, then where it ends, then set the values it moves between.",
        side: "top",
      },
    },
    {
      element: ".headerActions",
      onHighlightStarted: () => showPane("code"),
      popover: {
        title: "File, share, export and help",
        description: "The file menu saves your animation in this browser and downloads it as a file. " +
          "Next to it are Share, which gives you a link with the whole animation in it, Export video and Help.",
        side: "bottom", align: "end",
      },
    },
    finish(),
  ];
}

export function startTour(options: TourOptions) {
  const tour = driver({
    steps: options.phone ? phoneSteps(options) : desktopSteps(options),
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

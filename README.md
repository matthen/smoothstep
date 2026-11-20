<h1 align="center">
  <img src="public/images/logo.svg" width="48" height="48" alt=""><br>
  smoothstep
</h1>

<p align="center">
  Make animations in the WebGL shader language, right in your browser.<br>
  <b><a href="https://smoothstep.io">Open smoothstep.io</a></b> ·
  <a href="https://smoothstep.io/#tutorial">Tutorial</a> ·
  <a href="docs/">Documentation</a>
</p>

<p align="center">
  <a href="https://smoothstep.io"><img src="docs/images/screenshot.png" alt="smoothstep, with the 3D ray marching example: GLSL code on the left, the rendered sphere on the right, and the animation timeline below"></a>
</p>

smoothstep is a toolkit for making animations in the WebGL shader language. You write a
GLSL fragment shader, animate its inputs on a timeline, give it image textures, and export
the result as video. It all runs in your browser, with no server or sign-in.

I started smoothstep.io in 2021 as a closed-source hosted site, with accounts that kept your
animations on a server and let you share them with links. In November 2026 I rewrote it to run entirely in the browser, with no
server or accounts, and released it here as open source under the MIT licence. If you saved your
animations from the old site with "Download my data", open that zip with File → Open → "Open
file…".

You can use it at **[smoothstep.io](https://smoothstep.io)**, or run your own copy. To learn, start
the [tutorial](https://smoothstep.io/#tutorial): it runs in the app, beside the editor, and each step
notices when you've done it. The Help menu lists the shader inputs and the keyboard shortcuts, and the
[documentation](docs/) has those and the examples.

<p align="center">
  <img src="docs/images/examples.png" alt="Renders from four of the built-in examples">
  <br>
  <sub>Four of the built-in examples: domain-warped noise, a kaleidoscope of a painting, a
  ray-marched sphere, and Truchet tiles.</sub>
</p>

The editor highlights GLSL, shows compile errors on the line they occur, and gives you
inline pickers for colours, numbers and vectors. The timeline drives 16 animated variables,
`iFloat0` to `iFloat15`, each a sequence of step, linear or smoothstep transitions. You get 8
texture slots, `iTexture0` to `iTexture7`, which take built-in photos, noise, tiling textures
and font sheets, or your own images up to 4096px. smoothstep exports WebM, MP4, animated
GIFs and PNG frames, all made in your browser.

smoothstep keeps your animations and uploads in your browser's storage. You can download one
animation, or all of them as a zip, to back them up, move them to another computer or share
them, and open them again with File → Open → "Open file…".

## Running it

You need Node 24 (the version is in `.nvmrc`).

```bash
npm ci
npm run dev        # dev server on http://localhost:5173
npm run build      # type-checks, then builds the static site in dist/
npm run preview    # serves dist/
npm run lint
npm test           # unit tests
npm run test:e2e   # end-to-end tests in Chromium, against the build
```

`npm run build` makes a plain static site in `dist/`. You can put it on any static host,
such as GitHub Pages or Netlify, at any path. It works fully offline, including video export.
Saved animations open at `#anim/<id>`, the bundled examples at `#example/<id>`, and the tutorial at
`#tutorial` (or `#tutorial/<lesson>`), in a new animation.

## How it's built

smoothstep is a React 19 app in TypeScript, built with Vite. It uses Mantine for its interface,
Sass for the app's own styles, CodeMirror 6 for the code editor, and WebGL 2 for rendering.

- `src/app/` has `App.tsx`, which holds the open animation and lays out the page, the URL
  handling, the tour, the one-time tips (`tips.ts`), and the crash screen. If the app ever hits
  an error, the crash screen lets you download the animation you were editing and everything
  you've saved.
- `src/lib/` has the animation format and its checks (`document.ts`), the IndexedDB store
  for animations and uploaded images (`localStore.ts`), and file downloads and imports
  (`archive.ts`), in the formats described in [FILE_FORMATS.md](FILE_FORMATS.md).
- `src/render/` compiles and draws the shader, and maps compile errors back to lines of
  your code.
- `src/editor/` is the code editor, with GLSL highlighting, hints and the inline pickers.
  The pickers are adapted from [glslEditor](https://github.com/patriciogonzalezvivo/glslEditor).
- `src/timeline/` is the timeline and the play and seek bar.
- `src/dialogs/` has the welcome, Open, texture, export, help and other dialogs.
- `src/tutorial/` is the tutorial: its lessons and their checks (`lessons.tsx`), and the Learn panel
  that shows them beside the editor.
- `src/export/` renders an animation frame by frame and encodes it in the browser. WebM and
  MP4 use the browser's WebCodecs encoder through [Mediabunny](https://mediabunny.dev), GIF
  uses [gifenc](https://github.com/mattdesl/gifenc), and PNG frames download as a zip.

Everything in `public/` is copied into the build as it is. That includes the built-in
textures in `images/textures/` (credited in [CREDITS.md](public/images/textures/CREDITS.md))
and the example animations in `examples/`: each has its `.json`, a `.png` thumbnail and a short
`.mp4` preview for the example gallery. The list of examples, with their descriptions, is in
`src/lib/config.ts`.

`tools/` has the scripts that generate data. `buildTextures.py` makes the texture list and
thumbnails, `buildFonts.py` draws the font sheets, and `buildFunctions.py` makes the list of
GLSL built-ins the editor's hints show. `makeExamplePreviews.mjs` renders the examples' previews
and thumbnails with the app's own exporter. The end-to-end tests are in `e2e/`. They block every
request that isn't to your own machine, so they also check that the app works offline.

## Licence

The code is under the [MIT licence](LICENSE). The built-in textures and fonts keep their own
licences, listed in [CREDITS.md](public/images/textures/CREDITS.md).

smoothstep is made by [Matt Henderson](https://www.matthen.com/).

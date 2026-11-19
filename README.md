# smoothstep

A toolkit for making animations in the WebGL shader language. Write a GLSL fragment
shader, animate its inputs on a timeline, use image textures, and export the result as
video. It runs entirely in your browser: there's no server and no sign-in.

Use it at **[smoothstep.io](https://smoothstep.io)**, or run your own copy. The
[documentation and tutorial](https://docs.smoothstep.io) cover writing animations.

- **Shader editor** with GLSL highlighting, inline colour, number and vector pickers, and
  errors shown on the line they occur.
- **Timeline** with 16 animated variables (`iFloat0`–`iFloat15`), each a sequence of step,
  linear or smoothstep transitions.
- **Textures**: 8 slots (`iTexture0`–`iTexture7`), with built-in photos, noise, tiling
  textures and font sheets, or your own images (up to 4096px).
- **Export** as WebM, MP4, an animated GIF or PNG frames, all made in the browser.
- **Your work stays yours**: animations and uploads are saved in the browser (IndexedDB).
  Download one animation, or everything, as files to back up, move to another computer or
  share, and open them again with File → Open → "Open file…".

smoothstep was a hosted site with accounts from 2021 to 2026. Zips from its
"Download my data" open in this version.

## Running it

Needs Node 20.

```bash
npm install --legacy-peer-deps   # old peer ranges need the flag
npm start                        # dev server on http://localhost:3000
npm run build                    # production build in build/
npm run lint
```

`build/` is a plain static site that works from any path on any static host (GitHub Pages,
Netlify, an S3 bucket, a folder on your own server), or opened from a local web server such
as `python3 tools/serve.py 8000 build`. It works offline, except for MP4 export, which
downloads the ffmpeg core (about 31 MB) from unpkg the first time. Saved animations open at
`#anim/<id>`, and the bundled examples at `#example/<id>`.

The scripts set `NODE_OPTIONS=--openssl-legacy-provider`, because webpack 4 uses a hash
that Node 17+ disables. `.env` turns off source maps for production builds.

## How it's built

React 17 with create-react-app 4 (`react-scripts` 4.0.1), class components, react-bootstrap
1 / Bootstrap 4.5 and Sass.

- `src/App.js`: the app's state (code, timeline, textures, export) and the main layout:
  navbar, code editor, canvas and player, Animation/Textures tabs. It also handles saving,
  loading and export.
- `src/localStore.js`: animations and uploaded images in IndexedDB.
- `src/archive.js`: downloading and opening files; the formats are in
  [FILE_FORMATS.md](FILE_FORMATS.md).
- `src/components/`:
  - `Canvas.jsx` compiles and renders the shader with WebGL 2 and reports compile errors per line.
  - `CodeEditor.jsx` and `src/shaderMode.js` are the CodeMirror 5 editor and its GLSL mode.
  - `AnimationControls.jsx` is the timeline; `PlayerControls.jsx` is the play/seek bar.
  - `Textures.jsx` and `TexturePicker.jsx` handle the texture slots, built-in textures and uploads.
  - `ExportSettings.jsx` is the export dialog.
  - `DocumentBrowser.jsx` (File → Open) lists, opens, downloads and deletes saved
    animations, and opens files.
  - `Splash.jsx` is the welcome dialog with examples; `Acknowledgements.jsx` the credits.
- `src/glslEditor/`: the inline pickers, adapted from
  [glslEditor](https://github.com/patriciogonzalezvivo/glslEditor).
- `public/`: copied into the build as is:
  - `images/textures/`, the built-in textures (credits and licences in
    [CREDITS.md](public/images/textures/CREDITS.md));
  - `examples/`, the example animations;
  - `CCapture.js` and `gif.worker.js`, for recording and GIF encoding;
  - `ffmpeg/`, ffmpeg.wasm's browser files (see below).
- `tools/`: scripts for generating data and testing:
  - `buildTextures.py` makes `src/textures.json` and the thumbnails;
  - `buildFonts.py` draws the font sheets;
  - `buildFunctions.py` makes `src/glslFunctions.json`, the GLSL built-ins for the editor's hints;
  - `serve.py` serves a build;
  - `test_static.py` and `test_export.py` are Playwright end-to-end tests. Their usage is
    at the top of each file.

### MP4 export and `public/ffmpeg/`

MP4 export converts CCapture's WebM recording with ffmpeg.wasm 0.12, using the
single-threaded core, which doesn't need `SharedArrayBuffer` or COOP/COEP headers. Webpack 4
can't parse the `@ffmpeg/ffmpeg` package, so it's a devDependency, and its browser files are
copied into `public/ffmpeg/` with `npm run vendor-ffmpeg`. Rerun that after upgrading it.
Servers must send `ffmpeg/*.js` as JavaScript, because the worker is a module worker.

## Licence

The code is under the [MIT licence](LICENSE). The built-in textures and fonts keep their
own licences, listed in [CREDITS.md](public/images/textures/CREDITS.md).

Made by [Matt Henderson](https://twitter.com/matthen2).

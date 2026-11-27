# Code editor

This folder holds the code editor, built on CodeMirror 6. `CodeEditor.tsx` is the React component, and each code tab
gets its own. A hidden tab's editor stays mounted, so it keeps its undo history and scroll position. Everything the
editor adds to plain CodeMirror is a CodeMirror extension, and `editorExtensions` in `extensions.ts` puts them
together for a tab, so start reading there.

Shader tabs are GLSL. `glslLanguage.ts` tokenizes it, and `glslDefinitions.ts` reads enough of it to find where each
name is declared. Go to definition, find references, rename and showing an expression on the canvas all build on
that. The Canvas2D tab is JavaScript, and `javascript.ts` adds its support the first time a Canvas2D tab opens.

Clicking a value opens an inline picker, through `popups.ts`. The picker's edits carry the `pickerEdit` annotation,
and `CodeEditor` hands them to `onPickerEdit`. When it can, the app then shows each move on the canvas through a
uniform without building, as `src/render/README.md` describes. In that case the new code reaches the app once the
picker is let go, through `onPickerRelease`.

Some of this folder runs outside the editor. `highlight.ts` colours code with the editor's `tok-*` classes for the
docs, the tutorial and code quoted in the app. The docs build also reads `canvas2dReference.ts` to write the
Reference page. The docs build runs in Node, so the files it imports use `.ts` in their import paths.
`glslFunctions.json`, the help for GLSL's built-in functions, is made by `tools/buildFunctions.py`.

`CodeEditor.test.tsx` renders the editor in jsdom with Testing Library. Most other files have unit tests of their own.

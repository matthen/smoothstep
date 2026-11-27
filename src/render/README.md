# Rendering

This folder draws an animation's shaders. `Renderer.ts` is a plain WebGL 2 class with no React in it. It compiles
the image and buffer shaders, renders a frame from the inputs it's given, and copies the image to the canvas. The
players and the video exporter use `Renderer` directly. The app's `Canvas` component in `Canvas.tsx` owns a
`Renderer` and drives it through the `use*` hooks beside it.

In the app, `useRenderLoop` runs on every animation frame but draws only when something has asked for a draw. It
calls `renderFrame` from `useFrameAtPlayhead`, which reads the time from the timeline's `Playhead` and calls
`renderSteps` in `steps.ts`. When the animation has a Canvas2D layer, `useCanvasLayer` starts it, and `layerSteps.ts`
queues each step the shaders draw for the layer too, so the two stay on the same frame.

Some rules hold across files:

- A shader with state, one that reads buffers or `iPrevFrame`, moves on in fixed steps, 60 a second.
  `renderSteps` works out which steps are due, so a simulation runs at the same speed on any screen and in an export.
- `ProgramCache` in `programCache.ts` keeps linked programs by their source, so a build only compiles the shaders
  whose source changed.
- While a value picker in the editor is dragged, `Renderer.startPick` builds the code with that literal swapped for
  a uniform, using `pick.ts`. Each move then only sets the uniform, and `endPick` goes back to the code as last built.
- The canvas can show the value of an expression selected in the code in place of the image. `probe.ts` writes the
  shader that does this, `probeState.ts` tracks the request, and `useProbe` connects it to the app.

`render.test.ts` tests the parts of `Renderer.ts` that don't need WebGL, such as mapping compile errors back to
lines of the user's code.

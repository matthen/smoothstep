# Canvas2D layer

This folder runs an animation's Canvas2D layer, the JavaScript tab that draws with a 2D canvas context. The user's
code runs in a web worker inside a hidden, sandboxed iframe, where it can't reach the app's storage or the network.
The app sends the worker steps to draw and gets a frame back for each one, which the shaders read as `iCanvas2D`.

Start reading at `CanvasLayer.ts`. The app, the players and the video exporter each make a `CanvasLayer` and call
`configure` with the code, the canvas size and the texture slots. `prepare.ts` loads what the code needs, and
`workerSource.ts` joins the runtime, the drawing helpers, the imported libraries and the user's code into one script.
`sandbox.ts` starts a worker running it. The layer then sends the worker the steps it's given, in batches, and in the
worker `runtime.ts` calls the user's `setup` and `draw` and posts back each frame. A worker that has drawn can't go
back to frame 0, so `restart` starts a new one, and `CanvasLayer` keeps a spare worker waiting to make that quick.

Some rules hold across files:

- The worker gets `workerRuntime`, `makeHelpers`, `formatLogWithin` and the parts in `worker/` as source text,
  through `toString()`. So none of them may use anything from outside its own function body.
  `worker/parts.test.ts` checks this by running each part from its source text.
- `runtime.ts` calls `lockdown` before any library or user code runs. It keeps the originals of what the runtime
  calls, such as `postMessage` and the timers, and removes what user code mustn't have, such as `Worker`.
- The worker runs user code, so `CanvasLayer` passes every message it gets through `checkFromWorker` in
  `messages.ts`, which drops anything that isn't a well-formed `FromWorker` message.
- `worker/deterministic.ts` repeats `Math.random` and sets the clocks to the animation's time, so each run draws the
  same frames.

`CanvasLayer.test.ts` starts workers through a `FakeHost`, which records what each worker is sent and lets the test answer for it.
`runtime.test.ts` runs the real worker script in a Node `vm` context with a fake clock.

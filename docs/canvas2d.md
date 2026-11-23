# The Canvas2D layer

A shader is good at working out a colour for every pixel. It's harder to write text, draw a few
lines, or run a physics simulation in one. The Canvas2D layer is for those: JavaScript that draws on a
2D canvas, once a step, with the browser's
[canvas drawing commands](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D).

An animation can have one Canvas2D layer. Its drawing goes over the image, and every shader can also
read it as a texture, `iCanvas2D`.

## Adding one

Click the ⊕ above the code and choose **Add the Canvas2D layer**. A **Canvas2D** tab, marked JS,
appears first in the code tabs, set apart from the shader tabs by a divider: Canvas2D | iBuffer0 › …
› Image. It draws first too, so every shader reads this step's drawing.

The new layer has some starter code that writes "Hello, canvas" and turns a pentagon. Build with
<kbd>Shift</kbd> + <kbd>Enter</kbd> after a change, as you would for a shader.

The editor helps as it does for shaders. Click a drawing helper like `Disk`, an input like `time`, or
a `ctx` method or property like `fillText` to see what it does, with a link to its page on MDN for
`ctx`'s. Click a number for a slider, or a colour string like `"#ffcc00"` or `"rgb(255, 128, 0)"`
for a colour picker. **Help → Shader inputs** lists the inputs, helpers and libraries.

## setup and draw

The code has two functions:

```js
// Runs once after each build, before the first draw. Optional.
function setup({width, height, duration, floats, textures}) {
  return {sides: 5};
}

// Runs once per step.
function draw(ctx, {time, frame, duration, width, height, floats, textures, data}) {
  clear(ctx);
  ctx.fillText("Time: " + time.toFixed(1), 60, 110);
}
```

`setup` runs again whenever the layer restarts. Whatever it returns is passed to `draw` as `data`.

`draw` gets the canvas's drawing context, `ctx`, and these values:

| name | what it is |
|---|---|
| `time` | The time of this step, in seconds, the same as `iTime`. |
| `frame` | The step number, the same as `iFrame`. |
| `duration` | The length of the animation, in seconds. |
| `width`, `height` | The canvas's size, in canvas units (see below). |
| `floats` | An array of the 16 timeline values at this time, `floats[0]` being `iFloat0`. |
| `textures` | The 8 texture slots, ready for `ctx.drawImage`, or `null` for an empty slot. |
| `data` | Whatever `setup` returned. |

### Steps

`draw` runs 60 times a second while the animation plays, on the same clock as buffers. It follows
the same rules as `iFrame`: the steps start again at 0 when you build, when the animation loops, or
when it goes back to the start. Dragging along the timeline doesn't step it. When you render a
video, it runs from frame 0, every step in order, so the video matches what you saw.

Variables declared outside the two functions keep their values from one step to the next, so the
layer can remember things, like a buffer can:

```js
let count = 0;

function setup() {
  count = 0;
}

function draw(ctx, {time}) {
  count++;
}
```

Set them up again in `setup`, so they start fresh each time the layer restarts.

`Math.random()` gives the same numbers each run, so an animation plays the same way every time.
`Date.now()` and `performance.now()` give the step's time, not the time of day.

## Canvas units

The canvas is always 1080 units tall, and as wide as the aspect ratio makes it: 1920 for 16:9.
The origin is at the top left, and y goes down, as usual for a canvas. A size like `48px` is in
these units, so text and lines look the same in the small preview and in a 4K render.

Each `draw` starts with the font set to `48px Inter`, white fill and stroke, and a line width of 2.

## Clearing and trails

The canvas keeps what's drawn on it between steps. To start each step with an empty canvas, clear
it at the top of `draw`:

```js
clear(ctx);           // Clear to transparent, so the image shows through.
clear(ctx, "black");  // Clear to a colour.
```

Leave out `clear` and every step draws over the last, so a moving dot leaves a trail. For trails
that fade away, rub out a little of the canvas each step:

```js
function draw(ctx, {time, width, height}) {
  ctx.globalCompositeOperation = "destination-out";  // Draws transparency.
  ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(width / 2 + 400 * Math.cos(time), height / 2 + 300 * Math.sin(2 * time), 20, 0, 2 * Math.PI);
  ctx.fill();
}
```

## Fonts

Text can use the same fonts as the font textures: Inter, Arimo, Exo 2, Tinos and Courier Prime.
Set the font the way you would for any canvas, with an optional weight:

```js
ctx.font = "600 64px Inter";
ctx.font = "40px Courier Prime";
ctx.textAlign = "center";
ctx.fillText("Hello", width / 2, height / 2);
```

The fonts are part of smoothstep.io, so they work offline and in player files.

## Textures

`textures` holds the images in the 8 texture slots, so you can draw them on the canvas:

```js
function draw(ctx, {width, height, textures}) {
  if (textures[0]) {
    ctx.drawImage(textures[0], 0, 0, width, height);
  }
}
```

## drawList

Working in canvas units is fine for text, but for shapes it's often easier to think the way a
shader does. `drawList` draws a list of shapes in coordinates like a shader's uv: the origin is in
the middle of the canvas, y goes up from -1 at the bottom to 1 at the top, and x is on the same
scale.

```js
function draw(ctx, {time}) {
  clear(ctx);
  drawList(ctx, [
    Set({fillStyle: "orange"}),
    Disk({center: [0, 0], radius: 0.3}),
    [
      Set({strokeStyle: "white"}),
      AbsoluteLineWidth(6),
      Rotate({angle: time}),
      Line({pts: [[-0.8, 0], [0.8, 0]]}),
    ],
    Text({at: [0, -0.6], text: "drawList", align: "center"}),
  ]);
}
```

A list can hold commands and other lists. Styles and transforms in a list only last until the end
of that list, so above, the white line and its rotation don't affect the text after it.

`drawList(ctx, list, view)` takes an optional third argument to show a different part of the plane:
`{xmin, xmax, ymin, ymax}`. It fits the view on the canvas without stretching it, so circles stay
round. With `{xmin: 0, xmax: 10, ymin: 0, ymax: 10}`, the square from (0, 0) to (10, 10) is made as
big as fits, in the middle of the canvas.

### Commands

| command | what it draws or does |
|---|---|
| `Set({...})` | Sets any of the context's properties, like `fillStyle`, `strokeStyle`, `lineWidth`, `font`, `globalAlpha`, or `lineDash` (an array). |
| `Disk({center, radius})` | A filled circle. `fill: false, edge: true` draws its outline. `startAngle`, `endAngle` draw an arc, and `sector: true` joins its ends to the centre. `radiusInPixels: true` gives the radius in canvas units. |
| `Polygon({pts})` | A filled shape through the points, like `[[0, 0], [1, 0], [0, 1]]`. `edge: true` draws its outline, `fill: false` leaves it empty. |
| `Line({pts})` | A line through the points. `closed: true` joins the last point to the first. |
| `Text({at, text})` | Text at a point, in the current font. It stays upright and the same size whatever the list's scale. `align` and `baseline` place it. `edge: true` outlines it. |
| `Rotate({angle, center})` | Turns what follows anticlockwise by `angle` radians, about `center` (the origin if left out). |
| `Translate({offset})` | Moves what follows by `offset`, like `[0.5, 0]`. |
| `Scale({scale, center})` | Makes what follows bigger or smaller. `scaleX` and `scaleY` scale one direction. |
| `AbsoluteLineWidth(units)` | Sets the line width in canvas units, whatever the scale. Lines in a `drawList` start 2 units wide. |

A `lineWidth` set with `Set` is in the list's own coordinates, so `Set({lineWidth: 0.01})` is a
hundredth of the way up the frame. A plain function, `ctx => { ... }`, also works as a command, for
anything the commands don't cover.

`drawList` comes from [Matt Henderson](https://www.matthen.com/)'s library for drawing nested
lists of shapes.

### Other helpers

- `clear(ctx)` or `clear(ctx, colour)` clears the canvas.
- `seededRandom(seed)` gives a function that returns numbers from 0 to 1, the same ones each time
  for the same seed: `const random = seededRandom(7);` then `random()`.

`Set` is the drawing command. `new Set()` is still JavaScript's own Set.

## iCanvas2D and "Draw over the image"

The **Draw over the image** switch on the Canvas2D tab is on for a new layer. The canvas's drawing
then goes over the image, wherever it isn't transparent.

Either way, every shader can read the drawing as `iCanvas2D`, like a texture:

```glsl
vec4 c = texture(iCanvas2D, fragCoord / iResolution.xy);
```

It's the right way up for shaders, with (0, 0) at the bottom left like the other textures. Its
colours are premultiplied by alpha, so to put it over a colour yourself, write:

```glsl
col = col * (1.0 - c.a) + c.rgb;
```

Turn the switch off to use the drawing only through `iCanvas2D`. For example, draw text on the canvas
and have the image shader ripple it, or have a buffer use the drawing as the walls of a simulation.

For an animation that's only 2D drawing, keep the switch on and have the image shader draw black:

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
```

## Libraries

The Canvas2D layer has four libraries built in. Ask for one with an `import` line at the top of the
code:

```js
import planck from "planck";
import Matter from "matter-js";
import {createNoise2D} from "simplex-noise";
import {Delaunay} from "d3-delaunay";
```

| library | for | licence |
|---|---|---|
| [planck.js](https://piqnt.com/planck.js/) | 2D physics (a JavaScript Box2D) | MIT |
| [matter.js](https://brm.io/matter-js/) | 2D physics | MIT |
| [simplex-noise](https://github.com/jwagner/simplex-noise.js) | Smooth noise in 2D, 3D and 4D | MIT |
| [d3-delaunay](https://github.com/d3/d3-delaunay) | Delaunay triangulations and Voronoi diagrams | ISC |

Each import goes on one line. You can import the whole library (`import planck from "planck"` or
`import * as planck from "planck"`) or names from it (`import {Delaunay} from "d3-delaunay"`).
Other libraries can't be imported. The libraries are part of smoothstep.io, so they work offline.

This example drops a ball onto the floor with planck.js. The world is made in `setup`, so it starts
again each time the animation does:

```js
import planck from "planck";

let world, ball;

function setup() {
  world = new planck.World({gravity: new planck.Vec2(0, -10)});
  const ground = world.createBody();
  ground.createFixture(new planck.Edge(new planck.Vec2(-1.5, -0.9), new planck.Vec2(1.5, -0.9)));
  ball = world.createDynamicBody(new planck.Vec2(0, 0.8));
  ball.createFixture(new planck.Circle(0.1), {density: 1, restitution: 0.7});
}

function draw(ctx) {
  world.step(1 / 60);  // One step is a 60th of a second.
  const p = ball.getPosition();
  clear(ctx);
  drawList(ctx, [
    Line({pts: [[-1.5, -0.9], [1.5, -0.9]]}),
    Disk({center: [p.x, p.y], radius: 0.1}),
  ]);
}
```

The physics world uses the same coordinates as `drawList`, so drawing it is easy.

## Errors

Errors show under the line they're on, the way shader errors do. While there's an error, the layer
keeps the last frame that drew without one.

Slow code is fine: the animation plays more slowly while each step draws, and a render waits for
every step. Once a step has taken more than a second, "Drawing step 42…" shows over the canvas until
it's done. The page keeps working while the code runs, even a loop that never ends, and building
again stops it straight away.

The canvas is always the animation's size, so setting `ctx.canvas.width` or `height` is an error.

## Safety

The Canvas2D code runs in a sandbox, apart from the rest of the page. It can't see the page, your
saved animations or anything else in your browser, and it can't use the network or start workers of
its own. Timers (`setTimeout` and `setInterval`) only run while the animation plays, so they don't
keep working when it's paused. So it's safe to open an animation someone else made.

## Sharing

The Canvas2D layer is saved with the animation, and goes with it in share links, gists, exported
files and player files. Players on other websites run it too, and a downloaded player file includes
the libraries and fonts it uses, so it still works offline.

## Tips

- Use `floats` to animate your drawing from the timeline, the same way shaders use `iFloat0`.
- `ctx.measureText(text).width` tells you how wide some text is, to centre or box it.
- `ctx.globalCompositeOperation = "lighter"` adds colours together, for glowing overlapping shapes.
- A simulation should move on by the same amount each step, like `world.step(1 / 60)`, rather than
  by the time that's passed. Then it runs the same in the preview and in a render.

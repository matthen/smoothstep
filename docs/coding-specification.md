# Coding Specification

This is also in the app, under Help → Documentation. Help → Shader inputs lists the inputs in a table.

Every smoothstep.io animation must define a `mainImage` function with the following signature:

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = vec4(1.0, 0.0, 0.0, 1.0);
}
```

(This is the same as [Shadertoy](https://www.shadertoy.com/) shaders.)

`fragCoord` is the pixel's position, from (0, 0) at the bottom left to `iResolution` at the top
right. Set `fragColor` to its colour, with red, green and blue from 0 to 1. The image's alpha is
always set to 1.

If a tab's code has no `mainImage`, its error shows the one a new tab starts with, and **Insert a
mainImage function** adds it after your code and builds.

You write GLSL ES 3.00, the WebGL2 shader language. smoothstep.io adds `#version 300 es`,
`precision highp float;` and the input uniforms below before your code, so you don't write them
yourself.

## Input Uniforms

Animations may also use any of the following input variables (*uniforms*):

| variable | description |
|---|---|
| `float iTime`  |  The time into the animation, in seconds. |
| `float iDuration`  |  The length of the animation, in seconds. |
| `vec2 iResolution`  |  The size of the frame in pixels. (Shadertoy's `iResolution` is a `vec3`.) |
| `int iFrame`  |  The frame number, counting from 0 at 60 a second. See below for when it restarts. |
| `sampler2D iPrevFrame`  |  The frame drawn just before this one. |
| `sampler2D iTexture0` ... `iTexture7`  | The 8 images set in the *Textures* tab. |
| `float iFloat0` ... `iFloat15`  | The 16 numbers set on the timeline or with sliders. |
| `sampler2D iBuffer0` ... `iBuffer3`  | What each buffer drew most recently, when the animation has buffers. |
| `sampler2D iCanvas2D`  | What the Canvas2D layer drew this step, with premultiplied alpha. Transparent when there's no Canvas2D layer. |

On a high-DPI screen, such as a phone's, the preview draws up to twice as many pixels across as it
takes up, so it's sharp, and `iResolution` is that bigger size. If the animation can't keep up at
that size, the preview drops back to one pixel per screen pixel until the next build. Hover over
or tap the preview to see its size. A render draws at the size you choose.

## Textures

`texture(iTexture0, uv)` reads a texture's colour at `uv`, which runs from 0 to 1 across the
image with (0, 0) at the bottom left. `fragCoord / iResolution` fills the frame with it. Textures
repeat outside 0 to 1.

## iPrevFrame and iFrame

`iPrevFrame` is a texture like the others, so you can read the last frame and build on it, for
trails or simulations. It starts black, and is cleared each time you build, the canvas changes size
or a texture changes. `iFrame` goes back to 0 then too, and when the animation loops or goes back to
the start, so `if (iFrame == 0)` is the place to set things up. While it plays, `iPrevFrame`,
`iFrame` and the buffers move on 60 times a second, whatever the screen's refresh rate or the export's frame rate, so
a simulation runs at the same speed everywhere.

## Buffers and shared code

The ⊕ above the code adds a buffer, the Canvas2D layer or shared GLSL code. A buffer is another shader, with its own `mainImage`, that draws
before the image each frame. Every tab can read what a buffer drew as `iBuffer0`, `iBuffer1` and
so on, up to `iBuffer3`. The tabs go in the order they draw, so a buffer reading an earlier buffer
gets this frame's picture, and a buffer reading itself or a later one gets the last frame's. That's
how a buffer can run a simulation, with one buffer feeding the next.

On almost every device, buffers hold floating-point numbers, not just colours from 0 to 1, so they can store positions,
velocities or anything else, in all four channels. Reading between pixels blends them. Buffers start
at zero and clear when `iPrevFrame` does. A buffer that nothing reads isn't drawn.

To share code between them, choose **Add shared GLSL code** from the ⊕. Functions, constants and
`#define`s in its tab, shared.glsl, can be used in every shader tab: the image and each buffer. Its × removes it.

The [Ink in water](https://smoothstep.io/#example/5c81f0d3a7e2) example uses two buffers: one
for the water's flow, and one for the ink it carries.

## The Canvas2D layer

The Canvas2D layer is JavaScript that draws on a 2D canvas each step, with text, shapes and built-in
libraries for physics and noise. Its tab comes first, set apart from the shader tabs by a divider,
and it draws before the buffers and the image.
Its drawing goes over the image, and every shader can read it as `iCanvas2D`, with (0, 0) at the
bottom left like the other textures. Its colours are premultiplied by alpha, so
`col = col * (1.0 - c.a) + c.rgb` puts it over a colour. [The Canvas2D layer](canvas2d.md) has the
details.

## Checking values

To see what a part of your code works out, select it in a shader tab and click **Show on canvas**
under the selection, or press `Alt + Enter`. It can be a name like `d`, a part like `uv.x`, or a
calculation like `length(p) - r`. With nothing selected, `Alt + Enter` shows the name at the cursor.
The canvas then shows that value at every pixel, at the current time, in place of the image:

| type | shown as |
|---|---|
| `float`, `int`, `bool` | grey, from black at 0 to white at 1 |
| `vec2` | red and green |
| `vec3` | red, green and blue |
| `vec4` | red, green and blue, over a checkerboard where alpha is below 1 |

Values below 0 show as 0, and values above 1 as 1. Choose **-1 to 1** in the bar above the canvas
to show -1 as black and 1 as full colour instead. A value in a buffer's tab shows that buffer's
value, and one in shared.glsl shows in the image, or in the first buffer that calls its function,
directly or through other functions there. Showing a buffer that the image doesn't read starts the
simulation again from frame 0, so the buffer is set up as usual. The value is the one from just before its line runs, so
in `p = abs(p) - 0.5;`, `abs(p)` uses `p` from before the line. A variable that the line declares or
sets shows its new value. Pixels where the code never runs, such as inside an `if` that's false
there, are striped. If it runs more than once for a pixel, as in a loop, the canvas shows the last
value.

The selected code is marked with a dashed line. It stays on the canvas as you edit and build, until
you click the × in the bar above the canvas, or press `Alt + Enter` on it again. While you drag a
picker, the canvas shows the image until you let go. Your code, your saved animation and anything
you render stay as they are.

The pixel inspector shows the numbers. Click its button at the top left of the canvas, then point
at the canvas, or touch it on a touch screen. It shows the pixel's colour from 0 to 1 and as a hex
code, its `fragCoord`, and its `uv`, which is `fragCoord / iResolution`. While the canvas shows a value
from your code, the inspector shows that value itself, beyond 0 to 1 too.

## Coming from Shadertoy

Shadertoy's other inputs, such as `iChannel0`, `iMouse` and `iDate`, don't exist in smoothstep.
Use `iTexture0` and the other texture slots in place of `iChannel0`, and `iBuffer0` to `iBuffer3`
for buffers. Code in the shared.glsl tab can be used in every shader tab.

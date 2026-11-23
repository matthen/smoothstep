# Coding Specification

This is also in the app, under Help → Shader inputs.

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

The ⊕ button above the code adds a buffer: another shader, with its own `mainImage`, that draws
before the image each frame. Every tab can read what a buffer drew as `iBuffer0`, `iBuffer1` and
so on, up to `iBuffer3`. The tabs go in the order they draw, so a buffer reading an earlier buffer
gets this frame's picture, and a buffer reading itself or a later one gets the last frame's. That's
how a buffer can run a simulation, with one buffer feeding the next.

On almost every device, buffers hold floating-point numbers, not just colours from 0 to 1, so they can store positions,
velocities or anything else, in all four channels. Reading between pixels blends them. Buffers start
at zero and clear when `iPrevFrame` does. A buffer that nothing reads isn't drawn.

Once an animation has a buffer, a **Shared** tab appears. Functions, constants and `#define`s in it
can be used in every tab: the image and each buffer.

The [Ink in water](https://smoothstep.io/app/#example/5c81f0d3a7e2) example uses two buffers: one
for the water's flow, and one for the ink it carries.

## Coming from Shadertoy

Shadertoy's other inputs, such as `iChannel0`, `iMouse` and `iDate`, don't exist in smoothstep.
Use `iTexture0` and the other texture slots in place of `iChannel0`, and `iBuffer0` to `iBuffer3`
for buffers. Code in the Shared tab can be used in every tab.

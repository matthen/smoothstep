# Coding Specification

This is also in the app, under Help → Shader inputs.

Every smoothstep animation must define a `mainImage` function with the following signature:

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = vec4(1.0, 0.0, 0.0, 1.0);
}
```

(This is the same as [Shadertoy](https://www.shadertoy.com/) shaders.)

`fragCoord` is the pixel's position, from (0, 0) at the bottom left to `iResolution` at the top
right. Set `fragColor` to its colour, with red, green and blue from 0 to 1. The alpha is always set
to 1.

You write GLSL ES 3.00, the WebGL2 shader language. smoothstep adds `#version 300 es`,
`precision highp float;` and the input uniforms below before your code, so you don't write them
yourself.

## Input Uniforms

Animations may also use any of the following input variables (*uniforms*):

| variable | description |
|---|---|
| `float iTime`  |  The time into the animation, in seconds. |
| `float iDuration`  |  The length of the animation, in seconds. |
| `vec2 iResolution`  |  The size of the frame in pixels. (Shadertoy's `iResolution` is a `vec3`.) |
| `int iFrame`  |  The frame number, counting from 0. See below for when it restarts. |
| `sampler2D iPrevFrame`  |  The frame drawn just before this one. |
| `sampler2D iTexture0` ... `iTexture7`  | The 8 images set in the *Textures* tab. |
| `float iFloat0` ... `iFloat15`  | The 16 numbers animated on the timeline. |

## Textures

`texture(iTexture0, uv)` reads a texture's colour at `uv`, which runs from 0 to 1 across the
image with (0, 0) at the bottom left. `fragCoord / iResolution` fills the frame with it. Textures
repeat outside 0 to 1.

## iPrevFrame and iFrame

`iPrevFrame` is a texture like the others, so you can read the last frame and build on it, for
trails or simulations. It starts black, and is cleared each time you build, the canvas changes size
or a texture changes. `iFrame` goes back to 0 then too, and when the animation loops or goes back to
the start, so `if (iFrame == 0)` is the place to set things up.

## Coming from Shadertoy

Shadertoy's other inputs, such as `iChannel0`, `iMouse` and `iDate`, don't exist in smoothstep.
Use `iTexture0` and the other texture slots in place of `iChannel0`.

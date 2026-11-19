# Coding Specification

Every smoothstep animation must define a `mainImage` function with the following signature:

```glsl
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor.rgb = vec3(1., 0., 0.);
}
```

(This is the same as [Shadertoy](https://www.shadertoy.com/) shaders.)

You write GLSL ES 3.00, the WebGL2 shader language. smoothstep adds `#version 300 es`,
`precision highp float;` and the input uniforms below before your code, so you don't write them
yourself. The output's alpha is always set to 1.

## Input Uniforms

Animations may also use any of the following input variables (*uniforms*):

| variable | description |
|---|---|
| `int iFrame`  |  The index of the current frame. It goes back to 0 at the start of the animation, at every loop, and when the code is rebuilt. |
| `float iTime`  |  The time into the animation that the current frame is being rendered at, in seconds. |
| `sampler2D iPrevFrame`  |  The contents of the previously rendered frame. |
| `vec2 iResolution`  |  The resolution of the frame being rendered in pixels. (Shadertoy's `iResolution` is a `vec3`.) |
| `float iDuration`  |   The total duration of the animation in seconds. |
| `sampler2D iTexture0` ... `iTexture7`  | The contents of the 8 textures, set in the *Textures* tab. Textures repeat outside 0 to 1. |
| `float iFloat0` ... `iFloat15`  | The values of the 16 animated parameters, controlled by the animation timeline.  |

Shadertoy's other inputs, such as `iChannel0`, `iMouse` and `iDate`, don't exist in smoothstep.
Use `iTexture0` and the other texture slots in place of `iChannel0`.

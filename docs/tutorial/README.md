# Tutorial

The tutorial is part of the app. **[Start it at smoothstep.io/app/#tutorial](https://smoothstep.io/app/#tutorial)**, or
choose Help → Tutorial. It opens a new animation with the lessons beside the editor, and each step
notices when you've done it.

1. [Colour from position](https://smoothstep.io/app/#tutorial/1): a gradient from each pixel's position, and the colour picker.
2. [Moving with time](https://smoothstep.io/app/#tutorial/2): `iTime`, waves and a cosine-palette shimmer.
3. [Shapes](https://smoothstep.io/app/#tutorial/3): centred coordinates, circles from distances, and `smoothstep` edges.
4. [The timeline](https://smoothstep.io/app/#tutorial/4): animating `iFloat0` and `iFloat1`, transition types, and the length.
5. [Patterns](https://smoothstep.io/app/#tutorial/5): tiling with `fract`, rotation, and polar coordinates.
6. [Textures](https://smoothstep.io/app/#tutorial/6): showing, warping and folding an image.
7. [Memory with iPrevFrame](https://smoothstep.io/app/#tutorial/7): trails that fade, and setting up the first frame with `iFrame`.
8. [Buffers](https://smoothstep.io/app/#tutorial/8): a heat map that a moving dot paints into a buffer, spreading it out, and the Shared tab.
9. [Share it](https://smoothstep.io/app/#tutorial/9): saving, sharing a link, downloading and exporting video, and where to learn more.

Each lesson builds one animation a step at a time. Most end with challenges to try on your own,
with hints but no answers, and a related example to explore.

The lessons are in [`src/tutorial/lessons.tsx`](../../src/tutorial/lessons.tsx), and their shaders in
[`src/tutorial/shaders.ts`](../../src/tutorial/shaders.ts).

## Shaders

Animations in smoothstep.io are fragment shaders, written in the WebGL 2 shader language (GLSL). A
shader works out the colour of every pixel of each frame in parallel, from the pixel's position and
inputs like `iTime`. Your computer can run it on its graphics card, so animations play fast, and
you can always export them at any frame rate, even ones that don't play in real time.

As you learn GLSL, click a function like `smoothstep` or an input like `iTime` in the editor to see
what it does.

## Shadertoy

smoothstep.io is partly modelled on [Shadertoy](https://www.shadertoy.com/), with extra features for
making animations. Much of what's written about Shadertoy applies here, and a lot of Shadertoy code
runs in smoothstep.io with little or no change. [TheArtofCode's Shadertoy
tutorials](https://www.youtube.com/watch?v=u5HAYVHsasc&list=PLGmrMu-IwbguU_nY2egTFmlg691DN7uE5) on
YouTube are a good place to start.

# smoothstep documentation

You make animations in smoothstep by writing a fragment shader in the WebGL shader language
(GLSL). A timeline lets you animate the shader's inputs visually, and you can give it the
built-in textures or add your own images. When it's ready, you export it as video at any
frame rate and resolution. It all runs in your browser at [smoothstep.io](https://smoothstep.io).

[Start the tutorial](https://smoothstep.io/app/#tutorial), which runs in the app beside the editor, or
[open smoothstep.io](https://smoothstep.io).

## Contents

- [Tutorial](tutorial/README.md), in the app at [smoothstep.io/app/#tutorial](https://smoothstep.io/app/#tutorial)
  1. [Colour from position](https://smoothstep.io/app/#tutorial/1)
  2. [Moving with time](https://smoothstep.io/app/#tutorial/2)
  3. [Shapes](https://smoothstep.io/app/#tutorial/3)
  4. [The timeline](https://smoothstep.io/app/#tutorial/4)
  5. [Patterns](https://smoothstep.io/app/#tutorial/5)
  6. [Textures](https://smoothstep.io/app/#tutorial/6)
  7. [Memory with iPrevFrame](https://smoothstep.io/app/#tutorial/7)
  8. [Share it](https://smoothstep.io/app/#tutorial/8)
- [Examples](examples.md)
- [Sharing animations](sharing.md): links, gists, and playing animations on other websites
- [Keyboard shortcuts](keyboard-shortcuts.md), also in the app under Help → Keyboard shortcuts
- [Coding specification](coding-specification.md), also in the app under Help → Shader inputs

## Help in the app

The Help menu has the welcome dialog, the tour, the tutorial, and two references: Shader inputs
lists everything your shader can use, and Keyboard shortcuts lists the shortcuts. The welcome dialog
shows a different tip each visit. While you work, smoothstep shows a short tip the first time some
things happen, such as your first compile error or your first save. Each tip shows once, and "Don't
show tips" turns them off.

## Saving your work

smoothstep saves your animations and the images you add in your browser. File → Open lists the
animations saved there. You can download each one from that list, or click "Download all files"
to save everything as a zip. "Open file…" opens files you downloaded before. File → Download
animation file saves the animation you have open as a `.smoothstep.json` file. Your browser is
the only place your work is kept, so download anything you want to back up or move to another
computer.

## Sharing

Share gives you a link with the whole animation in it, a QR code of that link, code to show the
animation playing on a website, and a player file. It also makes links that open an animation file
you've put online, such as in a GitHub gist, which keeps your own images with it. File → Open from link opens animations that
others have shared, including animation files in GitHub gists. [Sharing animations](sharing.md) has
the details.

## Acknowledgements

Click Acknowledgements at the bottom of the app to see the open-source projects smoothstep is
built on. The built-in textures and fonts are credited, with their licences, in
[CREDITS.md](../public/images/textures/CREDITS.md).

## Feedback

Please get in touch with the developer, [Matt Henderson](https://www.matthen.com/), with any
feedback or questions.

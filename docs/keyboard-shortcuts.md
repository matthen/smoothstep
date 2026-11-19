# Keyboard Shortcuts

## In the code editor

| shortcut | description |
|---|---|
| `ctrl/cmd + enter` or `shift + enter` | build (recompile) the code |
| `ctrl/cmd + S` | save the current animation in this browser (this also works outside the editor) |
| `ctrl/cmd + F` | find within the code |
| `ctrl/cmd + G` | find the next match |
| `shift + ctrl/cmd + G` | find the previous match |
| `shift + ctrl + F` (Mac: `cmd + alt + F`) | find and replace |
| `shift + ctrl + R` (Mac: `shift + cmd + alt + F`) | replace all |
| `alt + G` | jump to a line |
| `ctrl/cmd + /` | comment or uncomment code |
| `tab` | indent the selected code, or insert two spaces |
| `shift + tab` | re-indent the current line or selected code automatically |
| `ctrl/cmd + Z` | undo |
| `shift + ctrl/cmd + Z` or `ctrl/cmd + Y` | redo |
| `ctrl + space` | show completions (`tab` or `enter` accepts one) |
| `ctrl/cmd + D` | also select the next match of the selected text |
| `alt + up arrow`/`alt + down arrow` | move the current line up or down |
| `escape` | close the find panel or a picker |

## Playing the animation

Click on the canvas or an empty part of the page first, so the code editor doesn't have focus.

| shortcut | description |
|---|---|
| `space` | play/pause |
| `left arrow`/`right arrow` | move back/forward 0.1 seconds |
| `,`/`.` | move back/forward 1/60 of a second |
| `0`, `1`, ..., `9` | move to 0%, 10%, ... 90% through the animation |
| `backspace`/`delete` | delete the selected transition in the animation timeline |

## Editor helpers

When you click on a number in the code, a picker appears that you can drag to change it. A `vec2` value brings
up a 2D picker. A `vec3` brings up a color picker when its values are between 0 and 1, and a 3D
direction picker otherwise. Click on a built-in function, like `smoothstep`, or an input
variable, like `iTime`, to see its definition. The editor also suggests completions as you type.

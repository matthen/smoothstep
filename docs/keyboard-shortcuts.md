# Keyboard Shortcuts

These are also in the app, under Help → Keyboard shortcuts, with your computer's own key names.
`Mod` is `Cmd` on a Mac and `Ctrl` elsewhere, and `Alt` is `Option` on a Mac.

## In the code editor

| shortcut | description |
|---|---|
| `Shift + Enter` or `Mod + Enter` | build the code |
| `Mod + S` | save the animation in this browser (this works outside the editor too) |
| `Mod + F` | find |
| `Mod + G` | find the next match |
| `Shift + Mod + G` | find the previous match |
| `Shift + Ctrl + F` (Mac: `Cmd + Alt + F`) | find and replace |
| `Shift + Ctrl + R` (Mac: `Shift + Cmd + Alt + F`) | replace all |
| `Alt + G` | go to a line |
| `Mod + /` | comment or uncomment |
| `Tab` | indent the selection, or insert two spaces |
| `Shift + Tab` | re-indent the line or selection |
| `Mod + Z` | undo |
| `Ctrl + Y` (Mac: `Shift + Cmd + Z`) | redo |
| `Ctrl + Space` | show completions (`Tab` or `Enter` picks one) |
| `Mod + D` | also select the next match of the selection |
| `Alt + ↑` or `Alt + ↓` | move the line up or down |
| `Esc` | close the find panel, completions or a picker |

## Playing the animation

Click the canvas or an empty part of the page first, so the code editor doesn't have focus.

| shortcut | description |
|---|---|
| `Space` | play or pause |
| `←` or `→` | back or forward 0.1 seconds |
| `,` or `.` | back or forward one frame (1/60 second) |
| `0` to `9` | jump to 0%, 10%, … 90% of the way through |
| `Backspace` or `Delete` | delete the selected transition on the timeline |
| `Ctrl` (`⌘` on a Mac) and scroll, or pinch | zoom the timeline in or out, around the pointer |
| `Esc` | leave full screen, which the button at the end of the play bar opens |

## Editor helpers

Click a number in the code for a slider that you can drag sideways to change it, and up or down to
zoom in or out. A `vec2` value brings up a 2D picker. A `vec3` brings up a colour picker when its
values are between 0 and 1, and a 3D direction picker otherwise. Click a built-in function, like `smoothstep`, or an input, like
`iTime`, to see its definition. The editor also suggests completions as you type.

In the Canvas2D tab, click a number for the same slider, or a colour string like `"#ffcc00"` or
`"rgba(255, 0, 0, 0.5)"` for a colour picker that writes the colour back in the same form. Click a
drawing helper, like `Disk`, an input, like `time`, or a `ctx` method or property, like `fillRect`, to
see what it does.

Links in comments are underlined, and you can click them. A web address opens in a new tab. A menu
item or tab named in square brackets, like `[Help → Tutorial]` or `the [Sliders] tab`, opens that
menu item or tab. The names that work are the File and Help menu items, `[Timeline]`, `[Sliders]`,
`[Textures]`, and the code tabs `[Image]`, `[Shared GLSL]`, `[Canvas2D]` and `[iBuffer0]` to
`[iBuffer3]`.

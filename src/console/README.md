# Console

The Console tab, which shows the Canvas2D code's console calls, every tab's errors and a line for each build. Its
entries are kept outside React's state.

`inputWarnings.ts` works out the warnings for inputs the code reads that hold nothing, such as an empty texture slot.
`useInputWarnings` lists them after each build that works, and again when the animation's textures or variables
change, through `useConsoleLog`, which adds the new ones and drops those that are no longer true.

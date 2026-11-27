# Timeline and playback

This folder holds the Timeline and Sliders tabs in the bottom panel, the play bar under the canvas, and the state of
playback. The animation's variables are the shader inputs `iFloat0` to `iFloat15`, and the timeline gives each one
in use a row of transitions from one value to another. The types for these, and `variableValues` for their values at a time, are in `src/lib/document.ts`.
Transition times are stored in tenths of a second, which the code calls dsecs.

Start reading at `usePlayback.ts`. `App.tsx` calls `usePlayback` once and passes what it returns to the preview and
the bottom panel. It owns a `Playhead` from `playhead.ts`, which holds the time and the simulation's step clock
outside React. Playing moves the playhead on every animation frame without re-rendering the app. The canvas reads it
as it draws, and components that show the time subscribe through `usePlayheadSelect`. Whether the animation is
playing is a `PlaybackMode` from `playbackMode.ts`. A scrub is a mode of its own, which remembers whether to play
again once the pointer lets go.

`Timeline.tsx` puts the rows together with its hooks. `useTimelinePointer` turns pointer events into gestures, and
the rules for them are pure functions in `gestures.ts`, which take the gesture so far and return the next one.
`useGestureState` holds the current gesture. `useTransitionEditor` makes the edits with `transitions.ts`, which keeps
each row's transitions sorted and apart, and passes the new variables up through `onVariablesChange`.
`keys.ts` turns key presses into playback and timeline actions, for both the timeline and the play bar.

The pure modules have unit tests beside them. `e2e/timeline.spec.ts` covers zooming and editing transitions in a
desktop browser.

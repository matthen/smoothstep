# Timeline and playback

The animation's variables are the shader inputs `iFloat0` to `iFloat15`. In the bottom panel, the Timeline tab gives
each one in use a row of transitions from one value to another, and the Sliders tab gives each one the code uses a
slider. The types for these, and `variableValues` for their values at a time, are in `src/lib/document.ts`.
Transition times are stored in tenths of a second, which the code calls dsecs.

`App.tsx` calls `usePlayback`, from `usePlayback.ts`, once and passes what it returns to the preview and the bottom
panel. The hook owns a `Playhead` from `playhead.ts`, which holds the time and the simulation's step clock outside
React. Playing moves the playhead on every animation frame without re-rendering the app. The canvas reads it as it draws,
and components that show the time subscribe through `usePlayheadSelect`. Whether the animation is playing is a
`PlaybackMode` from `playbackMode.ts`. A scrub is a mode of its own, which remembers whether to play again once the
pointer lets go.

`Timeline.tsx` puts the rows together with its hooks. `useTimelinePointer` turns pointer events into gestures. The
rules for them are pure functions in `gestures.ts`, which take the gesture so far and return the next one.
`useGestureState` holds the current gesture. `useTransitionEditor` makes the edits and passes the new variables up
through `onVariablesChange`. It uses `transitions.ts`, which keeps each row's transitions sorted and apart.
`keys.ts` turns key presses into playback and timeline actions, for both the timeline and the play bar under the
canvas in `PlayerControls.tsx`.

The pure modules have unit tests beside them. `e2e/timeline.spec.ts` covers zooming and editing transitions in a
desktop browser.

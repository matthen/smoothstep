import { lazy } from 'react';

import type { TutorialPanelProps } from '../../tutorial/TutorialPanel';
import { usePlayheadSelect } from '../../timeline/playhead';
import type { usePlayback } from '../../timeline/usePlayback';
import type { useDocument } from '../document/useDocument';
import { tutorialState } from './useTutorial';

// Loaded when the tutorial opens, with its lessons.
const TutorialPanel = lazy(() => import('../../tutorial/TutorialPanel'));

interface Props extends Omit<TutorialPanelProps, "state"> {
  docState: ReturnType<typeof useDocument>;
  playback: ReturnType<typeof usePlayback>;
}

// The Learn panel, which hears of the playhead itself: its checks only need the time while paused, to see
// whether it moved, so it doesn't re-render every frame as the animation plays.
export default function TutorialPane({docState, playback, ...props}: Props) {
  const {isPlaying, playhead} = playback;
  const time = usePlayheadSelect(playhead, t => isPlaying ? -1 : t);
  return <TutorialPanel state={tutorialState(docState, isPlaying, time)} {...props} />;
}

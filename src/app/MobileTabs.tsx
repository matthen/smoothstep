import { SegmentedControl } from '@mantine/core';
import { TbCircleCheckFilled } from 'react-icons/tb';

import { ConsoleLabel } from '../console/ConsolePanel';
import type { ConsoleStore } from '../console/consoleStore';
import type { MobileTab } from './useLayout';

interface Props {
  tab: MobileTab;
  onChange: (tab: MobileTab) => void;
  store: ConsoleStore;
  tutorialOpen: boolean;
  // Whether the tutorial's step is done, which the Learn tab shows while another tab is open.
  stepDone: boolean;
}

// The tabs along a phone's bottom edge, choosing which pane fills the screen.
export default function MobileTabs({tab, onChange, store, tutorialOpen, stepDone}: Props) {
  return (
    <nav className="mobileTabs" data-crowded={tutorialOpen || undefined}>
      <SegmentedControl
        fullWidth size="sm" withItemsBorders={false} value={tab} onChange={value => onChange(value as MobileTab)}
        data={[
          {value: "code", label: "Code"}, {value: "animation", label: "Timeline"}, {value: "sliders", label: "Sliders"},
          {value: "textures", label: "Textures"},
          {value: "console", label: <ConsoleLabel store={store} />},
          ...(tutorialOpen ? [{
            value: "learn",
            label: stepDone && tab !== "learn"
              ? <span className="learnTabLabel">Learn<TbCircleCheckFilled aria-label="step done" /></span>
              : "Learn",
          }] : []),
        ]}
      />
    </nav>
  );
}

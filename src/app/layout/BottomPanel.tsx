import { ActionIcon, Tabs } from '@mantine/core';
import { TbChevronDown } from 'react-icons/tb';

import ConsolePanel, { ConsoleClear, ConsoleLabel } from '../../console/ConsolePanel';
import type { ConsoleStore } from '../../console/consoleStore';
import Textures from '../../dialogs/Textures';
import type { AnimationDocument, TextureSlot, Variable } from '../../lib/document';
import type { ShaderId } from '../../render/Renderer';
import Sliders from '../../timeline/Sliders';
import Timeline from '../../timeline/Timeline';
import type { useInputs } from '../../timeline/useInputs';
import type { PanelTab } from './useLayout';
import type { usePlayback } from '../../timeline/usePlayback';

const PANEL_TABS: readonly string[] = ["animation", "sliders", "textures", "console"] satisfies PanelTab[];

interface Props {
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onToggle: () => void;
  phone: boolean;
  doc: AnimationDocument;
  edit: (change: Partial<AnimationDocument>) => void;
  // Variables changed on the timeline, which may earn a tip.
  onTimelineChange: (variables: Variable[]) => void;
  onDurationChange: (duration: number) => void;
  playback: ReturnType<typeof usePlayback>;
  inputs: ReturnType<typeof useInputs>;
  onMessage: (text: string) => void;
  store: ConsoleStore;
  consoleShown: boolean;
  onGoToLine: (tab: ShaderId, line: number | null) => void;
}

// The Timeline, Sliders, Textures and Console tabs under the code and canvas.
export default function BottomPanel(
  {tab, onTabChange, onToggle, phone, doc, edit, onTimelineChange, onDurationChange, playback, inputs, onMessage, store,
    consoleShown, onGoToLine}: Props,
) {
  const {playhead, valuesAt, seek} = playback;
  return (
    <section className="bottomPanel">
      <Tabs
        value={tab} keepMounted
        onChange={value => onTabChange(value !== null && PANEL_TABS.includes(value) ? value as PanelTab : "animation")}
      >
        <Tabs.List>
          <Tabs.Tab value="animation">Timeline</Tabs.Tab>
          <Tabs.Tab value="sliders">Sliders</Tabs.Tab>
          <Tabs.Tab value="textures">Textures</Tabs.Tab>
          <Tabs.Tab value="console"><ConsoleLabel store={store} /></Tabs.Tab>
          {consoleShown && !phone && <ConsoleClear store={store} />}
          <ActionIcon
            variant="subtle" color="gray" className="toggleFooter" aria-label="Toggle footer"
            onClick={onToggle}
          >
            <TbChevronDown />
          </ActionIcon>
        </Tabs.List>
        <Tabs.Panel value="animation">
          <Timeline
            variables={doc.variables} valuesAt={valuesAt} names={inputs.floatNameList}
            onVariablesChange={onTimelineChange}
            duration={doc.duration} playhead={playhead} onSeek={seek} onDurationChange={onDurationChange}
            onScrubStart={playback.onScrubStart} onScrubEnd={playback.onScrubEnd}
            rowCount={inputs.rowCount} onAddRow={inputs.addRow}
          />
        </Tabs.Panel>
        <Tabs.Panel value="sliders">
          <Sliders
            variables={doc.variables} playhead={playhead} valuesAt={valuesAt} names={inputs.floatNameList}
            code={inputs.allCode}
            held={new Set(playback.heldRows.keys())} onVariablesChange={(variables: Variable[]) => edit({variables})}
            onHold={playback.hold}
          />
        </Tabs.Panel>
        <Tabs.Panel value="textures">
          <Textures
            textures={doc.textures} onChange={(textures: TextureSlot[]) => edit({textures})}
            count={inputs.slotCount} onAdd={inputs.addSlot}
            onMessage={onMessage}
          />
        </Tabs.Panel>
        <Tabs.Panel value="console">
          <ConsolePanel store={store} active={consoleShown} phone={phone} onGoToLine={onGoToLine} />
        </Tabs.Panel>
      </Tabs>
    </section>
  );
}

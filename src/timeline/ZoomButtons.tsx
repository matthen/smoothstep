// The timeline's zoom buttons, in the corner above the row labels.
import { ActionIcon, Tooltip } from '@mantine/core';
import { TbArrowAutofitWidth, TbZoomIn, TbZoomOut } from 'react-icons/tb';

const ZOOM_STEP = 2;

interface Props {
  canZoomIn: boolean;
  canZoomOut: boolean;
  zoomBy: (factor: number) => void;
  // Zooms out to fit the whole animation.
  onFit: () => void;
  touch: boolean;
}

export default function ZoomButtons({canZoomIn, canZoomOut, zoomBy, onFit, touch}: Props) {
  return (
    <div className="corner">
      <Tooltip label={touch ? "Zoom out (or pinch)" : "Zoom out (or ctrl + scroll)"}>
        <ActionIcon
          variant="subtle" color="gray" size="sm" aria-label="Zoom out" disabled={!canZoomOut}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
        >
          <TbZoomOut />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={touch ? "Zoom in (or pinch)" : "Zoom in (or ctrl + scroll)"}>
        <ActionIcon
          variant="subtle" color="gray" size="sm" aria-label="Zoom in"
          disabled={!canZoomIn} onClick={() => zoomBy(ZOOM_STEP)}
        >
          <TbZoomIn />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Fit the whole animation">
        <ActionIcon
          variant="subtle" color="gray" size="sm" aria-label="Fit to width" disabled={!canZoomOut}
          onClick={onFit}
        >
          <TbArrowAutofitWidth />
        </ActionIcon>
      </Tooltip>
    </div>
  );
}

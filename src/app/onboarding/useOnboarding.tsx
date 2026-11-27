import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { GlslCode } from '../../editor/InlineCode';
import type { Route } from '../../lib/routes';
import { useLatest } from '../../lib/useLatest';
import { anyModalOpen } from '../AppModal';
import { setTourState, tourState } from './onboarding';
import { chooseTip, markTipSeen, seenTips, tipContent, tipsFor, turnOffTips, type TipEvent } from './tips';
import type { TourOptions } from './tour';

// Text with GLSL `code` in backticks.
function withCode(text: string) {
  return text.split("`").map((part, i) => i % 2 ? <GlslCode key={i}>{part}</GlslCode> : part);
}

interface Options {
  initialRoute: Route | null;
  phone: boolean;
  // Shows a pane the tour is about to highlight.
  showPane: TourOptions["showPane"];
  closeDialog: () => void;
  // Whether a dialog, the tutorial or loading has the user's attention, so a tip would get in the way.
  busy: boolean;
}

// The guided tour, the offer of it, and the one-time tips.
export function useOnboarding({initialRoute, phone, showPane, closeDialog, busy}: Options) {
  const [tourTaken, setTourTaken] = useState(() => tourState() === "taken");
  // What a one-time tip waits for: the tour, its offer, or another tip to finish.
  const tourRunning = useRef(false);
  const tourOfferShowing = useRef(false);
  const tipShowing = useRef(false);

  const takeTour = async () => {
    closeDialog();
    notifications.hide("tour");
    setTourState("taken");
    setTourTaken(true);
    tourRunning.current = true;
    let startTour;
    try {
      ({startTour} = await import('./tour'));
    } catch (error) {
      // Offline after a new deploy, say: the tour's chunk isn't cached.
      console.error(error);
      tourRunning.current = false;
      return;
    }
    startTour({
      phone,
      // Applied at once, so the tour measures the pane it's about to highlight.
      showPane: pane => flushSync(() => showPane(pane)),
      onFinish: () => {tourRunning.current = false;},
    });
  };

  // Someone whose first visit is a link to an animation doesn't see the welcome dialog, so
  // offer them the tour once instead.
  const offerTourRef = useLatest(() => {
    if (initialRoute && initialRoute.kind !== "tutorial" && tourState() === null) {
      setTourState("offered");
      tourOfferShowing.current = true;
      notifications.show({
        id: "tour", autoClose: 12000, title: "New to smoothstep.io?",
        onClose: () => {tourOfferShowing.current = false;},
        message: (
          <Group gap="xs" mt={4}>
            <Text size="sm">A one-minute tour shows you around.</Text>
            <Button size="compact-sm" onClick={() => void takeTour()}>Take the tour</Button>
          </Group>
        ),
      });
    }
  });
  const offerTour = useCallback(() => offerTourRef.current(), [offerTourRef]);

  // Shows a one-time tip for what just happened, unless something else has the user's attention.
  const showTip = (event: TipEvent) => {
    const blocked = tourRunning.current || tourOfferShowing.current || tipShowing.current || anyModalOpen() || busy;
    const id = chooseTip(tipsFor(event), seenTips(), blocked);
    if (!id) {
      return;
    }
    markTipSeen(id);
    tipShowing.current = true;
    const {title, message} = tipContent(id, phone);
    notifications.show({
      id: "tip", autoClose: 15000, title, className: "tipNotification",
      onClose: () => {tipShowing.current = false;},
      message: (
        <>
          <Text size="sm">{withCode(message)}</Text>
          <Button
            variant="subtle" color="gray" c="dimmed" fw={500} size="compact-xs" mt={4} ml={-6}
            onClick={() => {turnOffTips(); notifications.hide("tip");}}
          >
            Don't show tips
          </Button>
        </>
      ),
    });
  };

  return {tourTaken, takeTour, offerTour, showTip};
}
